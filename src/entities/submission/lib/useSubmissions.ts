import { useSyncExternalStore } from 'react'
import type { Submission } from '../model/submission'
import { submissionRepo } from './submissionRepo'
import { api } from '@/shared/api/api'
import { sessionRepo } from '@/shared/auth/sessionRepo'

const STORAGE_KEY = 'ui-create-works.submissions.v1'
const USE_API = import.meta.env.VITE_DATA_SOURCE === 'api'

type Cache = {
  raw: string | null
  list: Submission[]
}

let cache: Cache = { raw: null, list: [] }

let apiSnapshot: Submission[] = []
let apiStore: { subs: Set<() => void> } = { subs: new Set() }
let apiRefreshing = false
let apiHasLoaded = false
let apiLoadedForToken: string | null = null

export async function fetchSubmissions() {
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
    for (const cb of apiStore.subs) cb()
    apiRefreshing = false
    return
  }
  try {
    apiSnapshot = await api.get<Submission[]>('/submissions')
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
  const list = submissionRepo.listAll()
  cache = { raw, list }
  return list
}

export function useSubmissions() {
  if (USE_API) {
    return useSyncExternalStore(subscribeApi, getSnapshot, getSnapshot)
  }
  return useSyncExternalStore(submissionRepo.subscribe, getSnapshot, getSnapshot)
}

