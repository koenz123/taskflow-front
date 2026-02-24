import { useSyncExternalStore } from 'react'
import type { Task } from '../model/task'
import { normalizeTask, taskRepo } from './taskRepo'
import { api } from '@/shared/api/api'
import { sessionRepo } from '@/shared/auth/sessionRepo'

const EVENT_NAME = 'ui-create-works.tasks.change'

let cachedSnapshot: Task[] | null = null
const USE_API = import.meta.env.VITE_DATA_SOURCE === 'api'

let apiSnapshot: Task[] = []
let apiStore: { subs: Set<() => void> } = { subs: new Set() }
let apiRefreshing = false
let apiHasLoaded = false
let apiLoadedForToken: string | null = null
let apiPollId: ReturnType<typeof setInterval> | null = null

const POLL_MS = 3_000 // обновление списка заданий без перезагрузки страницы

const LOCAL_META = { loaded: true, refreshing: false }
let apiMetaSnapshot = { loaded: false, refreshing: false }

export async function fetchTasks() {
  if (!USE_API) return
  const token = sessionRepo.getToken()
  if (apiLoadedForToken !== token) {
    apiLoadedForToken = token
    apiHasLoaded = false
  }
  if (apiHasLoaded) return
  if (apiRefreshing) return
  apiRefreshing = true
  apiMetaSnapshot = apiMetaSnapshot.refreshing ? apiMetaSnapshot : { loaded: apiHasLoaded, refreshing: true }
  if (!token) {
    apiSnapshot = []
    apiHasLoaded = true
    apiRefreshing = false
    apiMetaSnapshot = { loaded: true, refreshing: false }
    for (const cb of apiStore.subs) cb()
    return
  }
  try {
    const raw = await api.get<unknown>('/tasks')
    const list = Array.isArray(raw) ? raw : []
    apiSnapshot = list
      .map((item) => {
        // Safety: do not fabricate ids for API tasks — drop malformed items.
        if (!item || typeof item !== 'object') return null
        const id = (item as any).id
        if (typeof id !== 'string' || !id.trim()) return null
        return normalizeTask(item)
      })
      .filter(Boolean) as Task[]
    apiHasLoaded = true
  } catch {
    // keep previous snapshot on transient errors
  }
  apiRefreshing = false
  apiMetaSnapshot =
    apiMetaSnapshot.loaded === apiHasLoaded && apiMetaSnapshot.refreshing === apiRefreshing
      ? apiMetaSnapshot
      : { loaded: apiHasLoaded, refreshing: apiRefreshing }
  for (const cb of apiStore.subs) cb()
}

export async function refreshTasks() {
  if (!USE_API) return
  apiHasLoaded = false
  await fetchTasks()
}

function subscribe(callback: () => void) {
  if (USE_API) {
    apiStore.subs.add(callback)
    void fetchTasks()
    const onSession = () => {
      void refreshTasks()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshTasks()
    }
    if (apiPollId === null && typeof window !== 'undefined') {
      apiPollId = window.setInterval(() => {
        if (document.visibilityState !== 'visible') return
        void refreshTasks()
      }, POLL_MS)
    }
    window.addEventListener('ui-create-works.session.change', onSession)
    window.addEventListener('storage', onSession)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      apiStore.subs.delete(callback)
      if (apiStore.subs.size === 0 && apiPollId !== null) {
        clearInterval(apiPollId)
        apiPollId = null
      }
      window.removeEventListener('ui-create-works.session.change', onSession)
      window.removeEventListener('storage', onSession)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }

  const handler = () => {
    cachedSnapshot = taskRepo.list()
    callback()
  }

  window.addEventListener(EVENT_NAME, handler)

  // Keep in sync across tabs/windows.
  const onStorage = (e: StorageEvent) => {
    if (e.key === 'ui-create-works.tasks.v2') handler()
  }
  window.addEventListener('storage', onStorage)

  return () => {
    window.removeEventListener(EVENT_NAME, handler)
    window.removeEventListener('storage', onStorage)
  }
}

function getSnapshot(): Task[] {
  if (USE_API) return apiSnapshot
  if (!cachedSnapshot) cachedSnapshot = taskRepo.list()
  return cachedSnapshot
}

export function useTasks() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

function getMetaSnapshot() {
  // IMPORTANT: snapshot must be referentially stable when values didn't change,
  // otherwise React can get stuck in a render loop.
  if (!USE_API) return LOCAL_META
  if (apiMetaSnapshot.loaded === apiHasLoaded && apiMetaSnapshot.refreshing === apiRefreshing) return apiMetaSnapshot
  apiMetaSnapshot = { loaded: apiHasLoaded, refreshing: apiRefreshing }
  return apiMetaSnapshot
}

export function useTasksMeta() {
  return useSyncExternalStore(subscribe, getMetaSnapshot, getMetaSnapshot)
}

