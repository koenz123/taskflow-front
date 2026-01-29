import { useSyncExternalStore } from 'react'
import type { User } from '../model/user'
import { userRepo } from './userRepo'

const EVENT_NAME = 'ui-create-works.users.change'

let cachedSnapshot: User[] | null = null

function subscribe(callback: () => void) {
  const handler = () => {
    cachedSnapshot = userRepo.list()
    callback()
  }

  window.addEventListener(EVENT_NAME, handler)
  const onStorage = (e: StorageEvent) => {
    if (e.key === 'ui-create-works.users.v1') handler()
  }
  window.addEventListener('storage', onStorage)

  return () => {
    window.removeEventListener(EVENT_NAME, handler)
    window.removeEventListener('storage', onStorage)
  }
}

function getSnapshot() {
  if (!cachedSnapshot) cachedSnapshot = userRepo.list()
  return cachedSnapshot
}

export function useUsers() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

