import { useSyncExternalStore } from 'react'
import type { TaskAssignment } from '../model/taskAssignment'
import { taskAssignmentRepo } from './taskAssignmentRepo'

const STORAGE_KEY = 'ui-create-works.taskAssignments.v1'

type Cache = {
  raw: string | null
  list: TaskAssignment[]
}

let cache: Cache = { raw: null, list: [] }

function getSnapshot() {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (cache.raw === raw) return cache.list
  const list = taskAssignmentRepo.listAll()
  cache = { raw, list }
  return list
}

export function useTaskAssignments() {
  return useSyncExternalStore(taskAssignmentRepo.subscribe, getSnapshot, getSnapshot)
}

