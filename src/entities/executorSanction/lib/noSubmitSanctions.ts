import { executorRestrictionRepo } from './executorRestrictionRepo'
import { executorViolationRepo } from './executorViolationRepo'

function addMs(iso: string, msToAdd: number) {
  const base = Date.parse(iso)
  const safeBase = Number.isFinite(base) ? base : Date.now()
  return new Date(safeBase + msToAdd).toISOString()
}

const HOUR_MS = 60 * 60 * 1000

export type NoSubmitSanction =
  | { kind: 'warning'; n: 1 }
  | { kind: 'respond_block'; n: 2 | 3 | 4; until: string; durationHours: 24 | 48 | 72 }
  | { kind: 'ban'; n: number }

export function applyNoSubmit24hSanctions(input: {
  executorId: string
  taskId: string
  assignmentId: string
  occurredAt?: string
}): { violationId: string; sanction: NoSubmitSanction } {
  const violation = executorViolationRepo.addNoSubmit24h({
    executorId: input.executorId,
    taskId: input.taskId,
    assignmentId: input.assignmentId,
    createdAt: input.occurredAt,
  })

  const occurredAtMs = Date.parse(violation.createdAt)
  const n = executorViolationRepo.levelForExecutor(
    input.executorId,
    'no_submit_24h',
    Number.isFinite(occurredAtMs) ? occurredAtMs : Date.now(),
  )

  if (n <= 1) {
    return { violationId: violation.id, sanction: { kind: 'warning', n: 1 } }
  }

  if (n === 2) {
    const until = addMs(new Date().toISOString(), 24 * HOUR_MS)
    executorRestrictionRepo.setRespondBlockedUntil(input.executorId, until)
    return { violationId: violation.id, sanction: { kind: 'respond_block', n: 2, until, durationHours: 24 } }
  }

  if (n === 3) {
    const until = addMs(new Date().toISOString(), 48 * HOUR_MS)
    executorRestrictionRepo.setRespondBlockedUntil(input.executorId, until)
    return { violationId: violation.id, sanction: { kind: 'respond_block', n: 3, until, durationHours: 48 } }
  }

  if (n === 4) {
    const until = addMs(new Date().toISOString(), 72 * HOUR_MS)
    executorRestrictionRepo.setRespondBlockedUntil(input.executorId, until)
    return { violationId: violation.id, sanction: { kind: 'respond_block', n: 4, until, durationHours: 72 } }
  }

  executorRestrictionRepo.ban(input.executorId)
  return { violationId: violation.id, sanction: { kind: 'ban', n } }
}

export function noSubmitViolationCountLast90d(executorId: string, nowMs: number = Date.now()) {
  // Kept for backward compatibility. This now returns current "points" (with 90-day decay).
  return executorViolationRepo.levelForExecutor(executorId, 'no_submit_24h', nowMs)
}

