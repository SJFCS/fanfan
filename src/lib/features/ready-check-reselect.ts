import { logger } from '@/index'
import { lcu } from '@/lib/lcu'
import { store } from '@/lib/store'

const READY_CHECK_MACHINE_SELECTOR =
  'uikit-state-machine.ready-check-state-machine[ready-check-data-state]'
const READY_CHECK_ACCEPT_SELECTOR = '.ready-check-button-accept'
const READY_CHECK_DECLINE_SELECTOR = '.ready-check-button-decline'
const READY_CHECK_BUTTONS_SELECTOR = '.ready-check-buttons-element'
const ACTIVE_CLASS = 'sona-ready-check-reselect-active'
const RESPONSE_ACCEPTED_CLASS = 'sona-ready-check-reselect-response-accepted'
const RESPONSE_DECLINED_CLASS = 'sona-ready-check-reselect-response-declined'
const RESPONSE_NONE_CLASS = 'sona-ready-check-reselect-response-none'
const ACCEPT_CLASS = 'sona-ready-check-accept-reselect'
const DECLINE_CLASS = 'sona-ready-check-decline-reselect'
const CLICKABLE_CLASS = 'sona-ready-check-reselect-clickable'
const INACTIVE_CLASS = 'sona-ready-check-reselect-inactive'
const BUTTONS_CLASS = 'sona-ready-check-buttons-reselect'

type ElementVisualSnapshot = {
  className: string
  style: string | null
}

let installed = false
let syncScheduled = false
let responseInFlight: ReadyCheckResponse | null = null
let queuedResponse: ReadyCheckResponse | null = null
let rootObserver: MutationObserver | null = null
let machineObserver: MutationObserver | null = null
let observedMachine: HTMLElement | null = null
let storeUnsub: (() => void) | null = null
let acceptSnapshot: ElementVisualSnapshot | null = null
let declineSnapshot: ElementVisualSnapshot | null = null
let buttonsSnapshot: ElementVisualSnapshot | null = null

type ReadyCheckResponse = 'accept' | 'decline'
type ReadyCheckPlayerResponse = 'None' | 'Accepted' | 'Declined'

function isReadyCheckInProgress(machine: HTMLElement | null) {
  return machine?.getAttribute('ready-check-data-state') === 'InProgress'
}

function isEnabled() {
  return store.get('readyCheckReselect')
}

function getReadyCheckMachine() {
  return document.querySelector<HTMLElement>(READY_CHECK_MACHINE_SELECTOR)
}

function getPlayerResponse(machine: HTMLElement | null): ReadyCheckPlayerResponse {
  const response = machine?.getAttribute('ready-check-data-player-response')
  return response === 'Accepted' || response === 'Declined' ? response : 'None'
}

function sanitizeClassName(className: string) {
  return className
    .split(/\s+/)
    .filter((name) => name && ![
      ACTIVE_CLASS,
      RESPONSE_ACCEPTED_CLASS,
      RESPONSE_DECLINED_CLASS,
      RESPONSE_NONE_CLASS,
      ACCEPT_CLASS,
      DECLINE_CLASS,
      CLICKABLE_CLASS,
      INACTIVE_CLASS,
      BUTTONS_CLASS,
    ].includes(name))
    .join(' ')
}

function takeVisualSnapshot(element: HTMLElement): ElementVisualSnapshot {
  return {
    className: sanitizeClassName(element.className),
    style: element.getAttribute('style'),
  }
}

function applyVisualSnapshot(
  element: HTMLElement,
  snapshot: ElementVisualSnapshot | null,
  managedClass: string,
  clickable?: boolean,
) {
  const baseClassName = snapshot ? snapshot.className : sanitizeClassName(element.className)
  const stateClass = clickable === undefined
    ? ''
    : clickable ? CLICKABLE_CLASS : INACTIVE_CLASS
  const desiredClassName = [baseClassName, managedClass, stateClass].filter(Boolean).join(' ')
  if (element.className !== desiredClassName) {
    element.className = desiredClassName
  }

  if (snapshot) {
    const currentStyle = element.getAttribute('style')
    if (snapshot.style === null && currentStyle !== null) {
      element.removeAttribute('style')
    } else if (snapshot.style !== null && currentStyle !== snapshot.style) {
      element.setAttribute('style', snapshot.style)
    }
  }

  if (element.hasAttribute('disabled')) {
    element.removeAttribute('disabled')
  }
  if (element.hasAttribute('aria-disabled')) {
    element.removeAttribute('aria-disabled')
  }
}

function cleanupManagedElements(
  activeAcceptButton: HTMLElement | null = null,
  activeDeclineButton: HTMLElement | null = null,
  activeButtonsElement: HTMLElement | null = null,
  activeMachine: HTMLElement | null = null,
) {
  document.querySelectorAll<HTMLElement>(`.${ACTIVE_CLASS}`).forEach((element) => {
    if (element !== activeMachine) {
      element.classList.remove(ACTIVE_CLASS)
      element.classList.remove(RESPONSE_ACCEPTED_CLASS)
      element.classList.remove(RESPONSE_DECLINED_CLASS)
      element.classList.remove(RESPONSE_NONE_CLASS)
    }
  })
  document.querySelectorAll<HTMLElement>(`.${ACCEPT_CLASS}`).forEach((element) => {
    if (element !== activeAcceptButton) {
      element.classList.remove(ACCEPT_CLASS)
      element.classList.remove(CLICKABLE_CLASS)
      element.classList.remove(INACTIVE_CLASS)
    }
  })
  document.querySelectorAll<HTMLElement>(`.${DECLINE_CLASS}`).forEach((element) => {
    if (element !== activeDeclineButton) {
      element.classList.remove(DECLINE_CLASS)
      element.classList.remove(CLICKABLE_CLASS)
      element.classList.remove(INACTIVE_CLASS)
    }
  })
  document.querySelectorAll<HTMLElement>(`.${BUTTONS_CLASS}`).forEach((element) => {
    if (element !== activeButtonsElement) {
      element.classList.remove(BUTTONS_CLASS)
    }
  })
}

function syncMachineResponseClass(machine: HTMLElement, response: ReadyCheckPlayerResponse) {
  machine.classList.toggle(RESPONSE_ACCEPTED_CLASS, response === 'Accepted')
  machine.classList.toggle(RESPONSE_DECLINED_CLASS, response === 'Declined')
  machine.classList.toggle(RESPONSE_NONE_CLASS, response === 'None')
}

function observeMachine(machine: HTMLElement | null) {
  if (observedMachine === machine) return

  machineObserver?.disconnect()
  machineObserver = null
  observedMachine = machine

  if (!machine) return

  machineObserver = new MutationObserver(scheduleSync)
  machineObserver.observe(machine, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      'ready-check-data-state',
      'ready-check-data-player-response',
      'state',
      'style',
      'class',
      'disabled',
      'aria-disabled',
    ],
  })
}

function syncReadyCheckButtons() {
  const machine = getReadyCheckMachine()
  observeMachine(machine)

  if (!isEnabled() || !isReadyCheckInProgress(machine)) {
    cleanupManagedElements()
    acceptSnapshot = null
    declineSnapshot = null
    buttonsSnapshot = null
    return
  }

  const acceptButton = machine?.querySelector<HTMLElement>(READY_CHECK_ACCEPT_SELECTOR)
  const declineButton = machine?.querySelector<HTMLElement>(READY_CHECK_DECLINE_SELECTOR)
  const buttonsElement = machine?.querySelector<HTMLElement>(READY_CHECK_BUTTONS_SELECTOR)
  cleanupManagedElements(acceptButton ?? null, declineButton ?? null, buttonsElement ?? null, machine ?? null)
  const playerResponse = getPlayerResponse(machine)
  if (machine && !machine.classList.contains(ACTIVE_CLASS)) {
    machine.classList.add(ACTIVE_CLASS)
  }
  if (machine) {
    syncMachineResponseClass(machine, playerResponse)
  }

  if (playerResponse === 'None') {
    if (acceptButton) acceptSnapshot = takeVisualSnapshot(acceptButton)
    if (declineButton) declineSnapshot = takeVisualSnapshot(declineButton)
    if (buttonsElement) buttonsSnapshot = takeVisualSnapshot(buttonsElement)
  }

  if (acceptButton) {
    applyVisualSnapshot(acceptButton, acceptSnapshot, ACCEPT_CLASS, playerResponse !== 'Accepted')
  }

  if (declineButton) {
    applyVisualSnapshot(declineButton, declineSnapshot, DECLINE_CLASS, playerResponse !== 'Declined')
  }

  if (buttonsElement) {
    applyVisualSnapshot(buttonsElement, buttonsSnapshot, BUTTONS_CLASS)
  }
}

function scheduleSync() {
  if (syncScheduled || !installed) return
  syncScheduled = true
  requestAnimationFrame(() => {
    syncScheduled = false
    if (!installed) return
    syncReadyCheckButtons()
  })
}

async function sendReadyCheckResponse(response: ReadyCheckResponse) {
  try {
    if (response === 'accept') {
      await lcu.acceptMatch()
    } else {
      await lcu.declineMatch()
    }
    logger.info('[ReadyCheckReselect] %s requested', response)
  } catch (err) {
    logger.error('[ReadyCheckReselect] %s failed:', response, err)
  }
}

async function drainReadyCheckResponseQueue(response: ReadyCheckResponse) {
  responseInFlight = response

  try {
    await sendReadyCheckResponse(response)
  } finally {
    responseInFlight = null
    const nextResponse = queuedResponse
    queuedResponse = null

    if (nextResponse && nextResponse !== response) {
      void drainReadyCheckResponseQueue(nextResponse)
    }
  }
}

function respondReadyCheck(response: ReadyCheckResponse) {
  if (responseInFlight) {
    queuedResponse = response
    return
  }

  void drainReadyCheckResponseQueue(response)
}

function isPointInsideElement(event: MouseEvent, element: HTMLElement | null) {
  if (!element) return false
  const rect = element.getBoundingClientRect()
  return (
    event.clientX >= rect.left
    && event.clientX <= rect.right
    && event.clientY >= rect.top
    && event.clientY <= rect.bottom
  )
}

function handleReadyCheckClick(event: MouseEvent) {
  if (!isEnabled()) return

  const target = event.target
  if (!(target instanceof Element)) return

  const clickedAcceptButton = target.closest<HTMLElement>(READY_CHECK_ACCEPT_SELECTOR)
  const clickedDeclineButton = target.closest<HTMLElement>(READY_CHECK_DECLINE_SELECTOR)
  const clickedButton = clickedAcceptButton ?? clickedDeclineButton
  const machine = clickedButton?.closest<HTMLElement>(READY_CHECK_MACHINE_SELECTOR) ?? null
  if (!clickedButton || !machine || !isReadyCheckInProgress(machine)) return

  const acceptButton = machine.querySelector<HTMLElement>(READY_CHECK_ACCEPT_SELECTOR)
  const declineButton = machine.querySelector<HTMLElement>(READY_CHECK_DECLINE_SELECTOR)
  const playerResponse = getPlayerResponse(machine)
  let nextResponse: ReadyCheckResponse | null = null

  if (playerResponse === 'Accepted') {
    nextResponse = isPointInsideElement(event, declineButton) ? 'decline' : null
  } else if (playerResponse === 'Declined') {
    nextResponse = isPointInsideElement(event, acceptButton) ? 'accept' : null
  } else if (clickedAcceptButton) {
    nextResponse = 'accept'
  } else if (clickedDeclineButton) {
    nextResponse = 'decline'
  }

  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()

  if (!nextResponse) {
    return
  }

  respondReadyCheck(nextResponse)
}

export function initReadyCheckReselect() {
  if (installed) return
  installed = true

  document.addEventListener('click', handleReadyCheckClick, true)
  rootObserver = new MutationObserver(scheduleSync)
  rootObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      'ready-check-data-state',
      'ready-check-data-player-response',
      'state',
    ],
  })
  storeUnsub = store.onChange('readyCheckReselect', (enabled) => {
    if (!enabled) cleanupManagedElements()
    scheduleSync()
  })
  scheduleSync()
}

export function stopReadyCheckReselect() {
  if (!installed) return

  installed = false
  syncScheduled = false
  responseInFlight = null
  queuedResponse = null
  document.removeEventListener('click', handleReadyCheckClick, true)
  rootObserver?.disconnect()
  rootObserver = null
  machineObserver?.disconnect()
  machineObserver = null
  observedMachine = null
  storeUnsub?.()
  storeUnsub = null
  cleanupManagedElements()
}
