import { injector } from '@/lib/InjectorManager'

const STYLE_ID = 'sona-profile-overview-backdrop-style'

function ensureStyle() {
  let style = document.getElementById(STYLE_ID)
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.head.appendChild(style)
  }

  style.textContent = `
    div.screen-root[data-screen-name="rcp-fe-lol-profiles-main"] .style-profile-background-image.uikit-background-switcher {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
  `
}

function tryApplyProfileOverviewBackdropStyle(): boolean {
  ensureStyle()
  return true
}

let registered = false

export function updateHideProfileOverviewBackdrop(enabled: boolean) {
  if (enabled && !registered) {
    registered = true
    injector.register(tryApplyProfileOverviewBackdropStyle)
    ensureStyle()
  } else if (!enabled && registered) {
    registered = false
    injector.unregister(tryApplyProfileOverviewBackdropStyle)
    document.getElementById(STYLE_ID)?.remove()
  } else if (!enabled) {
    document.getElementById(STYLE_ID)?.remove()
  }
}
