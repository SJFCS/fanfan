import { useState, useEffect, useRef } from 'react'
import { SettingCard, SettingGroup } from '@/components/ui/SettingCard'
import { SonaButton } from '@/components/ui/SonaButton'
import { SonaInput } from '@/components/ui/SonaInput'
import { SonaSwitch } from '@/components/ui/SonaSwitch'
import { searchChampions, getChampionById, type ChampionInfo } from '@/lib/assets'
import { logger } from '@/index'
import { store } from '@/lib/store'
import { AUTO_MATCHMAKING_MIN_MEMBERS_MAX, AUTO_MATCHMAKING_MIN_MEMBERS_MIN } from '@/lib/auto-matchmaking-config'
import { useI18n } from '@/i18n'
import '@/styles/SettingsPage.css'


function ChampionPriorityCards({
  championIds,
  emptyText,
  onRemove,
  onReorder,
}: {
  championIds: number[]
  emptyText: string
  onRemove: (championId: number) => void
  onReorder?: (championIds: number[]) => void
}) {
  const [draggedChampionId, setDraggedChampionId] = useState<number | null>(null)

  const handleDrop = (targetChampionId: number) => {
    if (!onReorder || draggedChampionId == null || draggedChampionId === targetChampionId) return

    const fromIndex = championIds.indexOf(draggedChampionId)
    const toIndex = championIds.indexOf(targetChampionId)
    if (fromIndex < 0 || toIndex < 0) return

    const next = [...championIds]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    onReorder(next)
    setDraggedChampionId(null)
  }

  if (championIds.length === 0) {
    return <p className="sona-subtitle" style={{ margin: 0 }}>{emptyText}</p>
  }

  return (
    <div className="sona-champ-priority-list">
      {championIds.map((championId, index) => {
        const champion = getChampionById(championId)
        return (
          <div
            className={`sona-champ-priority-card${onReorder ? ' sona-champ-priority-card-draggable' : ''}${draggedChampionId === championId ? ' is-dragging' : ''}`}
            key={championId}
            draggable={Boolean(onReorder)}
            onDragStart={(event) => {
              if (!onReorder) return
              setDraggedChampionId(championId)
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', String(championId))
            }}
            onDragOver={(event) => {
              if (!onReorder || draggedChampionId == null) return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
            }}
            onDrop={(event) => {
              event.preventDefault()
              handleDrop(championId)
            }}
            onDragEnd={() => setDraggedChampionId(null)}
          >
            <span className="sona-champ-priority-index">{index + 1}</span>
            <img
              className="sona-champ-priority-icon"
              src={`/lol-game-data/assets/v1/champion-icons/${championId}.png`}
              alt=""
            />
            <span className="sona-champ-priority-name">
              {champion ? `${champion.title} ${champion.name}` : `英雄#${championId}`}
            </span>
            <button
              className="sona-champ-priority-remove"
              type="button"
              draggable={false}
              onClick={() => onRemove(championId)}
              aria-label="移除"
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}

const AUTO_ACCEPT_DELAY_MIN_SECONDS = 0
const AUTO_ACCEPT_DELAY_MAX_SECONDS = 15
const AUTO_ACCEPT_DELAY_MS_PER_SECOND = 1000

const autoAcceptDelayInputProps = {
  type: 'number',
  min: AUTO_ACCEPT_DELAY_MIN_SECONDS,
  max: AUTO_ACCEPT_DELAY_MAX_SECONDS,
  step: 0.1,
  inputMode: 'decimal',
  pattern: '[0-9]*\\.?[0-9]*',
} as const

function cleanAutoAcceptDelaySecondsInput(value: string): string {
  const cleaned = value.replace(/[^\d.]/g, '')
  const dotIndex = cleaned.indexOf('.')
  const singleDotValue = dotIndex >= 0
    ? cleaned.slice(0, dotIndex + 1) + cleaned.slice(dotIndex + 1).replace(/\./g, '')
    : cleaned
  const parsedValue = parseFloat(singleDotValue)

  return Number.isFinite(parsedValue) && parsedValue > AUTO_ACCEPT_DELAY_MAX_SECONDS
    ? String(AUTO_ACCEPT_DELAY_MAX_SECONDS)
    : singleDotValue
}

function normalizeAutoAcceptDelaySeconds(value: string | number): number {
  const parsedValue = typeof value === 'number' ? value : parseFloat(cleanAutoAcceptDelaySecondsInput(value))
  if (!Number.isFinite(parsedValue)) return AUTO_ACCEPT_DELAY_MIN_SECONDS
  return Math.min(AUTO_ACCEPT_DELAY_MAX_SECONDS, Math.max(AUTO_ACCEPT_DELAY_MIN_SECONDS, parsedValue))
}

function getAutoAcceptDelayMinSeconds(maxSeconds: number): number {
  return maxSeconds - 1 < AUTO_ACCEPT_DELAY_MIN_SECONDS ? maxSeconds : maxSeconds - 1
}

function formatAutoAcceptDelaySecondsFromMs(value: number): string {
  const delayMs = Number.isFinite(value) ? value : 0
  const delaySeconds = normalizeAutoAcceptDelaySeconds(delayMs / AUTO_ACCEPT_DELAY_MS_PER_SECOND)
  return String(Number(delaySeconds.toFixed(3)))
}

function setAutoAcceptDelayRangeByMaxSeconds(maxSeconds: number) {
  const minSeconds = getAutoAcceptDelayMinSeconds(maxSeconds)
  store.set('autoAcceptDelayMin', Math.round(minSeconds * AUTO_ACCEPT_DELAY_MS_PER_SECOND))
  store.set('autoAcceptDelayMax', Math.round(maxSeconds * AUTO_ACCEPT_DELAY_MS_PER_SECOND))
}

export function AutomationPage() {
  const { t } = useI18n()
  const [autoAccept, setAutoAccept] = useState(store.get('autoAcceptMatch'))
  // 延迟值在 UI 里用字符串存，避免"删到空 → 变 NaN"、"输到一半"等中间态被推回 store
  const [autoAcceptDelayMax, setAutoAcceptDelayMax] = useState(formatAutoAcceptDelaySecondsFromMs(store.get('autoAcceptDelayMax')))
  const [autoReturnToLobby, setAutoReturnToLobby] = useState(store.get('autoReturnToLobby'))
  const [autoMatchmaking, setAutoMatchmaking] = useState(store.get('autoMatchmaking'))
  const [autoMatchmakingMinimumMembers, setAutoMatchmakingMinimumMembers] = useState(String(store.get('autoMatchmakingMinimumMembers')))
  const [autoMatchmakingDelaySeconds, setAutoMatchmakingDelaySeconds] = useState(String(store.get('autoMatchmakingDelaySeconds')))
  const [autoMatchmakingWaitForInvitees, setAutoMatchmakingWaitForInvitees] = useState(store.get('autoMatchmakingWaitForInvitees'))
  const [autoHonor, setAutoHonor] = useState(store.get('autoHonor'))
  const [autoLockChampion, setAutoLockChampion] = useState(store.get('autoLockChampion'))
  const [autoLockChampionIds, setAutoLockChampionIds] = useState(store.get('autoLockChampionIds'))
  const [champSearchText, setChampSearchText] = useState('')
  const [champSuggestions, setChampSuggestions] = useState<ChampionInfo[]>([])
  const [showChampSuggestions, setShowChampSuggestions] = useState(false)
  const [autoLockInstant, setAutoLockInstant] = useState(store.get('autoLockInstant'))
  const champSuggestRef = useRef<HTMLDivElement>(null)
  const [hextechAramAutoLock, setHextechAramAutoLock] = useState(store.get('hextechAramAutoLock'))
  const [hextechAramAutoLockChampionIds, setHextechAramAutoLockChampionIds] = useState(
    store.get('hextechAramAutoLockChampionIds'),
  )
  const [hextechChampSearchText, setHextechChampSearchText] = useState('')
  const [hextechChampSuggestions, setHextechChampSuggestions] = useState<ChampionInfo[]>([])
  const [showHextechChampSuggestions, setShowHextechChampSuggestions] = useState(false)
  const hextechChampSuggestRef = useRef<HTMLDivElement>(null)
  const [autoBanChampion, setAutoBanChampion] = useState(store.get('autoBanChampion'))
  const [autoBanChampionIds, setAutoBanChampionIds] = useState(store.get('autoBanChampionIds'))
  const [banChampSearchText, setBanChampSearchText] = useState('')
  const [banChampSuggestions, setBanChampSuggestions] = useState<ChampionInfo[]>([])
  const [showBanChampSuggestions, setShowBanChampSuggestions] = useState(false)
  const banChampSuggestRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const unsubs = [
      store.onChange('autoAcceptMatch', setAutoAccept),
      store.onChange('autoAcceptDelayMax', (v) => setAutoAcceptDelayMax(formatAutoAcceptDelaySecondsFromMs(v))),
      store.onChange('autoReturnToLobby', setAutoReturnToLobby),
      store.onChange('autoMatchmaking', setAutoMatchmaking),
      store.onChange('autoMatchmakingMinimumMembers', (v) => setAutoMatchmakingMinimumMembers(String(v))),
      store.onChange('autoMatchmakingDelaySeconds', (v) => setAutoMatchmakingDelaySeconds(String(v))),
      store.onChange('autoMatchmakingWaitForInvitees', setAutoMatchmakingWaitForInvitees),
      store.onChange('autoHonor', setAutoHonor),
      store.onChange('autoLockChampion', setAutoLockChampion),
      store.onChange('autoLockChampionIds', setAutoLockChampionIds),
      store.onChange('autoLockInstant', setAutoLockInstant),
      store.onChange('hextechAramAutoLock', setHextechAramAutoLock),
      store.onChange('hextechAramAutoLockChampionIds', setHextechAramAutoLockChampionIds),
      store.onChange('autoBanChampion', setAutoBanChampion),
      store.onChange('autoBanChampionIds', setAutoBanChampionIds),
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [])

  // 点击外部关闭英雄联想下拉
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (champSuggestRef.current && !champSuggestRef.current.contains(e.target as Node)) {
        setShowChampSuggestions(false)
      }
      if (hextechChampSuggestRef.current && !hextechChampSuggestRef.current.contains(e.target as Node)) {
        setShowHextechChampSuggestions(false)
      }
      if (banChampSuggestRef.current && !banChampSuggestRef.current.contains(e.target as Node)) {
        setShowBanChampSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const addAutoLockChampion = (champion: ChampionInfo) => {
    if (autoLockChampionIds.includes(champion.id)) {
      setChampSearchText('')
      setShowChampSuggestions(false)
      return
    }

    const next = [...autoLockChampionIds, champion.id]
    setAutoLockChampionIds(next)
    store.set('autoLockChampionIds', next)
    setChampSearchText('')
    setShowChampSuggestions(false)
    logger.info('[AutoLock] 已加入目标英雄队列: %s %s (ID: %d)', champion.title, champion.name, champion.id)
  }

  const removeAutoLockChampion = (championId: number) => {
    const next = autoLockChampionIds.filter((id) => id !== championId)
    setAutoLockChampionIds(next)
    store.set('autoLockChampionIds', next)
  }

  const reorderAutoLockChampions = (championIds: number[]) => {
    setAutoLockChampionIds(championIds)
    store.set('autoLockChampionIds', championIds)
  }

  const addHextechAramAutoLockChampion = (champion: ChampionInfo) => {
    if (hextechAramAutoLockChampionIds.includes(champion.id)) {
      setHextechChampSearchText('')
      setShowHextechChampSuggestions(false)
      return
    }

    const next = [...hextechAramAutoLockChampionIds, champion.id]
    setHextechAramAutoLockChampionIds(next)
    store.set('hextechAramAutoLockChampionIds', next)
    setHextechChampSearchText('')
    setShowHextechChampSuggestions(false)
    logger.info('[HextechAramAutoLock] 宸插姞鍏ョ洰鏍囪嫳闆勯槦鍒? %s %s (ID: %d)', champion.title, champion.name, champion.id)
  }

  const removeHextechAramAutoLockChampion = (championId: number) => {
    const next = hextechAramAutoLockChampionIds.filter((id) => id !== championId)
    setHextechAramAutoLockChampionIds(next)
    store.set('hextechAramAutoLockChampionIds', next)
  }

  const reorderHextechAramAutoLockChampions = (championIds: number[]) => {
    setHextechAramAutoLockChampionIds(championIds)
    store.set('hextechAramAutoLockChampionIds', championIds)
  }

  const addAutoBanChampion = (champion: ChampionInfo) => {
    if (autoBanChampionIds.includes(champion.id)) {
      setBanChampSearchText('')
      setShowBanChampSuggestions(false)
      return
    }

    const next = [...autoBanChampionIds, champion.id]
    setAutoBanChampionIds(next)
    store.set('autoBanChampionIds', next)
    setBanChampSearchText('')
    setShowBanChampSuggestions(false)
    logger.info('[AutoBan] 已加入目标英雄队列: %s %s (ID: %d)', champion.title, champion.name, champion.id)
  }

  const removeAutoBanChampion = (championId: number) => {
    const next = autoBanChampionIds.filter((id) => id !== championId)
    setAutoBanChampionIds(next)
    store.set('autoBanChampionIds', next)
  }

  const handleAutoHonorChange = (enabled: boolean) => {
    setAutoHonor(enabled)
    store.set('autoHonor', enabled)

    if (!enabled && autoReturnToLobby) {
      setAutoReturnToLobby(false)
      store.set('autoReturnToLobby', false)
    }
  }

  const handleAutoReturnChange = (enabled: boolean) => {
    if (!autoHonor && enabled) {
      return
    }

    setAutoReturnToLobby(enabled)
    store.set('autoReturnToLobby', enabled)
  }

  const autoReturnDisabled = !autoHonor

  const handleAutoMatchmakingChange = (enabled: boolean) => {
    setAutoMatchmaking(enabled)
    store.set('autoMatchmaking', enabled)
  }

  const handleMinimumMembersChange = (value: string) => {
    const cleaned = value.replace(/[^\d]/g, '')
    setAutoMatchmakingMinimumMembers(cleaned)
    const parsed = parseInt(cleaned, 10)
    const next = Number.isFinite(parsed)
      ? Math.max(AUTO_MATCHMAKING_MIN_MEMBERS_MIN, Math.min(AUTO_MATCHMAKING_MIN_MEMBERS_MAX, parsed))
      : AUTO_MATCHMAKING_MIN_MEMBERS_MIN
    store.set('autoMatchmakingMinimumMembers', next)
  }

  const handleMatchmakingDelayChange = (value: string) => {
    const cleaned = value.replace(/[^\d]/g, '')
    setAutoMatchmakingDelaySeconds(cleaned)
    const parsed = parseInt(cleaned, 10)
    store.set('autoMatchmakingDelaySeconds', Number.isFinite(parsed) ? parsed : 0)
  }

  const normalizeAutoMatchmakingInputs = () => {
    setAutoMatchmakingMinimumMembers(String(store.get('autoMatchmakingMinimumMembers')))
    setAutoMatchmakingDelaySeconds(String(store.get('autoMatchmakingDelaySeconds')))
  }

  return (
    <div className="sona-settings">
      <SettingGroup title={t('tools.group.lobbyAutomation')}>
        <SettingCard
          title={t('tools.autoAccept.title')}
          description={t('tools.autoAccept.description')}
        >
          <SonaSwitch
            checked={autoAccept}
            onChange={(v) => {
              setAutoAccept(v)
              store.set('autoAcceptMatch', v)
            }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.autoHonor.title')}
          description={t('tools.autoHonor.description')}
        >
          <SonaSwitch
            checked={autoHonor}
            onChange={handleAutoHonorChange}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.autoReturn.title')}
          description={autoReturnDisabled ? t('tools.autoReturn.requiresHonor') : t('tools.autoReturn.description')}
        >
          <SonaSwitch
            checked={autoReturnToLobby && autoHonor}
            onChange={handleAutoReturnChange}
            disabled={autoReturnDisabled}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.autoMatchmaking.title')}
          description={t('tools.autoMatchmaking.description')}
        >
          <SonaSwitch
            checked={autoMatchmaking}
            onChange={handleAutoMatchmakingChange}
          />
        </SettingCard>
      </SettingGroup>
      <SettingGroup title={t('tools.group.champSelectAutomation')}>
        <SettingCard
          title={t('tools.autoLock.title')}
          description={t('tools.autoLock.description')}
        >
          <SonaSwitch
            checked={autoLockChampion}
            onChange={(v) => { setAutoLockChampion(v); store.set('autoLockChampion', v) }}
          />
        </SettingCard>
        {autoLockChampion && (
          <div className="sona-setting-switch-panel">
            <div className="sona-debug-actions" style={{ alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1, position: 'relative' }} ref={champSuggestRef}>
                <SonaInput
                  value={champSearchText}
                  onChange={(v) => {
                    setChampSearchText(v)
                    const results = searchChampions(v)
                    setChampSuggestions(results)
                    setShowChampSuggestions(results.length > 0)
                  }}
                  placeholder={t('tools.autoLock.searchPlaceholder')}
                />
                {showChampSuggestions && champSuggestions.length > 0 && (
                  <div className="sona-champ-suggest">
                    {champSuggestions.map((c) => (
                      <button
                        key={c.id}
                        className="sona-champ-suggest-item"
                        type="button"
                        onClick={() => addAutoLockChampion(c)}
                      >
                        <img className="sona-champ-suggest-icon" src={`/lol-game-data/assets/v1/champion-icons/${c.id}.png`} alt="" />
                        <span className="sona-champ-suggest-title">{c.title}</span>
                        <span className="sona-champ-suggest-name">{c.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <SonaButton
                variant={autoLockInstant ? 'primary' : undefined}
                onClick={() => { setAutoLockInstant(true); store.set('autoLockInstant', true) }}
              >
                {t('tools.autoLock.lock')}{autoLockInstant ? ' ✓' : ''}
              </SonaButton>
              <SonaButton
                variant={!autoLockInstant ? 'primary' : undefined}
                onClick={() => { setAutoLockInstant(false); store.set('autoLockInstant', false) }}
              >
                {t('tools.autoLock.preselect')}{!autoLockInstant ? ' ✓' : ''}
              </SonaButton>
            </div>
            <ChampionPriorityCards
              championIds={autoLockChampionIds}
              emptyText={t('tools.autoLock.empty')}
              onRemove={removeAutoLockChampion}
              onReorder={reorderAutoLockChampions}
            />
          </div>
        )}
        <SettingCard
          title={t('tools.autoBan.title')}
          description={t('tools.autoBan.description')}
        >
          <SonaSwitch
            checked={autoBanChampion}
            onChange={(v) => { setAutoBanChampion(v); store.set('autoBanChampion', v) }}
          />
        </SettingCard>
        {autoBanChampion && (
          <div className="sona-setting-switch-panel">
            <div className="sona-debug-actions" style={{ alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1, position: 'relative' }} ref={banChampSuggestRef}>
                <SonaInput
                  value={banChampSearchText}
                  onChange={(v) => {
                    setBanChampSearchText(v)
                    const results = searchChampions(v)
                    setBanChampSuggestions(results)
                    setShowBanChampSuggestions(results.length > 0)
                  }}
                  placeholder={t('tools.autoBan.searchPlaceholder')}
                />
                {showBanChampSuggestions && (
                  <div className="sona-champ-suggest">
                    {banChampSuggestions.map((c) => (
                      <button
                        key={c.id}
                        className="sona-champ-suggest-item"
                        type="button"
                        onClick={() => addAutoBanChampion(c)}
                      >
                        <img className="sona-champ-suggest-icon" src={`/lol-game-data/assets/v1/champion-icons/${c.id}.png`} alt="" />
                        <span className="sona-champ-suggest-title">{c.title}</span>
                        <span className="sona-champ-suggest-name">{c.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <ChampionPriorityCards
              championIds={autoBanChampionIds}
              emptyText={t('tools.autoBan.empty')}
              onRemove={removeAutoBanChampion}
            />
          </div>
        )}
        <SettingCard
          title={t('tools.hextechAramAutoLock.title')}
          description={t('tools.hextechAramAutoLock.description')}
        >
          <SonaSwitch
            checked={hextechAramAutoLock}
            onChange={(v) => { setHextechAramAutoLock(v); store.set('hextechAramAutoLock', v) }}
          />
        </SettingCard>
        {hextechAramAutoLock && (
          <div className="sona-setting-switch-panel">
            <div className="sona-debug-actions" style={{ alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1, position: 'relative' }} ref={hextechChampSuggestRef}>
                <SonaInput
                  value={hextechChampSearchText}
                  onChange={(v) => {
                    setHextechChampSearchText(v)
                    const results = searchChampions(v)
                    setHextechChampSuggestions(results)
                    setShowHextechChampSuggestions(results.length > 0)
                  }}
                  placeholder={t('tools.hextechAramAutoLock.searchPlaceholder')}
                />
                {showHextechChampSuggestions && hextechChampSuggestions.length > 0 && (
                  <div className="sona-champ-suggest">
                    {hextechChampSuggestions.map((c) => (
                      <button
                        key={c.id}
                        className="sona-champ-suggest-item"
                        type="button"
                        onClick={() => addHextechAramAutoLockChampion(c)}
                      >
                        <img className="sona-champ-suggest-icon" src={`/lol-game-data/assets/v1/champion-icons/${c.id}.png`} alt="" />
                        <span className="sona-champ-suggest-title">{c.title}</span>
                        <span className="sona-champ-suggest-name">{c.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <ChampionPriorityCards
              championIds={hextechAramAutoLockChampionIds}
              emptyText={t('tools.hextechAramAutoLock.empty')}
              onRemove={removeHextechAramAutoLockChampion}
              onReorder={reorderHextechAramAutoLockChampions}
            />
          </div>
        )}        
      </SettingGroup>
    </div>
  )
}
