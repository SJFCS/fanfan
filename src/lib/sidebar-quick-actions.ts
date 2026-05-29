import { logger } from '@/index'
import { translate } from '@/i18n'
import { lcu } from '@/lib/lcu'
import type { GameflowPhase } from '@/lib/lcu'
import { store, type SonaConfig } from '@/lib/store'

export type SidebarQuickActionId = 'gameConfigLock' | 'playAgain' | 'leaveLobby' | 'restartUx'

type SidebarQuickActionPinKey = keyof Pick<
  SonaConfig,
  | 'sidebarPinnedGameConfigLock'
  | 'sidebarPinnedPlayAgain'
  | 'sidebarPinnedLeaveLobby'
  | 'sidebarPinnedRestartUx'
>

export type SidebarQuickActionPins = Record<SidebarQuickActionId, boolean>
export type SidebarQuickActionBusySnapshot = Record<SidebarQuickActionId, boolean>

const ENDGAME_PHASES: GameflowPhase[] = ['WaitingForStats', 'PreEndOfGame', 'EndOfGame']

const PIN_KEYS: Record<SidebarQuickActionId, SidebarQuickActionPinKey> = {
  gameConfigLock: 'sidebarPinnedGameConfigLock',
  playAgain: 'sidebarPinnedPlayAgain',
  leaveLobby: 'sidebarPinnedLeaveLobby',
  restartUx: 'sidebarPinnedRestartUx',
}

const busyActions = new Set<SidebarQuickActionId>()
const busyListeners = new Set<() => void>()

function emitBusyChange() {
  busyListeners.forEach((listener) => {
    try {
      listener()
    } catch {
      // ignore listener errors
    }
  })
}

function setActionBusy(action: SidebarQuickActionId, busy: boolean) {
  const changed = busy ? !busyActions.has(action) : busyActions.has(action)
  if (!changed) return

  if (busy) {
    busyActions.add(action)
  } else {
    busyActions.delete(action)
  }
  emitBusyChange()
}

function getErrorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function notifyError(message: string) {
  await lcu.sendNotification('FanFan', message).catch(() => {})
}

export function getSidebarQuickActionPins(): SidebarQuickActionPins {
  return {
    gameConfigLock: store.get('sidebarPinnedGameConfigLock'),
    playAgain: store.get('sidebarPinnedPlayAgain'),
    leaveLobby: store.get('sidebarPinnedLeaveLobby'),
    restartUx: store.get('sidebarPinnedRestartUx'),
  }
}

export function getSidebarQuickActionPinned(action: SidebarQuickActionId): boolean {
  return store.get(PIN_KEYS[action])
}

export function setSidebarQuickActionPinned(action: SidebarQuickActionId, pinned: boolean) {
  store.set(PIN_KEYS[action], pinned)
}

export function onSidebarQuickActionPinnedChange(action: SidebarQuickActionId, listener: (pinned: boolean) => void) {
  return store.onChange(PIN_KEYS[action], listener)
}

export function onSidebarQuickActionPinsChange(listener: (pins: SidebarQuickActionPins) => void) {
  const sync = () => listener(getSidebarQuickActionPins())
  const unsubs = Object.values(PIN_KEYS).map((key) => store.onChange(key, sync))
  return () => unsubs.forEach((unsubscribe) => unsubscribe())
}

export function getSidebarQuickActionBusySnapshot(): SidebarQuickActionBusySnapshot {
  return {
    gameConfigLock: busyActions.has('gameConfigLock'),
    playAgain: busyActions.has('playAgain'),
    leaveLobby: busyActions.has('leaveLobby'),
    restartUx: busyActions.has('restartUx'),
  }
}

export function onSidebarQuickActionStateChange(listener: () => void) {
  busyListeners.add(listener)
  return () => {
    busyListeners.delete(listener)
  }
}

export async function toggleGameConfigLock(): Promise<boolean> {
  if (!Pengu.gameConfig) {
    throw new Error(translate('tools.configLock.unsupported'))
  }

  const next = !store.get('gameConfigLocked')
  if (next) {
    await Pengu.gameConfig.lock()
  } else {
    await Pengu.gameConfig.unlock()
  }

  store.set('gameConfigLocked', next)
  return next
}

export async function playAgainFromEndgame(): Promise<GameflowPhase> {
  const phase = await lcu.getGameflowPhase()
  if (!ENDGAME_PHASES.includes(phase)) {
    throw new Error(translate('tools.gameflow.playAgain.notEndgame', { phase }))
  }

  await lcu.playAgain()
  return phase
}

export async function leaveCurrentLobby(): Promise<void> {
  const phase = await lcu.getGameflowPhase()
  if (phase !== 'Lobby') {
    throw new Error(translate('tools.gameflow.leaveLobby.notLobby', { phase }))
  }

  await lcu.leaveLobby()
}

export async function restartClientUx(): Promise<void> {
  await lcu.restartUx()
}

export async function runSidebarQuickAction(action: SidebarQuickActionId) {
  if (busyActions.has(action)) return

  setActionBusy(action, true)
  try {
    if (action === 'gameConfigLock') {
      const locked = await toggleGameConfigLock()
      logger.info('[SidebarQuickAction] %s', locked ? translate('tools.configLock.locked') : translate('tools.configLock.unlocked'))
    } else if (action === 'playAgain') {
      const phase = await playAgainFromEndgame()
      logger.info('[SidebarQuickAction] Requested play-again from endgame phase: %s', phase)
    } else if (action === 'leaveLobby') {
      await leaveCurrentLobby()
      logger.info('[SidebarQuickAction] Left current lobby')
    } else {
      await restartClientUx()
      logger.info('[SidebarQuickAction] League Client UX restart requested')
    }
  } catch (error) {
    const errorText = getErrorText(error)
    const message = action === 'gameConfigLock'
      ? translate('tools.configLock.failed', { error: errorText })
      : action === 'playAgain'
        ? translate('tools.gameflow.playAgain.failed', { error: errorText })
        : action === 'leaveLobby'
          ? translate('tools.gameflow.leaveLobby.failed', { error: errorText })
          : translate('tools.restartUx.failed', { error: errorText })

    logger.error('[SidebarQuickAction] %s', message)
    await notifyError(message)
  } finally {
    setActionBusy(action, false)
  }
}
