import { useSyncExternalStore } from 'react'
import { notificationRepo } from './notificationRepo'
import type { Notification } from '../model/notification'
import { api } from '@/shared/api/api'
import { sessionRepo } from '@/shared/auth/sessionRepo'

const CHANGE_EVENT = 'ui-create-works.notifications.change'
const STORAGE_KEY = 'ui-create-works.notifications.v1'
const USE_API = import.meta.env.VITE_DATA_SOURCE === 'api'

type Cache = {
  userId: string | null
  raw: string | null
  list: Notification[]
}

let cache: Cache = { userId: null, raw: null, list: [] }

let apiSnapshot: Notification[] = []
let apiStore: { subs: Set<() => void> } = { subs: new Set() }
let apiRefreshing = false
let apiHasLoaded = false
let apiLoadedForToken: string | null = null

export async function fetchNotifications() {
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
    apiSnapshot = await api.get<Notification[]>('/notifications')
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

function subscribe(onStoreChange: () => void) {
  const onChange = () => onStoreChange()
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

function getSnapshot(userId: string | null): Notification[] {
  if (!userId) {
    if (cache.userId !== null || cache.raw !== null || cache.list.length) {
      cache = { userId: null, raw: null, list: [] }
    }
    return cache.list
  }

  const raw = localStorage.getItem(STORAGE_KEY)
  if (cache.userId === userId && cache.raw === raw) return cache.list

  const list = notificationRepo.listForUser(userId)
  cache = { userId, raw, list }
  return list
}

export function useNotifications(userId?: string | null) {
  if (USE_API) {
    return useSyncExternalStore(subscribeApi, () => apiSnapshot, () => [])
  }
  return useSyncExternalStore(subscribe, () => getSnapshot(userId ?? null), () => [])
}

