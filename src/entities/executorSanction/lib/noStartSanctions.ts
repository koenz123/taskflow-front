import { executorRestrictionRepo } from './executorRestrictionRepo'
import { executorViolationRepo } from './executorViolationRepo'
import { ratingAdjustmentRepo } from '@/entities/ratingAdjustment/lib/ratingAdjustmentRepo'

function addMs(iso: string, msToAdd: number) {
  const base = Date.parse(iso)
  const safeBase = Number.isFinite(base) ? base : Date.now()
  return new Date(safeBase + msToAdd).toISOString()
}

export type NoStartSanction =
  | { kind: 'warning'; n: 1 }
  | { kind: 'rating_penalty'; n: 2; deltaPercent: -5 }
  | { kind: 'respond_block'; n: 3 | 4; until: string; durationHours: 24 | 72 }
  | { kind: 'ban'; n: number }

export function applyNoStart12hSanctions(input: {
  executorId: string
  taskId: string
  assignmentId: string
  occurredAt?: string
}): { violationId: string; sanction: NoStartSanction } {
  const violation = executorViolationRepo.addNoStart12h({
    executorId: input.executorId,
    taskId: input.taskId,
    assignmentId: input.assignmentId,
    createdAt: input.occurredAt,
  })

  const occurredAtMs = Date.parse(violation.createdAt)
  const n = executorViolationRepo.levelForExecutor(
    input.executorId,
    'no_start_12h',
    Number.isFinite(occurredAtMs) ? occurredAtMs : Date.now(),
  )

  if (n <= 1) {
    return { violationId: violation.id, sanction: { kind: 'warning', n: 1 } }
  }

  if (n === 2) {
    ratingAdjustmentRepo.addNoStartPenalty5(violation.id, input.executorId)
    return { violationId: violation.id, sanction: { kind: 'rating_penalty', n: 2, deltaPercent: -5 } }
  }

  if (n === 3) {
    const until = addMs(new Date().toISOString(), 24 * 60 * 60 * 1000)
    executorRestrictionRepo.setRespondBlockedUntil(input.executorId, until)
    return { violationId: violation.id, sanction: { kind: 'respond_block', n: 3, until, durationHours: 24 } }
  }

  if (n === 4) {
    const until = addMs(new Date().toISOString(), 72 * 60 * 60 * 1000)
    executorRestrictionRepo.setRespondBlockedUntil(input.executorId, until)
    return { violationId: violation.id, sanction: { kind: 'respond_block', n: 4, until, durationHours: 72 } }
  }

  executorRestrictionRepo.ban(input.executorId)
  return { violationId: violation.id, sanction: { kind: 'ban', n } }
}

export function noStartViolationCountLast90d(executorId: string, nowMs: number = Date.now()) {
  // Kept for backward compatibility with existing UI prompts.
  // This now returns the current "points" for this violation type (with 90-day decay).
  return executorViolationRepo.levelForExecutor(executorId, 'no_start_12h', nowMs)
}

