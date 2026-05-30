import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { logger } from '@/index'
import { lcu, LcuEventUri } from '@/lib/lcu'
import type { LCUEventMessage, GameflowPhase } from '@/lib/lcu'
import { injector } from '@/lib/InjectorManager'
import { GameAnalysisModal } from '@/components/ui/GameAnalysisModal'

// ==================== 进入游戏自动弹窗战力分析 ====================

const GAME_ANALYSIS_ROOT_ID = 'sona-game-analysis-root'
const GAME_ANALYSIS_MODAL_SELECTOR = '[data-sona-game-analysis-modal="true"], .sga-container'
const GAME_ANALYSIS_BTN_ATTR = 'data-sona-game-analysis'

let gameAnalysisRoot: Root | null = null
let gameAnalysisContainer: HTMLDivElement | null = null
let gameAnalysisBtnRegistered = false
let currentGameAnalysisPhase: GameflowPhase | null = null
let gameAnalysisPhaseRunId = 0
let lastPopupGameId = 0
let gameAnalysisPopupUnsub: (() => void) | null = null
let gameAnalysisAutoPopupEnabled = false

function isGameAnalysisPopupActive(runId: number) {
  return currentGameAnalysisPhase === 'InProgress' && runId === gameAnalysisPhaseRunId
}

function shouldResetPopupGameId(phase: GameflowPhase) {
  return phase !== 'GameStart' && phase !== 'Reconnect'
}

function cleanupStaleGameAnalysisDom(activeContainer: HTMLDivElement | null) {
  document.querySelectorAll<HTMLElement>('.sona-modal-overlay').forEach((overlay) => {
    if (overlay.querySelector(GAME_ANALYSIS_MODAL_SELECTOR)) {
      overlay.remove()
    }
  })

  document.querySelectorAll<HTMLDivElement>(`#${GAME_ANALYSIS_ROOT_ID}`).forEach((container) => {
    if (container !== activeContainer) {
      container.remove()
    }
  })
}

function destroyGameAnalysisModal() {
  if (gameAnalysisRoot) {
    gameAnalysisRoot.unmount()
    gameAnalysisRoot = null
  }

  if (gameAnalysisContainer) {
    gameAnalysisContainer.remove()
    gameAnalysisContainer = null
  }

  cleanupStaleGameAnalysisDom(null)
}

function ensureGameAnalysisRoot(): Root {
  if (gameAnalysisRoot && gameAnalysisContainer?.isConnected) {
    return gameAnalysisRoot
  }

  destroyGameAnalysisModal()
  gameAnalysisContainer = document.createElement('div')
  gameAnalysisContainer.id = GAME_ANALYSIS_ROOT_ID
  document.body.appendChild(gameAnalysisContainer)
  gameAnalysisRoot = createRoot(gameAnalysisContainer)
  return gameAnalysisRoot
}

function showGameAnalysisModal() {
  if (currentGameAnalysisPhase !== 'InProgress') return

  const root = ensureGameAnalysisRoot()
  root.render(
    createElement(GameAnalysisModal, { open: true, onClose: destroyGameAnalysisModal }),
  )
  logger.info('[GameAnalysis] 战力分析弹窗已显示')
}

// ---- 客户端内嵌按钮 ----

function tryInjectGameAnalysisButton(): boolean {
  const container = document.querySelector('.game-in-progress-container')
  if (!container) return false
  if (container.querySelector(`[${GAME_ANALYSIS_BTN_ATTR}]`)) return true

  const btn = document.createElement('lol-uikit-flat-button')
  btn.setAttribute(GAME_ANALYSIS_BTN_ATTR, 'true')
  btn.textContent = '对局分析'
  btn.style.display = 'block'
  btn.style.marginTop = '14px'

  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    e.preventDefault()
    showGameAnalysisModal()
    logger.info('[GameAnalysis] 打开分析弹窗')
  })

  const buildButton = container.querySelector('[data-sona-opgg-ingame-build]')
  if (buildButton?.parentElement === container) {
    ;(buildButton as HTMLElement).style.marginTop = '8px'
    buildButton.insertAdjacentElement('beforebegin', btn)
  } else {
    container.appendChild(btn)
  }
  logger.info('[GameAnalysis] 客户端内嵌按钮已注入 ✓')
  return true
}

function ensureGameAnalysisButtonRegistered() {
  if (gameAnalysisBtnRegistered) return

  injector.register(tryInjectGameAnalysisButton)
  gameAnalysisBtnRegistered = true
}

function cleanupGameAnalysisButton() {
  if (gameAnalysisBtnRegistered) {
    injector.unregister(tryInjectGameAnalysisButton)
    gameAnalysisBtnRegistered = false
  }

  document.querySelectorAll(`[${GAME_ANALYSIS_BTN_ATTR}]`).forEach((el) => el.remove())
}

function cleanupGameAnalysisRuntime(phase?: GameflowPhase) {
  if (!phase || shouldResetPopupGameId(phase)) {
    lastPopupGameId = 0
  }

  cleanupGameAnalysisButton()
  destroyGameAnalysisModal()
}

function maybeShowGameAnalysisAutoPopup(runId: number) {
  lcu.getGameflowSession()
    .then((session) => {
      if (!isGameAnalysisPopupActive(runId)) return

      const gid = session.gameData?.gameId ?? 0
      if (gid > 0 && gid !== lastPopupGameId) {
        lastPopupGameId = gid
        showGameAnalysisModal()
      }
    })
    .catch(() => {
      if (!isGameAnalysisPopupActive(runId) || lastPopupGameId === -1) return

      lastPopupGameId = -1
      showGameAnalysisModal()
    })
}

function rememberCurrentGameId(runId: number) {
  lcu.getGameflowSession()
    .then((session) => {
      if (!isGameAnalysisPopupActive(runId)) return
      lastPopupGameId = session.gameData?.gameId ?? -1
    })
    .catch(() => {
      if (!isGameAnalysisPopupActive(runId)) return
      lastPopupGameId = -1
    })
}

function handleGameAnalysisPhase(phase: GameflowPhase, autoPopup = true) {
  const previousPhase = currentGameAnalysisPhase
  currentGameAnalysisPhase = phase
  const runId = ++gameAnalysisPhaseRunId

  if (phase === 'InProgress') {
    ensureGameAnalysisButtonRegistered()
    if (autoPopup && previousPhase !== 'InProgress') {
      maybeShowGameAnalysisAutoPopup(runId)
    } else {
      rememberCurrentGameId(runId)
    }
    return
  }

  cleanupGameAnalysisRuntime(phase)
}

export function updateGameAnalysisPopup(enabled: boolean, autoPopupEnabled = enabled) {
  gameAnalysisAutoPopupEnabled = autoPopupEnabled

  if (enabled && !gameAnalysisPopupUnsub) {
    destroyGameAnalysisModal()
    gameAnalysisPopupUnsub = lcu.observe(LcuEventUri.GAMEFLOW_PHASE_CHANGE, (event: LCUEventMessage) => {
      handleGameAnalysisPhase(
        event.data as GameflowPhase,
        gameAnalysisAutoPopupEnabled && currentGameAnalysisPhase !== null,
      )
    })
    lcu.getGameflowPhase()
      .then((phase) => handleGameAnalysisPhase(phase, false))
      .catch(() => { /* ignore */ })
    logger.info('Game analysis popup enabled ✓')
  } else if (enabled && gameAnalysisPopupUnsub) {
    lcu.getGameflowPhase()
      .then((phase) => handleGameAnalysisPhase(phase, false))
      .catch(() => { /* ignore */ })
  } else if (!enabled && gameAnalysisPopupUnsub) {
    gameAnalysisPopupUnsub()
    gameAnalysisPopupUnsub = null
    currentGameAnalysisPhase = null
    gameAnalysisPhaseRunId++
    cleanupGameAnalysisRuntime()
    logger.info('Game analysis popup disabled')
  }
}
