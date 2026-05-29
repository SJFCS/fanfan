import { injector } from '@/lib/InjectorManager'

const STYLE_ID = 'sona-room-backdrop-style'
const HIDDEN_ATTR = 'data-sona-room-backdrop-hidden'
const ROOM_BACKGROUND_IMAGE_SELECTOR =
  'img.lol-uikit-background-switcher-image[src*="/LeagueClient/GameModeAssets/"][src*="/img/parties-background"]'

function ensureStyle() {
  let style = document.getElementById(STYLE_ID)
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.head.appendChild(style)
  }

  style.textContent = `
    [${HIDDEN_ATTR}="true"],
    ${ROOM_BACKGROUND_IMAGE_SELECTOR} {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
  `
}

function markRoomBackdrops() {
  document.querySelectorAll<HTMLImageElement>(ROOM_BACKGROUND_IMAGE_SELECTOR).forEach((image) => {
    const switcher = image.closest<HTMLElement>('.uikit-background-switcher')
    if (switcher) {
      switcher.setAttribute(HIDDEN_ATTR, 'true')
    }
  })
}

function clearRoomBackdropMarks() {
  document.querySelectorAll<HTMLElement>(`[${HIDDEN_ATTR}]`).forEach((element) => {
    element.removeAttribute(HIDDEN_ATTR)
  })
}

function tryApplyRoomBackdropStyle(): boolean {
  ensureStyle()
  markRoomBackdrops()
  return true
}

let registered = false

export function updateHideRoomBackdrop(enabled: boolean) {
  if (enabled && !registered) {
    registered = true
    injector.register(tryApplyRoomBackdropStyle)
    tryApplyRoomBackdropStyle()
  } else if (!enabled && registered) {
    registered = false
    injector.unregister(tryApplyRoomBackdropStyle)
    document.getElementById(STYLE_ID)?.remove()
    clearRoomBackdropMarks()
  } else if (!enabled) {
    document.getElementById(STYLE_ID)?.remove()
    clearRoomBackdropMarks()
  }
}
