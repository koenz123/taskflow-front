import { useSyncExternalStore } from 'react'
import { applicationRepo } from './applicationRepo'
import type { TaskApplication } from '../model/application'

const STORAGE_KEY = 'ui-create-works.taskApplications.v1'

type Cache = {
  raw: string | null
  list: TaskApplication[]
}

let cache: Cache = { raw: null, list: [] }

function getSnapshot() {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (cache.raw === raw) return cache.list
  const list = applicationRepo.listAll()
  cache = { raw, list }
  return list
}

export function useApplications() {
  return useSyncExternalStore(applicationRepo.subscribe, getSnapshot, getSnapshot)
}
