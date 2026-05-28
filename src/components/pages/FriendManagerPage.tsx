import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SettingGroup } from '@/components/ui/SettingCard'
import { SonaButton } from '@/components/ui/SonaButton'
import { SonaCheckbox } from '@/components/ui/SonaCheckbox'
import { SonaInput } from '@/components/ui/SonaInput'
import { SonaSelect } from '@/components/ui/SonaSelect'
import { Modal } from '@/components/ui/Modal'
import { lcu } from '@/lib/lcu'
import { logger } from '@/index'
import { useI18n } from '@/i18n'
import type { ChatFriend, ChatFriendGroup, MatchGame } from '@/types/lcu'
import '@/styles/FriendManagerPage.css'

type FriendExtraInfo = {
  lastGameDate?: number
  friendsSince?: number
}

type EnrichedFriend = {
  friend: ChatFriend
  groupName: string
  groupPriority: number
  lastGameDate?: number
  friendsSince?: number
}

type TimeFilter = 'all' | '7' | '30' | '60' | '120' | 'custom' | 'never'
type SortKey = 'name' | 'group' | 'lastGameDate' | 'friendsSince'
type SortDirection = 'asc' | 'desc'

const MATCH_BATCH_SIZE = 100
const MAX_MATCH_SCAN_PAGES = 4

function getFriendDisplayName(friend: ChatFriend) {
  if (friend.gameName && friend.gameTag) return `${friend.gameName}#${friend.gameTag}`
  return friend.gameName || friend.name || `Summoner ${friend.summonerId}`
}

function formatDateTime(timestamp: number | undefined, fallback: string) {
  if (!timestamp) return fallback
  const date = new Date(timestamp)
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function formatRelativeDays(timestamp?: number) {
  if (!timestamp) return ''
  const days = Math.floor((Date.now() - timestamp) / 86_400_000)
  if (days <= 0) return '今天'
  if (days === 1) return '昨天'
  return `${days} 天前`
}

function getMatchParticipantPuuids(game: MatchGame) {
  return new Set(
    game.participantIdentities
      .map((identity) => identity.player?.puuid)
      .filter((puuid): puuid is string => Boolean(puuid)),
  )
}

function normalizeGroupName(name: string) {
  const value = name.replace(/^\*\*/, '').trim()
  if (!value || value.toLowerCase() === 'default') return '默认分组'
  return value
}

function getGroupName(friend: ChatFriend, groupMap: Map<number, ChatFriendGroup>) {
  const group = groupMap.get(friend.groupId) ?? groupMap.get(friend.displayGroupId)
  return normalizeGroupName(group?.name || friend.groupName || friend.displayGroupName || '默认分组')
}

function getGroupPriority(friend: ChatFriend, groupMap: Map<number, ChatFriendGroup>) {
  const group = groupMap.get(friend.groupId) ?? groupMap.get(friend.displayGroupId)
  return group?.priority ?? 0
}

export function FriendManagerPage() {
  const { t } = useI18n()
  const [friends, setFriends] = useState<ChatFriend[]>([])
  const [groups, setGroups] = useState<ChatFriendGroup[]>([])
  const [extraInfoMap, setExtraInfoMap] = useState<Record<string, FriendExtraInfo>>({})
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isScanningMatches, setIsScanningMatches] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [status, setStatus] = useState('')
  const [query, setQuery] = useState('')
  const [groupFilter, setGroupFilter] = useState('all')
  const [lastTogetherFilter, setLastTogetherFilter] = useState<TimeFilter>('all')
  const [lastTogetherCustomDays, setLastTogetherCustomDays] = useState('')
  const [friendSinceFilter, setFriendSinceFilter] = useState<TimeFilter>('all')
  const [friendSinceCustomDays, setFriendSinceCustomDays] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('lastGameDate')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([])
  const deleteCancelledRef = useRef(false)
  const loadingRef = useRef(false)

  const groupMap = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups])
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const enrichedFriends = useMemo<EnrichedFriend[]>(() => {
    return friends.map((friend) => {
      const extraInfo = extraInfoMap[friend.puuid] ?? {}
      return {
        friend,
        groupName: getGroupName(friend, groupMap),
        groupPriority: getGroupPriority(friend, groupMap),
        lastGameDate: extraInfo.lastGameDate,
        friendsSince: extraInfo.friendsSince,
      }
    })
  }, [extraInfoMap, friends, groupMap])

  const filteredFriends = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    const getFilterDays = (filter: TimeFilter, customDays: string) => {
      if (filter === 'all' || filter === 'never') return 0
      const days = Number(filter === 'custom' ? customDays : filter)
      return Number.isFinite(days) && days > 0 ? days : 0
    }
    const lastTogetherDays = getFilterDays(lastTogetherFilter, lastTogetherCustomDays)
    const friendSinceDays = getFilterDays(friendSinceFilter, friendSinceCustomDays)
    const lastTogetherThreshold = lastTogetherDays ? Date.now() - lastTogetherDays * 86_400_000 : 0
    const friendSinceThreshold = friendSinceDays ? Date.now() - friendSinceDays * 86_400_000 : 0

    return enrichedFriends
      .filter((item) => {
        const name = getFriendDisplayName(item.friend).toLowerCase()
        const note = item.friend.note?.toLowerCase() ?? ''
        if (keyword && !name.includes(keyword) && !note.includes(keyword)) return false
        if (groupFilter !== 'all' && String(item.friend.groupId) !== groupFilter && String(item.friend.displayGroupId) !== groupFilter) return false
        if (lastTogetherFilter === 'never' && item.lastGameDate) return false
        if (lastTogetherThreshold && item.lastGameDate && item.lastGameDate > lastTogetherThreshold) return false
        if (friendSinceFilter === 'never' && item.friendsSince) return false
        if (friendSinceThreshold && (!item.friendsSince || item.friendsSince > friendSinceThreshold)) return false
        return true
      })
      .sort((a, b) => {
        let result = 0
        if (sortKey === 'group') {
          result = b.groupPriority - a.groupPriority || a.groupName.localeCompare(b.groupName)
        } else if (sortKey === 'friendsSince') {
          result = (a.friendsSince ?? Number.MAX_SAFE_INTEGER) - (b.friendsSince ?? Number.MAX_SAFE_INTEGER)
        } else if (sortKey === 'lastGameDate') {
          result = (a.lastGameDate ?? 0) - (b.lastGameDate ?? 0)
        } else {
          result = getFriendDisplayName(a.friend).localeCompare(getFriendDisplayName(b.friend))
        }
        if (result === 0) result = getFriendDisplayName(a.friend).localeCompare(getFriendDisplayName(b.friend))
        return sortDirection === 'asc' ? result : -result
      })
  }, [enrichedFriends, friendSinceCustomDays, friendSinceFilter, groupFilter, lastTogetherCustomDays, lastTogetherFilter, query, sortDirection, sortKey])

  const visibleSelectedCount = filteredFriends.filter((item) => selectedSet.has(item.friend.id)).length
  const allVisibleSelected = filteredFriends.length > 0 && visibleSelectedCount === filteredFriends.length

  const mergeExtraInfo = useCallback((patch: Record<string, FriendExtraInfo>) => {
    setExtraInfoMap((prev) => {
      const next = { ...prev }
      for (const [puuid, info] of Object.entries(patch)) {
        next[puuid] = { ...next[puuid], ...info }
      }
      return next
    })
  }, [])

  const scanLastTogetherDates = useCallback(async (knownFriends: ChatFriend[]) => {
    if (knownFriends.length === 0) {
      setIsScanningMatches(false)
      return
    }

    setIsScanningMatches(true)
    try {
      const me = await lcu.getSummonerInfo()
      const friendPuuids = new Set(knownFriends.map((friend) => friend.puuid).filter(Boolean))
      const found: Record<string, FriendExtraInfo> = {}

      for (let page = 0; page < MAX_MATCH_SCAN_PAGES; page += 1) {
        if (Object.keys(found).length >= friendPuuids.size) break
        const begIndex = page * MATCH_BATCH_SIZE
        const endIndex = begIndex + MATCH_BATCH_SIZE - 1
        const history = await lcu.getMatchHistory(me.puuid, begIndex, endIndex)
        const games = history.games?.games ?? []
        if (!games.length) break

        for (const game of games) {
          const participantPuuids = getMatchParticipantPuuids(game)
          for (const puuid of friendPuuids) {
            if (!found[puuid] && participantPuuids.has(puuid)) {
              found[puuid] = { lastGameDate: game.gameCreation }
            }
          }
        }

        mergeExtraInfo(found)
        if (games.length < MATCH_BATCH_SIZE) break
      }
    } catch (err) {
      logger.warn('[FriendManager] Failed to scan match history:', err)
    } finally {
      setIsScanningMatches(false)
    }
  }, [mergeExtraInfo])

  const loadFriendSinceDates = useCallback(async (knownFriends: ChatFriend[]) => {
    if (knownFriends.length === 0) return

    try {
      const giftableFriends = await lcu.getGiftableFriends()
      const puuidBySummonerId = new Map(knownFriends.map((friend) => [friend.summonerId, friend.puuid]))
      const patch: Record<string, FriendExtraInfo> = {}

      for (const giftableFriend of giftableFriends) {
        const puuid = puuidBySummonerId.get(giftableFriend.summonerId)
        const timestamp = new Date(giftableFriend.friendsSince).getTime()
        if (puuid && Number.isFinite(timestamp)) {
          patch[puuid] = { friendsSince: timestamp }
        }
      }

      mergeExtraInfo(patch)
    } catch (err) {
      logger.warn('[FriendManager] Failed to load friend since dates:', err)
    }
  }, [mergeExtraInfo])

  const loadFriends = useCallback(async (manual = false) => {
    if (loadingRef.current) return
    loadingRef.current = true
    setIsLoading(true)
    setStatus('')
    try {
      const [nextGroups, nextFriends] = await Promise.all([
        lcu.getFriendGroups().catch(() => []),
        lcu.getFriends(),
      ])
      setGroups(nextGroups)
      setFriends(nextFriends)
      setSelectedIds([])
      setExtraInfoMap({})
      setStatus(manual ? `已刷新 ${nextFriends.length} 位好友。` : '')
      void loadFriendSinceDates(nextFriends)
      void scanLastTogetherDates(nextFriends)
    } catch (err) {
      logger.error('[FriendManager] Failed to load friends:', err)
      setStatus(`加载好友失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      loadingRef.current = false
      setIsLoading(false)
    }
  }, [loadFriendSinceDates, scanLastTogetherDates])

  useEffect(() => {
    void loadFriends()
  }, [loadFriends])

  useEffect(() => {
    return lcu.observe('/lol-chat/v1/friends', () => {
      void loadFriends()
    })
  }, [loadFriends])

  const toggleFriend = (friendId: string) => {
    setSelectedIds((prev) => prev.includes(friendId) ? prev.filter((id) => id !== friendId) : [...prev, friendId])
  }

  const toggleVisible = () => {
    const visibleIds = filteredFriends.map((item) => item.friend.id)
    setSelectedIds((prev) => {
      if (allVisibleSelected) return prev.filter((id) => !visibleIds.includes(id))
      return Array.from(new Set([...prev, ...visibleIds]))
    })
  }

  const requestDeleteSelected = () => {
    if (isDeleting || selectedIds.length === 0) return
    setPendingDeleteIds(selectedIds)
  }

  const closeDeleteConfirm = () => {
    if (isDeleting) return
    setPendingDeleteIds([])
  }

  const handleDeleteSelected = async () => {
    if (isDeleting || pendingDeleteIds.length === 0) return
    const idsToDelete = pendingDeleteIds
    const count = idsToDelete.length

    deleteCancelledRef.current = false
    setIsDeleting(true)
    setPendingDeleteIds([])
    setStatus(`正在删除 0 / ${count}...`)

    let deletedCount = 0
    try {
      for (const friendId of idsToDelete) {
        if (deleteCancelledRef.current) break
        await lcu.deleteFriend(friendId)
        deletedCount += 1
        setStatus(`正在删除 ${deletedCount} / ${count}...`)
      }
      setFriends((prev) => prev.filter((friend) => !idsToDelete.includes(friend.id)))
      setSelectedIds((prev) => prev.filter((friendId) => !idsToDelete.includes(friendId)))
      setStatus(deleteCancelledRef.current ? `已取消，已删除 ${deletedCount} 位好友。` : `已删除 ${deletedCount} 位好友。`)
    } catch (err) {
      logger.error('[FriendManager] Failed to delete friends:', err)
      setStatus(`删除失败：${err instanceof Error ? err.message : String(err)}，已删除 ${deletedCount} 位。`)
      void loadFriends()
    } finally {
      setIsDeleting(false)
      deleteCancelledRef.current = false
    }
  }

  const groupOptions = useMemo(() => [
    { value: 'all', label: '全部分组' },
    ...groups
      .filter((group) => friends.some((friend) => friend.groupId === group.id || friend.displayGroupId === group.id))
      .sort((a, b) => b.priority - a.priority)
      .map((group) => ({ value: String(group.id), label: normalizeGroupName(group.name) })),
  ], [friends, groups])

  const timeFilterOptions = [
    { value: 'all', label: '全部' },
    { value: '7', label: '7天前' },
    { value: '30', label: '30天前' },
    { value: '60', label: '60天前' },
    { value: '120', label: '120天前' },
    { value: 'custom', label: '自定义天数' },
    { value: 'never', label: '从未找到' },
  ]

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => prev === 'asc' ? 'desc' : 'asc')
      return
    }

    setSortKey(key)
    setSortDirection('asc')
  }

  const sortMark = (key: SortKey) => {
    if (sortKey !== key) return ''
    return sortDirection === 'asc' ? ' ↑' : ' ↓'
  }

  return (
    <div className="sona-settings sona-friend-manager">
      <SettingGroup title="好友管理">
        <div className="sfm-panel">
          <div className="sfm-header">
            <div>
              <h2 className="sfm-title">清理不常一起玩的好友</h2>
              <p className="sona-subtitle">
                参考 LeagueAkari 的好友工具：拉取好友列表、上次一起对局、初次添加时间，并支持筛选后批量选择删除。
              </p>
            </div>
            <div className="sfm-header-actions">
              <SonaButton onClick={() => loadFriends(true)} disabled={isLoading || isDeleting}>
                {isLoading ? t('common.loading') : '刷新'}
              </SonaButton>
              <SonaButton variant="secondary" onClick={() => setSelectedIds([])} disabled={!selectedIds.length || isDeleting}>
                清空选择
              </SonaButton>
            </div>
          </div>

          <div className="sfm-summary">
            <span>好友 {friends.length}</span>
            <span>筛选结果 {filteredFriends.length}</span>
            <span>已选 {selectedIds.length}</span>
            {isScanningMatches && <span className="sfm-scanning">正在扫描最近 {MATCH_BATCH_SIZE * MAX_MATCH_SCAN_PAGES} 场对局…</span>}
            {status && <span className="sfm-status">{status}</span>}
          </div>

          <div className="sfm-bulkbar">
            <SonaCheckbox checked={allVisibleSelected} onChange={toggleVisible} label={`选择当前筛选结果 (${visibleSelectedCount}/${filteredFriends.length})`} disabled={!filteredFriends.length || isDeleting} />
            <div className="sfm-bulk-search">
              <SonaInput value={query} onChange={setQuery} placeholder="搜索好友" />
            </div>
            <div className="sfm-bulkbar-actions">
              {isDeleting && (
                <SonaButton variant="secondary" onClick={() => { deleteCancelledRef.current = true }}>
                  取消删除
                </SonaButton>
              )}
              <SonaButton onClick={requestDeleteSelected} disabled={!selectedIds.length || isDeleting}>
                {selectedIds.length ? `删除选中 ${selectedIds.length} 位` : '删除选中'}
              </SonaButton>
            </div>
          </div>

          <div className="sfm-table">
            <div className="sfm-table-head">
              <div className="sfm-head-cell">
                <button className="sfm-head-sort" type="button" onClick={() => toggleSort('name')}>好友{sortMark('name')}</button>
              </div>
              <div className="sfm-head-cell">
                <button className="sfm-head-sort" type="button" onClick={() => toggleSort('group')}>分组{sortMark('group')}</button>
                <SonaSelect options={groupOptions} value={groupFilter} onChange={setGroupFilter} />
              </div>
              <div className="sfm-head-cell">
                <button className="sfm-head-sort" type="button" onClick={() => toggleSort('lastGameDate')}>上次一起对局{sortMark('lastGameDate')}</button>
                <SonaSelect
                  options={timeFilterOptions}
                  value={lastTogetherFilter}
                  onChange={(value) => setLastTogetherFilter(value as TimeFilter)}
                />
                {lastTogetherFilter === 'custom' && (
                  <SonaInput
                    value={lastTogetherCustomDays}
                    onChange={setLastTogetherCustomDays}
                    placeholder="天数"
                    type="number"
                    min={1}
                  />
                )}
              </div>
              <div className="sfm-head-cell">
                <button className="sfm-head-sort" type="button" onClick={() => toggleSort('friendsSince')}>初次添加{sortMark('friendsSince')}</button>
                <SonaSelect
                  options={timeFilterOptions}
                  value={friendSinceFilter}
                  onChange={(value) => setFriendSinceFilter(value as TimeFilter)}
                />
                {friendSinceFilter === 'custom' && (
                  <SonaInput
                    value={friendSinceCustomDays}
                    onChange={setFriendSinceCustomDays}
                    placeholder="天数"
                    type="number"
                    min={1}
                  />
                )}
              </div>
            </div>
            <div className="sfm-table-body">
              {filteredFriends.length === 0 && (
                <div className="sfm-empty">{isLoading ? t('common.loading') : t('common.noData')}</div>
              )}
              {filteredFriends.map((item) => {
                const name = getFriendDisplayName(item.friend)
                const selected = selectedSet.has(item.friend.id)
                return (
                  <div key={item.friend.id} className={`sfm-row${selected ? ' sfm-row-selected' : ''}`}>
                    <div className="sfm-friend-cell">
                      <SonaCheckbox checked={selected} onChange={() => toggleFriend(item.friend.id)} disabled={isDeleting} />
                      <img className="sfm-avatar" src={`/lol-game-data/assets/v1/profile-icons/${item.friend.icon}.jpg`} alt="" />
                      <div className="sfm-friend-main">
                        <span className="sfm-friend-name" title={name}>{name}</span>
                        {item.friend.note && <span className="sfm-friend-note" title={item.friend.note}>{item.friend.note}</span>}
                      </div>
                    </div>
                    <span className="sfm-muted" title={item.groupName}>{item.groupName}</span>
                    <div className="sfm-date-cell">
                      <span>{formatDateTime(item.lastGameDate, '从未找到')}</span>
                      {item.lastGameDate && <small>{formatRelativeDays(item.lastGameDate)}</small>}
                    </div>
                    <div className="sfm-date-cell">
                      <span>{formatDateTime(item.friendsSince, t('common.unknown'))}</span>
                      {item.friendsSince && <small>{formatRelativeDays(item.friendsSince)}</small>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </SettingGroup>

      <Modal
        open={pendingDeleteIds.length > 0}
        onClose={closeDeleteConfirm}
        width={420}
        height="auto"
        maskClosable={!isDeleting}
        closable={!isDeleting}
      >
        <div className="sfm-delete-confirm">
          <div className="sfm-delete-confirm-mark">!</div>
          <div className="sfm-delete-confirm-body">
            <h3>确认删除好友</h3>
            <p>
              将从客户端好友列表中删除选中的 <strong>{pendingDeleteIds.length}</strong> 位好友。
              这个操作会立即同步，建议确认筛选结果后再继续。
            </p>
          </div>
          <div className="sfm-delete-confirm-actions">
            <SonaButton variant="secondary" onClick={closeDeleteConfirm} disabled={isDeleting}>
              取消
            </SonaButton>
            <SonaButton onClick={handleDeleteSelected} disabled={isDeleting}>
              确认删除
            </SonaButton>
          </div>
        </div>
      </Modal>
    </div>
  )
}
