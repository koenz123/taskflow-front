import { useSyncExternalStore } from 'react'
import type { DisputeMessage } from '../model/disputeMessage'
import { disputeMessageRepo } from './disputeMessageRepo'

const STORAGE_KEY = 'ui-create-works.disputeMessages.v1'

type Cache = {
  raw: string | null
  list: DisputeMessage[]
}

let cache: Cache = { raw: null, list: [] }

function getSnapshot(): DisputeMessage[] {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (cache.raw === raw) return cache.list
  const list = (() => {
    try {
      const parsed = JSON.parse(raw ?? '[]') as unknown
      if (!Array.isArray(parsed)) return [] as DisputeMessage[]
      return parsed as DisputeMessage[]
    } catch {
      return [] as DisputeMessage[]
    }
  })()
  cache = { raw, list }
  return list
}

export function useAllDisputeMessages() {
  return useSyncExternalStore(disputeMessageRepo.subscribe, getSnapshot, () => [])
}

