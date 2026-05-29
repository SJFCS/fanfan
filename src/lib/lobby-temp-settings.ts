import { logger } from '@/index'
import { lcu, LcuEventUri } from '@/lib/lcu'
import type { LCUEventMessage, Lobby } from '@/lib/lcu'

export type LobbyTempSettings = {
  /** 临时开关：自动接受对局（仅当前房间） */
  autoAcceptEnabled?: boolean
  /** 临时开关：自动匹配（仅当前房间） */
  autoMatchmakingEnabled?: boolean
  /** 临时配置：自动匹配最低人数（仅当前房间） */
  autoMatchmakingMinimumMembers?: number
  /** 临时配置：自动匹配等待时长（秒，仅当前房间） */
  autoMatchmakingDelaySeconds?: number
  /** 临时配置：等待邀请中的成员（仅当前房间） */
  autoMatchmakingWaitForInvitees?: boolean
}

export type LobbyTempSettingsChange =
  | { type: 'party'; partyId: string | null; previousPartyId: string | null; reason: string }
  | { type: 'settings'; partyId: string; key: keyof LobbyTempSettings; reason: string }

let installed = false
let currentPartyId: string | null = null
const settingsByParty = new Map<string, LobbyTempSettings>()
const listeners = new Set<(change: LobbyTempSettingsChange) => void>()

let refreshInFlight: Promise<void> | null = null

function emit(change: LobbyTempSettingsChange) {
  for (const listener of listeners) {
    try {
      listener(change)
    } catch (err) {
      logger.warn('[LobbyTempSettings] listener error:', err)
    }
  }
}

async function tryGetLobby(): Promise<Lobby | null> {
  try {
    return await lcu.getLobby()
  } catch {
    return null
  }
}

async function refreshCurrentPartyId(reason: string) {
  if (refreshInFlight) return refreshInFlight

  refreshInFlight = (async () => {
    const lobby = await tryGetLobby()
    const nextPartyId = lobby?.partyId || null

    if (nextPartyId === currentPartyId) return

    const previousPartyId = currentPartyId
    currentPartyId = nextPartyId

    if (previousPartyId) {
      // 只作用于当前房间：离开房间后丢弃旧房间的临时配置
      settingsByParty.delete(previousPartyId)
    }

    emit({ type: 'party', partyId: nextPartyId, previousPartyId, reason })
  })().finally(() => {
    refreshInFlight = null
  })

  return refreshInFlight
}

export function installLobbyTempSettings() {
  if (installed) return
  installed = true

  // 启动时先刷新一次
  void refreshCurrentPartyId('install')

  // 房间变化：partyId 变化 / 离开房间
  lcu.observe(LcuEventUri.LOBBY, () => {
    void refreshCurrentPartyId('lobby event')
  })

  // 兜底：phase 切换时也刷新一次，避免漏掉 Delete 事件
  lcu.observe(LcuEventUri.GAMEFLOW_PHASE_CHANGE, (event: LCUEventMessage) => {
    void refreshCurrentPartyId(`phase=${String(event.data)}`)
  })
}

export function onLobbyTempSettingsChange(listener: (change: LobbyTempSettingsChange) => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getCurrentPartyId() {
  return currentPartyId
}

export function getLobbyTempSettings(partyId = currentPartyId): LobbyTempSettings | null {
  if (!partyId) return null
  return settingsByParty.get(partyId) ?? {}
}

function isAllUndefined(settings: LobbyTempSettings): boolean {
  for (const value of Object.values(settings)) {
    if (value !== undefined) return false
  }
  return true
}

export async function setLobbyTempSetting<K extends keyof LobbyTempSettings>(
  key: K,
  value: LobbyTempSettings[K],
  reason: string,
) {
  if (!currentPartyId) {
    await refreshCurrentPartyId('set temp setting')
  }
  if (!currentPartyId) return

  const prev = settingsByParty.get(currentPartyId) ?? {}
  const next = { ...prev, [key]: value }
  if (isAllUndefined(next)) {
    settingsByParty.delete(currentPartyId)
  } else {
    settingsByParty.set(currentPartyId, next)
  }

  emit({ type: 'settings', partyId: currentPartyId, key, reason })
}

