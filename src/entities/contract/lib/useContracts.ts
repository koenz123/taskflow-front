import { useSyncExternalStore } from 'react'
import type { Contract } from '../model/contract'
import { contractRepo } from './contractRepo'

const STORAGE_KEY = 'ui-create-works.contracts.v1'

type Cache = {
  raw: string | null
  list: Contract[]
}

let cache: Cache = { raw: null, list: [] }

function getSnapshot() {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (cache.raw === raw) return cache.list
  const list = contractRepo.listAll()
  cache = { raw, list }
  return list
}

export function useContracts() {
  return useSyncExternalStore(contractRepo.subscribe, getSnapshot, getSnapshot)
}

