import { injector } from '@/lib/InjectorManager'
import type { BeautifyGlassConfig } from '@/lib/features/beautify-client/social-sidebar-glass'
import { resolvePluginAssetUrl } from '@/lib/plugin-resolver'

const VIEWPORT_ROOT_SELECTOR = 'section#rcp-fe-viewport-root'
const HOMEPAGE_BACKGROUND_STYLE_ID = 'sona-homepage-background-style'
const HOMEPAGE_VIDEO_ATTR = 'data-sona-homepage-background-video'
const HOMEPAGE_CONTEXT_ATTR = 'data-sona-homepage-background-context'
const PROFILE_SCREEN_SELECTOR = 'div.screen-root[data-screen-name="rcp-fe-lol-profiles-main"]'
const ROOM_BACKGROUND_IMAGE_SELECTOR =
  'img.lol-uikit-background-switcher-image[src*="/LeagueClient/GameModeAssets/"][src*="/img/parties-background"]'
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'ogg', 'ogv', 'mov', 'm4v'])

export interface HomepageBackgroundAdjustment {
  scale: number
  offsetX: number
  offsetY: number
}

function getAssetUrl(assetPath: string): string {
  return resolvePluginAssetUrl(assetPath, 'wallpapers')
}

function isVideoAsset(assetPath: string): boolean {
  const ext = assetPath.split('.').pop()?.toLowerCase()
  return Boolean(ext && VIDEO_EXTENSIONS.has(ext))
}

function escapeCssUrl(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

let currentAssetPath: string | null = null
let adjustments: Record<string, HomepageBackgroundAdjustment> = {}
let isHomepageBackgroundVideoSuspended = false
let homepageGlassConfig: BeautifyGlassConfig = {
  blur: 0,
  opacity: 0,
}
let profileGlassConfig: BeautifyGlassConfig = {
  blur: 0,
  opacity: 0,
}
let roomGlassConfig: BeautifyGlassConfig = {
  blur: 0,
  opacity: 0,
}
let profileContextEnabled = false
let roomContextEnabled = false
let lastStyleText = ''

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function normalizeGlassConfig(config: BeautifyGlassConfig) {
  return {
    blur: clamp(config.blur, 0, 40),
    opacity: clamp(config.opacity, 0, 100) / 100,
  }
}

function ensureHomepageBackgroundStyle() {
  if (!currentAssetPath) return

  const assetUrl = escapeCssUrl(getAssetUrl(currentAssetPath))
  const isVideo = isVideoAsset(currentAssetPath)
  const homepageGlass = normalizeGlassConfig(homepageGlassConfig)
  const profileGlass = normalizeGlassConfig(profileGlassConfig)
  const roomGlass = normalizeGlassConfig(roomGlassConfig)
  const adjustment = adjustments[currentAssetPath] ?? { scale: 1, offsetX: 0, offsetY: 0 }
  const scale = clamp(adjustment.scale, 1, 3)
  const offsetX = clamp(adjustment.offsetX, -100, 100)
  const offsetY = clamp(adjustment.offsetY, -100, 100)
  const backgroundSize = scale === 1 ? 'cover' : `${Number((scale * 100).toFixed(2))}% auto`
  const backgroundPositionX = `calc(50% + ${Number(offsetX.toFixed(2))}%)`
  const backgroundPositionY = `calc(50% + ${Number(offsetY.toFixed(2))}%)`
  let style = document.getElementById(HOMEPAGE_BACKGROUND_STYLE_ID)
  if (!style) {
    style = document.createElement('style')
    style.id = HOMEPAGE_BACKGROUND_STYLE_ID
    document.head.appendChild(style)
  }

  const styleText = `
    ${VIEWPORT_ROOT_SELECTOR} {
      position: relative !important;
      ${isVideo ? 'z-index: 0 !important;' : ''}
      ${isVideo ? 'background: transparent !important;' : `background-image: url("${assetUrl}") !important;`}
      ${isVideo ? '' : `background-size: ${backgroundSize} !important;`}
      ${isVideo ? '' : `background-position: ${backgroundPositionX} ${backgroundPositionY} !important;`}
      background-repeat: no-repeat !important;
      --sona-homepage-background-blur: ${homepageGlass.blur}px;
      --sona-homepage-background-opacity: ${homepageGlass.opacity};
    }

    ${VIEWPORT_ROOT_SELECTOR}[${HOMEPAGE_CONTEXT_ATTR}="profile"] {
      --sona-homepage-background-blur: ${profileGlass.blur}px;
      --sona-homepage-background-opacity: ${profileGlass.opacity};
    }

    ${VIEWPORT_ROOT_SELECTOR}[${HOMEPAGE_CONTEXT_ATTR}="room"] {
      --sona-homepage-background-blur: ${roomGlass.blur}px;
      --sona-homepage-background-opacity: ${roomGlass.opacity};
    }

    ${VIEWPORT_ROOT_SELECTOR} > video[${HOMEPAGE_VIDEO_ATTR}] {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      transform: translate(${offsetX}%, ${offsetY}%) scale(${scale});
      transform-origin: center center;
      pointer-events: none;
      z-index: -1;
    }

    ${VIEWPORT_ROOT_SELECTOR}::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      background: rgba(1, 10, 19, var(--sona-homepage-background-opacity));
      backdrop-filter: blur(var(--sona-homepage-background-blur));
      -webkit-backdrop-filter: blur(var(--sona-homepage-background-blur));
    }
  `
  if (lastStyleText !== styleText || style.textContent !== styleText) {
    style.textContent = styleText
    lastStyleText = styleText
  }
}

function setHomepageBackgroundContext(viewportRoot: HTMLElement, context: 'profile' | 'room' | null) {
  const currentContext = viewportRoot.getAttribute(HOMEPAGE_CONTEXT_ATTR)
  if (context && currentContext !== context) {
    viewportRoot.setAttribute(HOMEPAGE_CONTEXT_ATTR, context)
  } else if (!context && currentContext !== null) {
    viewportRoot.removeAttribute(HOMEPAGE_CONTEXT_ATTR)
  }
}

function syncHomepageBackgroundContext() {
  const viewportRoot = document.querySelector<HTMLElement>(VIEWPORT_ROOT_SELECTOR)
  if (!viewportRoot) return

  if (profileContextEnabled && document.querySelector(PROFILE_SCREEN_SELECTOR)) {
    setHomepageBackgroundContext(viewportRoot, 'profile')
    return
  }

  if (roomContextEnabled && document.querySelector(ROOM_BACKGROUND_IMAGE_SELECTOR)) {
    setHomepageBackgroundContext(viewportRoot, 'room')
    return
  }

  setHomepageBackgroundContext(viewportRoot, null)
}

function clearHomepageBackgroundContext() {
  document
    .querySelector<HTMLElement>(VIEWPORT_ROOT_SELECTOR)
    ?.removeAttribute(HOMEPAGE_CONTEXT_ATTR)
}

function ensureHomepageBackgroundVideo() {
  const viewportRoot = document.querySelector<HTMLElement>(VIEWPORT_ROOT_SELECTOR)
  if (!viewportRoot || !currentAssetPath || !isVideoAsset(currentAssetPath)) {
    removeHomepageBackgroundVideo()
    return
  }

  const assetUrl = getAssetUrl(currentAssetPath)
  let video = viewportRoot.querySelector<HTMLVideoElement>(`video[${HOMEPAGE_VIDEO_ATTR}]`)
  if (!video) {
    video = document.createElement('video')
    video.setAttribute(HOMEPAGE_VIDEO_ATTR, 'true')
    video.muted = true
    video.loop = true
    video.autoplay = true
    video.playsInline = true
    video.preload = 'metadata'
    viewportRoot.prepend(video)
  }

  if (video.getAttribute('src') !== assetUrl) {
    video.src = assetUrl
  }
  if (isHomepageBackgroundVideoSuspended) {
    video.pause()
    return
  }
  void video.play().catch(() => {})
}

function removeHomepageBackgroundVideo() {
  document
    .querySelector<HTMLVideoElement>(`${VIEWPORT_ROOT_SELECTOR} > video[${HOMEPAGE_VIDEO_ATTR}]`)
    ?.remove()
}

function tryApplyHomepageBackground(): boolean {
  ensureHomepageBackgroundStyle()
  ensureHomepageBackgroundVideo()
  syncHomepageBackgroundContext()

  return true
}

let registered = false

export function updateBeautifyHomepageBackground(assetPath: string | null) {
  currentAssetPath = assetPath

  if (assetPath && !registered) {
    registered = true
    injector.register(tryApplyHomepageBackground)
    tryApplyHomepageBackground()
  } else if (assetPath && registered) {
    tryApplyHomepageBackground()
  } else if (!assetPath && registered) {
    registered = false
    injector.unregister(tryApplyHomepageBackground)
    document.getElementById(HOMEPAGE_BACKGROUND_STYLE_ID)?.remove()
    lastStyleText = ''
    removeHomepageBackgroundVideo()
    clearHomepageBackgroundContext()
  } else if (!assetPath) {
    document.getElementById(HOMEPAGE_BACKGROUND_STYLE_ID)?.remove()
    lastStyleText = ''
    removeHomepageBackgroundVideo()
    clearHomepageBackgroundContext()
  }
}

export function updateBeautifyHomepageBackgroundGlassConfig(config: BeautifyGlassConfig) {
  homepageGlassConfig = config
  if (registered) {
    ensureHomepageBackgroundStyle()
  }
}

export function updateBeautifyProfileBackgroundGlassConfig(config: BeautifyGlassConfig) {
  profileGlassConfig = config
  if (registered) {
    ensureHomepageBackgroundStyle()
  }
}

export function updateBeautifyRoomBackgroundGlassConfig(config: BeautifyGlassConfig) {
  roomGlassConfig = config
  if (registered) {
    ensureHomepageBackgroundStyle()
  }
}

export function updateBeautifyHomepageBackgroundContextState(nextState: { profile: boolean; room: boolean }) {
  profileContextEnabled = nextState.profile
  roomContextEnabled = nextState.room
  if (registered) {
    syncHomepageBackgroundContext()
  } else {
    clearHomepageBackgroundContext()
  }
}

export function updateBeautifyHomepageBackgroundAdjustments(nextAdjustments: Record<string, HomepageBackgroundAdjustment>) {
  adjustments = nextAdjustments
  if (registered) {
    ensureHomepageBackgroundStyle()
  }
}

export function setBeautifyHomepageBackgroundVideoSuspended(suspended: boolean) {
  isHomepageBackgroundVideoSuspended = suspended

  const video = document.querySelector<HTMLVideoElement>(`${VIEWPORT_ROOT_SELECTOR} > video[${HOMEPAGE_VIDEO_ATTR}]`)
  if (!video) return

  if (suspended) {
    video.pause()
    return
  }

  if (currentAssetPath && isVideoAsset(currentAssetPath)) {
    void video.play().catch(() => {})
  }
}
