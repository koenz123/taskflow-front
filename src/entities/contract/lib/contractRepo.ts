import { createId } from '@/shared/lib/id'
import type { Contract, ContractStatus } from '../model/contract'

const STORAGE_KEY = 'ui-create-works.contracts.v1'
const CHANGE_EVENT = 'ui-create-works.contracts.change'

function safeParse(json: string | null): Contract[] {
  if (!json) return []
  try {
    const data = JSON.parse(json) as unknown
    if (!Array.isArray(data)) return []
    return data as Contract[]
  } catch {
    return []
  }
}

function readAll(): Contract[] {
  return safeParse(localStorage.getItem(STORAGE_KEY))
}

function writeAll(items: Contract[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function nowIso() {
  return new Date().toISOString()
}

function normalizeStatus(value: unknown): ContractStatus {
  if (
    value === 'active' ||
    value === 'submitted' ||
    value === 'revision_requested' ||
    value === 'approved' ||
    value === 'disputed' ||
    value === 'resolved' ||
    value === 'cancelled'
  ) {
    return value
  }
  return 'active'
}

/** Normalize raw API contract; supports id or _id (Mongo). */
export function normalizeContract(raw: unknown): Contract | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id =
    typeof r.id === 'string' && r.id.trim()
      ? r.id.trim()
      : typeof (r as any)._id === 'string'
        ? String((r as any)._id)
        : createId('contract')
  const taskId = typeof r.taskId === 'string' ? r.taskId : ''
  const clientId = typeof r.clientId === 'string' ? r.clientId : ''
  const executorId = typeof r.executorId === 'string' ? r.executorId : ''
  if (!taskId || !clientId || !executorId) return null
  const createdAt = typeof r.createdAt === 'string' ? r.createdAt : nowIso()
  const updatedAt = typeof r.updatedAt === 'string' ? r.updatedAt : createdAt
  const escrowAmount =
    typeof r.escrowAmount === 'number' && Number.isFinite(r.escrowAmount) && r.escrowAmount >= 0
      ? r.escrowAmount
      : 0
  const escrowCurrency =
    r.escrowCurrency === 'USD' || r.escrowCurrency === 'RUB' ? r.escrowCurrency : 'RUB'

  const c: Contract = {
    id,
    taskId,
    clientId,
    executorId,
    escrowAmount,
    escrowCurrency,
    status: normalizeStatus(r.status),
    createdAt,
    updatedAt,
  }

  // Allow up to 2 revision requests by default (including older persisted contracts).
  const includedRaw =
    typeof r.revisionIncluded === 'number' && Number.isFinite(r.revisionIncluded)
      ? Math.max(0, Math.floor(r.revisionIncluded))
      : 2
  c.revisionIncluded = Math.max(2, includedRaw)
  if (typeof r.revisionUsed === 'number' && Number.isFinite(r.revisionUsed)) {
    c.revisionUsed = Math.max(0, Math.floor(r.revisionUsed))
  }
  if (typeof r.lastSubmissionId === 'string' && r.lastSubmissionId.trim()) {
    c.lastSubmissionId = r.lastSubmissionId
  }
  if (typeof r.lastRevisionMessage === 'string' && r.lastRevisionMessage.trim()) {
    c.lastRevisionMessage = r.lastRevisionMessage.trim()
  }
  if (typeof r.lastRevisionRequestedAt === 'string' && r.lastRevisionRequestedAt.trim()) {
    c.lastRevisionRequestedAt = r.lastRevisionRequestedAt
  }

  return c
}

function normalize(raw: unknown): Contract | null {
  return normalizeContract(raw)
}

export const contractRepo = {
  listAll(): Contract[] {
    return readAll()
      .map(normalize)
      .filter(Boolean) as Contract[]
  },

  listForTask(taskId: string): Contract[] {
    return this.listAll().filter((c) => c.taskId === taskId)
  },

  listForClient(clientId: string): Contract[] {
    return this.listAll().filter((c) => c.clientId === clientId)
  },

  listForExecutor(executorId: string): Contract[] {
    return this.listAll().filter((c) => c.executorId === executorId)
  },

  getById(contractId: string): Contract | null {
    return this.listAll().find((c) => c.id === contractId) ?? null
  },

  getForTaskExecutor(taskId: string, executorId: string): Contract | null {
    return this.listAll().find((c) => c.taskId === taskId && c.executorId === executorId) ?? null
  },

  /**
   * Create (or return existing) contract for a selected executor on a task.
   * Safe to call multiple times (idempotent for taskId+executorId).
   */
  createActive(input: {
    taskId: string
    clientId: string
    executorId: string
    escrowAmount: number
    revisionIncluded?: number
  }): Contract {
    const existing = this.getForTaskExecutor(input.taskId, input.executorId)
    if (existing) return existing

    const now = nowIso()
    const c: Contract = {
      id: createId('contract'),
      taskId: input.taskId,
      clientId: input.clientId,
      executorId: input.executorId,
      escrowAmount:
        typeof input.escrowAmount === 'number' && Number.isFinite(input.escrowAmount) && input.escrowAmount >= 0
          ? input.escrowAmount
          : 0,
      escrowCurrency: 'RUB',
      status: 'active',
      revisionIncluded:
        typeof input.revisionIncluded === 'number' && Number.isFinite(input.revisionIncluded)
          ? Math.max(2, Math.floor(input.revisionIncluded))
          : 2,
      revisionUsed: 0,
      createdAt: now,
      updatedAt: now,
    }

    const all = readAll()
    all.push(c)
    writeAll(all)
    return c
  },

  update(contractId: string, updater: (prev: Contract) => Contract): Contract | null {
    const all = readAll()
    const idx = all.findIndex((c) => c.id === contractId)
    if (idx === -1) return null
    const prev = normalize(all[idx])
    if (!prev) return null
    const next = updater(prev)
    all[idx] = { ...next, updatedAt: nowIso() }
    writeAll(all)
    return normalize(all[idx])
  },

  setStatus(contractId: string, status: ContractStatus): Contract | null {
    return this.update(contractId, (c) => ({ ...c, status }))
  },

  setLastSubmission(contractId: string, submissionId: string) {
    return this.update(contractId, (c) => ({ ...c, lastSubmissionId: submissionId }))
  },

  incrementRevisionUsed(contractId: string) {
    return this.update(contractId, (c) => ({ ...c, revisionUsed: (c.revisionUsed ?? 0) + 1 }))
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

