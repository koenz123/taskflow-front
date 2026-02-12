import { createId } from '@/shared/lib/id'
import type { TaskAssignment, TaskAssignmentStatus } from '../model/taskAssignment'

const STORAGE_KEY = 'ui-create-works.taskAssignments.v1'
const CHANGE_EVENT = 'ui-create-works.taskAssignments.change'

const START_WINDOW_MS = 12 * 60 * 60 * 1000
const EXECUTION_WINDOW_MS = 24 * 60 * 60 * 1000
const AUTO_DISPUTE_AFTER_OVERDUE_MS = 24 * 60 * 60 * 1000
const PAUSE_AUTO_ACCEPT_MS = 12 * 60 * 60 * 1000
const PAUSE_MAX_MS = 24 * 60 * 60 * 1000

function safeParse(json: string | null): TaskAssignment[] {
  if (!json) return []
  try {
    const data = JSON.parse(json) as unknown
    if (!Array.isArray(data)) return []
    return data as TaskAssignment[]
  } catch {
    return []
  }
}

function readAll(): TaskAssignment[] {
  return safeParse(localStorage.getItem(STORAGE_KEY))
}

function writeAll(items: TaskAssignment[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function nowIso() {
  return new Date().toISOString()
}

function addMs(iso: string, msToAdd: number) {
  const base = Date.parse(iso)
  const safeBase = Number.isFinite(base) ? base : Date.now()
  return new Date(safeBase + msToAdd).toISOString()
}

function normalizeStatus(value: unknown): TaskAssignmentStatus {
  if (
    value === 'pending_start' ||
    value === 'in_progress' ||
    value === 'pause_requested' ||
    value === 'paused' ||
    value === 'overdue' ||
    value === 'submitted' ||
    value === 'accepted' ||
    value === 'removed_auto' ||
    value === 'cancelled_by_customer' ||
    value === 'dispute_opened'
  ) {
    return value
  }
  return 'pending_start'
}

function normalizePauseReason(value: unknown) {
  if (value === 'illness' || value === 'family' || value === 'force_majeure') return value
  return undefined
}

function normalize(raw: unknown): TaskAssignment | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = typeof r.id === 'string' ? r.id : createId('assign')
  const taskId = typeof r.taskId === 'string' ? r.taskId : ''
  const executorId = typeof r.executorId === 'string' ? r.executorId : ''
  if (!taskId || !executorId) return null

  const assignedAt = typeof r.assignedAt === 'string' ? r.assignedAt : nowIso()
  const startDeadlineAt =
    typeof r.startDeadlineAt === 'string' && r.startDeadlineAt.trim()
      ? r.startDeadlineAt
      : addMs(assignedAt, START_WINDOW_MS)
  const status = normalizeStatus(r.status)

  const a: TaskAssignment = {
    id,
    taskId,
    executorId,
    assignedAt,
    startDeadlineAt,
    status,
  }

  const startedAt = typeof r.startedAt === 'string' && r.startedAt.trim() ? r.startedAt : undefined
  const executionBaseDeadlineAt =
    typeof r.executionBaseDeadlineAt === 'string' && r.executionBaseDeadlineAt.trim()
      ? r.executionBaseDeadlineAt
      : startedAt
        ? addMs(startedAt, EXECUTION_WINDOW_MS)
        : undefined
  const executionExtensionMs =
    typeof r.executionExtensionMs === 'number' && Number.isFinite(r.executionExtensionMs) && r.executionExtensionMs >= 0
      ? Math.floor(r.executionExtensionMs)
      : 0
  const executionDeadlineAt =
    typeof r.executionDeadlineAt === 'string' && r.executionDeadlineAt.trim()
      ? r.executionDeadlineAt
      : startedAt
        ? addMs(executionBaseDeadlineAt ?? startedAt, executionExtensionMs)
        : undefined
  const submittedAt = typeof r.submittedAt === 'string' && r.submittedAt.trim() ? r.submittedAt : undefined
  const acceptedAt = typeof r.acceptedAt === 'string' && r.acceptedAt.trim() ? r.acceptedAt : undefined
  const pauseUsed = Boolean(r.pauseUsed)
  const pauseRequestedAt =
    typeof r.pauseRequestedAt === 'string' && r.pauseRequestedAt.trim() ? r.pauseRequestedAt : undefined
  const pauseAutoAcceptAt =
    typeof r.pauseAutoAcceptAt === 'string' && r.pauseAutoAcceptAt.trim()
      ? r.pauseAutoAcceptAt
      : pauseRequestedAt
        ? addMs(pauseRequestedAt, PAUSE_AUTO_ACCEPT_MS)
        : undefined
  const pauseReasonId = normalizePauseReason(r.pauseReasonId)
  const pauseComment = typeof r.pauseComment === 'string' && r.pauseComment.trim() ? r.pauseComment.trim() : undefined
  const pauseRequestedDurationMs =
    typeof r.pauseRequestedDurationMs === 'number' && Number.isFinite(r.pauseRequestedDurationMs) && r.pauseRequestedDurationMs > 0
      ? Math.floor(r.pauseRequestedDurationMs)
      : undefined
  const pauseDecision = r.pauseDecision === 'accepted' || r.pauseDecision === 'rejected' ? r.pauseDecision : undefined
  const pauseDecidedAt = typeof r.pauseDecidedAt === 'string' && r.pauseDecidedAt.trim() ? r.pauseDecidedAt : undefined
  const pausedAt = typeof r.pausedAt === 'string' && r.pausedAt.trim() ? r.pausedAt : undefined
  const pausedUntil = typeof r.pausedUntil === 'string' && r.pausedUntil.trim() ? r.pausedUntil : undefined
  const forceMajeureAppliedEventIds = Array.isArray(r.forceMajeureAppliedEventIds)
    ? r.forceMajeureAppliedEventIds.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : undefined
  const overdueAt = typeof r.overdueAt === 'string' && r.overdueAt.trim() ? r.overdueAt : undefined
  const autoDisputeAt =
    typeof r.autoDisputeAt === 'string' && r.autoDisputeAt.trim()
      ? r.autoDisputeAt
      : overdueAt
        ? addMs(overdueAt, AUTO_DISPUTE_AFTER_OVERDUE_MS)
        : undefined

  if (startedAt) a.startedAt = startedAt
  if (executionBaseDeadlineAt) a.executionBaseDeadlineAt = executionBaseDeadlineAt
  if (executionExtensionMs) a.executionExtensionMs = executionExtensionMs
  if (executionDeadlineAt) a.executionDeadlineAt = executionDeadlineAt
  if (submittedAt) a.submittedAt = submittedAt
  if (acceptedAt) a.acceptedAt = acceptedAt
  if (pauseUsed) a.pauseUsed = true
  if (pauseRequestedAt) a.pauseRequestedAt = pauseRequestedAt
  if (pauseAutoAcceptAt) a.pauseAutoAcceptAt = pauseAutoAcceptAt
  if (pauseReasonId) a.pauseReasonId = pauseReasonId
  if (pauseComment) a.pauseComment = pauseComment
  if (pauseRequestedDurationMs) a.pauseRequestedDurationMs = pauseRequestedDurationMs
  if (pauseDecision) a.pauseDecision = pauseDecision
  if (pauseDecidedAt) a.pauseDecidedAt = pauseDecidedAt
  if (pausedAt) a.pausedAt = pausedAt
  if (pausedUntil) a.pausedUntil = pausedUntil
  if (forceMajeureAppliedEventIds && forceMajeureAppliedEventIds.length > 0) {
    a.forceMajeureAppliedEventIds = forceMajeureAppliedEventIds
  }
  if (overdueAt) a.overdueAt = overdueAt
  if (autoDisputeAt) a.autoDisputeAt = autoDisputeAt

  return a
}

export const taskAssignmentRepo = {
  constants: {
    START_WINDOW_MS,
    EXECUTION_WINDOW_MS,
    AUTO_DISPUTE_AFTER_OVERDUE_MS,
    PAUSE_AUTO_ACCEPT_MS,
    PAUSE_MAX_MS,
  },

  listAll(): TaskAssignment[] {
    return readAll()
      .map(normalize)
      .filter(Boolean) as TaskAssignment[]
  },

  listForTask(taskId: string): TaskAssignment[] {
    return this.listAll()
      .filter((a) => a.taskId === taskId)
      .slice()
      .sort((a, b) => b.assignedAt.localeCompare(a.assignedAt))
  },

  listForExecutor(executorId: string): TaskAssignment[] {
    return this.listAll()
      .filter((a) => a.executorId === executorId)
      .slice()
      .sort((a, b) => b.assignedAt.localeCompare(a.assignedAt))
  },

  getForTaskExecutor(taskId: string, executorId: string): TaskAssignment | null {
    return this.listAll().find((a) => a.taskId === taskId && a.executorId === executorId) ?? null
  },

  /**
   * Create (or return existing) assignment for a task+executor pair.
   * Idempotent for (taskId, executorId).
   */
  createPendingStart(input: { taskId: string; executorId: string; assignedAt?: string }): TaskAssignment {
    const existing = this.getForTaskExecutor(input.taskId, input.executorId)
    if (existing) return existing
    const assignedAt = input.assignedAt && input.assignedAt.trim() ? input.assignedAt : nowIso()
    const a: TaskAssignment = {
      id: createId('assign'),
      taskId: input.taskId,
      executorId: input.executorId,
      assignedAt,
      startDeadlineAt: addMs(assignedAt, START_WINDOW_MS),
      status: 'pending_start',
    }
    const all = readAll()
    all.push(a)
    writeAll(all)
    return a
  },

  startWork(taskId: string, executorId: string): TaskAssignment | null {
    const all = readAll()
    const idx = all.findIndex((x) => (x as any)?.taskId === taskId && (x as any)?.executorId === executorId)
    if (idx === -1) return null
    const prev = normalize(all[idx])
    if (!prev) return null
    if (prev.status !== 'pending_start') return prev
    const startedAt = nowIso()
    const base = addMs(startedAt, EXECUTION_WINDOW_MS)
    const next: TaskAssignment = {
      ...prev,
      status: 'in_progress',
      startedAt,
      executionBaseDeadlineAt: base,
      executionExtensionMs: 0,
      executionDeadlineAt: base,
    }
    all[idx] = next
    writeAll(all)
    return next
  },

  requestPause(input: {
    taskId: string
    executorId: string
    reasonId: 'illness' | 'family' | 'force_majeure'
    comment?: string
    durationMs: number
  }): TaskAssignment | null {
    const all = readAll()
    const idx = all.findIndex((x) => (x as any)?.taskId === input.taskId && (x as any)?.executorId === input.executorId)
    if (idx === -1) return null
    const prev = normalize(all[idx])
    if (!prev) return null
    if (prev.status !== 'in_progress') return prev
    if (!prev.startedAt || !prev.executionDeadlineAt || !prev.executionBaseDeadlineAt) return prev
    if (prev.pauseUsed) return prev

    const now = nowIso()
    const durationMs = Math.max(5 * 60 * 1000, Math.min(PAUSE_MAX_MS, Math.floor(input.durationMs)))
    const next: TaskAssignment = {
      ...prev,
      status: 'pause_requested',
      pauseUsed: true,
      pauseRequestedAt: now,
      pauseAutoAcceptAt: addMs(now, PAUSE_AUTO_ACCEPT_MS),
      pauseReasonId: input.reasonId,
      pauseComment: input.comment?.trim() || undefined,
      pauseRequestedDurationMs: durationMs,
      pauseDecision: undefined,
      pauseDecidedAt: undefined,
      pausedAt: undefined,
      pausedUntil: undefined,
    }
    all[idx] = next
    writeAll(all)
    return next
  },

  acceptPause(taskId: string, executorId: string, decidedAtIso?: string): TaskAssignment | null {
    const all = readAll()
    const idx = all.findIndex((x) => (x as any)?.taskId === taskId && (x as any)?.executorId === executorId)
    if (idx === -1) return null
    const prev = normalize(all[idx])
    if (!prev) return null
    if (prev.status !== 'pause_requested') return prev
    if (!prev.pauseRequestedAt || !prev.pauseRequestedDurationMs) return prev
    if (!prev.executionBaseDeadlineAt) return prev

    const decidedAt = decidedAtIso && decidedAtIso.trim() ? decidedAtIso : nowIso()
    const requestedAtMs = Date.parse(prev.pauseRequestedAt)
    const decidedAtMs = Date.parse(decidedAt)
    const waitMs =
      Number.isFinite(requestedAtMs) && Number.isFinite(decidedAtMs) ? Math.max(0, decidedAtMs - requestedAtMs) : 0

    // Enforce extension cap: max +50% of base execution window, and also <= 24h.
    const maxExtendMs = Math.min(PAUSE_MAX_MS, Math.floor(EXECUTION_WINDOW_MS * 0.5))
    const prevExt = typeof prev.executionExtensionMs === 'number' && Number.isFinite(prev.executionExtensionMs) ? prev.executionExtensionMs : 0
    const remaining = Math.max(0, maxExtendMs - prevExt)
    const addMsTotal = Math.min(remaining, waitMs + prev.pauseRequestedDurationMs)
    const nextExt = prevExt + addMsTotal
    const newDeadline = addMs(prev.executionBaseDeadlineAt, nextExt)

    const pausedAt = decidedAt
    const pausedUntil = addMs(pausedAt, prev.pauseRequestedDurationMs)

    const next: TaskAssignment = {
      ...prev,
      status: 'paused',
      pauseDecision: 'accepted',
      pauseDecidedAt: decidedAt,
      executionExtensionMs: nextExt,
      executionDeadlineAt: newDeadline,
      pausedAt,
      pausedUntil,
    }
    all[idx] = next
    writeAll(all)
    return next
  },

  rejectPause(taskId: string, executorId: string, decidedAtIso?: string): TaskAssignment | null {
    const all = readAll()
    const idx = all.findIndex((x) => (x as any)?.taskId === taskId && (x as any)?.executorId === executorId)
    if (idx === -1) return null
    const prev = normalize(all[idx])
    if (!prev) return null
    if (prev.status !== 'pause_requested') return prev
    const decidedAt = decidedAtIso && decidedAtIso.trim() ? decidedAtIso : nowIso()
    const next: TaskAssignment = {
      ...prev,
      status: 'in_progress',
      pauseDecision: 'rejected',
      pauseDecidedAt: decidedAt,
    }
    all[idx] = next
    writeAll(all)
    return next
  },

  resumeIfPauseEnded(taskId: string, executorId: string, nowMs: number = Date.now()): TaskAssignment | null {
    const all = readAll()
    const idx = all.findIndex((x) => (x as any)?.taskId === taskId && (x as any)?.executorId === executorId)
    if (idx === -1) return null
    const prev = normalize(all[idx])
    if (!prev) return null
    if (prev.status !== 'paused') return prev
    if (!prev.pausedUntil) return prev
    const untilMs = Date.parse(prev.pausedUntil)
    if (!Number.isFinite(untilMs) || nowMs < untilMs) return prev
    const next: TaskAssignment = { ...prev, status: 'in_progress' }
    all[idx] = next
    writeAll(all)
    return next
  },

  /**
   * Executor can end an accepted pause early (paused -> in_progress).
   * We keep the extended deadlines as-is (best-effort / simple UX).
   */
  endPauseEarly(taskId: string, executorId: string, resumedAtIso?: string): TaskAssignment | null {
    const all = readAll()
    const idx = all.findIndex((x) => (x as any)?.taskId === taskId && (x as any)?.executorId === executorId)
    if (idx === -1) return null
    const prev = normalize(all[idx])
    if (!prev) return null
    if (prev.status !== 'paused') return prev
    const resumedAt = resumedAtIso && resumedAtIso.trim() ? resumedAtIso : nowIso()
    const next: TaskAssignment = { ...prev, status: 'in_progress', pausedUntil: resumedAt }
    all[idx] = next
    writeAll(all)
    return next
  },

  /**
   * Apply a finished force majeure event by extending deadlines.
   * Idempotent per assignment+eventId using `forceMajeureAppliedEventIds`.
   */
  applyForceMajeureShift(input: { taskId: string; executorId: string; eventId: string; durationMs: number }) {
    const all = readAll()
    const idx = all.findIndex((x) => (x as any)?.taskId === input.taskId && (x as any)?.executorId === input.executorId)
    if (idx === -1) return null
    const prev = normalize(all[idx])
    if (!prev) return null
    const applied = new Set(prev.forceMajeureAppliedEventIds ?? [])
    if (applied.has(input.eventId)) return prev

    const dur = Math.max(0, Math.floor(input.durationMs))
    if (!dur) {
      applied.add(input.eventId)
      const next0: TaskAssignment = { ...prev, forceMajeureAppliedEventIds: Array.from(applied) }
      all[idx] = next0
      writeAll(all)
      return next0
    }

    const next: TaskAssignment = { ...prev, forceMajeureAppliedEventIds: Array.from(applied).concat(input.eventId) }

    // Extend start window if not started yet.
    if (next.status === 'pending_start') {
      next.startDeadlineAt = addMs(next.startDeadlineAt, dur)
    }

    // Extend execution deadlines if started.
    if (next.executionBaseDeadlineAt) {
      const prevExt =
        typeof next.executionExtensionMs === 'number' && Number.isFinite(next.executionExtensionMs) ? next.executionExtensionMs : 0
      next.executionExtensionMs = prevExt + dur
      next.executionDeadlineAt = addMs(next.executionBaseDeadlineAt, next.executionExtensionMs)
    } else if (next.executionDeadlineAt) {
      next.executionDeadlineAt = addMs(next.executionDeadlineAt, dur)
    }

    // Auto-dispute time shift if already overdue.
    if (next.autoDisputeAt) {
      next.autoDisputeAt = addMs(next.autoDisputeAt, dur)
    }

    // Pause-related deadlines
    if (next.pauseAutoAcceptAt) next.pauseAutoAcceptAt = addMs(next.pauseAutoAcceptAt, dur)
    if (next.pausedUntil) next.pausedUntil = addMs(next.pausedUntil, dur)

    all[idx] = next
    writeAll(all)
    return next
  },

  markOverdue(taskId: string, executorId: string, overdueAtIso?: string): TaskAssignment | null {
    const all = readAll()
    const idx = all.findIndex((x) => (x as any)?.taskId === taskId && (x as any)?.executorId === executorId)
    if (idx === -1) return null
    const prev = normalize(all[idx])
    if (!prev) return null
    if (prev.status !== 'in_progress') return prev
    const overdueAt = overdueAtIso && overdueAtIso.trim() ? overdueAtIso : nowIso()
    const next: TaskAssignment = {
      ...prev,
      status: 'overdue',
      overdueAt,
      autoDisputeAt: addMs(overdueAt, AUTO_DISPUTE_AFTER_OVERDUE_MS),
    }
    all[idx] = next
    writeAll(all)
    return next
  },

  markSubmitted(taskId: string, executorId: string, submittedAtIso?: string): TaskAssignment | null {
    const all = readAll()
    const idx = all.findIndex((x) => (x as any)?.taskId === taskId && (x as any)?.executorId === executorId)
    if (idx === -1) return null
    const prev = normalize(all[idx])
    if (!prev) return null
    if (prev.status !== 'in_progress' && prev.status !== 'overdue') return prev
    const submittedAt = submittedAtIso && submittedAtIso.trim() ? submittedAtIso : nowIso()
    const next: TaskAssignment = { ...prev, status: 'submitted', submittedAt }
    all[idx] = next
    writeAll(all)
    return next
  },

  /**
   * When customer requests a revision, executor should be able to continue work.
   * Sync assignment back from `submitted` to `in_progress` (best-effort).
   */
  resumeAfterRevisionRequest(taskId: string, executorId: string, resumedAtIso?: string): TaskAssignment | null {
    const all = readAll()
    const idx = all.findIndex((x) => (x as any)?.taskId === taskId && (x as any)?.executorId === executorId)
    if (idx === -1) return null
    const prev = normalize(all[idx])
    if (!prev) return null
    if (prev.status !== 'submitted') return prev
    // Keep deadlines as-is; just allow the executor to submit again.
    void (resumedAtIso && resumedAtIso.trim() ? resumedAtIso : nowIso())
    const next: TaskAssignment = { ...prev, status: 'in_progress' }
    all[idx] = next
    writeAll(all)
    return next
  },

  markAccepted(taskId: string, executorId: string, acceptedAtIso?: string): TaskAssignment | null {
    const all = readAll()
    const idx = all.findIndex((x) => (x as any)?.taskId === taskId && (x as any)?.executorId === executorId)
    if (idx === -1) return null
    const prev = normalize(all[idx])
    if (!prev) return null
    if (prev.status !== 'submitted' && prev.status !== 'dispute_opened') return prev
    const acceptedAt = acceptedAtIso && acceptedAtIso.trim() ? acceptedAtIso : nowIso()
    const next: TaskAssignment = { ...prev, status: 'accepted', acceptedAt }
    all[idx] = next
    writeAll(all)
    return next
  },

  removedAuto(taskId: string, executorId: string): TaskAssignment | null {
    const all = readAll()
    const idx = all.findIndex((x) => (x as any)?.taskId === taskId && (x as any)?.executorId === executorId)
    if (idx === -1) return null
    const prev = normalize(all[idx])
    if (!prev) return null
    if (prev.status !== 'pending_start') return prev
    const next: TaskAssignment = { ...prev, status: 'removed_auto' }
    all[idx] = next
    writeAll(all)
    return next
  },

  cancelByCustomer(taskId: string, executorId: string): TaskAssignment | null {
    const all = readAll()
    const idx = all.findIndex((x) => (x as any)?.taskId === taskId && (x as any)?.executorId === executorId)
    if (idx === -1) return null
    const prev = normalize(all[idx])
    if (!prev) return null
    if (prev.status === 'accepted' || prev.status === 'cancelled_by_customer') return prev
    const next: TaskAssignment = { ...prev, status: 'cancelled_by_customer' }
    all[idx] = next
    writeAll(all)
    return next
  },

  openDispute(taskId: string, executorId: string): TaskAssignment | null {
    const all = readAll()
    const idx = all.findIndex((x) => (x as any)?.taskId === taskId && (x as any)?.executorId === executorId)
    if (idx === -1) return null
    const prev = normalize(all[idx])
    if (!prev) return null
    if (prev.status === 'dispute_opened' || prev.status === 'accepted') return prev
    const next: TaskAssignment = { ...prev, status: 'dispute_opened' }
    all[idx] = next
    writeAll(all)
    return next
  },

  subscribe(callback: () => void) {
    const handler = () => callback()
    window.addEventListener(CHANGE_EVENT, handler)
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) handler()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(CHANGE_EVENT, handler)
      window.removeEventListener('storage', onStorage)
    }
  },
}

