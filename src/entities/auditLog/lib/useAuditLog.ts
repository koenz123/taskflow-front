import { useSyncExternalStore } from 'react'
import type { AuditEntry } from '../model/auditEntry'
import { auditLogRepo } from './auditLogRepo'

const STORAGE_KEY = 'ui-create-works.auditLog.v1'

type Cache = {
  disputeId: string | null
  raw: string | null
  list: AuditEntry[]
}

let cache: Cache = { disputeId: null, raw: null, list: [] }

function getSnapshot(disputeId: string | null) {
  if (!disputeId) {
    if (cache.disputeId !== null || cache.raw !== null || cache.list.length) {
      cache = { disputeId: null, raw: null, list: [] }
    }
    return cache.list
  }

  const raw = localStorage.getItem(STORAGE_KEY)
  if (cache.disputeId === disputeId && cache.raw === raw) return cache.list

  const list = auditLogRepo
    .listForDispute(disputeId)
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  cache = { disputeId, raw, list }
  return list
}

export function useAuditLog(disputeId?: string | null) {
  return useSyncExternalStore(auditLogRepo.subscribe, () => getSnapshot(disputeId ?? null), () => [])
}

