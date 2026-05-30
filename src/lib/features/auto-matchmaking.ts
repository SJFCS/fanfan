import { logger } from '@/index'
import { lcu, LcuEventUri } from '@/lib/lcu'
import type { GameflowPhase, LCUEventMessage, Lobby } from '@/lib/lcu'
import { AUTO_MATCHMAKING_MIN_MEMBERS_MAX, AUTO_MATCHMAKING_MIN_MEMBERS_MIN } from '@/lib/auto-matchmaking-config'
import { store } from '@/lib/store'
import { onAutoReturnedToLobby } from '@/lib/features/auto-return-to-lobby'

const START_MATCHMAKING_RETRY_MS = 1500
const AUTO_MATCHMAKING_REFRESH_DEBOUNCE_MS = 250

let autoMatchmakingUnsubs: Array<() => void> = []
let autoMatchmakingTimer: ReturnType<typeof setTimeout> | null = null
let autoMatchmakingRefreshTimer: ReturnType<typeof setTimeout> | null = null
let autoMatchmakingDueAt = 0
let autoMatchmakingRunId = 0
let autoMatchmakingEvaluateId = 0
let autoMatchmakingInFlight = false
let autoMatchmakingRefreshInFlight = false
let lastBlockedReason: MatchmakingBlockedReason | null = null
let lastObservedQueueId = 0
let currentGameflowPhase: GameflowPhase | null = null
let pendingAutoMatchmakingRefresh: { reason: string; resetExistingTimer: boolean } | null = null

type MatchmakingBlockedReason =
  | 'not-in-lobby'
  | 'custom-game'
  | 'not-leader'
  | 'waiting-for-penalty-time'
  | 'matchmaking-state-unavailable'
  | 'waiting-for-invitees'
  | 'insufficient-members'
  | 'activity-unavailable'

type MatchmakingReadiness =
  | { canStart: true }
  | { canStart: false; reason: MatchmakingBlockedReason }

function isLcuStatusError(err: unknown, status: number) {
  return err instanceof Error && new RegExp(`\\b${status}\\b`).test(err.message)
}

function getMinimumMembers() {
  const value = store.get('autoMatchmakingMinimumMembers')
  if (!Number.isFinite(value)) {
    return AUTO_MATCHMAKING_MIN_MEMBERS_MIN
  }

  return Math.max(
    AUTO_MATCHMAKING_MIN_MEMBERS_MIN,
    Math.min(AUTO_MATCHMAKING_MIN_MEMBERS_MAX, Math.floor(value)),
  )
}

async function getCurrentLobbyQueueId() {
  try {
    const lobby = await lcu.getLobby()
    return lobby.gameConfig?.queueId ?? 0
  } catch {
    return 0
  }
}

function getLobbyFromEvent(event: LCUEventMessage): Lobby | null {
  return event.data && typeof event.data === 'object'
    ? event.data as Lobby
    : null
}

async function isInLobbyPhase() {
  if (currentGameflowPhase === 'Lobby') {
    return true
  }
  if (currentGameflowPhase !== null) {
    return false
  }

  try {
    currentGameflowPhase = await lcu.getGameflowPhase()
    return currentGameflowPhase === 'Lobby'
  } catch {
    return false
  }
}

function getDelayMs() {
  const value = store.get('autoMatchmakingDelaySeconds')
  return (Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0) * 1000
}

function shouldWaitForInvitees() {
  return store.get('autoMatchmakingWaitForInvitees')
}

export function isAutoMatchmakingEnabledForCurrentLobby() {
  return store.get('autoMatchmaking') && store.get('lobbyHeaderAutoMatchmakingEnabled')
}

export function getAutoMatchmakingConfiguredDelayMs() {
  return getDelayMs()
}

export function getAutoMatchmakingCountdownMs() {
  if (!autoMatchmakingTimer || autoMatchmakingDueAt <= 0) {
    return null
  }

  return Math.max(0, autoMatchmakingDueAt - Date.now())
}

export function isAutoMatchmakingCountdownActive() {
  return autoMatchmakingTimer !== null && autoMatchmakingDueAt > 0
}

function clearAutoMatchmakingTimer() {
  if (autoMatchmakingTimer) {
    clearTimeout(autoMatchmakingTimer)
    autoMatchmakingTimer = null
  }
  autoMatchmakingDueAt = 0
}

function clearPendingAutoMatchmakingRefresh() {
  if (autoMatchmakingRefreshTimer) {
    clearTimeout(autoMatchmakingRefreshTimer)
    autoMatchmakingRefreshTimer = null
  }
  pendingAutoMatchmakingRefresh = null
}

function resetAutoMatchmakingRuntime() {
  clearAutoMatchmakingTimer()
  clearPendingAutoMatchmakingRefresh()
  autoMatchmakingRunId++
  autoMatchmakingEvaluateId++
  autoMatchmakingInFlight = false
  autoMatchmakingRefreshInFlight = false
  lastBlockedReason = null
}

function resetAutoMatchmakingTimer(reason: string) {
  if (autoMatchmakingTimer) {
    logger.info('[AutoMatchmaking] %s，重置自动匹配倒计时', reason)
  }
  clearAutoMatchmakingTimer()
  autoMatchmakingRunId++
}

function toFiniteNumber(value: unknown) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : 0
}

export async function getLowPriorityPenaltyRemainingSeconds(): Promise<number> {
  const search = await lcu.getMatchSearchResult()
  const searchPenalty = toFiniteNumber(search.lowPriorityData?.penaltyTimeRemaining)
  const errorPenalty = search.errors.reduce<number>((max, error) => {
    const penaltyTimeRemaining = typeof error === 'object' && error && 'penaltyTimeRemaining' in error
      ? toFiniteNumber((error as { penaltyTimeRemaining?: unknown }).penaltyTimeRemaining)
      : 0
    return Math.max(max, penaltyTimeRemaining)
  }, 0)

  return Math.max(searchPenalty, errorPenalty)
}

async function getLowPriorityPenaltyStatus(): Promise<'penalized' | 'clear' | 'unavailable'> {
  try {
    return await getLowPriorityPenaltyRemainingSeconds() > 0 ? 'penalized' : 'clear'
  } catch (err) {
    if (isLcuStatusError(err, 404)) {
      return 'clear'
    }

    logger.info('[AutoMatchmaking] 暂无法读取匹配搜索状态，跳过本次自动匹配检查:', err)
    return 'unavailable'
  }
}

async function getMatchmakingReadiness(): Promise<MatchmakingReadiness> {
  try {
    if (!await isInLobbyPhase()) {
      return { canStart: false, reason: 'not-in-lobby' }
    }

    const lobby = await lcu.getLobby()

    if (lobby.gameConfig?.isCustom) {
      return { canStart: false, reason: 'custom-game' }
    }

    if (!lobby.localMember?.isLeader) {
      return { canStart: false, reason: 'not-leader' }
    }

    const lowPriorityPenaltyStatus = await getLowPriorityPenaltyStatus()
    if (lowPriorityPenaltyStatus === 'penalized') {
      return { canStart: false, reason: 'waiting-for-penalty-time' }
    }
    if (lowPriorityPenaltyStatus === 'unavailable') {
      return { canStart: false, reason: 'matchmaking-state-unavailable' }
    }

    if (shouldWaitForInvitees() && lobby.invitations.some((invitation) => invitation.state === 'Pending')) {
      return { canStart: false, reason: 'waiting-for-invitees' }
    }

    if (lobby.members.length < getMinimumMembers()) {
      return { canStart: false, reason: 'insufficient-members' }
    }

    if (!lobby.canStartActivity) {
      return { canStart: false, reason: 'activity-unavailable' }
    }

    return { canStart: true }
  } catch {
    return { canStart: false, reason: 'not-in-lobby' }
  }
}

function cancelScheduledMatchmaking(reason: MatchmakingBlockedReason, shouldInvalidateEvaluation = true) {
  if (autoMatchmakingTimer) {
    logger.info('[AutoMatchmaking] 条件变为 %s，取消自动匹配倒计时', reason)
  }

  clearAutoMatchmakingTimer()
  autoMatchmakingRunId++
  if (shouldInvalidateEvaluation) {
    autoMatchmakingEvaluateId++
  }

  if (lastBlockedReason !== reason) {
    logger.info('[AutoMatchmaking] 暂不开启匹配 %s', reason)
    lastBlockedReason = reason
  }
}

async function startMatchmaking(runId: number) {
  if (autoMatchmakingInFlight || runId !== autoMatchmakingRunId) {
    return
  }

  autoMatchmakingInFlight = true
  try {
    const readiness = await getMatchmakingReadiness()
    if (runId !== autoMatchmakingRunId) {
      return
    }

    if (!readiness.canStart) {
      cancelScheduledMatchmaking(readiness.reason)
      return
    }

    await lcu.startMatchmaking()
    logger.info('[AutoMatchmaking] 已开始自动匹配 OK')
  } catch (err) {
    logger.error('[AutoMatchmaking] 开始匹配失败', err)
    if (runId === autoMatchmakingRunId && isAutoMatchmakingEnabledForCurrentLobby()) {
      autoMatchmakingRunId++
      autoMatchmakingTimer = setTimeout(() => {
        autoMatchmakingTimer = null
        autoMatchmakingDueAt = 0
        requestAutoMatchmakingRefresh('开始匹配失败后重试', false, 0)
      }, START_MATCHMAKING_RETRY_MS)
      autoMatchmakingDueAt = Date.now() + START_MATCHMAKING_RETRY_MS
    }
  } finally {
    autoMatchmakingInFlight = false
  }
}

function requestAutoMatchmakingRefresh(
  reason: string,
  resetExistingTimer = false,
  debounceMs = AUTO_MATCHMAKING_REFRESH_DEBOUNCE_MS,
) {
  if (!isAutoMatchmakingEnabledForCurrentLobby() || currentGameflowPhase !== 'Lobby') {
    return
  }

  pendingAutoMatchmakingRefresh = {
    reason,
    resetExistingTimer: Boolean(pendingAutoMatchmakingRefresh?.resetExistingTimer || resetExistingTimer),
  }

  if (autoMatchmakingRefreshTimer || autoMatchmakingRefreshInFlight) {
    return
  }

  autoMatchmakingRefreshTimer = setTimeout(() => {
    autoMatchmakingRefreshTimer = null
    void drainAutoMatchmakingRefreshQueue()
  }, debounceMs)
}

async function drainAutoMatchmakingRefreshQueue() {
  if (autoMatchmakingRefreshInFlight) {
    return
  }

  const queuedRefresh = pendingAutoMatchmakingRefresh
  if (!queuedRefresh) {
    return
  }

  pendingAutoMatchmakingRefresh = null
  autoMatchmakingRefreshInFlight = true
  try {
    await runAutoMatchmakingRefresh(queuedRefresh.reason, queuedRefresh.resetExistingTimer)
  } finally {
    autoMatchmakingRefreshInFlight = false
    if (pendingAutoMatchmakingRefresh && isAutoMatchmakingEnabledForCurrentLobby() && currentGameflowPhase === 'Lobby') {
      autoMatchmakingRefreshTimer = setTimeout(() => {
        autoMatchmakingRefreshTimer = null
        void drainAutoMatchmakingRefreshQueue()
      }, AUTO_MATCHMAKING_REFRESH_DEBOUNCE_MS)
    }
  }
}

async function runAutoMatchmakingRefresh(reason: string, resetExistingTimer = false) {
  if (autoMatchmakingInFlight || !isAutoMatchmakingEnabledForCurrentLobby()) {
    return
  }

  if (!await isInLobbyPhase()) {
    cancelScheduledMatchmaking('not-in-lobby')
    return
  }

  const evaluateId = ++autoMatchmakingEvaluateId
  const readiness = await getMatchmakingReadiness()
  if (evaluateId !== autoMatchmakingEvaluateId || !isAutoMatchmakingEnabledForCurrentLobby()) {
    return
  }

  if (!readiness.canStart) {
    cancelScheduledMatchmaking(readiness.reason, false)
    return
  }

  const delayMs = getDelayMs()
  if (autoMatchmakingTimer) {
    if (!resetExistingTimer) {
      return
    }

    clearAutoMatchmakingTimer()
    autoMatchmakingRunId++
    logger.info('[AutoMatchmaking] %s，条件仍满足，按当前配置重置倒计时为 %dms', reason, delayMs)
  } else {
    logger.info('[AutoMatchmaking] %s，条件满足，将在 %dms 后开始匹配', reason, delayMs)
  }

  if (evaluateId !== autoMatchmakingEvaluateId) {
    return
  }

  lastBlockedReason = null
  const runId = ++autoMatchmakingRunId
  autoMatchmakingDueAt = delayMs > 0 ? Date.now() + delayMs : 0

  autoMatchmakingTimer = setTimeout(() => {
    autoMatchmakingTimer = null
    autoMatchmakingDueAt = 0
    startMatchmaking(runId)
  }, delayMs)
}

export function updateAutoMatchmaking(enabled: boolean) {
  if (enabled && autoMatchmakingUnsubs.length === 0) {
    currentGameflowPhase = null
    autoMatchmakingUnsubs = [
      onAutoReturnedToLobby(() => requestAutoMatchmakingRefresh('自动返回房间完成', false, 0)),
      lcu.observe(LcuEventUri.LOBBY, (event: LCUEventMessage) => {
        if (currentGameflowPhase !== 'Lobby') {
          return
        }

        const lobby = getLobbyFromEvent(event)
        if (!lobby) {
          lastObservedQueueId = 0
          clearPendingAutoMatchmakingRefresh()
          cancelScheduledMatchmaking('not-in-lobby')
          return
        }

        const queueId = lobby.gameConfig?.queueId
        if (typeof queueId === 'number' && queueId !== lastObservedQueueId) {
          lastObservedQueueId = queueId
          resetAutoMatchmakingTimer('房间模式切换')
          requestAutoMatchmakingRefresh('房间模式切换', true, 0)
          return
        }

        requestAutoMatchmakingRefresh('房间状态变化')
      }),
      lcu.observe(LcuEventUri.GAMEFLOW_PHASE_CHANGE, (event: LCUEventMessage) => {
        currentGameflowPhase = event.data as GameflowPhase
        if (currentGameflowPhase === 'Lobby') {
          void getCurrentLobbyQueueId().then((queueId) => {
            lastObservedQueueId = queueId
            requestAutoMatchmakingRefresh('进入房间', false, 0)
          })
        } else {
          lastObservedQueueId = 0
          clearPendingAutoMatchmakingRefresh()
          cancelScheduledMatchmaking('not-in-lobby')
        }
      }),
    ]
    void lcu.getGameflowPhase().then((phase) => {
      currentGameflowPhase = phase
      if (phase !== 'Lobby') {
        lastObservedQueueId = 0
        cancelScheduledMatchmaking('not-in-lobby')
        return
      }

      void getCurrentLobbyQueueId().then((queueId) => {
        lastObservedQueueId = queueId
        requestAutoMatchmakingRefresh('自动匹配已开启', false, 0)
      })
    }).catch(() => {
      currentGameflowPhase = null
    })
    logger.info('Auto matchmaking enabled OK')
  } else if (!enabled && autoMatchmakingUnsubs.length > 0) {
    resetAutoMatchmakingRuntime()
    autoMatchmakingUnsubs.forEach((unsubscribe) => unsubscribe())
    autoMatchmakingUnsubs = []
    currentGameflowPhase = null
    logger.info('Auto matchmaking disabled')
  }
}

export function stopAutoMatchmaking() {
  updateAutoMatchmaking(false)
  resetAutoMatchmakingRuntime()
  lastObservedQueueId = 0
  currentGameflowPhase = null
}

export function refreshAutoMatchmakingConfig() {
  if (autoMatchmakingUnsubs.length === 0 || !isAutoMatchmakingEnabledForCurrentLobby()) {
    return
  }

  requestAutoMatchmakingRefresh('自动匹配配置变化', true, 0)
}
