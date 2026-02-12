import { createId } from '@/shared/lib/id'
import type { RatingAdjustment } from '../model/ratingAdjustment'

const STORAGE_KEY = 'ui-create-works.ratingAdjustments.v1'
const CHANGE_EVENT = 'ui-create-works.ratingAdjustments.change'

function safeParse(json: string | null): RatingAdjustment[] {
  if (!json) return []
  try {
    const data = JSON.parse(json) as unknown
    if (!Array.isArray(data)) return []
    return data as RatingAdjustment[]
  } catch {
    return []
  }
}

function readAll(): RatingAdjustment[] {
  return safeParse(localStorage.getItem(STORAGE_KEY))
}

function writeAll(items: RatingAdjustment[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function nowIso() {
  return new Date().toISOString()
}

function normalize(raw: unknown): RatingAdjustment | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = typeof r.id === 'string' ? r.id : createId('radj')
  const executorId = typeof r.executorId === 'string' ? r.executorId : ''
  const violationId = typeof r.violationId === 'string' ? r.violationId : ''
  const createdAt = typeof r.createdAt === 'string' ? r.createdAt : nowIso()
  const deltaPercent = typeof r.deltaPercent === 'number' && Number.isFinite(r.deltaPercent) ? r.deltaPercent : 0
  const reason = r.reason === 'no_submit_24h' ? 'no_submit_24h' : r.reason === 'no_start_12h' ? 'no_start_12h' : null
  if (!executorId || !violationId) return null
  if (!Number.isFinite(deltaPercent) || deltaPercent === 0) return null
  if (!reason) return null
  return { id, executorId, violationId, createdAt, deltaPercent, reason }
}

export const ratingAdjustmentRepo = {
  listAll(): RatingAdjustment[] {
    return readAll()
      .map(normalize)
      .filter(Boolean) as RatingAdjustment[]
  },

  listForExecutor(executorId: string): RatingAdjustment[] {
    return this.listAll()
      .filter((a) => a.executorId === executorId)
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },

  getForViolation(violationId: string): RatingAdjustment | null {
    return this.listAll().find((x) => x.violationId === violationId) ?? null
  },

  addNoStartPenalty5(violationId: string, executorId: string) {
    const existing = this.getForViolation(violationId)
    if (existing) return existing
    const a: RatingAdjustment = {
      id: createId('radj'),
      executorId,
      deltaPercent: -5,
      reason: 'no_start_12h',
      violationId,
      createdAt: nowIso(),
    }
    const all = readAll()
    all.push(a)
    writeAll(all)
    return a
  },

  addNoSubmitPenalty5(violationId: string, executorId: string) {
    const existing = this.getForViolation(violationId)
    if (existing) return existing
    const a: RatingAdjustment = {
      id: createId('radj'),
      executorId,
      deltaPercent: -5,
      reason: 'no_submit_24h',
      violationId,
      createdAt: nowIso(),
    }
    const all = readAll()
    all.push(a)
    writeAll(all)
    return a
  },

  totalDeltaPercentForExecutor(executorId: string) {
    return this.listForExecutor(executorId).reduce((sum, x) => sum + x.deltaPercent, 0)
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

