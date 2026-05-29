import { store } from '@/lib/store'
import {
  getAutoAcceptCountdownMs,
  isAutoAcceptEnabledForCurrentLobby,
} from '@/lib/features/auto-accept'
import {
  getAutoMatchmakingConfiguredDelayMs,
  getAutoMatchmakingCountdownMs,
  isAutoMatchmakingCountdownActive,
  isAutoMatchmakingEnabledForCurrentLobby,
} from '@/lib/features/auto-matchmaking'

const FIND_MATCH_TEXT_SELECTOR = '.find-match-button .button-text'
const READY_CHECK_ACCEPT_SELECTOR = '.ready-check-button-accept'

let textSyncTimer: ReturnType<typeof setInterval> | null = null
let textSyncObserver: MutationObserver | null = null
let textSyncFrame = 0
let installed = false

function formatSeconds(milliseconds: number) {
  return `${Math.max(0, milliseconds / 1000).toFixed(1)} s`
}

function findWritableTextNode(element: Element) {
  const textNodes = Array.from(element.childNodes)
    .filter((node): node is Text => node.nodeType === Node.TEXT_NODE)

  return textNodes.find((node) => node.textContent?.trim()) ?? textNodes[0] ?? null
}

function setTextIfNeeded(element: Element | null, text: string) {
  if (!element) {
    return
  }

  const textNode = findWritableTextNode(element)
  if (textNode) {
    if (textNode.textContent !== text) {
      textNode.textContent = text
    }
    return
  }

  element.appendChild(document.createTextNode(text))
}

function getAutoAcceptButtonText() {
  if (!isAutoAcceptEnabledForCurrentLobby()) {
    return '接受！'
  }

  const countdownMs = getAutoAcceptCountdownMs()
  const delayMs = countdownMs ?? 0
  return `自动接受 (${formatSeconds(delayMs)})`
}

function getAutoMatchmakingButtonText() {
  if (!isAutoMatchmakingEnabledForCurrentLobby()) {
    return '寻找对局'
  }

  const countdownMs = isAutoMatchmakingCountdownActive()
    ? getAutoMatchmakingCountdownMs()
    : null
  const delayMs = countdownMs ?? getAutoMatchmakingConfiguredDelayMs()
  return `自动匹配 (${formatSeconds(delayMs)})`
}

function syncNativeAutomationButtonText() {
  setTextIfNeeded(document.querySelector(FIND_MATCH_TEXT_SELECTOR), getAutoMatchmakingButtonText())
  setTextIfNeeded(document.querySelector(READY_CHECK_ACCEPT_SELECTOR), getAutoAcceptButtonText())
}

function startNativeAutomationButtonTextSyncLoop() {
  const tick = () => {
    syncNativeAutomationButtonText()
    textSyncFrame = requestAnimationFrame(tick)
  }

  if (!textSyncFrame) {
    textSyncFrame = requestAnimationFrame(tick)
  }
}

export function initNativeAutomationButtonText() {
  if (installed) return
  installed = true

  syncNativeAutomationButtonText()
  startNativeAutomationButtonTextSyncLoop()
  textSyncObserver = new MutationObserver(syncNativeAutomationButtonText)
  textSyncObserver.observe(document.body, {
    characterData: true,
    childList: true,
    subtree: true,
  })

  store.onChange('autoAcceptMatch', syncNativeAutomationButtonText)
  store.onChange('lobbyHeaderAutoAcceptEnabled', syncNativeAutomationButtonText)
  store.onChange('autoAcceptDelayMin', syncNativeAutomationButtonText)
  store.onChange('autoAcceptDelayMax', syncNativeAutomationButtonText)
  store.onChange('autoMatchmaking', syncNativeAutomationButtonText)
  store.onChange('lobbyHeaderAutoMatchmakingEnabled', syncNativeAutomationButtonText)
  store.onChange('autoMatchmakingDelaySeconds', syncNativeAutomationButtonText)
}

export function stopNativeAutomationButtonText() {
  if (textSyncFrame) {
    cancelAnimationFrame(textSyncFrame)
    textSyncFrame = 0
  }
  textSyncObserver?.disconnect()
  textSyncObserver = null
  installed = false
}
