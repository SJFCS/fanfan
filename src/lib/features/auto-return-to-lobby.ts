import { logger } from '@/index'
import { lcu, LcuEventUri } from '@/lib/lcu'
import type { LCUEventMessage, GameflowPhase } from '@/lib/lcu'
import { sleep } from '@/lib/utils'
import { isAutoHonorBusy, onAutoHonorIdle } from '@/lib/features/auto-honor'

// ==================== 对局结束自动返回房间 ====================

const WAIT_FOR_BALLOT_MS = 3250
const WAIT_FOR_STATS_MS = 10000
const END_OF_GAME_BUFFER_MS = 1575
const PLAY_AGAIN_RETRY_MS = 650
const MAX_PLAY_AGAIN_RETRIES = 5
const HONOR_IDLE_WAIT_TIMEOUT_MS = 8000

let autoReturnUnsub: (() => void) | null = null
let autoReturnTimer: ReturnType<typeof setTimeout> | null = null
let autoReturnDueAt = 0
let autoReturnRunId = 0
let autoReturnInFlight = false
const returnedToLobbyListeners = new Set<() => void>()

function resetAutoReturnRuntime() {
  clearAutoReturnTimer()
  autoReturnRunId++
}

function clearAutoReturnTimer() {
  if (autoReturnTimer) {
    clearTimeout(autoReturnTimer)
    autoReturnTimer = null
  }
  autoReturnDueAt = 0
}

function scheduleAutoReturn(delayMs: number, reason: string) {
  const dueAt = Date.now() + delayMs
  if (autoReturnTimer && autoReturnDueAt <= dueAt) {
    logger.info('[AutoReturn] 已有更早的返回任务，跳过 %s', reason)
    return
  }

  clearAutoReturnTimer()
  const runId = ++autoReturnRunId
  autoReturnDueAt = dueAt
  logger.info('[AutoReturn] %s，%dms 后尝试 play-again', reason, delayMs)

  autoReturnTimer = setTimeout(() => {
    autoReturnTimer = null
    autoReturnDueAt = 0
    executeAutoReturn(runId)
  }, delayMs)
}

function waitForAutoHonorIdle(runId: number) {
  if (!isAutoHonorBusy()) {
    return Promise.resolve(true)
  }

  return new Promise<boolean>((resolve) => {
    let unsubscribe: (() => void) | null = null
    const timer = setTimeout(() => {
      unsubscribe?.()
      resolve(runId === autoReturnRunId)
    }, HONOR_IDLE_WAIT_TIMEOUT_MS)

    unsubscribe = onAutoHonorIdle(() => {
      clearTimeout(timer)
      unsubscribe?.()
      resolve(runId === autoReturnRunId)
    })
  })
}

function notifyAutoReturnedToLobby() {
  returnedToLobbyListeners.forEach((listener) => {
    try {
      listener()
    } catch {
      // ignore listener errors
    }
  })
}

async function playAgainWithRetry(runId: number) {
  for (let i = 1; i <= MAX_PLAY_AGAIN_RETRIES; i++) {
    if (runId !== autoReturnRunId) {
      return false
    }

    try {
      await lcu.playAgain()
      logger.info('[AutoReturn] 已通过 play-again 重建房间，保留原队伍结构 OK (第 %d 次尝试)', i)
      return true
    } catch (err) {
      if (i < MAX_PLAY_AGAIN_RETRIES) {
        logger.info('[AutoReturn] play-again 暂不可用，稍后重试... (%d/%d)', i, MAX_PLAY_AGAIN_RETRIES)
        await sleep(PLAY_AGAIN_RETRY_MS)
      } else {
        logger.error('[AutoReturn] play-again 失败，已达到最大重试次数 %d:', MAX_PLAY_AGAIN_RETRIES, err)
      }
    }
  }

  return false
}

async function executeAutoReturn(runId: number) {
  if (autoReturnInFlight || runId !== autoReturnRunId) {
    return
  }

  autoReturnInFlight = true

  try {
    if (!await waitForAutoHonorIdle(runId)) {
      return
    }

    const returnedToLobby = await playAgainWithRetry(runId)
    if (!returnedToLobby) {
      return
    }

    notifyAutoReturnedToLobby()
  } catch (err) {
    logger.error('[AutoReturn] 自动返回流程异常:', err)
  } finally {
    autoReturnInFlight = false
  }
}

export function updateAutoReturnToLobby(enabled: boolean) {
  if (enabled && !autoReturnUnsub) {
    autoReturnUnsub = lcu.observe(LcuEventUri.GAMEFLOW_PHASE_CHANGE, (event: LCUEventMessage) => {
      const phase = event.data as GameflowPhase

      if (phase === 'WaitingForStats') {
        scheduleAutoReturn(WAIT_FOR_STATS_MS, 'WaitingForStats fallback')
      } else if (phase === 'PreEndOfGame') {
        scheduleAutoReturn(WAIT_FOR_BALLOT_MS, 'PreEndOfGame')
      } else if (phase === 'EndOfGame') {
        scheduleAutoReturn(END_OF_GAME_BUFFER_MS, 'EndOfGame')
      } else {
        resetAutoReturnRuntime()
      }
    })
    logger.info('Auto return to lobby enabled OK')
  } else if (!enabled && autoReturnUnsub) {
    resetAutoReturnRuntime()
    autoReturnUnsub()
    autoReturnUnsub = null
    logger.info('Auto return to lobby disabled')
  }
}

export function stopAutoReturnToLobby() {
  updateAutoReturnToLobby(false)
  resetAutoReturnRuntime()
}

export function onAutoReturnedToLobby(listener: () => void) {
  returnedToLobbyListeners.add(listener)
  return () => {
    returnedToLobbyListeners.delete(listener)
  }
}
