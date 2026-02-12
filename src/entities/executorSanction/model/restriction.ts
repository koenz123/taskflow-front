export type AccountStatus = 'active' | 'banned'

export type ExecutorRestriction = {
  executorId: string
  respondBlockedUntil?: string // ISO datetime
  accountStatus: AccountStatus
  updatedAt: string // ISO datetime
}

