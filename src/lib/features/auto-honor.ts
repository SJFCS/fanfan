import { logger } from '@/index'
import { lcu, LcuEventUri } from '@/lib/lcu'
import type { LCUEventMessage, GameflowPhase } from '@/lib/lcu'

// ==================== 对局结束自动点赞 ====================

const HONOR_CATEGORIES = ['HEART'] as const
const BALLOT_RETRY_DELAYS = [250, 500, 750, 1000, 1500, 2000] as const

/** ballot 接口返回类型 */
interface HonorBallot {
  gameId: number
  eligibleAllies: Array<{
    botPlayer: boolean
    championId: number
    championName: string
    puuid: string
    summonerId: number
    role: string
  }>
  eligibleOpponents: Array<{
    botPlayer: boolean
    championId: number
    championName: string
    puuid: string
    summonerId: number
    role: string
  }>
  honoredPlayers: unknown[]
  votePool: {
    fromGamePlayed: number
    fromHighHonor: number
    fromRecentHonors: number
    fromRollover: number
    votes: number
  }
}

type HonorPlayer = HonorBallot['eligibleAllies'][number]

const honoredGameIds = new Set<number>()
const honoredGameIdOrder: number[] = []
let honorInFlightGameId: number | null = null
let honorRetryTimer: ReturnType<typeof setTimeout> | null = null
let honorAttemptInProgress = false
let autoHonorUnsubs: Array<() => void> = []
const honorIdleListeners = new Set<() => void>()

function shufflePlayers<T>(players: T[]): T[] {
  for (let i = players.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[players[i], players[j]] = [players[j], players[i]]
  }
  return players
}

async function loadHonorBallot(): Promise<HonorBallot | null> {
  const ballotRes = await fetch('/lol-honor-v2/v1/ballot')
  if (!ballotRes.ok) {
    return null
  }

  return ballotRes.json() as Promise<HonorBallot>
}

function rememberHonoredGame(gameId: number) {
  if (honoredGameIds.has(gameId)) {
    return
  }

  honoredGameIds.add(gameId)
  honoredGameIdOrder.push(gameId)

  while (honoredGameIdOrder.length > 8) {
    const expiredGameId = honoredGameIdOrder.shift()
    if (expiredGameId != null) {
      honoredGameIds.delete(expiredGameId)
    }
  }
}

async function loadEogPartyPuuids(): Promise<Set<string>> {
  try {
    const res = await fetch('/lol-lobby/v2/party/eog-status')
    if (!res.ok) {
      return new Set()
    }

    const status = await res.json() as {
      eogPlayers?: string[]
      leftPlayers?: string[]
      readyPlayers?: string[]
    }

    return new Set([
      ...(status.eogPlayers || []),
      ...(status.leftPlayers || []),
      ...(status.readyPlayers || []),
    ])
  } catch {
    return new Set()
  }
}

async function completeHonorBallot() {
  const v1Res = await fetch('/lol-honor/v1/ballot', { method: 'POST' }).catch(() => null)
  if (!v1Res?.ok) {
    logger.info('[AutoHonor] 完成点赞 ballot 失败: %s', v1Res?.status ?? 'network-error')
    return false
  }
  return true
}

function takeTargets(targets: HonorPlayer[], candidates: HonorPlayer[], votes: number) {
  for (const candidate of candidates) {
    if (targets.length >= votes) {
      return
    }
    if (!targets.some((target) => target.puuid === candidate.puuid)) {
      targets.push(candidate)
    }
  }
}

function notifyHonorIdle() {
  if (isAutoHonorBusy()) {
    return
  }

  honorIdleListeners.forEach((listener) => {
    try {
      listener()
    } catch {
      // ignore listener errors
    }
  })
}

async function autoHonorTeammate(ballot?: HonorBallot | null): Promise<boolean> {
  let acquired = false

  try {
    honorAttemptInProgress = true
    const activeBallot = ballot ?? await loadHonorBallot()
    if (!activeBallot) {
      logger.info('[AutoHonor] 当前没有待点赞的对局')
      return false
    }

    if (honoredGameIds.has(activeBallot.gameId) || honorInFlightGameId === activeBallot.gameId) {
      return true
    }

    honorInFlightGameId = activeBallot.gameId
    acquired = true

    const allies = shufflePlayers([...(activeBallot.eligibleAllies || [])].filter((p) => !p.botPlayer))
    const opponents = shufflePlayers([...(activeBallot.eligibleOpponents || [])].filter((p) => !p.botPlayer))

    if (allies.length === 0 && opponents.length === 0) {
      logger.info('[AutoHonor] 没有可点赞的玩家')
      if (!await completeHonorBallot()) {
        return false
      }
      rememberHonoredGame(activeBallot.gameId)
      return true
    }

    const votes = activeBallot.votePool?.votes ?? 1
    logger.info('[AutoHonor] 可用票数: %d, 队友: %d, 对手: %d', votes, allies.length, opponents.length)

    const partyPuuids = await loadEogPartyPuuids()
    const partyAllies = allies.filter((p) => partyPuuids.has(p.puuid))
    const nonPartyAllies = allies.filter((p) => !partyPuuids.has(p.puuid))
    const nonPartyOpponents = opponents.filter((p) => !partyPuuids.has(p.puuid))
    const targets: HonorPlayer[] = []

    takeTargets(targets, partyAllies, votes)
    takeTargets(targets, nonPartyAllies, votes)
    takeTargets(targets, nonPartyOpponents, votes)

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i]
      const category = HONOR_CATEGORIES[Math.floor(Math.random() * HONOR_CATEGORIES.length)]
      const isAlly = allies.some((p) => p.puuid === target.puuid)

      const honorRes = await fetch('/lol-honor/v1/honor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          honorType: category,
          recipientPuuid: target.puuid,
        }),
      })

      if (honorRes.ok) {
        logger.info('[AutoHonor] 第 %d 票 OK -> [%s] 给了 %s%s', i + 1, category, target.championName, isAlly ? '' : ' (对手)')
      } else {
        logger.error('[AutoHonor] 第 %d 票失败', i + 1, honorRes.status, await honorRes.text())
        return false
      }
    }

    if (!await completeHonorBallot()) {
      return false
    }

    rememberHonoredGame(activeBallot.gameId)
    logger.info('[AutoHonor] 自动点赞完成，共 %d 票', targets.length)
    return true
  } catch (err) {
    logger.error('[AutoHonor] 自动点赞异常:', err)
    return false
  } finally {
    honorAttemptInProgress = false
    if (acquired) {
      honorInFlightGameId = null
    }
    notifyHonorIdle()
  }
}

function clearHonorRetryTimer() {
  if (honorRetryTimer) {
    clearTimeout(honorRetryTimer)
    honorRetryTimer = null
    notifyHonorIdle()
  }
}

function scheduleHonorRetry(attempt = 0) {
  clearHonorRetryTimer()
  const delay = BALLOT_RETRY_DELAYS[attempt]
  if (delay == null) {
    notifyHonorIdle()
    return
  }

  honorRetryTimer = setTimeout(async () => {
    honorRetryTimer = null
    const honored = await autoHonorTeammate()
    if (!honored) {
      scheduleHonorRetry(attempt + 1)
    } else {
      notifyHonorIdle()
    }
  }, delay)
}

export function updateAutoHonor(enabled: boolean) {
  if (enabled && autoHonorUnsubs.length === 0) {
    autoHonorUnsubs = [
      lcu.observe(LcuEventUri.HONOR_BALLOT, (event: LCUEventMessage) => {
        if (event.eventType !== 'Delete' && event.data) {
          clearHonorRetryTimer()
          autoHonorTeammate(event.data as HonorBallot)
        }
      }),
      lcu.observe(LcuEventUri.GAMEFLOW_PHASE_CHANGE, (event: LCUEventMessage) => {
        const phase = event.data as GameflowPhase
        if (phase === 'PreEndOfGame') {
          scheduleHonorRetry()
        }
      }),
    ]
    logger.info('Auto honor enabled OK')
  } else if (!enabled && autoHonorUnsubs.length > 0) {
    clearHonorRetryTimer()
    autoHonorUnsubs.forEach((unsubscribe) => unsubscribe())
    autoHonorUnsubs = []
    logger.info('Auto honor disabled')
  }
}

export function isAutoHonorBusy() {
  return honorInFlightGameId !== null || honorRetryTimer !== null || honorAttemptInProgress
}

export function onAutoHonorIdle(listener: () => void) {
  honorIdleListeners.add(listener)
  return () => honorIdleListeners.delete(listener)
}
