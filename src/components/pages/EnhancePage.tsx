import { useState, useEffect } from 'react'
import { SettingCard, SettingGroup } from '@/components/ui/SettingCard'
import { SonaSwitch } from '@/components/ui/SonaSwitch'
import { SonaSelect } from '@/components/ui/SonaSelect'
import { store, type InGameAutoPopupMode, type LobbyEnhancementDisplayMode } from '@/lib/store'
import { useI18n } from '@/i18n'
import '@/styles/SettingsPage.css'

export function EnhancePage() {
  const { t } = useI18n()
  const visibilityOptions = [
  { value: 'celebration', label: t('option.visibility.self') },
  { value: 'chat', label: t('option.visibility.team') },
]
  const recentOptions = [
    { value: '20', label: t('option.recent.20') },
    { value: '50', label: t('option.recent.50') },
    { value: '100', label: t('option.recent.100') },
  ]
  const [champSelectAssist, setChampSelectAssist] = useState(store.get('champSelectAssist'))
  const [opggBuildRecommendation, setOpggBuildRecommendation] = useState(store.get('opggBuildRecommendation'))
  const [smartBuildRecommendation, setSmartBuildRecommendation] = useState(store.get('smartBuildRecommendation'))
  const [balanceBuffTooltip, setBalanceBuffTooltip] = useState(store.get('balanceBuffTooltip'))
  const [inGameAutoPopupMode, setInGameAutoPopupMode] = useState(store.get('inGameAutoPopupMode'))
  const [analyzeTeamPower, setAnalyzeTeamPower] = useState(store.get('analyzeTeamPower'))
  const [analyzeTeamPowerMsgType, setAnalyzeTeamPowerMsgType] = useState(store.get('analyzeTeamPowerMsgType'))
  const [analyzeTeamPowerFetchCount, setAnalyzeTeamPowerFetchCount] = useState(store.get('analyzeTeamPowerFetchCount'))
  const [analyzeTeamPowerDisplayMode, setAnalyzeTeamPowerDisplayMode] = useState(store.get('analyzeTeamPowerDisplayMode'))
  const [champSelectAssistFetchCount, setChampSelectAssistFetchCount] = useState(store.get('champSelectAssistFetchCount'))
  const [gameAnalysisFetchCount, setGameAnalysisFetchCount] = useState(store.get('gameAnalysisFetchCount'))
  const [sideIndicator, setSideIndicator] = useState(store.get('sideIndicator'))
  const [sideIndicatorMsgType, setSideIndicatorMsgType] = useState(store.get('sideIndicatorMsgType'))
  const [benchNoCooldown, setBenchNoCooldown] = useState(store.get('benchNoCooldown'))
  const [champSelectQuitButton, setChampSelectQuitButton] = useState(store.get('champSelectQuitButton'))
  const [lobbyEnhancementFetchCount, setLobbyEnhancementFetchCount] = useState(store.get('lobbyEnhancementFetchCount'))
  const [lobbyEnhancementDisplayMode, setLobbyEnhancementDisplayMode] = useState(store.get('lobbyEnhancementDisplayMode'))
  const [lobbyEnhancement, setLobbyEnhancement] = useState(store.get('lobbyEnhancement'))

  useEffect(() => {
    const unsubs = [
      store.onChange('champSelectAssist', setChampSelectAssist),
      store.onChange('opggBuildRecommendation', setOpggBuildRecommendation),
      store.onChange('smartBuildRecommendation', setSmartBuildRecommendation),
      store.onChange('balanceBuffTooltip', setBalanceBuffTooltip),
      store.onChange('inGameAutoPopupMode', setInGameAutoPopupMode),
      store.onChange('analyzeTeamPower', setAnalyzeTeamPower),
      store.onChange('analyzeTeamPowerMsgType', setAnalyzeTeamPowerMsgType),
      store.onChange('analyzeTeamPowerFetchCount', setAnalyzeTeamPowerFetchCount),
      store.onChange('analyzeTeamPowerDisplayMode', setAnalyzeTeamPowerDisplayMode),
      store.onChange('champSelectAssistFetchCount', setChampSelectAssistFetchCount),
      store.onChange('gameAnalysisFetchCount', setGameAnalysisFetchCount),
      store.onChange('sideIndicator', setSideIndicator),
      store.onChange('sideIndicatorMsgType', setSideIndicatorMsgType),
      store.onChange('benchNoCooldown', setBenchNoCooldown),
      store.onChange('champSelectQuitButton', setChampSelectQuitButton),
      store.onChange('lobbyEnhancementFetchCount', setLobbyEnhancementFetchCount),
      store.onChange('lobbyEnhancementDisplayMode', setLobbyEnhancementDisplayMode),
      store.onChange('lobbyEnhancement', setLobbyEnhancement),
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [])

  return (
    <div className="sona-settings">
      <SettingGroup title={t('tools.group.enhanceInsights')}>
        <SettingCard
          title={t('tools.analyzeTeamPower.title')}
          description={t('tools.analyzeTeamPower.description')}
        >
          <SonaSelect
            value={String(analyzeTeamPowerFetchCount)}
            onChange={(v) => { setAnalyzeTeamPowerFetchCount(Number(v)); store.set('analyzeTeamPowerFetchCount', Number(v)) }}
            options={recentOptions}
          />
          <SonaSelect
            value={analyzeTeamPowerDisplayMode}
            onChange={(v) => {
              const mode = v as 'legacy' | 'strength'
              setAnalyzeTeamPowerDisplayMode(mode)
              store.set('analyzeTeamPowerDisplayMode', mode)
            }}
            options={[
              { value: 'legacy', label: t('option.display.legacy') },
              { value: 'strength', label: t('option.display.strength') },
            ]}
          />
          <SonaSelect
            value={analyzeTeamPowerMsgType}
            onChange={(v) => { setAnalyzeTeamPowerMsgType(v); store.set('analyzeTeamPowerMsgType', v) }}
            options={visibilityOptions}
          />
          <SonaSwitch
            checked={analyzeTeamPower}
            onChange={(v) => { setAnalyzeTeamPower(v); store.set('analyzeTeamPower', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.sideIndicator.title')}
          description={t('tools.sideIndicator.description')}
        >
          <SonaSelect
            value={sideIndicatorMsgType}
            onChange={(v) => { setSideIndicatorMsgType(v); store.set('sideIndicatorMsgType', v) }}
            options={visibilityOptions}
          />
          <SonaSwitch
            checked={sideIndicator}
            onChange={(v) => { setSideIndicator(v); store.set('sideIndicator', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.champSelectAssist.title')}
          description={t('tools.champSelectAssist.description')}
        >
          <SonaSelect
            value={String(champSelectAssistFetchCount)}
            onChange={(v) => { setChampSelectAssistFetchCount(Number(v)); store.set('champSelectAssistFetchCount', Number(v)) }}
            options={recentOptions}
          />
          <SonaSwitch
            checked={champSelectAssist}
            onChange={(v) => { setChampSelectAssist(v); store.set('champSelectAssist', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.lobbyEnhancement.title')}
          description={t('tools.lobbyEnhancement.description')}
        >
          <SonaSelect
            value={String(lobbyEnhancementFetchCount)}
            onChange={(v) => { setLobbyEnhancementFetchCount(Number(v)); store.set('lobbyEnhancementFetchCount', Number(v)) }}
            options={recentOptions}
          />
          <SonaSelect
            value={lobbyEnhancementDisplayMode}
            onChange={(v) => {
              const mode = v as LobbyEnhancementDisplayMode
              setLobbyEnhancementDisplayMode(mode)
              store.set('lobbyEnhancementDisplayMode', mode)
            }}
            options={[
              { value: 'humor', label: t('option.lobbyEnhancementDisplay.humor') },
              { value: 'score', label: t('option.lobbyEnhancementDisplay.score') },
            ]}
          />
          <SonaSwitch
            checked={lobbyEnhancement}
            onChange={(v) => { setLobbyEnhancement(v); store.set('lobbyEnhancement', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.balanceBuffTooltip.title')}
          description={t('tools.balanceBuffTooltip.description')}
        >
          <SonaSwitch
            checked={balanceBuffTooltip}
            onChange={(v) => { setBalanceBuffTooltip(v); store.set('balanceBuffTooltip', v) }}
          />
        </SettingCard>
      </SettingGroup>

      <SettingGroup title={t('tools.group.enhanceActions')}>
        <SettingCard
          title={t('tools.benchNoCooldown.title')}
          description={t('tools.benchNoCooldown.description')}
        >
          <SonaSwitch
            checked={benchNoCooldown}
            onChange={(v) => { setBenchNoCooldown(v); store.set('benchNoCooldown', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.opggBuildRecommendation.title')}
          description={t('tools.opggBuildRecommendation.description')}
        >
          <SonaSwitch
            checked={opggBuildRecommendation}
            onChange={(v) => { setOpggBuildRecommendation(v); store.set('opggBuildRecommendation', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.smartBuildRecommendation.title')}
          description={t('tools.smartBuildRecommendation.description')}
        >
          <SonaSwitch
            checked={smartBuildRecommendation}
            onChange={(v) => { setSmartBuildRecommendation(v); store.set('smartBuildRecommendation', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.champSelectQuitButton.title')}
          description={t('tools.champSelectQuitButton.description')}
        >
          <SonaSwitch
            checked={champSelectQuitButton}
            onChange={(v) => { setChampSelectQuitButton(v); store.set('champSelectQuitButton', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.inGameAutoPopup.title')}
          description={t('tools.inGameAutoPopup.description')}
        >
          {inGameAutoPopupMode === 'gameAnalysis' && (
            <SonaSelect
              value={String(gameAnalysisFetchCount)}
              onChange={(v) => { setGameAnalysisFetchCount(Number(v)); store.set('gameAnalysisFetchCount', Number(v)) }}
              options={recentOptions}
            />
          )}
          <SonaSelect
            value={inGameAutoPopupMode}
            onChange={(v) => {
              const mode = v as InGameAutoPopupMode
              setInGameAutoPopupMode(mode)
              store.set('inGameAutoPopupMode', mode)
            }}
            options={[
              { value: 'none', label: t('option.inGameAutoPopup.none') },
              { value: 'gameAnalysis', label: t('option.inGameAutoPopup.gameAnalysis') },
              { value: 'buildRecommendation', label: t('option.inGameAutoPopup.buildRecommendation') },
            ]}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.balanceBuffTooltip.title')}
          description={t('tools.balanceBuffTooltip.description')}
        >
          <SonaSwitch
            checked={balanceBuffTooltip}
            onChange={(v) => { setBalanceBuffTooltip(v); store.set('balanceBuffTooltip', v) }}
          />
        </SettingCard>
      </SettingGroup>
    </div>
  )
}
