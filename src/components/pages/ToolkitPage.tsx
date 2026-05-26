import { useState, useEffect, useRef } from 'react'
import { SettingCard, SettingGroup } from '@/components/ui/SettingCard'
import { SonaButton } from '@/components/ui/SonaButton'
import { SonaInput } from '@/components/ui/SonaInput'
import { MatchHistoryModal } from '@/components/ui/MatchHistoryModal'
import { searchChampions, getChampionById, type ChampionInfo } from '@/lib/assets'
import { lcu } from '@/lib/lcu'
import { logger } from '@/index'
import { store } from '@/lib/store'
import { useI18n } from '@/i18n'
import type { ChatFriend } from '@/types/lcu'
import '@/styles/SettingsPage.css'
import '@/styles/ConfigLockPage.css'


export function ToolkitPage() {
  const { t } = useI18n()
  const [replayGameId, setReplayGameId] = useState('')
  const [replayState, setReplayState] = useState<'idle' | 'downloading' | 'ready' | 'launching' | 'error'>('idle')
  const [searchRiotId, setSearchRiotId] = useState('')
  const [searchError, setSearchError] = useState('')
  const [matchModalOpen, setMatchModalOpen] = useState(false)
  const [matchModalPuuid, setMatchModalPuuid] = useState('')
  const [matchModalName, setMatchModalName] = useState('')
  const [settingsPath, setSettingsPath] = useState('')
  const [loadingConfigPath, setLoadingConfigPath] = useState(false)
  const [configPathError, setConfigPathError] = useState('')
  const [configActionError, setConfigActionError] = useState('')
  const [updatingConfigLock, setUpdatingConfigLock] = useState(false)
  const [locked, setLocked] = useState(store.get('gameConfigLocked'))
  const [configDetailsOpen, setConfigDetailsOpen] = useState(false)
  const [restartingUx, setRestartingUx] = useState(false)
  const [restartUxError, setRestartUxError] = useState('')
  const [spectateIdentity, setSpectateIdentity] = useState('')
  const [spectateStatus, setSpectateStatus] = useState('')
  const [isSpectating, setIsSpectating] = useState(false)
  const [watchableFriends, setWatchableFriends] = useState<ChatFriend[]>([])
  const [loadingWatchableFriends, setLoadingWatchableFriends] = useState(false)

  const handleSearchMatch = async () => {
    const parts = searchRiotId.trim().split('#')
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      setSearchError(t('tools.matchQuery.invalid'))
      return
    }
    setSearchError('')
    try {
      const summoner = await lcu.getSummonerByRiotId(parts[0], parts[1])
      if (!summoner?.puuid) {
        setSearchError(t('tools.matchQuery.notFound'))
        return
      }
      setMatchModalPuuid(summoner.puuid)
      setMatchModalName(`${parts[0]}#${parts[1]}`)
      setMatchModalOpen(true)
    } catch {
      setSearchError(t('tools.matchQuery.failed'))
    }
  }

  const refreshConfigPath = async () => {
    setLoadingConfigPath(true)
    setConfigPathError('')
    try {
      setSettingsPath(await lcu.getGameSettingsFilePath())
    } catch (err) {
      setSettingsPath('')
      setConfigPathError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingConfigPath(false)
    }
  }

  useEffect(() => {
    return store.onChange('gameConfigLocked', setLocked)
  }, [])

  const toggleConfigDetails = () => {
    setConfigDetailsOpen((open) => {
      const next = !open
      if (next && !settingsPath && !configPathError && !loadingConfigPath) {
        void refreshConfigPath()
      }
      return next
    })
  }

  const toggleConfigLocked = async () => {
    if (!Pengu.gameConfig) {
      setConfigActionError('当前 Pengu Loader 不支持配置只读接口，请先更新到支持 gameConfig 的版本。')
      return
    }

    const next = !locked
    setUpdatingConfigLock(true)
    setConfigActionError('')

    try {
      if (next) {
        await Pengu.gameConfig.lock()
      } else {
        await Pengu.gameConfig.unlock()
      }
      setLocked(next)
      store.set('gameConfigLocked', next)
    } catch (err) {
      setConfigActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setUpdatingConfigLock(false)
    }
  }

  const handleRestartUx = async () => {
    setRestartingUx(true)
    setRestartUxError('')

    try {
      await lcu.restartUx()
      logger.info('[Toolkit] League Client UX restart requested')
    } catch (err) {
      logger.error('[Toolkit] Failed to restart League Client UX:', err)
      setRestartUxError(err instanceof Error ? err.message : String(err))
    } finally {
      setRestartingUx(false)
    }
  }

  const isPuuidLike = (value: string) => {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  }

  const getSpectateTargetPuuid = async (identity: string) => {
    const value = identity.trim()
    if (!value) {
      throw new Error(t('tools.spectate.empty'))
    }

    if (isPuuidLike(value)) {
      return value
    }

    const [gameName, tagLine, ...rest] = value.split('#')
    if (!gameName || !tagLine || rest.length > 0) {
      throw new Error(t('tools.spectate.invalid'))
    }

    const summoner = await lcu.getSummonerByRiotId(gameName.trim(), tagLine.trim())
    if (!summoner?.puuid) {
      throw new Error(t('tools.spectate.notFound'))
    }

    return summoner.puuid
  }

  const launchSpectatorByPuuid = async (puuid: string, label: string) => {
    setIsSpectating(true)
    setSpectateStatus('')

    try {
      const phase = await lcu.getGameflowPhase()
      if (phase !== 'None') {
        throw new Error(t('tools.spectate.notIdle', { phase }))
      }

      const payload = await lcu.getSpectatorLaunchPayloadByPuuid(puuid).catch(() => null)
      if (payload?.spectatorKey) {
        await lcu.canSpectateBuddy(payload.puuid, payload.spectatorKey).catch(() => null)
        await lcu.spectateBuddy(payload.puuid)
      } else {
        throw new Error(t('tools.spectate.needFriendKey'))
      }
      setSpectateStatus(t('tools.spectate.success'))
      logger.info('[Spectate] Requested spectator launch for %s', label)
    } catch (err) {
      logger.error('[Spectate] Failed to launch spectator:', err)
      setSpectateStatus(t('tools.spectate.failed', { error: err instanceof Error ? err.message : String(err) }))
    } finally {
      setIsSpectating(false)
    }
  }

  const handleSpectate = async () => {
    if (isSpectating) return

    try {
      const puuid = await getSpectateTargetPuuid(spectateIdentity)
      await launchSpectatorByPuuid(puuid, spectateIdentity.trim())
    } catch (err) {
      setSpectateStatus(err instanceof Error ? err.message : String(err))
    }
  }

  const refreshWatchableFriends = async () => {
    setLoadingWatchableFriends(true)
    setSpectateStatus('')

    try {
      const friends = await lcu.getFriends()
      setWatchableFriends(friends.filter((friend) => friend.lol?.gameStatus === 'inGame' && Boolean(friend.lol?.spectatorKey)))
    } catch (err) {
      logger.error('[Spectate] Failed to load friends:', err)
      setSpectateStatus(t('tools.spectate.loadFriendsFailed'))
    } finally {
      setLoadingWatchableFriends(false)
    }
  }

  return (
    <div className="sona-settings">
      <h2 className="sona-settings-title">{t('tools.title')}</h2>

      <SettingGroup title={t('tools.group.matchQuery')}>
        <p className="sona-subtitle" style={{ marginBottom: 10 }}>{t('tools.matchQuery.description')}</p>
        <div className="sona-debug-actions" style={{ alignItems: 'flex-end', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <SonaInput
              value={searchRiotId}
              onChange={(v) => { setSearchRiotId(v); setSearchError('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearchMatch() }}
              placeholder={t('tools.matchQuery.placeholder')}
            />
          </div>
          <SonaButton variant="primary" onClick={handleSearchMatch}>
            {t('tools.matchQuery.search')}
          </SonaButton>
        </div>
        {searchError && <p className="sona-subtitle" style={{ color: '#e74c3c', marginTop: 6 }}>{searchError}</p>}
      </SettingGroup>

      <MatchHistoryModal
        open={matchModalOpen}
        onClose={() => setMatchModalOpen(false)}
        puuid={matchModalPuuid}
        playerName={matchModalName}
      />

      <SettingGroup title={t('tools.group.client')}>
        <div className="sona-config-lock-card">
          <SettingCard
            title={t('tools.restartUx.title')}
            description={t('tools.restartUx.description')}
          >
            <SonaButton variant="secondary" onClick={handleRestartUx} disabled={restartingUx}>
              {restartingUx ? t('tools.restartUx.restarting') : t('tools.restartUx.button')}
            </SonaButton>
          </SettingCard>

          {restartUxError && (
            <div className="sona-config-action-error">
              {t('tools.restartUx.failed', { error: restartUxError })}
            </div>
          )}
        </div>
      </SettingGroup>

      <SettingGroup title={t('tools.group.spectate')}>
        <p className="sona-subtitle" style={{ marginBottom: 10 }}>{t('tools.spectate.description')}</p>
        <div className="sona-debug-actions" style={{ alignItems: 'flex-end', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <SonaInput
              value={spectateIdentity}
              onChange={(v) => { setSpectateIdentity(v); setSpectateStatus('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSpectate() }}
              placeholder={t('tools.spectate.placeholder')}
            />
          </div>
          <SonaButton onClick={handleSpectate} disabled={isSpectating || !spectateIdentity.trim()}>
            {isSpectating ? t('tools.spectate.launching') : t('tools.spectate.button')}
          </SonaButton>
          <SonaButton variant="secondary" onClick={refreshWatchableFriends} disabled={loadingWatchableFriends}>
            {loadingWatchableFriends ? t('common.loading') : t('tools.spectate.refreshFriends')}
          </SonaButton>
        </div>

        {watchableFriends.length > 0 && (
          <div className="sona-spectate-friends">
            {watchableFriends.map((friend) => (
              <button
                key={friend.puuid}
                className="sona-spectate-friend"
                type="button"
                disabled={isSpectating}
                onClick={() => launchSpectatorByPuuid(friend.puuid, `${friend.gameName}#${friend.gameTag}`)}
              >
                <span className="sona-spectate-friend-name">{friend.gameName}#{friend.gameTag}</span>
                <span className="sona-spectate-friend-mode">{friend.lol?.gameQueueType || friend.lol?.gameMode || t('common.unknown')}</span>
              </button>
            ))}
          </div>
        )}

        {spectateStatus && <p className="sona-subtitle" style={{ marginTop: 8 }}>{spectateStatus}</p>}
      </SettingGroup>

      <SettingGroup title={t('tools.group.replay')}>
        <p className="sona-subtitle" style={{ marginBottom: 10 }}>{t('tools.replay.description')}</p>
        <div className="sona-debug-actions" style={{ alignItems: 'flex-end', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <SonaInput
              value={replayGameId}
              onChange={(v) => { setReplayGameId(v); setReplayState('idle') }}
              placeholder={t('tools.replay.placeholder')}
            />
          </div>
          <SonaButton
            onClick={async () => {
              const id = Number(replayGameId)
              if (!id) return

              setReplayState('downloading')
              try {
                // 1. 查元数据
                const metaRes = await fetch(`/lol-replays/v1/metadata/${id}`)
                if (!metaRes.ok) {
                  logger.error('[Replay] 获取元数据失败:', metaRes.status)
                  setReplayState('error')
                  return
                }
                const meta = await metaRes.json() as { state: string; downloadProgress: number; gameId: number }

                // 2. 已就绪 → 直接观看
                if (meta.state === 'watch') {
                  setReplayState('launching')
                  const res = await fetch(`/lol-replays/v1/rofls/${id}/watch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ componentType: 'replay', contextData: 'match-history' }),
                  })
                  setReplayState(res.ok ? 'ready' : 'error')
                  if (res.ok) logger.info('[Replay] 开始播放 #%d ✓', id)
                  else logger.error('[Replay] 播放失败:', await res.text())
                  return
                }

                // 3. 未下载 → 触发下载
                if (meta.state !== 'downloading') {
                  await fetch(`/lol-replays/v1/rofls/${id}/download`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ componentType: 'replay', contextData: 'match-history' }),
                  })
                }

                // 4. 轮询 metadata 等待下载完成
                for (let i = 0; i < 30; i++) {
                  await new Promise((r) => setTimeout(r, 2000))
                  const checkRes = await fetch(`/lol-replays/v1/metadata/${id}`)
                  if (!checkRes.ok) continue
                  const checkMeta = await checkRes.json() as { state: string; downloadProgress: number }
                  logger.info('[Replay] 下载中... %d%%', checkMeta.downloadProgress)

                  if (checkMeta.state === 'watch') {
                    setReplayState('launching')
                    const res = await fetch(`/lol-replays/v1/rofls/${id}/watch`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ componentType: 'replay', contextData: 'match-history' }),
                    })
                    setReplayState(res.ok ? 'ready' : 'error')
                    if (res.ok) logger.info('[Replay] 下载完成，开始播放 #%d ✓', id)
                    else logger.error('[Replay] 播放失败:', await res.text())
                    return
                  }
                }
                logger.warn('[Replay] 等待超时')
                setReplayState('error')
              } catch (err) {
                logger.error('[Replay] 异常:', err)
                setReplayState('error')
              }
            }}
          >
            {{ idle: t('tools.replay.watch'), downloading: t('tools.replay.status.downloading'), ready: t('tools.replay.status.ready'), launching: t('tools.replay.status.launching'), error: t('tools.replay.status.error') }[replayState]}
          </SonaButton>
        </div>
      </SettingGroup>

      <div className="sona-config-lock-card">
        <SettingCard
          title={t('tools.group.configLock')}
          description={t('tools.group.configLock.description')}
        >
          <SonaButton variant="secondary" onClick={toggleConfigDetails}>
            {configDetailsOpen ? '收起' : '详情'}
          </SonaButton>
          <SonaButton variant={locked ? 'secondary' : 'primary'} onClick={toggleConfigLocked} disabled={updatingConfigLock}>
            {updatingConfigLock ? '处理中...' : locked ? '解锁配置' : '锁定配置'}
          </SonaButton>
        </SettingCard>

        {configDetailsOpen && (
          <div className="sona-config-path-panel sona-config-path-panel--nested">
            <div className="sona-config-path-header">
              <div>
                <div className="sona-config-path-label">配置文件地址</div>
                <p>当前客户端的 PersistedSettings.json 路径。路径通过 LCU 的 /data-store/v1/install-dir 推导。</p>
              </div>
              <SonaButton variant="secondary" onClick={refreshConfigPath} disabled={loadingConfigPath}>
                刷新
              </SonaButton>
            </div>
            <div className={`sona-config-path-value${configPathError ? ' sona-config-path-value--error' : ''}`}>
              {loadingConfigPath ? '正在请求客户端安装目录' : configPathError || settingsPath || '暂无路径'}
            </div>
          </div>
        )}

        {configActionError && (
          <div className="sona-config-action-error">
            {configActionError}
          </div>
        )}
      </div>

    </div>
  )
}
