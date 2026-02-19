import { useSyncExternalStore } from 'react'
import { applicationRepo } from './applicationRepo'
import type { TaskApplication } from '../model/application'
import { api } from '@/shared/api/api'
import { sessionRepo } from '@/shared/auth/sessionRepo'

const STORAGE_KEY = 'ui-create-works.taskApplications.v1'
const USE_API = import.meta.env.VITE_DATA_SOURCE === 'api'

type Cache = {
  raw: string | null
  list: TaskApplication[]
}

let cache: Cache = { raw: null, list: [] }

let apiSnapshot: TaskApplication[] = []
let apiStore: { subs: Set<() => void> } = { subs: new Set() }
let apiRefreshing = false
let apiHasLoaded = false
let apiLoadedForToken: string | null = null

function notifyApi() {
  for (const cb of apiStore.subs) cb()
}

function sameList(a: TaskApplication[], b: TaskApplication[]) {
  if (a === b) return true
  if (a.length !== b.length) return false
  if (a.length === 0) return true
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false
    if (a[i].updatedAt !== b[i].updatedAt) return false
  }
  return true
}

export async function fetchApplications() {
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
    notifyApi()
    apiRefreshing = false
    return
  }
  try {
    const next = await api.get<TaskApplication[]>('/applications')
    if (!sameList(apiSnapshot, next)) apiSnapshot = next
    apiHasLoaded = true
  } catch {
    // keep previous
  }
  apiRefreshing = false
  notifyApi()
}

export async function refreshApplications() {
  if (!USE_API) return
  apiHasLoaded = false
  await fetchApplications()
}

export async function fetchApplicationsForTask(taskId: string) {
  if (!USE_API) return []
  const token = sessionRepo.getToken()
  if (!token) return []
  const next = await api.get<TaskApplication[]>(`/applications?taskId=${encodeURIComponent(taskId)}`)
  // Merge: replace apps for this task with server list, keep other tasks intact.
  const keep = apiSnapshot.filter((a) => a.taskId !== taskId)
  apiSnapshot = keep.concat(next)
  apiHasLoaded = true
  notifyApi()
  return next
}

export function upsertApplication(app: TaskApplication) {
  if (!USE_API) return
  const idx = apiSnapshot.findIndex((x) => x.id === app.id)
  if (idx === -1) apiSnapshot = apiSnapshot.concat([app])
  else {
    const copy = apiSnapshot.slice()
    copy[idx] = app
    apiSnapshot = copy
  }
  apiHasLoaded = true
  notifyApi()
}

function subscribeApi(cb: () => void) {
  apiStore.subs.add(cb)
  void fetchApplications()
  const onSession = () => {
    void refreshApplications()
  }
  window.addEventListener('ui-create-works.session.change', onSession)
  window.addEventListener('storage', onSession)
  return () => {
    apiStore.subs.delete(cb)
    window.removeEventListener('ui-create-works.session.change', onSession)
    window.removeEventListener('storage', onSession)
  }
}

function getSnapshot() {
  if (USE_API) return apiSnapshot
  const raw = localStorage.getItem(STORAGE_KEY)
  if (cache.raw === raw) return cache.list
  const list = applicationRepo.listAll()
  cache = { raw, list }
  return list
}

export function useApplications() {
  if (USE_API) {
    return useSyncExternalStore(subscribeApi, getSnapshot, getSnapshot)
  }
  return useSyncExternalStore(applicationRepo.subscribe, getSnapshot, getSnapshot)
}
