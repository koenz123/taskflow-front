import { createId } from '@/shared/lib/id'
import type { SystemEvent, SystemEventType } from '../model/systemEvent'

const STORAGE_KEY = 'ui-create-works.systemEvents.v1'
const CHANGE_EVENT = 'ui-create-works.systemEvents.change'

function safeParse(json: string | null): SystemEvent[] {
  if (!json) return []
  try {
    const data = JSON.parse(json) as unknown
    if (!Array.isArray(data)) return []
    return data as SystemEvent[]
  } catch {
    return []
  }
}

function readAll(): SystemEvent[] {
  return safeParse(localStorage.getItem(STORAGE_KEY))
}

function writeAll(items: SystemEvent[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function nowIso() {
  return new Date().toISOString()
}

function normalizeType(value: unknown): SystemEventType {
  if (value === 'force_majeure') return value
  return 'force_majeure'
}

function normalize(raw: unknown): SystemEvent | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = typeof r.id === 'string' ? r.id : createId('se')
  const type = normalizeType(r.type)
  const startAt = typeof r.startAt === 'string' ? r.startAt : ''
  if (!startAt) return null
  const endAt = typeof r.endAt === 'string' && r.endAt.trim() ? r.endAt : undefined
  const affectedTaskIds = Array.isArray(r.affectedTaskIds)
    ? r.affectedTaskIds.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : undefined
  const createdAt = typeof r.createdAt === 'string' ? r.createdAt : nowIso()
  return { id, type, startAt, endAt, affectedTaskIds, createdAt }
}

export const systemEventRepo = {
  listAll(): SystemEvent[] {
    return readAll()
      .map(normalize)
      .filter(Boolean) as SystemEvent[]
  },

  listActive(nowMs: number = Date.now()): SystemEvent[] {
    return this.listAll().filter((e) => {
      const s = Date.parse(e.startAt)
      if (!Number.isFinite(s) || nowMs < s) return false
      if (!e.endAt) return true
      const en = Date.parse(e.endAt)
      if (!Number.isFinite(en)) return true
      return nowMs < en
    })
  },

  activeForceMajeureForTask(taskId: string, nowMs: number = Date.now()): SystemEvent | null {
    const active = this.listActive(nowMs).filter((e) => e.type === 'force_majeure')
    for (const e of active) {
      const affected = e.affectedTaskIds
      if (!affected || affected.length === 0) return e
      if (affected.includes(taskId)) return e
    }
    return null
  },

  createForceMajeure(input: { startAt?: string; affectedTaskIds?: string[] }): SystemEvent {
    const startAt = input.startAt && input.startAt.trim() ? input.startAt : nowIso()
    const e: SystemEvent = {
      id: createId('se'),
      type: 'force_majeure',
      startAt,
      affectedTaskIds: input.affectedTaskIds?.filter((x) => x && x.trim()) ?? undefined,
      createdAt: nowIso(),
    }
    const all = readAll()
    all.push(e)
    writeAll(all)
    return e
  },

  end(eventId: string, endAt?: string) {
    const all = readAll()
    const idx = all.findIndex((x) => (x as any)?.id === eventId)
    if (idx === -1) return null
    const prev = normalize(all[idx])
    if (!prev) return null
    const next: SystemEvent = { ...prev, endAt: endAt && endAt.trim() ? endAt : nowIso() }
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

