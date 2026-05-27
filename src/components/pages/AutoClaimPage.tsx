import { useEffect, useMemo, useRef, useState } from 'react'
import { SettingGroup } from '@/components/ui/SettingCard'
import { SonaButton } from '@/components/ui/SonaButton'
import { SonaCheckbox } from '@/components/ui/SonaCheckbox'
import {
  claimEventHubRewards,
  claimMissions,
  claimRewardGrants,
  getClaimableEventHubEvents,
  getClaimableMissions,
  getClaimableRewardGrants,
  type ClaimableEventHubEvent,
  type ClaimableMission,
  type ClaimableRewardGroup,
  type ClaimableRewardItem,
  type ClaimableRewardGrant,
} from '@/lib/features/auto-claim'
import { useI18n } from '@/i18n'
import { lcu, LcuEventUri } from '@/lib/lcu'
import '@/styles/AutoClaimPage.css'

type ClaimKind = 'rewards' | 'missions' | 'events'

function itemKey(kind: ClaimKind, id: string) {
  return `${kind}:${id}`
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="sona-claim-empty">
      <div className="sona-claim-empty-icon">
        <span />
      </div>
      <div>{text}</div>
    </div>
  )
}

function RewardPreview({ items }: { items: ClaimableRewardItem[] }) {
  if (items.length === 0) return null

  return (
    <div className="sona-claim-reward-preview">
      {items.slice(0, 6).map((item) => (
        <div className="sona-claim-reward-chip" key={item.id} title={item.name}>
          {item.iconUrl ? <img src={item.iconUrl} alt="" /> : <span />}
          <em>{item.name}</em>
        </div>
      ))}
    </div>
  )
}

function RewardGroupPreview({ groups }: { groups?: ClaimableRewardGroup[] }) {
  if (!groups?.length) return null

  return (
    <div className="sona-claim-reward-groups">
      {groups.map((group) => (
        <div className="sona-claim-reward-group" key={group.id}>
          <div className="sona-claim-reward-group-title">{group.title}</div>
          <RewardPreview items={group.items} />
        </div>
      ))}
    </div>
  )
}

interface ClaimSectionProps<T extends { sonaTitle: string; sonaItems: ClaimableRewardItem[]; sonaGroups?: ClaimableRewardGroup[] }> {
  title: string
  hint?: string
  kind: ClaimKind
  rows: T[]
  selectedIds: Set<string>
  loading: boolean
  claiming: boolean
  onToggle: (id: string) => void
  onToggleAll: () => void
  onRefresh: () => void
  onClaim: () => void
  onCancel?: () => void
  message?: string
  text: {
    claim: string
    claiming: string
    cancel: string
    refresh: string
    refreshing: string
    itemColumn: string
    empty: string
  }
}

function ClaimSection<T extends { id?: string; info?: { id?: string }; sonaTitle: string; sonaItems: ClaimableRewardItem[]; sonaGroups?: ClaimableRewardGroup[] }>({
  title,
  hint,
  kind,
  rows,
  selectedIds,
  loading,
  claiming,
  onToggle,
  onToggleAll,
  onRefresh,
  onClaim,
  onCancel,
  message,
  text,
}: ClaimSectionProps<T>) {
  const allChecked = rows.length > 0 && rows.every((row) => selectedIds.has(row.info?.id ?? row.id ?? ''))

  return (
    <section className="sona-claim-section">
      <div className="sona-claim-section-header">
        <div className="sona-claim-section-heading">
          {title && <h2>{title}</h2>}
          {hint && <p>{hint}</p>}
        </div>
        <div className="sona-claim-actions">
          <SonaButton onClick={onClaim} disabled={claiming || loading || selectedIds.size === 0}>
            {claiming ? text.claiming : text.claim}
          </SonaButton>
          {claiming && onCancel && (
            <SonaButton variant="secondary" onClick={onCancel}>
              {text.cancel}
            </SonaButton>
          )}
          <SonaButton variant="secondary" onClick={onRefresh} disabled={loading || claiming}>
            {loading ? text.refreshing : text.refresh}
          </SonaButton>
        </div>
      </div>

      <div className="sona-claim-table">
        <div className="sona-claim-table-head">
          <SonaCheckbox checked={allChecked} onChange={onToggleAll} disabled={rows.length === 0 || loading || claiming} />
          <span>{text.itemColumn}</span>
        </div>

        <div className="sona-claim-table-body">
          {rows.length === 0 ? (
            <EmptyState text={text.empty} />
          ) : rows.map((row) => {
            const id = row.info?.id ?? row.id ?? ''
            const key = itemKey(kind, id)
            return (
              <div
                className="sona-claim-row"
                key={key}
              >
                <SonaCheckbox
                  checked={selectedIds.has(id)}
                  onChange={() => onToggle(id)}
                  disabled={loading || claiming}
                />
                <div className="sona-claim-row-main">
                  <strong>{row.sonaTitle}</strong>
                  {row.sonaGroups?.length ? <RewardGroupPreview groups={row.sonaGroups} /> : <RewardPreview items={row.sonaItems} />}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {message && <pre className="sona-claim-group-message">{message}</pre>}
    </section>
  )
}

export function AutoClaimPage() {
  const { t } = useI18n()
  const [rewards, setRewards] = useState<ClaimableRewardGrant[]>([])
  const [missions, setMissions] = useState<ClaimableMission[]>([])
  const [events, setEvents] = useState<ClaimableEventHubEvent[]>([])
  const [selectedRewards, setSelectedRewards] = useState<Set<string>>(new Set())
  const [selectedMissions, setSelectedMissions] = useState<Set<string>>(new Set())
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set())
  const [loadingRewards, setLoadingRewards] = useState(false)
  const [loadingMissions, setLoadingMissions] = useState(false)
  const [loadingEvents, setLoadingEvents] = useState(false)
  const [claimingRewards, setClaimingRewards] = useState(false)
  const [claimingMissions, setClaimingMissions] = useState(false)
  const [claimingEvents, setClaimingEvents] = useState(false)
  const [rewardMessage, setRewardMessage] = useState('')
  const [missionMessage, setMissionMessage] = useState('')
  const [eventMessage, setEventMessage] = useState('')
  const rewardClaimingRef = useRef(false)
  const missionClaimingRef = useRef(false)
  const eventClaimingRef = useRef(false)
  const rewardLoadingRef = useRef(false)
  const missionLoadingRef = useRef(false)
  const eventLoadingRef = useRef(false)

  const selectedRewardRows = useMemo(
    () => rewards.filter((reward) => selectedRewards.has(reward.info.id)),
    [rewards, selectedRewards],
  )

  const selectedMissionRows = useMemo(
    () => missions.filter((mission) => selectedMissions.has(mission.id)),
    [missions, selectedMissions],
  )

  const selectedEventRows = useMemo(
    () => events.filter((event) => selectedEvents.has(event.id)),
    [events, selectedEvents],
  )

  const refreshRewards = async () => {
    if (rewardLoadingRef.current) return rewards
    rewardLoadingRef.current = true
    setLoadingRewards(true)
    try {
      const data = await getClaimableRewardGrants()
      setRewards(data)
      setSelectedRewards((current) => new Set([...current].filter((id) => data.some((item) => item.info.id === id))))
      return data
    } catch (error) {
      setRewardMessage(error instanceof Error ? error.message : String(error))
      return null
    } finally {
      rewardLoadingRef.current = false
      setLoadingRewards(false)
    }
  }

  const refreshMissions = async () => {
    if (missionLoadingRef.current) return
    missionLoadingRef.current = true
    setLoadingMissions(true)
    try {
      const data = await getClaimableMissions()
      setMissions(data)
      setSelectedMissions((current) => new Set([...current].filter((id) => data.some((item) => item.id === id))))
    } catch (error) {
      setMissionMessage(error instanceof Error ? error.message : String(error))
    } finally {
      missionLoadingRef.current = false
      setLoadingMissions(false)
    }
  }

  const refreshEvents = async () => {
    if (eventLoadingRef.current) return events
    eventLoadingRef.current = true
    setLoadingEvents(true)
    try {
      const data = await getClaimableEventHubEvents()
      setEvents(data)
      setSelectedEvents((current) => new Set([...current].filter((id) => data.some((item) => item.id === id))))
      return data
    } catch (error) {
      setEventMessage(error instanceof Error ? error.message : String(error))
      return null
    } finally {
      eventLoadingRef.current = false
      setLoadingEvents(false)
    }
  }

  useEffect(() => {
    void refreshRewards()
    void refreshMissions()
    void refreshEvents()

    const unsubs = [
      lcu.observe(LcuEventUri.REWARDS_GRANTS, () => void refreshRewards()),
      lcu.observe(LcuEventUri.MISSIONS, () => void refreshMissions()),
      lcu.observe(LcuEventUri.EVENT_HUB_EVENTS, () => void refreshEvents()),
    ]

    return () => {
      unsubs.forEach((unsubscribe) => unsubscribe())
    }
  }, [])

  const toggleReward = (id: string) => {
    setSelectedRewards((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleMission = (id: string) => {
    setSelectedMissions((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleEvent = (id: string) => {
    setSelectedEvents((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const claimSelectedRewards = async () => {
    rewardClaimingRef.current = true
    setClaimingRewards(true)
    try {
      const result = await claimRewardGrants(selectedRewardRows, { shouldContinue: () => rewardClaimingRef.current })
      setRewardMessage(result.errors.length ? result.errors.join('\n') : t('autoClaim.message.claimedRewards', { count: result.count }))
      setSelectedRewards(new Set())
      await refreshRewards()
    } catch (error) {
      setRewardMessage(error instanceof Error ? error.message : String(error))
    } finally {
      rewardClaimingRef.current = false
      setClaimingRewards(false)
    }
  }

  const claimSelectedMissions = async () => {
    missionClaimingRef.current = true
    setClaimingMissions(true)
    try {
      const result = await claimMissions(selectedMissionRows, { shouldContinue: () => missionClaimingRef.current })
      setMissionMessage(result.errors.length ? result.errors.join('\n') : t('autoClaim.message.claimedMissions', { count: result.count }))
      setSelectedMissions(new Set())
      await refreshMissions()
    } catch (error) {
      setMissionMessage(error instanceof Error ? error.message : String(error))
    } finally {
      missionClaimingRef.current = false
      setClaimingMissions(false)
    }
  }

  const claimSelectedEvents = async () => {
    eventClaimingRef.current = true
    setClaimingEvents(true)
    try {
      const result = await claimEventHubRewards(selectedEventRows, { shouldContinue: () => eventClaimingRef.current })
      setSelectedEvents(new Set())
      const [remainingEvents, remainingRewards] = await Promise.all([refreshEvents(), refreshRewards()])

      const messages = [result.errors.length ? result.errors.join('\n') : t('autoClaim.message.claimedEvents', { count: result.count })]

      if ((!remainingEvents || remainingEvents.length === 0) && remainingRewards && remainingRewards.length > 0) {
        messages.push(t('autoClaim.message.rewardFallback', { count: remainingRewards.length }))
      }

      setEventMessage(messages.join('\n'))
    } catch (error) {
      setEventMessage(error instanceof Error ? error.message : String(error))
    } finally {
      eventClaimingRef.current = false
      setClaimingEvents(false)
    }
  }

  return (
    <div className="sona-settings sona-claim-page">
      <h2 className="sona-settings-title">{t('autoClaim.title')}</h2>

      <SettingGroup title={t('autoClaim.section.events.title')}>
        <ClaimSection
          title=""
          hint={t('autoClaim.section.events.hint')}
          kind="events"
          rows={events}
          selectedIds={selectedEvents}
          loading={loadingEvents}
          claiming={claimingEvents}
          onToggle={toggleEvent}
          onToggleAll={() => setSelectedEvents(selectedEvents.size === events.length ? new Set() : new Set(events.map((item) => item.id)))}
          onRefresh={refreshEvents}
          onClaim={claimSelectedEvents}
          onCancel={() => { eventClaimingRef.current = false }}
          message={eventMessage}
          text={{
            claim: t('autoClaim.action.claim'),
            claiming: t('autoClaim.action.claiming'),
            cancel: t('autoClaim.action.cancel'),
            refresh: t('autoClaim.action.refresh'),
            refreshing: t('autoClaim.action.refreshing'),
            itemColumn: t('autoClaim.table.claimableItems'),
            empty: t('autoClaim.empty'),
          }}
        />
      </SettingGroup>

      <SettingGroup title={t('autoClaim.section.missions.title')}>
        <ClaimSection
          title=""
          hint={t('autoClaim.section.missions.hint')}
          kind="missions"
          rows={missions}
          selectedIds={selectedMissions}
          loading={loadingMissions}
          claiming={claimingMissions}
          onToggle={toggleMission}
          onToggleAll={() => setSelectedMissions(selectedMissions.size === missions.length ? new Set() : new Set(missions.map((item) => item.id)))}
          onRefresh={refreshMissions}
          onClaim={claimSelectedMissions}
          onCancel={() => { missionClaimingRef.current = false }}
          message={missionMessage}
          text={{
            claim: t('autoClaim.action.claim'),
            claiming: t('autoClaim.action.claiming'),
            cancel: t('autoClaim.action.cancel'),
            refresh: t('autoClaim.action.refresh'),
            refreshing: t('autoClaim.action.refreshing'),
            itemColumn: t('autoClaim.table.claimableItems'),
            empty: t('autoClaim.empty'),
          }}
        />
      </SettingGroup>

      <SettingGroup title={t('autoClaim.section.rewards.title')}>
        <ClaimSection
          title=""
          hint={t('autoClaim.section.rewards.hint')}
          kind="rewards"
          rows={rewards}
          selectedIds={selectedRewards}
          loading={loadingRewards}
          claiming={claimingRewards}
          onToggle={toggleReward}
          onToggleAll={() => setSelectedRewards(selectedRewards.size === rewards.length ? new Set() : new Set(rewards.map((item) => item.info.id)))}
          onRefresh={refreshRewards}
          onClaim={claimSelectedRewards}
          onCancel={() => { rewardClaimingRef.current = false }}
          message={rewardMessage}
          text={{
            claim: t('autoClaim.action.claim'),
            claiming: t('autoClaim.action.claiming'),
            cancel: t('autoClaim.action.cancel'),
            refresh: t('autoClaim.action.refresh'),
            refreshing: t('autoClaim.action.refreshing'),
            itemColumn: t('autoClaim.table.claimableItems'),
            empty: t('autoClaim.empty'),
          }}
        />
      </SettingGroup>
    </div>
  )
}
