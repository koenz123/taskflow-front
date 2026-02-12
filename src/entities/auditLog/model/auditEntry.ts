export type AuditActionType =
  | 'dispute_opened'
  | 'take_in_work'
  | 'resume_review'
  | 'request_more_info'
  | 'internal_comment'
  | 'public_message'
  | 'system_message'
  | 'decision_confirmed'
  | 'dispute_closed'

export type AuditEntry = {
  id: string
  disputeId: string
  actionType: AuditActionType
  actorUserId: string
  summary: string
  payload?: Record<string, unknown>
  createdAt: string // ISO datetime
  versionBefore?: number
  versionAfter?: number
}

