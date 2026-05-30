import { logger } from '@/index'
import { lcu } from '@/lib/lcu'
import { sleep } from '@/lib/utils'
import { store } from '@/lib/store'
import type { GameflowPhase } from '@/lib/lcu'

// ==================== 急速回房间 ====================

const ENDGAME_PHASES = new Set<GameflowPhase>(['WaitingForStats', 'PreEndOfGame', 'EndOfGame'])
const PHASE_POLL_INTERVAL_MS = 500
const PLAY_AGAIN_RETRY_MS = 300
const PLAY_AGAIN_RETRY_COUNT = 10
const HONOR_RETRY_DELAYS_MS = [0, 250, 500, 750, 1000, 1500, 2000, 3000] as const
const HONOR_GAME_CACHE_LIMIT = 8

interface FastHonorBallot {
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
  votePool?: {
    votes?: number
  }
}

const honoredGameIds = new Set<number>()
const honoredGameIdOrder: number[] = []

let pollTimer: ReturnType<typeof setInterval> | null = null
let pollInFlight = false
let fastReturnRunId = 0
let fastReturnInFlight = false
let lastPolledPhase: GameflowPhase | null = null
let triggeredForCurrentEndgame = false
let honorRetryTimer: ReturnType<typeof setTimeout> | null = null
let honorRunId = 0
let honorInFlightGameId: number | null = null
let honorAttemptInProgress = false

function isEnabled() {
  return store.get('autoFastReturnToLobby')
}

function rememberHonoredGame(gameId: number) {
  if (honoredGameIds.has(gameId)) {
    return
  }

  honoredGameIds.add(gameId)
  honoredGameIdOrder.push(gameId)

  while (honoredGameIdOrder.length > HONOR_GAME_CACHE_LIMIT) {
    const expired = honoredGameIdOrder.shift()
    if (expired != null) {
      honoredGameIds.delete(expired)
    }
  }
}

async function loadHonorBallot(): Promise<FastHonorBallot | null> {
  const res = await fetch('/lol-honor-v2/v1/ballot').catch(() => null)
  if (!res || !res.ok) {
    return null
  }

  return res.json() as Promise<FastHonorBallot>
}

function pickTargets(ballot: FastHonorBallot) {
  const votes = Math.max(ballot.votePool?.votes ?? 1, 1)
  const allies = [...(ballot.eligibleAllies || [])].filter((p) => !p.botPlayer)
  const opponents = [...(ballot.eligibleOpponents || [])].filter((p) => !p.botPlayer)
  const candidates = [...allies, ...opponents]

  if (candidates.length === 0) {
    return []
  }

  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
  }

  return candidates.slice(0, Math.min(votes, candidates.length))
}

async function completeHonorBallot() {
  const res = await fetch('/lol-honor/v1/ballot', { method: 'POST' }).catch(() => null)
  return Boolean(res?.ok)
}

function clearHonorRetryTimer() {
  if (honorRetryTimer) {
    clearTimeout(honorRetryTimer)
    honorRetryTimer = null
  }
}

async function attemptHonorOnce(runId: number): Promise<boolean> {
  if (!isEnabled() || runId !== honorRunId) {
    return false
  }

  honorAttemptInProgress = true
  try {
    const ballot = await loadHonorBallot()
    if (!ballot) {
      return false
    }

    if (honoredGameIds.has(ballot.gameId) || honorInFlightGameId === ballot.gameId) {
      return true
    }

    honorInFlightGameId = ballot.gameId

    const targets = pickTargets(ballot)
    if (targets.length === 0) {
      if (!await completeHonorBallot()) {
        return false
      }
      rememberHonoredGame(ballot.gameId)
      logger.info('[FastReturn] 没有可点赞玩家，已完成 ballot')
      return true
    }

    for (const target of targets) {
      if (!isEnabled() || runId !== honorRunId) {
        return false
      }

      const honorRes = await fetch('/lol-honor-v2/v1/honor-player/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: ballot.gameId,
          honorCategory: 'HEART',
          summonerId: target.summonerId,
          puuid: target.puuid,
        }),
      })

      if (!honorRes.ok) {
        logger.warn('[FastReturn] 点赞失败，status=%d', honorRes.status)
        return false
      }
    }

    if (!await completeHonorBallot()) {
      return false
    }

    rememberHonoredGame(ballot.gameId)
    logger.info('[FastReturn] 尽力点赞完成，gameId=%d, votes=%d', ballot.gameId, targets.length)
    return true
  } catch (err) {
    logger.warn('[FastReturn] 点赞流程异常:', err)
    return false
  } finally {
    honorAttemptInProgress = false
    honorInFlightGameId = null
  }
}

function scheduleHonorBestEffort(attempt = 0) {
  if (!isEnabled()) {
    return
  }

  clearHonorRetryTimer()
  const delay = HONOR_RETRY_DELAYS_MS[attempt]
  if (delay == null) {
    return
  }

  const runId = honorRunId
  honorRetryTimer = setTimeout(async () => {
    honorRetryTimer = null
    if (!isEnabled() || runId !== honorRunId) {
      return
    }

    const honored = await attemptHonorOnce(runId)
    if (!honored) {
      scheduleHonorBestEffort(attempt + 1)
    }
  }, delay)
}

async function playAgainWithRetry(runId: number) {
  for (let i = 1; i <= PLAY_AGAIN_RETRY_COUNT; i++) {
    if (!isEnabled() || runId !== fastReturnRunId) {
      return false
    }

    try {
      await lcu.playAgain()
      logger.info('[FastReturn] 已优先回房间，play-again 成功（第 %d 次尝试）', i)
      return true
    } catch (err) {
      if (i < PLAY_AGAIN_RETRY_COUNT) {
        await sleep(PLAY_AGAIN_RETRY_MS)
      } else {
        logger.warn('[FastReturn] play-again 失败，已重试 %d 次:', PLAY_AGAIN_RETRY_COUNT, err)
      }
    }
  }

  return false
}

async function executeFastReturn(runId: number) {
  if (fastReturnInFlight || runId !== fastReturnRunId || !isEnabled()) {
    return
  }

  fastReturnInFlight = true
  try {
    const shouldTryHonor = store.get('autoHonor')
    const playAgainPromise = playAgainWithRetry(runId)

    if (shouldTryHonor && isEnabled() && runId === fastReturnRunId) {
      scheduleHonorBestEffort()
    }

    await playAgainPromise
  } catch (err) {
    logger.error('[FastReturn] 急速回房间异常:', err)
  } finally {
    fastReturnInFlight = false
  }
}

async function pollGameflow() {
  if (pollInFlight || !isEnabled()) {
    return
  }

  pollInFlight = true
  try {
    const phase = await lcu.getGameflowPhase().catch(() => null)
    if (!phase) {
      return
    }

    const inEndgame = ENDGAME_PHASES.has(phase)
    const wasInEndgame = lastPolledPhase != null && ENDGAME_PHASES.has(lastPolledPhase)

    if (inEndgame && !wasInEndgame) {
      triggeredForCurrentEndgame = false
      fastReturnRunId++
      honorRunId++
      logger.info('[FastReturn] 检测到结算阶段 %s，开始优先回房间', phase)
    }

    if (!inEndgame) {
      triggeredForCurrentEndgame = false
    } else if (!triggeredForCurrentEndgame) {
      triggeredForCurrentEndgame = true
      void executeFastReturn(fastReturnRunId)
    }

    lastPolledPhase = phase
  } finally {
    pollInFlight = false
  }
}

function startPolling() {
  if (pollTimer) {
    return
  }

  void pollGameflow()
  pollTimer = setInterval(() => {
    void pollGameflow()
  }, PHASE_POLL_INTERVAL_MS)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function resetRuntime() {
  clearHonorRetryTimer()
  fastReturnRunId++
  honorRunId++
  fastReturnInFlight = false
  honorInFlightGameId = null
  honorAttemptInProgress = false
  triggeredForCurrentEndgame = false
  lastPolledPhase = null
}

export function updateAutoFastReturnToLobby(enabled: boolean) {
  if (enabled) {
    startPolling()
    void pollGameflow()
    logger.info('Fast return to lobby enabled OK')
    return
  }

  stopPolling()
  resetRuntime()
  logger.info('Fast return to lobby disabled')
}

export function isFastReturnBusy() {
  return fastReturnInFlight || honorAttemptInProgress || honorRetryTimer !== null
}
