import { logger } from '@/index'
import { translate } from '@/i18n'
import { getChampionById, getQueue } from '@/lib/assets'
import { lcu, LcuEventUri } from '@/lib/lcu'
import type { ChampSelectSession, GameflowPhase, LCUEventMessage } from '@/lib/lcu'
import type { ChampSelectAction } from '@/types/lcu'
import { store } from '@/lib/store'

const retryTimers = new Set<number>()
const SUBSET_CHAMPION_LIST_URI = '/lol-lobby-team-builder/champ-select/v1/subset-champion-list'

let gameflowUnsub: (() => void) | null = null
let champSelectUnsub: (() => void) | null = null
let subsetChampionListUnsub: (() => void) | null = null
let isHandling = false
let hasPendingUpdate = false
let lastSessionId = ''
let lastChampionId = 0
let pendingAutoChampionId = 0
let lastAutoChampionId = 0
let lastAutoAt = 0
let currentSession: ChampSelectSession | null = null
const userRejectedChampionIds = new Set<number>()

function getConfiguredChampionIds(): number[] {
  return [...new Set(store.get('hextechAramAutoLockChampionIds').filter((id) => id > 0))]
}

function getConfiguredChampionSet(): Set<number> {
  return new Set(getConfiguredChampionIds())
}

function isConfiguredChampion(championId: number): boolean {
  return championId > 0 && getConfiguredChampionSet().has(championId)
}

function getLocalChampionId(session: ChampSelectSession): number {
  return session.myTeam.find((player) => player.cellId === session.localPlayerCellId)?.championId ?? 0
}

async function getIdSet(loader: () => Promise<number[]>): Promise<Set<number>> {
  try {
    return new Set(await loader())
  } catch {
    return new Set()
  }
}

async function isHextechAramSession(session: ChampSelectSession): Promise<boolean> {
  const queueMode = getQueue(session.queueId)?.gameMode
  if (queueMode?.toLowerCase() === 'kiwi') return true

  const gameflow = await lcu.getGameflowSession().catch(() => null)
  const gameMode = gameflow?.gameData?.queue?.gameMode || gameflow?.map?.gameMode || ''
  return gameMode.toLowerCase() === 'kiwi'
}

async function notifyHextechGrabSuccess(championId: number) {
  const champInfo = getChampionById(championId)
  const championName = champInfo?.name || `Champion#${championId}`
  const msg = translate('champSelect.hextechAramAutoLock.message', { championName })

  try {
    await lcu.sendChampSelectMessage(msg, 'celebration')
  } catch {
    // Chat can be unavailable briefly after entering champ select.
  }
}

function pickPreferredChampion(candidates: Set<number>): number | null {
  for (const id of getConfiguredChampionIds()) {
    if (userRejectedChampionIds.has(id)) continue
    if (candidates.has(id)) return id
  }
  return null
}

function getEffectiveChampionRank(championId: number): number {
  if (championId <= 0 || userRejectedChampionIds.has(championId)) return -1
  return getConfiguredChampionIds().indexOf(championId)
}

function shouldSwapToChampion(session: ChampSelectSession, championId: number): boolean {
  const selfChampionId = getLocalChampionId(session)
  if (championId <= 0 || championId === selfChampionId) return false

  const currentRank = getEffectiveChampionRank(selfChampionId)
  const targetRank = getEffectiveChampionRank(championId)
  if (targetRank < 0) return false

  return currentRank < 0 || targetRank < currentRank
}

async function resolveSubsetChampionId(session: ChampSelectSession): Promise<number | null> {
  if (!session.allowSubsetChampionPicks) return null

  const [pickableIds, disabledIds, subsetChampionIds] = await Promise.all([
    getIdSet(() => lcu.getPickableChampionIds()),
    getIdSet(() => lcu.getDisabledChampionIds()),
    getIdSet(() => lcu.getChampSelectSubsetChampionIds()),
  ])
  const selfChampionId = getLocalChampionId(session)

  return pickPreferredChampion(
    new Set(
      [...subsetChampionIds].filter((id) => (
        id !== selfChampionId
        && pickableIds.has(id)
        && !disabledIds.has(id)
      )),
    ),
  )
}

async function resolveBenchChampionId(session: ChampSelectSession): Promise<number | null> {
  const [pickableIds, disabledIds] = await Promise.all([
    getIdSet(() => lcu.getPickableChampionIds()),
    getIdSet(() => lcu.getDisabledChampionIds()),
  ])
  const benchChampionIds = new Set(session.benchChampions.map((champion) => champion.championId))
  const selfChampionId = getLocalChampionId(session)

  return pickPreferredChampion(
    new Set(
      [...benchChampionIds].filter((id) => (
        id !== selfChampionId
        && pickableIds.has(id)
        && !disabledIds.has(id)
      )),
    ),
  )
}

function getLocalPickAction(session: ChampSelectSession): ChampSelectAction | undefined {
  return session.actions
    .flat(2)
    .find((action) => (
      action.actorCellId === session.localPlayerCellId
      && action.type === 'pick'
      && !action.completed
    ))
}

function resetSessionState(sessionId = '') {
  clearRetryTimers()
  lastSessionId = sessionId
  lastChampionId = 0
  pendingAutoChampionId = 0
  lastAutoChampionId = 0
  lastAutoAt = 0
  currentSession = null
  userRejectedChampionIds.clear()
  isHandling = false
  hasPendingUpdate = false
}

function clearRetryTimers() {
  retryTimers.forEach((timer) => window.clearTimeout(timer))
  retryTimers.clear()
}

function scheduleRetry(delay = 1000) {
  if (!currentSession || retryTimers.size > 0) return

  const timer = window.setTimeout(() => {
    retryTimers.delete(timer)
    if (currentSession) {
      void handleChampSelectSession(currentSession, 'retry')
    }
  }, delay)

  retryTimers.add(timer)
}

function markAutoIntent(championId: number) {
  pendingAutoChampionId = championId
}

function markAutoSuccess(championId: number) {
  pendingAutoChampionId = 0
  lastAutoChampionId = championId
  lastAutoAt = Date.now()
}

function recordManualSwap(session: ChampSelectSession) {
  const championId = getLocalChampionId(session)
  if (championId === lastChampionId) return

  const changedFromPendingAuto = championId === pendingAutoChampionId
  const changedFromRecentAuto = championId === lastAutoChampionId && Date.now() - lastAutoAt < 3000
  const isAutoChange = changedFromPendingAuto || changedFromRecentAuto

  if (!isAutoChange && isConfiguredChampion(lastChampionId)) {
    userRejectedChampionIds.add(lastChampionId)
    logger.info('[HextechAramAutoLock] User rejected auto champion for this session: %d', lastChampionId)
  }

  if (isAutoChange) {
    pendingAutoChampionId = 0
  }

  lastChampionId = championId
}

async function pickSubsetChampion(session: ChampSelectSession, championId: number): Promise<boolean> {
  const pickAction = getLocalPickAction(session)
  if (!pickAction) return false

  markAutoIntent(championId)
  const res = await fetch(`/lol-champ-select/v1/session/actions/${pickAction.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      championId,
      completed: true,
      type: 'pick',
    }),
  })

  if (res.ok) {
    markAutoSuccess(championId)
  } else {
    pendingAutoChampionId = 0
  }

  return res.ok
}

async function swapBenchChampion(championId: number): Promise<void> {
  markAutoIntent(championId)
  try {
    await lcu.benchSwap(championId)
    markAutoSuccess(championId)
  } catch (err) {
    pendingAutoChampionId = 0
    throw err
  }
}

async function handleChampSelectSession(session: ChampSelectSession, source: 'event' | 'retry') {
  if (isHandling) {
    currentSession = session
    hasPendingUpdate = true
    return
  }
  if (getConfiguredChampionIds().length === 0) return

  if (lastSessionId && lastSessionId !== session.id) {
    resetSessionState(session.id)
  } else if (!lastSessionId) {
    lastSessionId = session.id
  }

  currentSession = session
  recordManualSwap(session)

  isHandling = true
  try {
    if (!await isHextechAramSession(session)) {
      logger.info('[HextechAramAutoLock] Current champ select is not KIWI, skip')
      resetSessionState()
      return
    }

    if (session.timer.phase === 'BAN_PICK') {
      const championId = await resolveSubsetChampionId(session)
      if (!championId) {
        scheduleRetry()
        return
      }

      if (await pickSubsetChampion(session, championId)) {
        logger.info('[HextechAramAutoLock] Picked subset champion: %d', championId)
        notifyHextechGrabSuccess(championId)
      } else {
        scheduleRetry()
      }
      return
    }

    if (!session.benchEnabled || session.timer.phase !== 'FINALIZATION') {
      return
    }

    const championId = await resolveBenchChampionId(session)
    if (!championId || !shouldSwapToChampion(session, championId)) {
      return
    }

    try {
      await swapBenchChampion(championId)
      logger.info('[HextechAramAutoLock] Swapped bench champion: %d', championId)
      notifyHextechGrabSuccess(championId)
    } catch (err) {
      logger.warn('[HextechAramAutoLock] Bench swap failed, retry later: %o', err)
      scheduleRetry()
    }
  } catch (err) {
    logger.warn('[HextechAramAutoLock] Failed to handle champ-select update: %o', err)
    if (source === 'event') scheduleRetry()
  } finally {
    isHandling = false
    if (hasPendingUpdate && currentSession) {
      hasPendingUpdate = false
      void handleChampSelectSession(currentSession, source)
    }
  }
}

function onChampSelectUpdate(event: LCUEventMessage) {
  if (event.eventType === 'Delete') {
    resetSessionState()
    return
  }

  const session = event.data as ChampSelectSession | null
  if (!session?.id) return

  void handleChampSelectSession(session, 'event')
}

function onSubsetChampionListUpdate() {
  if (currentSession) {
    void handleChampSelectSession(currentSession, 'event')
  }
}

function startChampSelectListener() {
  if (!champSelectUnsub) {
    champSelectUnsub = lcu.observe(LcuEventUri.CHAMP_SELECT, onChampSelectUpdate)
  }
  if (!subsetChampionListUnsub) {
    subsetChampionListUnsub = lcu.observe(SUBSET_CHAMPION_LIST_URI, onSubsetChampionListUpdate)
  }
}

function stopChampSelectListener() {
  if (champSelectUnsub) {
    champSelectUnsub()
    champSelectUnsub = null
  }
  if (subsetChampionListUnsub) {
    subsetChampionListUnsub()
    subsetChampionListUnsub = null
  }
  resetSessionState()
}

export function updateHextechAramAutoLock(enabled: boolean) {
  if (enabled && !gameflowUnsub) {
    gameflowUnsub = lcu.observe(LcuEventUri.GAMEFLOW_PHASE_CHANGE, (event: LCUEventMessage) => {
      const phase = event.data as GameflowPhase
      if (phase === 'ChampSelect') {
        startChampSelectListener()
        lcu.getChampSelectSession()
          .then((session) => handleChampSelectSession(session, 'event'))
          .catch(() => {})
      } else {
        stopChampSelectListener()
      }
    })
    logger.info('Hextech ARAM auto lock enabled')
  } else if (!enabled && gameflowUnsub) {
    gameflowUnsub()
    gameflowUnsub = null
    stopChampSelectListener()
    logger.info('Hextech ARAM auto lock disabled')
  }
}
