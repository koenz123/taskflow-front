import { useSyncExternalStore } from 'react'
import { notificationRepo } from './notificationRepo'
import type { Notification } from '../model/notification'

const CHANGE_EVENT = 'ui-create-works.notifications.change'
const STORAGE_KEY = 'ui-create-works.notifications.v1'

type Cache = {
  userId: string | null
  raw: string | null
  list: Notification[]
}

let cache: Cache = { userId: null, raw: null, list: [] }

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
  return useSyncExternalStore(subscribe, () => getSnapshot(userId ?? null), () => [])
}

