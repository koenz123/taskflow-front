import { useSyncExternalStore } from 'react'
import type { Task } from '../model/task'
import { taskRepo } from './taskRepo'

const EVENT_NAME = 'ui-create-works.tasks.change'

let cachedSnapshot: Task[] | null = null

function subscribe(callback: () => void) {
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
  if (!cachedSnapshot) cachedSnapshot = taskRepo.list()
  return cachedSnapshot
}

export function useTasks() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

