import { useSyncExternalStore } from 'react'
import type { DisputeMessage } from '../model/disputeMessage'
import { disputeMessageRepo } from './disputeMessageRepo'

const STORAGE_KEY = 'ui-create-works.disputeMessages.v1'

type Cache = {
  disputeId: string | null
  raw: string | null
  list: DisputeMessage[]
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

  const list = disputeMessageRepo.listForDispute(disputeId).slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  cache = { disputeId, raw, list }
  return list
}

export function useDisputeMessages(disputeId?: string | null) {
  return useSyncExternalStore(
    disputeMessageRepo.subscribe,
    () => getSnapshot(disputeId ?? null),
    () => [],
  )
}

