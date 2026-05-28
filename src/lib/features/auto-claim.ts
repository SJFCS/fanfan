import { logger } from '@/index'
import { translate, type TranslationKey } from '@/i18n'
import { lcu, type EventHubEvent, type EventHubRewardOption, type EventHubRewardTrackItem, type Mission, type RewardGrant, type RewardGroupResponse, type RewardItem } from '@/lib/lcu'

const TARGET_REWARD_GRANT_STATUS = 'PENDING_SELECTION'
const TARGET_MISSION_STATUS = 'SELECT_REWARDS'
const TARGET_EVENT_REWARD_STATE = 'Unselected'
const EVENT_HUB_REFRESH_DELAY_MS = 2000

interface ClaimOptions {
  shouldContinue?: () => boolean
}

export interface ClaimableRewardItem {
  id: string
  name: string
  iconUrl: string
}

export interface ClaimableLocalizedText {
  key: TranslationKey
  params?: Record<string, string | number>
}

export interface ClaimableRewardGroup {
  id: string
  title: string
  titleI18n?: ClaimableLocalizedText
  items: ClaimableRewardItem[]
}

export interface ClaimableRewardGrant extends RewardGrant {
  sonaTitle: string
  sonaTitleI18n?: ClaimableLocalizedText
  sonaItems: ClaimableRewardItem[]
}

export interface ClaimableMission extends Mission {
  sonaTitle: string
  sonaTitleI18n?: ClaimableLocalizedText
  sonaItems: ClaimableRewardItem[]
}

export interface ClaimableEventHubEvent extends EventHubEvent {
  id: string
  sonaTitle: string
  sonaItems: ClaimableRewardItem[]
  sonaGroups: ClaimableRewardGroup[]
}

function chooseRandom<T>(items: T[], count: number): T[] {
  const targetCount = Math.min(items.length, Math.max(1, count))
  const pool = [...items]
  const chosen: T[] = []

  while (chosen.length < targetCount && pool.length > 0) {
    const index = Math.floor(Math.random() * pool.length)
    const [item] = pool.splice(index, 1)
    chosen.push(item)
  }

  return chosen
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function rewardGroupTitle(title: string | undefined, count: number, fallback: string): { title: string; titleI18n?: ClaimableLocalizedText } {
  if (title?.includes('DO NOT TRANSLATE')) {
    return {
      title: translate('autoClaim.rewardGroup.unnamed', { count }),
      titleI18n: { key: 'autoClaim.rewardGroup.unnamed', params: { count } },
    }
  }

  return { title: title || fallback }
}

function claimableTitle(title: string, titleI18n?: ClaimableLocalizedText): string {
  return titleI18n ? translate(titleI18n.key, titleI18n.params) : title
}

function normalizeRewardItem(reward: RewardItem): ClaimableRewardItem {
  return {
    id: reward.id,
    name: reward.localizations?.title || reward.itemId || reward.id,
    iconUrl: reward.media?.iconUrl || '',
  }
}

function normalizeRewardGrant(grant: RewardGrant): ClaimableRewardGrant {
  const rewards = grant.rewardGroup?.rewards ?? []
  const rewardGroup = rewardGroupTitle(grant.rewardGroup?.localizations?.title, rewards.length, grant.info.id)

  return {
    ...grant,
    sonaTitle: rewardGroup.title,
    sonaTitleI18n: rewardGroup.titleI18n,
    sonaItems: rewards.map(normalizeRewardItem),
  }
}

function normalizeMission(mission: Mission): ClaimableMission {
  const rewards = mission.rewards ?? []
  const rewardGroup = rewardGroupTitle(mission.internalName, rewards.length, mission.id)

  return {
    ...mission,
    sonaTitle: rewardGroup.title,
    sonaTitleI18n: rewardGroup.titleI18n,
    sonaItems: rewards.map((reward) => ({
      id: reward.rewardGroup,
      name: reward.description || reward.rewardGroup,
      iconUrl: reward.iconUrl || '',
    })),
  }
}

function rewardOptionsFromTrackItems(items: EventHubRewardTrackItem[]) {
  return items
    .flatMap((item) => item.rewardOptions ?? [])
    .filter((reward) => reward.state === TARGET_EVENT_REWARD_STATE)
}

let rewardGroupsCache: RewardGroupResponse[] | null = null

async function getRewardGroupsByIds(ids: string[]) {
  const idSet = new Set(ids)
  if (idSet.size === 0) return new Map<string, RewardGroupResponse>()

  if (!rewardGroupsCache) {
    rewardGroupsCache = await lcu.getRewardGroups()
  }

  return new Map(rewardGroupsCache.filter((group) => idSet.has(group.id)).map((group) => [group.id, group]))
}

function fallbackEventRewardGroup(option: EventHubRewardOption): ClaimableRewardGroup {
  return {
    id: option.rewardGroupId,
    title: option.rewardName || option.rewardDescription || option.rewardGroupId,
    items: [{
      id: option.rewardGroupId,
      name: option.rewardName || option.rewardDescription || option.rewardGroupId,
      iconUrl: option.thumbIconPath || '',
    }],
  }
}

async function normalizeEventHubEvent(event: EventHubEvent): Promise<ClaimableEventHubEvent> {
  const [trackItems, bonusItems] = await Promise.all([
    lcu.getEventHubRewardTrackItems(event.eventId).catch(() => []),
    lcu.getEventHubRewardTrackBonusItems(event.eventId).catch(() => []),
  ])
  const rewardOptions = rewardOptionsFromTrackItems([...trackItems, ...bonusItems])
  const rewardGroups = await getRewardGroupsByIds(rewardOptions.map((reward) => reward.rewardGroupId)).catch(() => new Map<string, RewardGroupResponse>())

  const sonaGroups = rewardOptions.map((option) => {
    const group = rewardGroups.get(option.rewardGroupId)
    if (!group) return fallbackEventRewardGroup(option)

    const items = group.rewards.map(normalizeRewardItem)
    const rewardGroup = rewardGroupTitle(group.localizations?.title, items.length, option.rewardGroupId)
    return {
      id: option.rewardGroupId,
      title: option.rewardName || rewardGroup.title,
      titleI18n: rewardGroup.titleI18n,
      items: items.length ? items : fallbackEventRewardGroup(option).items,
    }
  })

  return {
    ...event,
    id: event.eventId,
    sonaTitle: event.eventInfo?.eventName || event.eventId,
    sonaItems: sonaGroups.flatMap((group) => group.items),
    sonaGroups,
  }
}

export async function getClaimableRewardGrants(): Promise<ClaimableRewardGrant[]> {
  const grants = await lcu.getRewardGrants(TARGET_REWARD_GRANT_STATUS)
  return grants
    .filter((grant) => grant.info.status === TARGET_REWARD_GRANT_STATUS)
    .map(normalizeRewardGrant)
}

export async function getClaimableMissions(): Promise<ClaimableMission[]> {
  const missions = await lcu.getMissions()
  return missions
    .filter((mission) => mission.status === TARGET_MISSION_STATUS)
    .map(normalizeMission)
}

export async function getClaimableEventHubEvents(): Promise<ClaimableEventHubEvent[]> {
  const events = await lcu.getEventHubEvents()
  const claimableEvents = events.filter((event) => event.eventInfo?.unclaimedRewardCount)
  return Promise.all(claimableEvents.map(normalizeEventHubEvent))
}

export async function claimRewardGrants(grants: ClaimableRewardGrant[], options: ClaimOptions = {}): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = []
  let count = 0

  for (const grant of grants) {
    if (options.shouldContinue && !options.shouldContinue()) break

    const rewards = grant.rewardGroup?.rewards ?? []
    if (!grant.info?.id || !grant.rewardGroup?.id || rewards.length === 0) continue

    const maxSelections = grant.rewardGroup.selectionStrategyConfig?.maxSelectionsAllowed ?? 1
    const chosen = chooseRandom(rewards, maxSelections)

    try {
      await lcu.selectRewardGrant(grant.info.id, {
        grantId: grant.info.id,
        rewardGroupId: grant.rewardGroup.id,
        selections: chosen.map((reward) => reward.id),
      })
      count += 1
      logger.info('[Claim] Claimed reward grant: %s', claimableTitle(grant.sonaTitle, grant.sonaTitleI18n))
    } catch (error) {
      errors.push(`${claimableTitle(grant.sonaTitle, grant.sonaTitleI18n)}: ${errorMessage(error)}`)
    }
  }

  return { count, errors }
}

export async function claimEventHubRewards(events: ClaimableEventHubEvent[], options: ClaimOptions = {}): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = []
  let count = 0

  for (const event of events) {
    if (options.shouldContinue && !options.shouldContinue()) break
    if (!event.eventId) continue

    try {
      await lcu.claimAllEventHubRewards(event.eventId)
      count += 1
      logger.info('[Claim] Claimed event hub rewards: %s', claimableTitle(event.sonaTitle, undefined))
    } catch (error) {
      errors.push(`${claimableTitle(event.sonaTitle, undefined)}: ${errorMessage(error)}`)
    }
  }

  if (count > 0) {
    await sleep(EVENT_HUB_REFRESH_DELAY_MS)
  }

  return { count, errors }
}

export async function claimMissions(missions: ClaimableMission[], options: ClaimOptions = {}): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = []
  let count = 0

  for (const mission of missions) {
    if (options.shouldContinue && !options.shouldContinue()) break

    const rewards = mission.rewards ?? []
    if (!mission.id || rewards.length === 0) continue

    const maxSelections = mission.rewardStrategy?.selectMaxGroupCount ?? 1
    const chosen = chooseRandom(rewards, maxSelections).map((reward) => reward.rewardGroup).filter(Boolean)
    if (chosen.length === 0) continue

    try {
      await lcu.selectMissionRewardGroups(mission.id, chosen)
      count += 1
      logger.info('[Claim] Claimed mission rewards: %s', claimableTitle(mission.sonaTitle, mission.sonaTitleI18n))
    } catch (error) {
      errors.push(`${claimableTitle(mission.sonaTitle, mission.sonaTitleI18n)}: ${errorMessage(error)}`)
    }
  }

  return { count, errors }
}
