import { useState } from 'react'
import { SettingCard, SettingGroup } from '@/components/ui/SettingCard'
import { SonaButton } from '@/components/ui/SonaButton'
import { SonaInput } from '@/components/ui/SonaInput'
import { MatchHistoryModal } from '@/components/ui/MatchHistoryModal'
import { SidebarPinButton } from '@/components/ui/SidebarPinButton'
import { lcu } from '@/lib/lcu'
import { logger } from '@/index'
import { useI18n } from '@/i18n'
import type { ChatFriend } from '@/types/lcu'
import { leaveCurrentLobby, playAgainFromEndgame, restartClientUx } from '@/lib/sidebar-quick-actions'
import '@/styles/SettingsPage.css'

export function ToolkitPage() {
  const { t } = useI18n()
  const [replayGameId, setReplayGameId] = useState('')
  const [replayState, setReplayState] = useState<'idle' | 'downloading' | 'ready' | 'launching' | 'error'>('idle')
  const [searchRiotId, setSearchRiotId] = useState('')
  const [searchError, setSearchError] = useState('')
  const [matchModalOpen, setMatchModalOpen] = useState(false)
  const [matchModalPuuid, setMatchModalPuuid] = useState('')
  const [matchModalName, setMatchModalName] = useState('')
  const [restartingUx, setRestartingUx] = useState(false)
  const [restartUxError, setRestartUxError] = useState('')
  const [gameflowAction, setGameflowAction] = useState<'playAgain' | 'leaveLobby' | null>(null)
  const [gameflowStatus, setGameflowStatus] = useState('')
  const [spectateIdentity, setSpectateIdentity] = useState('')
  const [spectateStatus, setSpectateStatus] = useState('')
  const [isSpectating, setIsSpectating] = useState(false)
  const [watchableFriends, setWatchableFriends] = useState<ChatFriend[]>([])
  const [loadingWatchableFriends, setLoadingWatchableFriends] = useState(false)
  const [removingCrest, setRemovingCrest] = useState(false)
  const [resettingIcon, setResettingIcon] = useState(false)
  const [removingChallengeTokens, setRemovingChallengeTokens] = useState(false)
  const [clearingEmotes, setClearingEmotes] = useState(false)

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

  const handleRestartUx = async () => {
    setRestartingUx(true)
    setRestartUxError('')

    try {
      await restartClientUx()
      logger.info('[Toolkit] League Client UX restart requested')
    } catch (err) {
      logger.error('[Toolkit] Failed to restart League Client UX:', err)
      setRestartUxError(err instanceof Error ? err.message : String(err))
    } finally {
      setRestartingUx(false)
    }
  }

  const handlePlayAgain = async () => {
    if (gameflowAction) return

    setGameflowAction('playAgain')
    setGameflowStatus('')

    try {
      const phase = await playAgainFromEndgame()
      setGameflowStatus(t('tools.gameflow.playAgain.success'))
      logger.info('[Toolkit] Requested play-again from endgame phase: %s', phase)
    } catch (err) {
      logger.error('[Toolkit] Failed to play again:', err)
      setGameflowStatus(t('tools.gameflow.playAgain.failed', { error: err instanceof Error ? err.message : String(err) }))
    } finally {
      setGameflowAction(null)
    }
  }

  const handleLeaveLobby = async () => {
    if (gameflowAction) return

    setGameflowAction('leaveLobby')
    setGameflowStatus('')

    try {
      await leaveCurrentLobby()
      setGameflowStatus(t('tools.gameflow.leaveLobby.success'))
      logger.info('[Toolkit] Left current lobby')
    } catch (err) {
      logger.error('[Toolkit] Failed to leave lobby:', err)
      setGameflowStatus(t('tools.gameflow.leaveLobby.failed', { error: err instanceof Error ? err.message : String(err) }))
    } finally {
      setGameflowAction(null)
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

  const handleRemoveCrest = async () => {
    if (removingCrest) return

    setRemovingCrest(true)
    try {
      await fetch('/lol-regalia/v2/current-summoner/regalia', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredCrestType: 'prestige', preferredBannerType: 'blank', selectedPrestigeCrest: 0 }),
      })
      logger.info('[Toolkit] Removed profile crest')
    } catch (err) {
      logger.error('[Toolkit] Failed to remove profile crest:', err)
    } finally {
      setRemovingCrest(false)
    }
  }

  const handleResetIcon = async () => {
    if (resettingIcon) return

    setResettingIcon(true)
    try {
      await lcu.setProfileIcon(29)
      logger.info('[Toolkit] Reset profile icon')
    } catch (err) {
      logger.error('[Toolkit] Failed to reset profile icon:', err)
    } finally {
      setResettingIcon(false)
    }
  }

  const handleRemoveChallengeTokens = async () => {
    if (removingChallengeTokens) return

    setRemovingChallengeTokens(true)
    try {
      await lcu.removeChallengeTokens()
      logger.info('[Toolkit] Removed challenge tokens')
    } catch (err) {
      logger.error('[Toolkit] Failed to remove challenge tokens:', err)
    } finally {
      setRemovingChallengeTokens(false)
    }
  }

  const handleClearEmotes = async () => {
    if (clearingEmotes) return

    setClearingEmotes(true)
    try {
      await lcu.clearEmotes()
      logger.info('[Toolkit] Cleared emotes')
    } catch (err) {
      logger.error('[Toolkit] Failed to clear emotes:', err)
    } finally {
      setClearingEmotes(false)
    }
  }

  return (
    <div className="sona-settings">
      <SettingGroup title={t('tools.group.match')}>
        <SettingCard
          title={t('tools.group.matchQuery')}
          description={t('tools.matchQuery.description')}
        >
          <div className="sona-toolkit-card-action">
            <div className="sona-toolkit-card-input">
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
          {searchError && <p className="sona-subtitle sona-toolkit-card-status" style={{ color: '#e74c3c' }}>{searchError}</p>}
        </SettingCard>

        <SettingCard
          title={t('tools.group.replay')}
          description={t('tools.replay.description')}
        >
          <div className="sona-toolkit-card-action">
            <div className="sona-toolkit-card-input">
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
        </SettingCard>

        <SettingCard
          title={t('tools.group.spectate')}
          description={t('tools.spectate.description')}
        >
          <div className="sona-toolkit-card-action">
            <div className="sona-toolkit-card-input">
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

          {spectateStatus && <p className="sona-subtitle sona-toolkit-card-status">{spectateStatus}</p>}
        </SettingCard>
      </SettingGroup>

      <SettingGroup title={t('tools.group.socialtools')}>
        <SettingCard
          title={t('tools.removeCrest.title')}
          description={t('tools.removeCrest.description')}
        >
          <SonaButton onClick={handleRemoveCrest} disabled={removingCrest}>
            {removingCrest ? t('common.loading') : t('tools.unequip')}
          </SonaButton>
        </SettingCard>
        <SettingCard
          title={t('tools.removeIcon.title')}
          description={t('tools.removeIcon.description')}
        >
          <SonaButton onClick={handleResetIcon} disabled={resettingIcon}>
            {resettingIcon ? t('common.loading') : t('tools.unequip')}
          </SonaButton>
        </SettingCard>
        <SettingCard
          title={t('tools.removeChallengeTokens.title')}
          description={t('tools.removeChallengeTokens.description')}
        >
          <SonaButton onClick={handleRemoveChallengeTokens} disabled={removingChallengeTokens}>
            {removingChallengeTokens ? t('common.loading') : t('tools.unequip')}
          </SonaButton>
        </SettingCard>
        <SettingCard
          title={t('tools.clearEmotes.title')}
          description={t('tools.clearEmotes.description')}
        >
          <SonaButton onClick={handleClearEmotes} disabled={clearingEmotes}>
            {clearingEmotes ? t('common.loading') : t('tools.unequip')}
          </SonaButton>
        </SettingCard>
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
            title={t('tools.gameflow.playAgain.title')}
            description={t('tools.gameflow.playAgain.description')}
          >
            <SonaButton variant="primary" onClick={handlePlayAgain} disabled={gameflowAction !== null}>
              {gameflowAction === 'playAgain' ? t('tools.gameflow.processing') : t('tools.gameflow.playAgain.button')}
            </SonaButton>
            <SidebarPinButton action="playAgain" label={t('tools.gameflow.playAgain.title')} />
          </SettingCard>

          <SettingCard
            title={t('tools.gameflow.leaveLobby.title')}
            description={t('tools.gameflow.leaveLobby.description')}
          >
            <SonaButton variant="secondary" onClick={handleLeaveLobby} disabled={gameflowAction !== null}>
              {gameflowAction === 'leaveLobby' ? t('tools.gameflow.processing') : t('tools.gameflow.leaveLobby.button')}
            </SonaButton>
            <SidebarPinButton action="leaveLobby" label={t('tools.gameflow.leaveLobby.title')} />
          </SettingCard>

          {gameflowStatus && (
            <div className="sona-config-action-error" style={{ color: '#cdbe91', borderColor: 'rgba(200, 170, 110, 0.28)', background: 'rgba(200, 170, 110, 0.08)' }}>
              {gameflowStatus}
            </div>
          )}

          <SettingCard
            title={t('tools.restartUx.title')}
            description={t('tools.restartUx.description')}
          >
            <SonaButton variant="secondary" onClick={handleRestartUx} disabled={restartingUx}>
              {restartingUx ? t('tools.restartUx.restarting') : t('tools.restartUx.button')}
            </SonaButton>
            <SidebarPinButton action="restartUx" label={t('tools.restartUx.title')} />
          </SettingCard>

          {restartUxError && (
            <div className="sona-config-action-error">
              {t('tools.restartUx.failed', { error: restartUxError })}
            </div>
          )}
        </div>
      </SettingGroup>
    </div>
  )
}
