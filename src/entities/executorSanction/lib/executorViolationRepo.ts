import { createId } from '@/shared/lib/id'
import type { ExecutorViolation, ExecutorViolationType } from '../model/violation'

const STORAGE_KEY = 'ui-create-works.executorViolations.v1'
const CHANGE_EVENT = 'ui-create-works.executorViolations.change'
const DECAY_DAYS = 90
const DECAY_MS = DECAY_DAYS * 24 * 60 * 60 * 1000

function safeParse(json: string | null): ExecutorViolation[] {
  if (!json) return []
  try {
    const data = JSON.parse(json) as unknown
    if (!Array.isArray(data)) return []
    return data as ExecutorViolation[]
  } catch {
    return []
  }
}

function readAll(): ExecutorViolation[] {
  return safeParse(localStorage.getItem(STORAGE_KEY))
}

function writeAll(items: ExecutorViolation[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function nowIso() {
  return new Date().toISOString()
}

function applyDecay(level: number, deltaMs: number) {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return level
  const steps = Math.floor(deltaMs / DECAY_MS)
  if (!Number.isFinite(steps) || steps <= 0) return level
  return Math.max(0, level - steps)
}

function normalize(raw: unknown): ExecutorViolation | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = typeof r.id === 'string' ? r.id : createId('viol')
  const executorId = typeof r.executorId === 'string' ? r.executorId : ''
  const taskId = typeof r.taskId === 'string' ? r.taskId : ''
  const assignmentId = typeof r.assignmentId === 'string' ? r.assignmentId : ''
  const createdAt = typeof r.createdAt === 'string' ? r.createdAt : nowIso()
  const type: ExecutorViolationType =
    r.type === 'no_submit_24h'
      ? 'no_submit_24h'
      : r.type === 'no_start_12h'
        ? 'no_start_12h'
        : r.type === 'force_majeure_abuse'
          ? 'force_majeure_abuse'
          : 'no_start_12h'
  if (!executorId || !taskId || !assignmentId) return null
  return { id, executorId, type, taskId, assignmentId, createdAt }
}

export const executorViolationRepo = {
  listAll(): ExecutorViolation[] {
    return readAll()
      .map(normalize)
      .filter(Boolean) as ExecutorViolation[]
  },

  listForExecutor(executorId: string): ExecutorViolation[] {
    return this.listAll()
      .filter((v) => v.executorId === executorId)
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },

  listForExecutorSince(executorId: string, sinceMs: number, type?: ExecutorViolationType): ExecutorViolation[] {
    const list = this.listForExecutor(executorId)
    return list.filter((v) => {
      if (type && v.type !== type) return false
      const t = Date.parse(v.createdAt)
      return Number.isFinite(t) && t >= sinceMs
    })
  },

  countForExecutorSince(executorId: string, sinceMs: number, type?: ExecutorViolationType) {
    return this.listForExecutorSince(executorId, sinceMs, type).length
  },

  /**
   * Returns current "points" (level) for a specific violation type.
   * Points decay by 1 every 90 days without new violations of that type.
   *
   * Note: if nowMs is in the past, only violations with createdAt <= nowMs are considered.
   */
  levelForExecutor(executorId: string, type: ExecutorViolationType, nowMs: number = Date.now()) {
    const all = this.listForExecutor(executorId)
      .filter((v) => v.type === type)
      .slice()
      // ISO string, chronological sort.
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

    let level = 0
    let lastTs: number | null = null

    for (const v of all) {
      const ts = Date.parse(v.createdAt)
      if (!Number.isFinite(ts)) continue
      if (Number.isFinite(nowMs) && ts > nowMs) break
      if (lastTs != null) level = applyDecay(level, ts - lastTs)
      level += 1
      lastTs = ts
    }

    if (lastTs != null) level = applyDecay(level, nowMs - lastTs)
    return level
  },

  getForAssignment(assignmentId: string, type: ExecutorViolationType): ExecutorViolation | null {
    return this.listAll().find((v) => v.assignmentId === assignmentId && v.type === type) ?? null
  },

  addNoStart12h(input: { executorId: string; taskId: string; assignmentId: string; createdAt?: string }): ExecutorViolation {
    const existing = this.getForAssignment(input.assignmentId, 'no_start_12h')
    if (existing) return existing
    const createdAt = input.createdAt && input.createdAt.trim() ? input.createdAt : nowIso()
    const v: ExecutorViolation = {
      id: createId('viol'),
      executorId: input.executorId,
      type: 'no_start_12h',
      taskId: input.taskId,
      assignmentId: input.assignmentId,
      createdAt,
    }
    const all = readAll()
    all.push(v)
    writeAll(all)
    return v
  },

  addNoSubmit24h(input: { executorId: string; taskId: string; assignmentId: string; createdAt?: string }): ExecutorViolation {
    const existing = this.getForAssignment(input.assignmentId, 'no_submit_24h')
    if (existing) return existing
    const createdAt = input.createdAt && input.createdAt.trim() ? input.createdAt : nowIso()
    const v: ExecutorViolation = {
      id: createId('viol'),
      executorId: input.executorId,
      type: 'no_submit_24h',
      taskId: input.taskId,
      assignmentId: input.assignmentId,
      createdAt,
    }
    const all = readAll()
    all.push(v)
    writeAll(all)
    return v
  },

  addForceMajeureAbuse(input: { executorId: string; taskId: string; assignmentId: string; createdAt?: string }): ExecutorViolation {
    const existing = this.getForAssignment(input.assignmentId, 'force_majeure_abuse')
    if (existing) return existing
    const createdAt = input.createdAt && input.createdAt.trim() ? input.createdAt : nowIso()
    const v: ExecutorViolation = {
      id: createId('viol'),
      executorId: input.executorId,
      type: 'force_majeure_abuse',
      taskId: input.taskId,
      assignmentId: input.assignmentId,
      createdAt,
    }
    const all = readAll()
    all.push(v)
    writeAll(all)
    return v
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

