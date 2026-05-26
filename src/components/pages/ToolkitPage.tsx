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
