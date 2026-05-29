import { store } from '@/lib/store'
import {
  getAutoAcceptCountdownMs,
  isAutoAcceptEnabledForCurrentLobby,
} from '@/lib/features/auto-accept'
import {
  getAutoMatchmakingConfiguredDelayMs,
  getAutoMatchmakingCountdownMs,
  getLowPriorityPenaltyRemainingSeconds,
  isAutoMatchmakingCountdownActive,
  isAutoMatchmakingEnabledForCurrentLobby,
} from '@/lib/features/auto-matchmaking'

const FIND_MATCH_TEXT_SELECTOR = '.find-match-button .button-text'
const READY_CHECK_ACCEPT_SELECTOR = '.ready-check-button-accept'
const LOW_PRIORITY_PENALTY_POLL_MS = 1000
const COUNTDOWN_RENDER_POLL_MS = 100

let textSyncTimer: ReturnType<typeof setInterval> | null = null
let countdownRenderTimer: ReturnType<typeof setInterval> | null = null
let textSyncObserver: MutationObserver | null = null
let syncScheduled = false
let installed = false
let penaltyRefreshInFlight = false
let lowPriorityPenaltyStatusLoaded = false
let lowPriorityPenaltyEndsAt = 0
let textSyncUnsubs: Array<() => void> = []

interface ManagedTextState {
  fallbackText: string
  lastWrittenText: string | null
}

const findMatchTextState: ManagedTextState = {
  fallbackText: '寻找对局',
  lastWrittenText: null,
}

const readyCheckAcceptTextState: ManagedTextState = {
  fallbackText: '接受！',
  lastWrittenText: null,
}

function formatSeconds(milliseconds: number) {
  return `${Math.max(0, milliseconds / 1000).toFixed(1)} s`
}

function findWritableTextNode(element: Element) {
  const textNodes = Array.from(element.childNodes)
    .filter((node): node is Text => node.nodeType === Node.TEXT_NODE)

  return textNodes.find((node) => node.textContent?.trim()) ?? textNodes[0] ?? null
}

function setManagedText(element: Element | null, state: ManagedTextState, text: string) {
  if (!element) {
    return
  }

  const textNode = findWritableTextNode(element)
  if (textNode) {
    if (textNode.textContent !== text) {
      textNode.textContent = text
    }
    state.lastWrittenText = text
    return
  }

  element.appendChild(document.createTextNode(text))
  state.lastWrittenText = text
}

function releaseManagedText(element: Element | null, state: ManagedTextState) {
  if (!element || !state.lastWrittenText) {
    state.lastWrittenText = null
    return
  }

  const textNode = findWritableTextNode(element)
  if (textNode?.textContent === state.lastWrittenText) {
    textNode.textContent = state.fallbackText
  }
  state.lastWrittenText = null
}

function getLowPriorityPenaltyRemainingMs() {
  if (lowPriorityPenaltyEndsAt <= 0) {
    return 0
  }

  const remainingMs = Math.max(0, lowPriorityPenaltyEndsAt - Date.now())
  if (remainingMs <= 0) {
    lowPriorityPenaltyEndsAt = 0
  }
  return remainingMs
}

async function refreshLowPriorityPenalty() {
  if (penaltyRefreshInFlight) return
  penaltyRefreshInFlight = true

  try {
    const remainingSeconds = await getLowPriorityPenaltyRemainingSeconds()
    lowPriorityPenaltyEndsAt = remainingSeconds > 0 ? Date.now() + remainingSeconds * 1000 : 0
  } catch {
    if (getLowPriorityPenaltyRemainingMs() <= 0) {
      lowPriorityPenaltyEndsAt = 0
    }
  } finally {
    lowPriorityPenaltyStatusLoaded = true
    penaltyRefreshInFlight = false
    if (installed) {
      scheduleSync()
    }
  }
}

function getAutoAcceptButtonText() {
  const countdownMs = getAutoAcceptCountdownMs()
  const delayMs = countdownMs ?? 0
  return `自动接受 (${formatSeconds(delayMs)})`
}

function getAutoMatchmakingButtonText() {
  const countdownMs = isAutoMatchmakingCountdownActive()
    ? getAutoMatchmakingCountdownMs()
    : null
  const delayMs = countdownMs ?? getAutoMatchmakingConfiguredDelayMs()
  return `自动匹配 (${formatSeconds(delayMs)})`
}

function shouldRenderCountdown() {
  return Boolean(
    (isAutoAcceptEnabledForCurrentLobby() && getAutoAcceptCountdownMs() !== null)
    || (isAutoMatchmakingEnabledForCurrentLobby() && isAutoMatchmakingCountdownActive()),
  )
}

function updateCountdownRenderTimer() {
  const shouldStart = shouldRenderCountdown()
  if (shouldStart && !countdownRenderTimer) {
    countdownRenderTimer = setInterval(scheduleSync, COUNTDOWN_RENDER_POLL_MS)
  } else if (!shouldStart && countdownRenderTimer) {
    clearInterval(countdownRenderTimer)
    countdownRenderTimer = null
  }
}

function scheduleSync() {
  if (syncScheduled || !installed) return
  syncScheduled = true
  requestAnimationFrame(() => {
    syncScheduled = false
    if (!installed) return
    syncNativeAutomationButtonText()
    updateCountdownRenderTimer()
  })
}

function syncNativeAutomationButtonText() {
  const findMatchText = document.querySelector(FIND_MATCH_TEXT_SELECTOR)
  const penaltyRemainingMs = getLowPriorityPenaltyRemainingMs()
  const shouldWaitForPenaltyStatus =
    isAutoMatchmakingEnabledForCurrentLobby() && !lowPriorityPenaltyStatusLoaded
  if (penaltyRemainingMs <= 0 && !shouldWaitForPenaltyStatus) {
    if (isAutoMatchmakingEnabledForCurrentLobby()) {
      setManagedText(findMatchText, findMatchTextState, getAutoMatchmakingButtonText())
    } else {
      releaseManagedText(findMatchText, findMatchTextState)
    }
  }

  const readyCheckAccept = document.querySelector(READY_CHECK_ACCEPT_SELECTOR)
  if (isAutoAcceptEnabledForCurrentLobby()) {
    setManagedText(readyCheckAccept, readyCheckAcceptTextState, getAutoAcceptButtonText())
  } else {
    releaseManagedText(readyCheckAccept, readyCheckAcceptTextState)
  }
}

export function initNativeAutomationButtonText() {
  if (installed) return
  installed = true

  scheduleSync()
  void refreshLowPriorityPenalty()
  textSyncTimer = setInterval(() => {
    void refreshLowPriorityPenalty()
  }, LOW_PRIORITY_PENALTY_POLL_MS)
  textSyncObserver = new MutationObserver(scheduleSync)
  textSyncObserver.observe(document.body, {
    childList: true,
    subtree: true,
  })

  textSyncUnsubs = [
    store.onChange('autoAcceptMatch', scheduleSync),
    store.onChange('lobbyHeaderAutoAcceptEnabled', scheduleSync),
    store.onChange('autoAcceptDelayMin', scheduleSync),
    store.onChange('autoAcceptDelayMax', scheduleSync),
    store.onChange('autoMatchmaking', scheduleSync),
    store.onChange('lobbyHeaderAutoMatchmakingEnabled', scheduleSync),
    store.onChange('autoMatchmakingDelaySeconds', scheduleSync),
  ]
}

export function stopNativeAutomationButtonText() {
  syncScheduled = false
  if (textSyncTimer) {
    clearInterval(textSyncTimer)
    textSyncTimer = null
  }
  if (countdownRenderTimer) {
    clearInterval(countdownRenderTimer)
    countdownRenderTimer = null
  }
  textSyncUnsubs.forEach((unsubscribe) => unsubscribe())
  textSyncUnsubs = []
  textSyncObserver?.disconnect()
  textSyncObserver = null
  lowPriorityPenaltyEndsAt = 0
  penaltyRefreshInFlight = false
  lowPriorityPenaltyStatusLoaded = false
  findMatchTextState.lastWrittenText = null
  readyCheckAcceptTextState.lastWrittenText = null
  installed = false
}
