import { createId } from '@/shared/lib/id'
import type { Dispute, DisputeDecision, DisputeReason, DisputeStatus } from '../model/dispute'

const STORAGE_KEY = 'ui-create-works.disputes.v1'
const CHANGE_EVENT = 'ui-create-works.disputes.change'
const SLA_MS = 24 * 60 * 60 * 1000

function safeParse(json: string | null): Dispute[] {
  if (!json) return []
  try {
    const data = JSON.parse(json) as unknown
    if (!Array.isArray(data)) return []
    return data as Dispute[]
  } catch {
    return []
  }
}

function readAll(): Dispute[] {
  return safeParse(localStorage.getItem(STORAGE_KEY))
}

function writeAll(items: Dispute[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function nowIso() {
  return new Date().toISOString()
}

function addMsToIso(iso: string, addMs: number) {
  const ts = Date.parse(iso)
  if (!Number.isFinite(ts)) return new Date(Date.now() + addMs).toISOString()
  return new Date(ts + addMs).toISOString()
}

function normalizeStatus(value: unknown): DisputeStatus {
  if (value === 'open' || value === 'in_review' || value === 'need_more_info' || value === 'decided' || value === 'closed') return value
  return 'open'
}

function normalizeReason(value: unknown): DisputeReason {
  if (!value || typeof value !== 'object') return { categoryId: 'universal', reasonId: 'other' }
  const r = value as Record<string, unknown>
  const categoryId = typeof r.categoryId === 'string' && r.categoryId.trim() ? r.categoryId : 'universal'
  const reasonId = typeof r.reasonId === 'string' && r.reasonId.trim() ? r.reasonId : 'other'
  const detail = typeof r.detail === 'string' && r.detail.trim() ? r.detail.trim() : undefined
  return { categoryId, reasonId, detail }
}

function normalizeDecision(value: unknown): DisputeDecision | undefined {
  if (!value || typeof value !== 'object') return undefined
  const r = value as Record<string, unknown>
  const payout = r.payout
  if (payout === 'executor') return { payout: 'executor' }
  if (payout === 'customer') return { payout: 'customer' }
  if (payout === 'split' || payout === 'partial') {
    const executorAmount = typeof r.executorAmount === 'number' ? r.executorAmount : NaN
    const customerAmount = typeof r.customerAmount === 'number' ? r.customerAmount : NaN
    if (!Number.isFinite(executorAmount) || !Number.isFinite(customerAmount)) return undefined
    const note = typeof r.note === 'string' && r.note.trim() ? r.note.trim() : undefined
    return payout === 'split'
      ? { payout: 'split', executorAmount, customerAmount }
      : { payout: 'partial', executorAmount, customerAmount, note }
  }
  return undefined
}

function normalize(raw: unknown): Dispute | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = typeof r.id === 'string' ? r.id : createId('disp')
  const contractId = typeof r.contractId === 'string' ? r.contractId : ''
  const openedByUserId = typeof r.openedByUserId === 'string' ? r.openedByUserId : ''
  if (!contractId || !openedByUserId) return null
  const createdAt = typeof r.createdAt === 'string' ? r.createdAt : nowIso()
  const updatedAt = typeof r.updatedAt === 'string' ? r.updatedAt : createdAt
  const slaDueAt =
    typeof r.slaDueAt === 'string' && r.slaDueAt.trim()
      ? r.slaDueAt
      : addMsToIso(createdAt, SLA_MS)
  const assignedArbiterId =
    typeof r.assignedArbiterId === 'string' && r.assignedArbiterId.trim() ? r.assignedArbiterId.trim() : undefined
  const lockedDecisionAt =
    typeof r.lockedDecisionAt === 'string' && r.lockedDecisionAt.trim() ? r.lockedDecisionAt : undefined
  const versionRaw = typeof r.version === 'number' ? r.version : NaN
  const version = Number.isFinite(versionRaw) && versionRaw >= 1 ? Math.floor(versionRaw) : 1
  return {
    id,
    contractId,
    openedByUserId,
    reason: normalizeReason(r.reason),
    status: normalizeStatus(r.status),
    decision: normalizeDecision(r.decision),
    assignedArbiterId,
    slaDueAt,
    lockedDecisionAt,
    version,
    createdAt,
    updatedAt,
  }
}

function writeUpdatedById(disputeId: string, updater: (prev: Dispute) => Dispute): Dispute | null {
  const all = readAll()
  const idx = all.findIndex((x) => (x as any)?.id === disputeId)
  if (idx === -1) return null
  const prev = normalize(all[idx])
  if (!prev) return null
  const next = updater(prev)
  all[idx] = { ...next, updatedAt: nowIso() }
  writeAll(all)
  return normalize(all[idx])
}

export const disputeRepo = {
  listAll(): Dispute[] {
    return readAll()
      .map(normalize)
      .filter(Boolean) as Dispute[]
  },

  getById(disputeId: string): Dispute | null {
    return this.listAll().find((d) => d.id === disputeId) ?? null
  },

  getForContract(contractId: string): Dispute | null {
    return this.listAll().find((d) => d.contractId === contractId) ?? null
  },

  open(input: { contractId: string; openedByUserId: string; reason: DisputeReason }): Dispute {
    const existing = this.getForContract(input.contractId)
    if (existing) return existing
    const now = nowIso()
    const d: Dispute = {
      id: createId('disp'),
      contractId: input.contractId,
      openedByUserId: input.openedByUserId,
      reason: {
        categoryId: input.reason.categoryId,
        reasonId: input.reason.reasonId,
        detail: input.reason.detail?.trim() || undefined,
      },
      status: 'open',
      slaDueAt: addMsToIso(now, SLA_MS),
      version: 1,
      createdAt: now,
      updatedAt: now,
    }
    const all = readAll()
    all.push(d)
    writeAll(all)
    return d
  },

  decide(contractId: string, decision: DisputeDecision): Dispute | null {
    const d = this.getForContract(contractId)
    if (!d) return null
    return writeUpdatedById(d.id, (prev) => {
      if (prev.lockedDecisionAt) return prev
      return {
        ...prev,
        status: 'decided',
        decision,
        lockedDecisionAt: prev.lockedDecisionAt ?? nowIso(),
        version: (prev.version ?? 1) + 1,
      }
    })
  },

  close(contractId: string): Dispute | null {
    const d = this.getForContract(contractId)
    if (!d) return null
    return writeUpdatedById(d.id, (prev) => ({
      ...prev,
      status: 'closed',
      version: (prev.version ?? 1) + 1,
    }))
  },

  takeInWork(input: { disputeId: string; arbiterId: string; expectedVersion?: number }): Dispute | null {
    return writeUpdatedById(input.disputeId, (prev) => {
      if (prev.lockedDecisionAt) return prev
      if (prev.status === 'closed') return prev
      const expected = input.expectedVersion
      if (typeof expected === 'number' && Number.isFinite(expected) && expected !== (prev.version ?? 1)) return prev
      if (prev.assignedArbiterId && prev.assignedArbiterId !== input.arbiterId) return prev
      return {
        ...prev,
        assignedArbiterId: input.arbiterId,
        status: 'in_review',
        version: (prev.version ?? 1) + 1,
      }
    })
  },

  requestMoreInfo(input: { disputeId: string; arbiterId: string; expectedVersion?: number }): Dispute | null {
    return writeUpdatedById(input.disputeId, (prev) => {
      if (prev.lockedDecisionAt) return prev
      if (prev.status === 'closed') return prev
      const expected = input.expectedVersion
      if (typeof expected === 'number' && Number.isFinite(expected) && expected !== (prev.version ?? 1)) return prev
      if (prev.assignedArbiterId && prev.assignedArbiterId !== input.arbiterId) return prev
      return {
        ...prev,
        assignedArbiterId: prev.assignedArbiterId ?? input.arbiterId,
        status: 'need_more_info',
        version: (prev.version ?? 1) + 1,
      }
    })
  },

  decideLocked(input: { disputeId: string; decision: DisputeDecision; expectedVersion: number; arbiterId: string }): Dispute | null {
    return writeUpdatedById(input.disputeId, (prev) => {
      if (prev.lockedDecisionAt) return prev
      if (prev.status === 'closed') return prev
      if ((prev.version ?? 1) !== input.expectedVersion) return prev
      if (prev.assignedArbiterId && prev.assignedArbiterId !== input.arbiterId) return prev
      if (prev.status !== 'in_review') return prev
      return {
        ...prev,
        status: 'decided',
        decision: input.decision,
        lockedDecisionAt: nowIso(),
        version: (prev.version ?? 1) + 1,
      }
    })
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

