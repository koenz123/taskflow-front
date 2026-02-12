import { useSyncExternalStore } from 'react'
import type { ExecutorViolation } from '../model/violation'
import { executorViolationRepo } from './executorViolationRepo'

const STORAGE_KEY = 'ui-create-works.executorViolations.v1'

type Cache = {
  executorId: string | null
  raw: string | null
  list: ExecutorViolation[]
}

let cache: Cache = { executorId: null, raw: null, list: [] }

function getSnapshot(executorId: string | null): ExecutorViolation[] {
  if (!executorId) {
    if (cache.executorId !== null || cache.raw !== null || cache.list.length) {
      cache = { executorId: null, raw: null, list: [] }
    }
    return cache.list
  }

  const raw = localStorage.getItem(STORAGE_KEY)
  if (cache.executorId === executorId && cache.raw === raw) return cache.list

  const list = executorViolationRepo.listForExecutor(executorId)
  cache = { executorId, raw, list }
  return list
}

export function useExecutorViolations(executorId?: string | null) {
  return useSyncExternalStore(
    executorViolationRepo.subscribe,
    () => getSnapshot(executorId ?? null),
    () => [],
  )
}

