import { useEffect, useState } from 'react'
import { SettingCard, SettingGroup } from '@/components/ui/SettingCard'
import { SonaButton } from '@/components/ui/SonaButton'
import { SonaSwitch } from '@/components/ui/SonaSwitch'
import { SonaSelect } from '@/components/ui/SonaSelect'
import { lcu } from '@/lib/lcu'
import { logger } from '@/index'
import { store } from '@/lib/store'
import { useI18n } from '@/i18n'
import '@/styles/SettingsPage.css'

export function NexusPage() {
  const { t } = useI18n()
  const [unlockStatus, setUnlockStatus] = useState(store.get('unlockStatus'))
  const [unlockAvailability, setUnlockAvailability] = useState(store.get('unlockAvailability'))
  const [lockOfflineStatus, setLockOfflineStatus] = useState(store.get('lockOfflineStatus'))
  const [friendSmartGroup, setFriendSmartGroup] = useState(store.get('friendSmartGroup'))
  const [enhancedFriendGameStatus, setEnhancedFriendGameStatus] = useState(store.get('enhancedFriendGameStatus'))
  const [friendMatchHistory, setFriendMatchHistory] = useState(store.get('friendMatchHistory'))
  const [customProfileBg, setCustomProfileBg] = useState(store.get('customProfileBg'))
  const [customBanner, setCustomBanner] = useState(store.get('customBanner'))
  const [rankDisguise, setRankDisguise] = useState(store.get('rankDisguise'))
  const [rankQueue, setRankQueue] = useState(store.get('rankQueue'))
  const [rankTier, setRankTier] = useState(store.get('rankTier'))
  const [rankDivision, setRankDivision] = useState(store.get('rankDivision'))

  useEffect(() => {
    const unsubs = [
      store.onChange('unlockStatus', setUnlockStatus),
      store.onChange('unlockAvailability', setUnlockAvailability),
      store.onChange('lockOfflineStatus', setLockOfflineStatus),
      store.onChange('friendSmartGroup', setFriendSmartGroup),
      store.onChange('enhancedFriendGameStatus', setEnhancedFriendGameStatus),
      store.onChange('friendMatchHistory', setFriendMatchHistory),
      store.onChange('customProfileBg', setCustomProfileBg),
      store.onChange('customBanner', setCustomBanner),
      store.onChange('rankDisguise', setRankDisguise),
      store.onChange('rankQueue', setRankQueue),
      store.onChange('rankTier', setRankTier),
      store.onChange('rankDivision', setRankDivision),
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [])

  return (
    <div className="sona-settings">
      <SettingGroup title={t('tools.group.social')}>
        <SettingCard
          title={t('tools.group.rankDisguise')}
          description={t('tools.rankDisguise.description')}
        >
          <SonaSwitch
            checked={rankDisguise}
            onChange={(v) => { setRankDisguise(v); store.set('rankDisguise', v) }}
          />
        </SettingCard>
        {rankDisguise && (
          <div className="sona-setting-switch-panel">
            <div className="sona-setting-panel-section">
              <SettingCard
                title={t('tools.group.rankDisguise')}
                description={t('tools.rankDisguise.description')}
              >
                <div className="sona-debug-actions" style={{ alignItems: 'center' }}>
                  <div style={{ minWidth: 140 }}>
                    <SonaSelect
                      options={[
                        { value: 'RANKED_SOLO_5x5', label: t('rank.queue.RANKED_SOLO_5x5') },
                        { value: 'RANKED_FLEX_SR', label: t('rank.queue.RANKED_FLEX_SR') },
                        { value: 'RANKED_FLEX_TT', label: t('rank.queue.RANKED_FLEX_TT') },
                        { value: 'RANKED_TFT', label: t('rank.queue.RANKED_TFT') },
                        { value: 'RANKED_TFT_DOUBLE_UP', label: t('rank.queue.RANKED_TFT_DOUBLE_UP') },
                        { value: 'RANKED_TFT_TURBO', label: t('rank.queue.RANKED_TFT_TURBO') },
                      ]}
                      value={rankQueue}
                      onChange={(v) => { setRankQueue(v); store.set('rankQueue', v) }}
                    />
                  </div>
                  <div style={{ minWidth: 130 }}>
                    <SonaSelect
                      options={[
                        { value: 'CHALLENGER', label: t('rank.CHALLENGER') },
                        { value: 'GRANDMASTER', label: t('rank.GRANDMASTER') },
                        { value: 'MASTER', label: t('rank.MASTER') },
                        { value: 'DIAMOND', label: t('rank.DIAMOND') },
                        { value: 'EMERALD', label: t('rank.EMERALD') },
                        { value: 'PLATINUM', label: t('rank.PLATINUM') },
                        { value: 'GOLD', label: t('rank.GOLD') },
                        { value: 'SILVER', label: t('rank.SILVER') },
                        { value: 'BRONZE', label: t('rank.BRONZE') },
                        { value: 'IRON', label: t('rank.IRON') },
                      ]}
                      value={rankTier}
                      onChange={(v) => { setRankTier(v); store.set('rankTier', v) }}
                    />
                  </div>
                  <div style={{ minWidth: 80 }}>
                    <SonaSelect
                      options={[
                        { value: 'I', label: 'I' },
                        { value: 'II', label: 'II' },
                        { value: 'III', label: 'III' },
                        { value: 'IV', label: 'IV' },
                      ]}
                      value={rankDivision}
                      onChange={(v) => { setRankDivision(v); store.set('rankDivision', v) }}
                    />
                  </div>
                </div>
              </SettingCard>
            </div>
          </div>
        )}
        <SettingCard
          title={t('tools.unlockStatus.title')}
          description={t('tools.unlockStatus.description')}
        >
          <SonaSwitch
            checked={unlockStatus}
            onChange={(v) => { setUnlockStatus(v); store.set('unlockStatus', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.unlockAvailability.title')}
          description={t('tools.unlockAvailability.description')}
        >
          <SonaSwitch
            checked={unlockAvailability}
            onChange={(v) => {
              setUnlockAvailability(v)
              store.set('unlockAvailability', v)
            }}
          />
        </SettingCard>
        {unlockAvailability && (
          <div className="sona-setting-switch-panel">
            <div className="sona-setting-panel-section">
              <SettingCard
                title={t('tools.lockOfflineStatus.title')}
                description={t('tools.lockOfflineStatus.description')}
              >
                <SonaSwitch
                  checked={lockOfflineStatus}
                  onChange={(v) => { setLockOfflineStatus(v); store.set('lockOfflineStatus', v) }}
                />
              </SettingCard>
            </div>
          </div>
        )}
        <SettingCard
          title={t('tools.customProfileBg.title')}
          description={t('tools.customProfileBg.description')}
        >
          <SonaSwitch
            checked={customProfileBg}
            onChange={(v) => { setCustomProfileBg(v); store.set('customProfileBg', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.customBanner.title')}
          description={t('tools.customBanner.description')}
        >
          <SonaSwitch
            checked={customBanner}
            onChange={(v) => { setCustomBanner(v); store.set('customBanner', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.friendSmartGroup.title')}
          description={t('tools.friendSmartGroup.description')}
        >
          <SonaSwitch
            checked={friendSmartGroup}
            onChange={(v) => { setFriendSmartGroup(v); store.set('friendSmartGroup', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.enhancedFriendStatus.title')}
          description={t('tools.enhancedFriendStatus.description')}
        >
          <SonaSwitch
            checked={enhancedFriendGameStatus}
            onChange={(v) => { setEnhancedFriendGameStatus(v); store.set('enhancedFriendGameStatus', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.friendMatchHistory.title')}
          description={t('tools.friendMatchHistory.description')}
        >
          <SonaSwitch
            checked={friendMatchHistory}
            onChange={(v) => { setFriendMatchHistory(v); store.set('friendMatchHistory', v) }}
          />
        </SettingCard>
      </SettingGroup>
    </div>
  )
}
