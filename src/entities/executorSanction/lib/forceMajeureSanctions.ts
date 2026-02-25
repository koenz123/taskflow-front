import { taskAssignmentRepo } from '@/entities/taskAssignment/lib/taskAssignmentRepo'
import { executorRestrictionRepo } from './executorRestrictionRepo'
import { executorViolationRepo } from './executorViolationRepo'
import { notificationRepo } from '@/entities/notification/lib/notificationRepo'

const HOUR_MS = 60 * 60 * 1000
const WEEK_MS = 7 * 24 * HOUR_MS

function addMs(iso: string, msToAdd: number) {
  const base = Date.parse(iso)
  const safeBase = Number.isFinite(base) ? base : Date.now()
  return new Date(safeBase + msToAdd).toISOString()
}

export type ForceMajeureSanction =
  | { kind: 'warning'; n: 1 }
  | { kind: 'respond_block'; n: 2 | 3 | 4; until: string; durationHours: 24 | 48 | 72 }
  | { kind: 'ban'; n: number }

function applySanctionLadder(
  executorId: string,
  taskId: string,
  violationId: string,
  n: number,
): void {
  if (n <= 1) {
    notificationRepo.addExecutorViolationWarning({
      recipientUserId: executorId,
      taskId,
      violationId,
      violationType: 'force_majeure_abuse',
    })
    return
  }
  if (n === 2) {
    const until = addMs(new Date().toISOString(), 24 * HOUR_MS)
    executorRestrictionRepo.setRespondBlockedUntil(executorId, until)
    notificationRepo.addExecutorViolationRespondBlock({
      recipientUserId: executorId,
      taskId,
      violationId,
      violationType: 'force_majeure_abuse',
      until,
      durationHours: 24,
    })
    return
  }
  if (n === 3) {
    const until = addMs(new Date().toISOString(), 48 * HOUR_MS)
    executorRestrictionRepo.setRespondBlockedUntil(executorId, until)
    notificationRepo.addExecutorViolationRespondBlock({
      recipientUserId: executorId,
      taskId,
      violationId,
      violationType: 'force_majeure_abuse',
      until,
      durationHours: 48,
    })
    return
  }
  if (n === 4) {
    const until = addMs(new Date().toISOString(), 72 * HOUR_MS)
    executorRestrictionRepo.setRespondBlockedUntil(executorId, until)
    notificationRepo.addExecutorViolationRespondBlock({
      recipientUserId: executorId,
      taskId,
      violationId,
      violationType: 'force_majeure_abuse',
      until,
      durationHours: 72,
    })
    return
  }
  executorRestrictionRepo.ban(executorId)
  notificationRepo.addExecutorViolationBan({
    recipientUserId: executorId,
    taskId,
    violationId,
    violationType: 'force_majeure_abuse',
  })
}

/**
 * Call after executor requests pause with reason force_majeure.
 * If they have 3, 6, 9… such requests in the last 7 days, adds one violation point
 * and applies the sanction ladder (1=warning, 2=24h block, 3=48h, 4=72h, 5=permanent ban).
 * Points 1–4 decay every 90 days.
 */
export function checkAndApplyForceMajeureSanctions(
  executorId: string,
  taskId: string,
  assignmentId: string,
): void {
  const nowMs = Date.now()
  const sinceMs = nowMs - WEEK_MS

  const all = taskAssignmentRepo.listAll()
  const withForceMajeure = all.filter((a) => {
    if (a.executorId !== executorId) return false
    if (a.pauseReasonId !== 'force_majeure') return false
    const at = a.pauseRequestedAt
    if (!at) return false
    const ts = Date.parse(at)
    return Number.isFinite(ts) && ts >= sinceMs
  })
  const sorted = withForceMajeure.slice().sort((a, b) => (a.pauseRequestedAt ?? '').localeCompare(b.pauseRequestedAt ?? ''))
  const count = sorted.length

  if (count < 3 || count % 3 !== 0) return
  const lastInBatch = sorted[count - 1]
  if (lastInBatch.id !== assignmentId) return

  if (executorViolationRepo.getForAssignment(assignmentId, 'force_majeure_abuse')) return

  const violation = executorViolationRepo.addForceMajeureAbuse({
    executorId,
    taskId,
    assignmentId,
    createdAt: lastInBatch.pauseRequestedAt,
  })
  const occurredAtMs = Date.parse(violation.createdAt)
  const n = executorViolationRepo.levelForExecutor(
    executorId,
    'force_majeure_abuse',
    Number.isFinite(occurredAtMs) ? occurredAtMs : Date.now(),
  )
  applySanctionLadder(executorId, taskId, violation.id, n)
}

export function forceMajeureViolationLevel(executorId: string, nowMs: number = Date.now()) {
  return executorViolationRepo.levelForExecutor(executorId, 'force_majeure_abuse', nowMs)
}
