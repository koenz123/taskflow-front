export type NotificationType =
  | 'task_application'
  | 'task_application_cancelled'
  | 'task_taken'
  | 'task_assigned'
  | 'task_assigned_else'
  | 'task_submitted'
  | 'task_approved'
  | 'task_revision'
  | 'task_pause_requested'
  | 'task_pause_accepted'
  | 'task_pause_rejected'
  | 'task_completed'
  | 'task_unclaimed'
  | 'task_executor_no_start'
  | 'task_executor_overdue'
  | 'dispute_opened'
  | 'dispute_message'
  | 'dispute_status'
  | 'dispute_sla_threshold'
  | 'rate_customer'
  | 'executor_violation_warning'
  | 'executor_violation_rating_penalty'
  | 'executor_violation_respond_block'
  | 'executor_violation_ban'

export type ViolationType = 'no_start_12h' | 'no_submit_24h'

export type Notification = {
  id: string
  type: NotificationType

  recipientUserId: string
  actorUserId: string
  taskId: string
  disputeId?: string
  disputeStatus?: string
  /**
   * For SLA threshold notifications (e.g. 12/6/3/2/1 hours left).
   * Stored as the threshold value (hours).
   */
  slaHoursLeft?: number
  completionVideoUrl?: string
  message?: string
  violationId?: string
  violationType?: ViolationType
  sanctionDeltaPercent?: number
  sanctionUntil?: string
  sanctionDurationHours?: number

  createdAt: string // ISO datetime
  readAt?: string // ISO datetime
}

