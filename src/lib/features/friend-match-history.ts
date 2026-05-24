import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { logger } from '@/index'
import { MatchHistoryModal } from '@/components/ui/MatchHistoryModal'
import { injector } from '@/lib/InjectorManager'
import { lcu } from '@/lib/lcu'
import type { ChatFriend } from '@/lib/lcu'
import { sleep } from '@/lib/utils'

const FRIENDS_URI = '/lol-chat/v1/friends'
const SONA_FRIEND_HISTORY_ATTR = 'data-sona-friend-history'
const SONA_FRIEND_HISTORY_BUTTON_ATTR = 'data-sona-friend-history-button'
const SONA_FRIEND_HISTORY_STYLE_ATTR = 'data-sona-friend-history-style'

interface FriendMatchHistoryInfo {
  puuid: string
  displayName: string
  keys: string[]
}

interface BoundFriendMember {
  member: HTMLElement
  button: HTMLButtonElement
  previousMemberPosition: string
  previousAvatarPosition: string
  handlers: Array<{
    type: string
    handler: (event: Event) => void
  }>
}

let friendMatchHistoryRegistered = false
let friendMatchHistoryInjected = false
let friendMatchHistoryUnsub: (() => void) | null = null
let friendMatchHistoryRefreshTimer: number | null = null
let friendMatchHistoryRefreshInFlight: Promise<void> | null = null
let friendHistoryMap = new Map<string, FriendMatchHistoryInfo>()
let boundFriendMembers: BoundFriendMember[] = []
let matchModalRoot: Root | null = null
let matchModalContainer: HTMLDivElement | null = null

function showMatchHistoryModal(puuid: string, playerName: string) {
  if (!matchModalContainer) {
    matchModalContainer = document.createElement('div')
    matchModalContainer.id = 'sona-friend-match-history-root'
    document.body.appendChild(matchModalContainer)
    matchModalRoot = createRoot(matchModalContainer)
  }

  const close = () => {
    matchModalRoot?.render(
      createElement(MatchHistoryModal, { open: false, onClose: close, puuid: '', playerName: '' }),
    )
  }

  matchModalRoot!.render(
    createElement(MatchHistoryModal, { open: true, onClose: close, puuid, playerName }),
  )
}

function cleanupMatchHistoryModal() {
  if (matchModalRoot) {
    matchModalRoot.unmount()
    matchModalRoot = null
  }
  if (matchModalContainer) {
    matchModalContainer.remove()
    matchModalContainer = null
  }
}

function getFriendDisplayName(friend: ChatFriend): string {
  if (friend.gameName && friend.gameTag) return `${friend.gameName}#${friend.gameTag}`
  return friend.gameName || friend.name || friend.id.replace(/@pvp\.net$/i, '')
}

function getFriendHistoryKeys(friend: ChatFriend): string[] {
  const keys = new Set<string>()
  const baseName = friend.gameName || friend.name

  if (baseName) keys.add(baseName)
  if (friend.gameName && friend.gameTag) keys.add(`${friend.gameName}#${friend.gameTag}`)
  if (friend.puuid) keys.add(`puuid:${friend.puuid}`)
  if (friend.summonerId) keys.add(`summoner:${friend.summonerId}`)

  return [...keys]
}

function mapFriendHistoryInfo(friend: ChatFriend): FriendMatchHistoryInfo | null {
  if (!friend.puuid) return null

  const keys = getFriendHistoryKeys(friend)
  if (keys.length === 0) return null

  return {
    puuid: friend.puuid,
    displayName: getFriendDisplayName(friend),
    keys,
  }
}

async function refreshFriendHistoryMap(retries = 5) {
  if (friendMatchHistoryRefreshInFlight) return friendMatchHistoryRefreshInFlight

  friendMatchHistoryRefreshInFlight = doRefreshFriendHistoryMap(retries)
    .finally(() => {
      friendMatchHistoryRefreshInFlight = null
    })

  return friendMatchHistoryRefreshInFlight
}

async function doRefreshFriendHistoryMap(retries = 5) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const friends = await lcu.getFriends()
      if (!friendMatchHistoryRegistered) return

      const nextMap = new Map<string, FriendMatchHistoryInfo>()
      for (const friend of friends) {
        const info = mapFriendHistoryInfo(friend)
        if (!info) continue

        for (const key of info.keys) {
          nextMap.set(key, info)
        }
      }

      friendHistoryMap = nextMap
      logger.info('[FriendHistory] 刷新好友战绩入口索引 -> %d 条', nextMap.size)
      tryInjectFriendMatchHistory()
      return
    } catch (err) {
      if (attempt < retries) {
        await sleep(2000)
      } else {
        logger.error('[FriendHistory] 查询好友列表失败:', err)
      }
    }
  }
}

function scheduleFriendHistoryRefresh(delay = 250) {
  if (!friendMatchHistoryRegistered) return

  if (friendMatchHistoryRefreshTimer != null) {
    window.clearTimeout(friendMatchHistoryRefreshTimer)
  }

  friendMatchHistoryRefreshTimer = window.setTimeout(() => {
    friendMatchHistoryRefreshTimer = null
    void refreshFriendHistoryMap(0)
  }, delay)
}

function ensureFriendHistoryStyle() {
  if (document.querySelector(`style[${SONA_FRIEND_HISTORY_STYLE_ATTR}]`)) return

  const style = document.createElement('style')
  style.setAttribute(SONA_FRIEND_HISTORY_STYLE_ATTR, 'true')
  style.textContent = `
    [${SONA_FRIEND_HISTORY_ATTR}="true"] [${SONA_FRIEND_HISTORY_BUTTON_ATTR}="true"] {
      position: absolute;
      top: -2px;
      right: -2px;
      z-index: 20;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 17px;
      height: 17px;
      min-width: 17px;
      min-height: 17px;
      padding: 0;
      border: 1px solid rgba(200, 170, 110, 0.78);
      border-radius: 50%;
      background: rgba(1, 10, 19, 0.92);
      color: #c8aa6e;
      font: 700 11px/1 "Microsoft YaHei", sans-serif;
      cursor: pointer;
      pointer-events: auto;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
      opacity: 0;
      transform: scale(0.88);
      transition: opacity 0.14s ease, transform 0.14s ease, border-color 0.14s ease, color 0.14s ease;
    }
    [${SONA_FRIEND_HISTORY_ATTR}="true"]:hover [${SONA_FRIEND_HISTORY_BUTTON_ATTR}="true"],
    [${SONA_FRIEND_HISTORY_BUTTON_ATTR}="true"]:focus-visible {
      opacity: 1;
      transform: scale(1);
    }
    [${SONA_FRIEND_HISTORY_BUTTON_ATTR}="true"]:hover {
      border-color: #f0e6d2;
      color: #f0e6d2;
      background: rgba(30, 35, 40, 0.96);
    }
  `
  document.head.appendChild(style)
}

function getMemberHistoryInfo(member: HTMLElement): FriendMatchHistoryInfo | null {
  const name = member.querySelector('.member-name')?.textContent?.trim()
  if (!name) return null

  return friendHistoryMap.get(name) ?? null
}

function isBound(member: HTMLElement): boolean {
  return boundFriendMembers.some((bound) => bound.member === member)
}

function bindFriendMember(member: HTMLElement, info: FriendMatchHistoryInfo) {
  if (isBound(member)) return

  const avatar = member.querySelector('.lol-social-avatar.member-icon') as HTMLElement | null
  if (!avatar) return

  ensureFriendHistoryStyle()

  const previousMemberPosition = member.style.position
  const previousAvatarPosition = avatar.style.position
  member.setAttribute(SONA_FRIEND_HISTORY_ATTR, 'true')
  if (!member.style.position) member.style.position = 'relative'
  if (!avatar.style.position) avatar.style.position = 'relative'

  const button = document.createElement('button')
  button.type = 'button'
  button.draggable = false
  button.title = `查询战绩：${info.displayName}`
  button.setAttribute('aria-label', `查询战绩：${info.displayName}`)
  button.setAttribute(SONA_FRIEND_HISTORY_BUTTON_ATTR, 'true')
  button.textContent = '战'

  const stopNativeFriendClick = (event: Event) => {
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
  }

  const openHistoryHandler = (event: Event) => {
    stopNativeFriendClick(event)
    showMatchHistoryModal(info.puuid, info.displayName)
  }

  const handlers = [
    { type: 'pointerdown', handler: stopNativeFriendClick },
    { type: 'mousedown', handler: stopNativeFriendClick },
    { type: 'pointerup', handler: stopNativeFriendClick },
    { type: 'mouseup', handler: stopNativeFriendClick },
    { type: 'dblclick', handler: stopNativeFriendClick },
    { type: 'dragstart', handler: stopNativeFriendClick },
    { type: 'click', handler: openHistoryHandler },
  ]

  handlers.forEach(({ type, handler }) => {
    button.addEventListener(type, handler, true)
  })

  avatar.appendChild(button)
  boundFriendMembers.push({ member, button, previousMemberPosition, previousAvatarPosition, handlers })
}

function tryInjectFriendMatchHistory(): boolean {
  const container = document.querySelector('.lol-social-lower-pane-container')
  if (!container) return true

  const allMembers = container.querySelectorAll('[class*="lol-social-roster-member"]')
  if (allMembers.length === 0) return true

  allMembers.forEach((node) => {
    const member = node as HTMLElement
    const info = getMemberHistoryInfo(member)
    if (!info) return

    bindFriendMember(member, info)
  })

  return true
}

function cleanupBoundFriendMembers() {
  boundFriendMembers.forEach(({ member, button, previousMemberPosition, previousAvatarPosition, handlers }) => {
    const avatar = button.parentElement as HTMLElement | null
    handlers.forEach(({ type, handler }) => {
      button.removeEventListener(type, handler, true)
    })
    button.remove()
    member.removeAttribute(SONA_FRIEND_HISTORY_ATTR)
    member.style.position = previousMemberPosition
    if (avatar) avatar.style.position = previousAvatarPosition
  })
  boundFriendMembers = []
}

export function updateFriendMatchHistory(enabled: boolean) {
  if (enabled && !friendMatchHistoryRegistered) {
    friendMatchHistoryRegistered = true

    injector.register(tryInjectFriendMatchHistory)
    friendMatchHistoryInjected = true

    friendMatchHistoryUnsub = lcu.observe(FRIENDS_URI, () => {
      scheduleFriendHistoryRefresh()
    })

    void refreshFriendHistoryMap().then(() => {
      if (friendMatchHistoryRegistered) {
        logger.info('Friend match history enabled ✓')
      }
    })
  } else if (!enabled && friendMatchHistoryRegistered) {
    if (friendMatchHistoryInjected) {
      injector.unregister(tryInjectFriendMatchHistory)
      friendMatchHistoryInjected = false
    }
    if (friendMatchHistoryUnsub) {
      friendMatchHistoryUnsub()
      friendMatchHistoryUnsub = null
    }
    if (friendMatchHistoryRefreshTimer != null) {
      window.clearTimeout(friendMatchHistoryRefreshTimer)
      friendMatchHistoryRefreshTimer = null
    }

    friendMatchHistoryRegistered = false
    friendHistoryMap.clear()
    cleanupBoundFriendMembers()
    cleanupMatchHistoryModal()
    document.querySelector(`style[${SONA_FRIEND_HISTORY_STYLE_ATTR}]`)?.remove()

    logger.info('Friend match history disabled')
  }
}
