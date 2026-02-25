import { useSyncExternalStore } from 'react'
import type { Contract } from '../model/contract'
import { contractRepo, normalizeContract } from './contractRepo'
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
let apiPollId: number | null = null

function notifyApi() {
  for (const cb of apiStore.subs) cb()
}

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
    notifyApi()
    apiRefreshing = false
    return
  }
  try {
    const raw = await api.get<unknown>('/contracts')
    let next: Contract[] = Array.isArray(raw)
      ? (raw as unknown[]).map((x) => normalizeContract(x)).filter((c): c is Contract => c != null)
      : []
    // Keep contracts from current snapshot not in API response (e.g. arbiter viewing dispute, GET /contracts returns [] or filtered)
    for (const c of apiSnapshot) {
      if (!next.some((x) => x.id === c.id)) next.push(c)
    }
    if (!sameList(apiSnapshot, next)) {
      apiSnapshot = next
      notifyApi()
    }
    apiHasLoaded = true
  } catch {
    // keep previous
  }
  apiRefreshing = false
}

export async function refreshContracts() {
  if (!USE_API) return
  apiHasLoaded = false
  await fetchContracts()
}

/** Load a single contract by ID (e.g. for arbiter when list is empty). Merges into api snapshot. */
export async function fetchContractById(contractId: string): Promise<Contract | null> {
  if (!USE_API || !contractId?.trim()) return null
  const token = sessionRepo.getToken()
  if (!token) return null
  try {
    const raw = await api.get<unknown>(`/contracts/${encodeURIComponent(contractId)}`)
    const c = normalizeContract(raw)
    if (!c) return null
    if (!apiSnapshot.some((x) => x.id === c.id)) {
      apiSnapshot = [...apiSnapshot, c]
      notifyApi()
    }
    return c
  } catch {
    return null
  }
}

function subscribeApi(cb: () => void) {
  apiStore.subs.add(cb)
  void fetchContracts()
  const onSession = () => {
    void refreshContracts()
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') void refreshContracts()
  }
  if (apiPollId === null && typeof window !== 'undefined') {
    apiPollId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void refreshContracts()
    }, 3_000)
  }
  window.addEventListener('ui-create-works.session.change', onSession)
  window.addEventListener('storage', onSession)
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    apiStore.subs.delete(cb)
    if (apiStore.subs.size === 0 && apiPollId !== null) {
      window.clearInterval(apiPollId)
      apiPollId = null
    }
    window.removeEventListener('ui-create-works.session.change', onSession)
    window.removeEventListener('storage', onSession)
    document.removeEventListener('visibilitychange', onVisible)
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

