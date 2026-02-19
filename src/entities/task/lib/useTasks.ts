import { useSyncExternalStore } from 'react'
import type { Task } from '../model/task'
import { taskRepo } from './taskRepo'
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
  if (!token) {
    apiSnapshot = []
    apiHasLoaded = true
    apiRefreshing = false
    for (const cb of apiStore.subs) cb()
    return
  }
  try {
    apiSnapshot = await api.get<Task[]>('/tasks')
    apiHasLoaded = true
  } catch {
    // keep previous snapshot on transient errors
  }
  apiRefreshing = false
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
    window.addEventListener('ui-create-works.session.change', onSession)
    window.addEventListener('storage', onSession)
    return () => {
      apiStore.subs.delete(callback)
      window.removeEventListener('ui-create-works.session.change', onSession)
      window.removeEventListener('storage', onSession)
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

