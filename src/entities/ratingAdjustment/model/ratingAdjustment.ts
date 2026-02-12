export type RatingAdjustment = {
  id: string
  executorId: string
  deltaPercent: number // e.g. -5
  reason: 'no_start_12h' | 'no_submit_24h'
  violationId: string
  createdAt: string // ISO datetime
}

