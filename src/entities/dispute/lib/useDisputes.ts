import { useSyncExternalStore } from 'react'
import type { Dispute } from '../model/dispute'
import { disputeRepo } from './disputeRepo'

const STORAGE_KEY = 'ui-create-works.disputes.v1'

type Cache = {
  raw: string | null
  list: Dispute[]
}

let cache: Cache = { raw: null, list: [] }

function getSnapshot() {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (cache.raw === raw) return cache.list
  const list = disputeRepo.listAll()
  cache = { raw, list }
  return list
}

export function useDisputes() {
  return useSyncExternalStore(disputeRepo.subscribe, getSnapshot, getSnapshot)
}

