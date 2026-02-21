import { useSyncExternalStore } from 'react'
import type { Dispute } from '../model/dispute'
import { disputeRepo } from './disputeRepo'
import { api } from '@/shared/api/api'
import { sessionRepo } from '@/shared/auth/sessionRepo'

const STORAGE_KEY = 'ui-create-works.disputes.v1'
const USE_API = import.meta.env.VITE_DATA_SOURCE === 'api'

type Cache = {
  raw: string | null
  list: Dispute[]
}

let cache: Cache = { raw: null, list: [] }

let apiSnapshot: Dispute[] = []
let apiStore: { subs: Set<() => void> } = { subs: new Set() }
let apiRefreshing = false
let apiHasLoaded = false
let apiLoadedForToken: string | null = null
let apiPollId: number | null = null

function notifyApi() {
  for (const cb of apiStore.subs) cb()
}

function sameList(a: Dispute[], b: Dispute[]) {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false
    if (a[i].updatedAt !== b[i].updatedAt) return false
    if (a[i].status !== b[i].status) return false
    if ((a[i].version ?? 0) !== (b[i].version ?? 0)) return false
  }
  return true
}

export async function fetchDisputes() {
  if (!USE_API) return
  const token = sessionRepo.getToken()
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
    apiRefreshing = false
    notifyApi()
    return
  }
  try {
    const next = await api.get<Dispute[]>('/disputes')
    if (!sameList(apiSnapshot, next)) apiSnapshot = next
    apiHasLoaded = true
  } catch {
    // keep previous
  }
  apiRefreshing = false
  notifyApi()
}

export async function refreshDisputes() {
  if (!USE_API) return
  apiHasLoaded = false
  await fetchDisputes()
}

function subscribeApi(cb: () => void) {
  apiStore.subs.add(cb)
  void fetchDisputes()
  const onSession = () => {
    void refreshDisputes()
  }
  if (apiPollId === null && typeof window !== 'undefined') {
    apiPollId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void refreshDisputes()
    }, 30_000)
  }
  window.addEventListener('ui-create-works.session.change', onSession)
  window.addEventListener('storage', onSession)
  return () => {
    apiStore.subs.delete(cb)
    if (apiStore.subs.size === 0 && apiPollId !== null) {
      window.clearInterval(apiPollId)
      apiPollId = null
    }
    window.removeEventListener('ui-create-works.session.change', onSession)
    window.removeEventListener('storage', onSession)
  }
}

function getSnapshot() {
  if (USE_API) return apiSnapshot
  const raw = localStorage.getItem(STORAGE_KEY)
  if (cache.raw === raw) return cache.list
  const list = disputeRepo.listAll()
  cache = { raw, list }
  return list
}

export function useDisputes() {
  if (USE_API) return useSyncExternalStore(subscribeApi, getSnapshot, getSnapshot)
  return useSyncExternalStore(disputeRepo.subscribe, getSnapshot, getSnapshot)
}

