import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'ui-create-works.devMode.v1'
const EVENT_NAME = 'ui-create-works.devMode.change'

let cachedValue: boolean | null = null

function read(): boolean {
  return localStorage.getItem(STORAGE_KEY) === '1'
}

function write(next: boolean) {
  localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
  cachedValue = next
  window.dispatchEvent(new Event(EVENT_NAME))
}

function subscribe(callback: () => void) {
  const handler = () => {
    cachedValue = read()
    callback()
  }
  window.addEventListener(EVENT_NAME, handler)
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) handler()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(EVENT_NAME, handler)
    window.removeEventListener('storage', onStorage)
  }
}

function getSnapshot() {
  if (cachedValue === null) cachedValue = read()
  return cachedValue
}

export function useDevMode() {
  const enabled = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return { enabled, setEnabled: write }
}

