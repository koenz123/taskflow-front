export type TaskAssignmentStatus =
  | 'pending_start'
  | 'in_progress'
  | 'pause_requested'
  | 'paused'
  | 'overdue'
  | 'submitted'
  | 'accepted'
  | 'removed_auto'
  | 'cancelled_by_customer'
  | 'dispute_opened'

export type PauseReasonId = 'illness' | 'family' | 'force_majeure'

export type TaskAssignment = {
  id: string
  taskId: string
  executorId: string

  assignedAt: string // ISO datetime
  startDeadlineAt: string // ISO datetime (assignedAt + 12h)
  startedAt?: string // ISO datetime

  // Base execution deadline = startedAt + 24h. `executionDeadlineAt` may be extended by pauses / system events.
  executionBaseDeadlineAt?: string // ISO datetime
  executionExtensionMs?: number
  executionDeadlineAt?: string // ISO datetime (startedAt + 24h)

  submittedAt?: string // ISO datetime
  acceptedAt?: string // ISO datetime

  // Pause flow (one pause per assignment).
  pauseUsed?: boolean
  pauseRequestedAt?: string // ISO datetime
  pauseAutoAcceptAt?: string // ISO datetime (pauseRequestedAt + 12h)
  pauseReasonId?: PauseReasonId
  pauseComment?: string
  pauseRequestedDurationMs?: number
  pauseDecision?: 'accepted' | 'rejected'
  pauseDecidedAt?: string // ISO datetime
  pausedAt?: string // ISO datetime
  pausedUntil?: string // ISO datetime (pausedAt + pauseRequestedDurationMs)

  // System events
  forceMajeureAppliedEventIds?: string[]

  overdueAt?: string // ISO datetime
  autoDisputeAt?: string // ISO datetime (overdueAt + 1d)

  status: TaskAssignmentStatus
}

