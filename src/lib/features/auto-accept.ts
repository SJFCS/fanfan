import { logger } from '@/index'
import { store } from '@/lib/store'
import { lcu, LcuEventUri } from '@/lib/lcu'
import type { LCUEventMessage, GameflowPhase, ReadyCheck } from '@/lib/lcu'

const AUTO_ACCEPT_MAX_DELAY_MS = 10000

let autoAcceptUnsubs: Array<() => void> = []
let autoAcceptTimer: ReturnType<typeof setTimeout> | null = null
let autoAcceptDueAt = 0
let autoAcceptRunId = 0
let autoAcceptAttempted = false
let autoAcceptInFlightRunId: number | null = null

function computeAcceptDelayMs(): number {
  const minMs = store.get('autoAcceptDelayMin')
  const maxMs = store.get('autoAcceptDelayMax')

  const isValidRange =
    Number.isFinite(minMs) && Number.isFinite(maxMs) &&
    minMs >= 0 && maxMs >= 0 &&
    maxMs <= AUTO_ACCEPT_MAX_DELAY_MS &&
    minMs <= maxMs &&
    maxMs > 0

  if (!isValidRange) return 0
  return Math.round(minMs + Math.random() * (maxMs - minMs))
}

export function isAutoAcceptEnabledForCurrentLobby() {
  return store.get('autoAcceptMatch') && store.get('lobbyHeaderAutoAcceptEnabled')
}

export function getAutoAcceptCountdownMs() {
  if (!autoAcceptTimer || autoAcceptDueAt <= 0) {
    return null
  }

  return Math.max(0, autoAcceptDueAt - Date.now())
}

function scheduleAcceptMatch() {
  if (autoAcceptTimer || autoAcceptAttempted || autoAcceptInFlightRunId === autoAcceptRunId) {
    return
  }

  const delayMs = computeAcceptDelayMs()
  const runId = autoAcceptRunId
  autoAcceptDueAt = delayMs > 0 ? Date.now() + delayMs : 0

  const doAccept = () => {
    if (runId !== autoAcceptRunId) {
      return
    }

    autoAcceptTimer = null
    autoAcceptDueAt = 0
    autoAcceptAttempted = true
    autoAcceptInFlightRunId = runId
    lcu.acceptMatch()
      .then(() => logger.info('Auto accepted match OK (delay=%dms)', delayMs))
      .catch((err) => {
        if (runId === autoAcceptRunId) {
          autoAcceptAttempted = false
        }
        logger.error('Auto accept failed:', err)
      })
      .finally(() => {
        if (autoAcceptInFlightRunId === runId) {
          autoAcceptInFlightRunId = null
        }
      })
  }

  if (delayMs === 0) {
    doAccept()
    return
  }

  logger.info('[AutoAccept] Delay %dms before accepting', delayMs)
  autoAcceptTimer = setTimeout(doAccept, delayMs)
}

function cancelScheduledAccept(reason?: string) {
  const hadTimer = Boolean(autoAcceptTimer)

  if (autoAcceptTimer) {
    clearTimeout(autoAcceptTimer)
    autoAcceptTimer = null
  }
  autoAcceptDueAt = 0
  if (reason === 'not-in-ready-check' || reason === 'disabled') {
    autoAcceptRunId++
    autoAcceptAttempted = false
    autoAcceptInFlightRunId = null
  } else if (reason === 'accepted' || reason === 'declined') {
    autoAcceptAttempted = true
  }

  if (!hadTimer) {
    return
  }

  if (reason === 'accepted') {
    logger.info('[AutoAccept] 已手动接受，取消即将执行的自动接受')
  } else if (reason === 'declined') {
    logger.info('[AutoAccept] 已手动拒绝，取消即将执行的自动接受')
  } else if (reason) {
    logger.info('[AutoAccept] 取消即将执行的自动接受: %s', reason)
  }
}

export function updateAutoAccept(enabled: boolean) {
  if (enabled && autoAcceptUnsubs.length === 0) {
    autoAcceptUnsubs = [
      lcu.observe(LcuEventUri.GAMEFLOW_PHASE_CHANGE, (event: LCUEventMessage) => {
        const phase = event.data as GameflowPhase
        if (phase === 'ReadyCheck') {
          scheduleAcceptMatch()
        } else {
          cancelScheduledAccept('not-in-ready-check')
        }
      }),
      lcu.observe(LcuEventUri.READY_CHECK, (event: LCUEventMessage) => {
        const readyCheck = event.data as ReadyCheck | null
        if (!readyCheck || readyCheck.state === 'Invalid') {
          cancelScheduledAccept('not-in-ready-check')
          return
        }

        if (readyCheck?.playerResponse === 'Accepted' || readyCheck?.playerResponse === 'Declined') {
          cancelScheduledAccept(readyCheck.playerResponse.toLowerCase())
        } else if (readyCheck.state === 'InProgress' && readyCheck.playerResponse === 'None') {
          scheduleAcceptMatch()
        }
      }),
    ]
    logger.info('Auto accept enabled OK')
  } else if (!enabled && autoAcceptUnsubs.length > 0) {
    autoAcceptUnsubs.forEach((unsubscribe) => unsubscribe())
    autoAcceptUnsubs = []
    cancelScheduledAccept('disabled')
    logger.info('Auto accept disabled')
  }
}
