import { useSyncExternalStore } from 'react'
import type { Contract } from '../model/contract'
import { contractRepo } from './contractRepo'
import { api } from '@/shared/api/api'
import { sessionRepo } from '@/shared/auth/sessionRepo'

const STORAGE_KEY = 'ui-create-works.contracts.v1'
const USE_API = import.meta.env.VITE_DATA_SOURCE === 'api'

type Cache = {
  raw: string | null
  list: Contract[]
}

let cache: Cache = { raw: null, list: [] }

let apiSnapshot: Contract[] = []
let apiStore: { subs: Set<() => void> } = { subs: new Set() }
let apiRefreshing = false
let apiHasLoaded = false
let apiLoadedForToken: string | null = null

function sameList(a: Contract[], b: Contract[]) {
  if (a === b) return true
  if (a.length !== b.length) return false
  if (a.length === 0) return true
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false
    if (a[i].updatedAt !== b[i].updatedAt) return false
  }
  return true
}

export async function fetchContracts() {
  if (!USE_API) return
  const token = sessionRepo.getToken()
  // Token changed (login/logout) => treat as not loaded.
  if (apiLoadedForToken !== token) {
    apiLoadedForToken = token
    apiHasLoaded = false
  }
  if (apiHasLoaded) return
  if (apiRefreshing) return
  apiRefreshing = true
  if (!token) {
    apiSnapshot = []
    apiHasLoaded = true
    for (const cb of apiStore.subs) cb()
    apiRefreshing = false
    return
  }
  try {
    const next = await api.get<Contract[]>('/contracts')
    if (!sameList(apiSnapshot, next)) apiSnapshot = next
    apiHasLoaded = true
  } catch {
    // keep previous
  }
  apiRefreshing = false
  for (const cb of apiStore.subs) cb()
}

function subscribeApi(cb: () => void) {
  apiStore.subs.add(cb)
  return () => {
    apiStore.subs.delete(cb)
  }
}

function getSnapshot() {
  if (USE_API) return apiSnapshot
  const raw = localStorage.getItem(STORAGE_KEY)
  if (cache.raw === raw) return cache.list
  const list = contractRepo.listAll()
  cache = { raw, list }
  return list
}

export function useContracts() {
  if (USE_API) {
    return useSyncExternalStore(subscribeApi, getSnapshot, getSnapshot)
  }
  return useSyncExternalStore(contractRepo.subscribe, getSnapshot, getSnapshot)
}

