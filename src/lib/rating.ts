import { translate } from '@/i18n'

/**
 * 根据胜率和 KDA 给出 LOL 风格幽默评价
 */
export function getRating(winRate: number, kda: number): string {
  if (winRate >= 75 && kda >= 4.5) return translate('champSelect.rating.godlike')
  if (winRate >= 70) return translate('champSelect.rating.smurf')
  if (winRate >= 65) return translate('champSelect.rating.hardCarry')
  if (winRate >= 60) return translate('champSelect.rating.specialist')
  if (winRate >= 56) return translate('champSelect.rating.steady')
  if (winRate >= 52) return translate('champSelect.rating.helper')
  if (winRate >= 48) return translate('champSelect.rating.swing')
  if (winRate >= 45) return translate('champSelect.rating.holding')
  if (winRate >= 41) return translate('champSelect.rating.autofill')
  if (winRate >= 37) return translate('champSelect.rating.losing')
  if (winRate >= 33) return translate('champSelect.rating.breakpoint')
  if (winRate >= 28) return translate('champSelect.rating.atm')
  if (winRate >= 20) return translate('champSelect.rating.surrender')
  return translate('champSelect.rating.actor')
}
