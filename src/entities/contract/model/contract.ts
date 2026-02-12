export type ContractStatus =
  | 'active'
  | 'submitted'
  | 'revision_requested'
  | 'approved'
  | 'disputed'
  | 'resolved'
  | 'cancelled'

export type Contract = {
  id: string
  taskId: string
  clientId: string
  executorId: string
  escrowAmount: number
  status: ContractStatus

  revisionIncluded?: number
  revisionUsed?: number

  lastSubmissionId?: string
  lastRevisionMessage?: string
  lastRevisionRequestedAt?: string // ISO datetime

  createdAt: string // ISO datetime
  updatedAt: string // ISO datetime
}

