import type { Rating } from '@/entities/rating/model/rating'
import type { RatingAdjustment } from '@/entities/ratingAdjustment/model/ratingAdjustment'

export type RatingSummary = {
  avg: number
  count: number
}

export function getRatingSummaryForUser(ratings: Rating[], userId: string | null | undefined): RatingSummary | null {
  if (!userId) return null
  const list = ratings.filter((r) => r.toUserId === userId)
  if (!list.length) return null
  const sum = list.reduce((s, r) => s + r.rating, 0)
  const avg = sum / list.length
  return { avg, count: list.length }
}

export function getEffectiveRatingSummaryForUser(
  ratings: Rating[],
  adjustments: RatingAdjustment[],
  userId: string | null | undefined,
): RatingSummary | null {
  const base = getRatingSummaryForUser(ratings, userId)
  if (!base || !userId) return base

  const deltaPercent = adjustments
    .filter((a) => a.executorId === userId)
    .reduce((sum, a) => sum + a.deltaPercent, 0)

  const multiplier = 1 + deltaPercent / 100
  const effectiveAvg = Math.max(0, Math.min(5, base.avg * multiplier))
  return { avg: effectiveAvg, count: base.count }
}

