import { useEffect, useMemo, useRef, useState } from 'react'
import { SonaButton } from '@/components/ui/SonaButton'
import { SonaCheckbox } from '@/components/ui/SonaCheckbox'
import {
  claimMissions,
  claimRewardGrants,
  getClaimableMissions,
  getClaimableRewardGrants,
  type ClaimableMission,
  type ClaimableRewardGrant,
} from '@/lib/features/auto-claim'
import { lcu, LcuEventUri } from '@/lib/lcu'
import '@/styles/AutoClaimPage.css'

type ClaimKind = 'rewards' | 'missions'

function itemKey(kind: ClaimKind, id: string) {
  return `${kind}:${id}`
}

function EmptyState() {
  return (
    <div className="sona-claim-empty">
      <div className="sona-claim-empty-icon">
        <span />
      </div>
      <div>无数据</div>
    </div>
  )
}

function RewardPreview({ items }: { items: Array<{ id: string; name: string; iconUrl: string }> }) {
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

interface ClaimSectionProps<T extends { sonaTitle: string; sonaItems: Array<{ id: string; name: string; iconUrl: string }> }> {
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
}

function ClaimSection<T extends { id?: string; info?: { id?: string }; sonaTitle: string; sonaItems: Array<{ id: string; name: string; iconUrl: string }> }>({
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
}: ClaimSectionProps<T>) {
  const allChecked = rows.length > 0 && rows.every((row) => selectedIds.has(row.info?.id ?? row.id ?? ''))

  return (
    <section className="sona-claim-section">
      <div className="sona-claim-section-header">
        <h2>{title}</h2>
        {hint && <p>{hint}</p>}
        <div className="sona-claim-actions">
          <SonaButton onClick={onClaim} disabled={claiming || loading || selectedIds.size === 0}>
            {claiming ? '领取中' : '领取'}
          </SonaButton>
          {claiming && onCancel && (
            <SonaButton variant="secondary" onClick={onCancel}>
              取消
            </SonaButton>
          )}
          <SonaButton variant="secondary" onClick={onRefresh} disabled={loading || claiming}>
            {loading ? '刷新中' : '刷新'}
          </SonaButton>
        </div>
      </div>

      <div className="sona-claim-table">
        <div className="sona-claim-table-head">
          <SonaCheckbox checked={allChecked} onChange={onToggleAll} disabled={rows.length === 0 || loading || claiming} />
          <span>可领取物品</span>
        </div>

        <div className="sona-claim-table-body">
          {rows.length === 0 ? (
            <EmptyState />
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
                  <RewardPreview items={row.sonaItems} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export function AutoClaimPage() {
  const [rewards, setRewards] = useState<ClaimableRewardGrant[]>([])
  const [missions, setMissions] = useState<ClaimableMission[]>([])
  const [selectedRewards, setSelectedRewards] = useState<Set<string>>(new Set())
  const [selectedMissions, setSelectedMissions] = useState<Set<string>>(new Set())
  const [loadingRewards, setLoadingRewards] = useState(false)
  const [loadingMissions, setLoadingMissions] = useState(false)
  const [claimingRewards, setClaimingRewards] = useState(false)
  const [claimingMissions, setClaimingMissions] = useState(false)
  const [message, setMessage] = useState('')
  const rewardClaimingRef = useRef(false)
  const missionClaimingRef = useRef(false)
  const rewardLoadingRef = useRef(false)
  const missionLoadingRef = useRef(false)

  const selectedRewardRows = useMemo(
    () => rewards.filter((reward) => selectedRewards.has(reward.info.id)),
    [rewards, selectedRewards],
  )

  const selectedMissionRows = useMemo(
    () => missions.filter((mission) => selectedMissions.has(mission.id)),
    [missions, selectedMissions],
  )

  const refreshRewards = async () => {
    if (rewardLoadingRef.current) return
    rewardLoadingRef.current = true
    setLoadingRewards(true)
    try {
      const data = await getClaimableRewardGrants()
      setRewards(data)
      setSelectedRewards((current) => new Set([...current].filter((id) => data.some((item) => item.info.id === id))))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
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
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      missionLoadingRef.current = false
      setLoadingMissions(false)
    }
  }

  useEffect(() => {
    void refreshRewards()
    void refreshMissions()

    const unsubs = [
      lcu.observe(LcuEventUri.REWARDS_GRANTS, () => void refreshRewards()),
      lcu.observe(LcuEventUri.MISSIONS, () => void refreshMissions()),
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

  const claimSelectedRewards = async () => {
    rewardClaimingRef.current = true
    setClaimingRewards(true)
    try {
      const result = await claimRewardGrants(selectedRewardRows, { shouldContinue: () => rewardClaimingRef.current })
      setMessage(result.errors.length ? result.errors.join('\n') : `已领取 ${result.count} 个奖励`)
      setSelectedRewards(new Set())
      await refreshRewards()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
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
      setMessage(result.errors.length ? result.errors.join('\n') : `已领取 ${result.count} 个任务奖励`)
      setSelectedMissions(new Set())
      await refreshMissions()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      missionClaimingRef.current = false
      setClaimingMissions(false)
    }
  }

  return (
    <div className="sona-claim-page">
      <div className="sona-claim-backdrop" />
      <ClaimSection
        title="奖励"
        hint="找回一些遗忘的东西。"
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
      />

      <ClaimSection
        title="任务"
        hint="提前完成任务可能会导致数据不同步，使用时请斟酌可能的风险。"
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
      />

      {message && <pre className="sona-claim-message">{message}</pre>}
    </div>
  )
}
