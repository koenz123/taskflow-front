import { createId } from '@/shared/lib/id'
import type { AuditActionType, AuditEntry } from '../model/auditEntry'

const STORAGE_KEY = 'ui-create-works.auditLog.v1'
const CHANGE_EVENT = 'ui-create-works.auditLog.change'

function safeParse(json: string | null): AuditEntry[] {
  if (!json) return []
  try {
    const data = JSON.parse(json) as unknown
    if (!Array.isArray(data)) return []
    return data as AuditEntry[]
  } catch {
    return []
  }
}

function readAll(): AuditEntry[] {
  return safeParse(localStorage.getItem(STORAGE_KEY))
}

function writeAll(items: AuditEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function nowIso() {
  return new Date().toISOString()
}

function normalize(raw: unknown): AuditEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = typeof r.id === 'string' ? r.id : createId('audit')
  const disputeId = typeof r.disputeId === 'string' ? r.disputeId : ''
  const actorUserId = typeof r.actorUserId === 'string' ? r.actorUserId : ''
  const actionType = typeof r.actionType === 'string' ? (r.actionType as AuditActionType) : ('system_message' as const)
  const summary = typeof r.summary === 'string' ? r.summary : ''
  if (!disputeId || !actorUserId || !summary) return null
  const createdAt = typeof r.createdAt === 'string' ? r.createdAt : nowIso()
  const payload = (r.payload && typeof r.payload === 'object' ? (r.payload as Record<string, unknown>) : undefined) ?? undefined
  const versionBefore = typeof r.versionBefore === 'number' && Number.isFinite(r.versionBefore) ? r.versionBefore : undefined
  const versionAfter = typeof r.versionAfter === 'number' && Number.isFinite(r.versionAfter) ? r.versionAfter : undefined
  return { id, disputeId, actionType, actorUserId, summary, payload, createdAt, versionBefore, versionAfter }
}

export const auditLogRepo = {
  listForDispute(disputeId: string): AuditEntry[] {
    return readAll()
      .map(normalize)
      .filter(Boolean)
      .filter((e) => (e as AuditEntry).disputeId === disputeId) as AuditEntry[]
  },

  add(input: {
    disputeId: string
    actionType: AuditActionType
    actorUserId: string
    summary: string
    payload?: Record<string, unknown>
    versionBefore?: number
    versionAfter?: number
  }): AuditEntry {
    const entry: AuditEntry = {
      id: createId('audit'),
      disputeId: input.disputeId,
      actionType: input.actionType,
      actorUserId: input.actorUserId,
      summary: input.summary,
      payload: input.payload,
      versionBefore: input.versionBefore,
      versionAfter: input.versionAfter,
      createdAt: nowIso(),
    }
    const all = readAll()
    all.push(entry)
    writeAll(all)
    return entry
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

