import { logger } from '@/index'
import { lcu, type Mission, type RewardGrant } from '@/lib/lcu'

const TARGET_REWARD_GRANT_STATUS = 'PENDING_SELECTION'
const TARGET_MISSION_STATUS = 'SELECT_REWARDS'

interface ClaimOptions {
  shouldContinue?: () => boolean
}

export interface ClaimableRewardGrant extends RewardGrant {
  sonaTitle: string
  sonaItems: Array<{
    id: string
    name: string
    iconUrl: string
  }>
}

export interface ClaimableMission extends Mission {
  sonaTitle: string
  sonaItems: Array<{
    id: string
    name: string
    iconUrl: string
  }>
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function rewardGroupTitle(title: string | undefined, count: number, fallback: string): string {
  if (title?.includes('DO NOT TRANSLATE')) {
    return `未命名奖励组（${count}）`
  }

  return title || fallback
}

function normalizeRewardGrant(grant: RewardGrant): ClaimableRewardGrant {
  const rewards = grant.rewardGroup?.rewards ?? []

  return {
    ...grant,
    sonaTitle: rewardGroupTitle(grant.rewardGroup?.localizations?.title, rewards.length, grant.info.id),
    sonaItems: rewards.map((reward) => ({
      id: reward.id,
      name: reward.localizations?.title || reward.itemId || reward.id,
      iconUrl: reward.media?.iconUrl || '',
    })),
  }
}

function normalizeMission(mission: Mission): ClaimableMission {
  const rewards = mission.rewards ?? []

  return {
    ...mission,
    sonaTitle: rewardGroupTitle(mission.internalName, rewards.length, mission.id),
    sonaItems: rewards.map((reward) => ({
      id: reward.rewardGroup,
      name: reward.description || reward.rewardGroup,
      iconUrl: reward.iconUrl || '',
    })),
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
      logger.info('[Claim] Claimed reward grant: %s', grant.sonaTitle)
    } catch (error) {
      errors.push(`${grant.sonaTitle}: ${errorMessage(error)}`)
    }
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
      logger.info('[Claim] Claimed mission rewards: %s', mission.sonaTitle)
    } catch (error) {
      errors.push(`${mission.sonaTitle}: ${errorMessage(error)}`)
    }
  }

  return { count, errors }
}
