export type DisputeStatus = 'open' | 'in_review' | 'need_more_info' | 'decided' | 'closed'

export type DisputeReason = {
  categoryId: string
  reasonId: string
  detail?: string
}

export type DisputeDecision =
  | { payout: 'executor' }
  | { payout: 'customer' }
  | { payout: 'split'; executorAmount: number; customerAmount: number }
  | { payout: 'partial'; executorAmount: number; customerAmount: number; note?: string }

export type Dispute = {
  id: string
  contractId: string
  openedByUserId: string
  reason: DisputeReason
  status: DisputeStatus
  /**
   * Which arbiter is currently handling the dispute (if any).
   * In this app it's dev-only for now.
   */
  assignedArbiterId?: string
  /**
   * SLA deadline (ISO). Inbox uses it for nearing-SLA indicators.
   */
  slaDueAt?: string
  decision?: DisputeDecision
  /**
   * When decision is confirmed and becomes immutable.
   */
  lockedDecisionAt?: string
  /**
   * Optimistic locking version. Incremented on every state transition.
   */
  version?: number
  createdAt: string // ISO datetime
  updatedAt: string // ISO datetime
}

