import { useSyncExternalStore } from 'react'

const KEY = 'ui-create-works.dev.deleteAnyTasks'
const EVENT_NAME = 'ui-create-works.dev.change'

function readFlag() {
  return localStorage.getItem(KEY) === '1'
}

function subscribe(callback: () => void) {
  const handler = () => callback()
  window.addEventListener(EVENT_NAME, handler)
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) callback()
  }
  window.addEventListener('storage', onStorage)

  return () => {
    window.removeEventListener(EVENT_NAME, handler)
    window.removeEventListener('storage', onStorage)
  }
}

function getSnapshot() {
  return readFlag()
}

export function useDevDeleteAnyTasksEnabled() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function setDevDeleteAnyTasksEnabled(enabled: boolean) {
  if (enabled) localStorage.setItem(KEY, '1')
  else localStorage.removeItem(KEY)
  window.dispatchEvent(new Event(EVENT_NAME))
}

