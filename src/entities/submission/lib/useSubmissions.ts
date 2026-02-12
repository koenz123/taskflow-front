import { useSyncExternalStore } from 'react'
import type { Submission } from '../model/submission'
import { submissionRepo } from './submissionRepo'

const STORAGE_KEY = 'ui-create-works.submissions.v1'

type Cache = {
  raw: string | null
  list: Submission[]
}

let cache: Cache = { raw: null, list: [] }

function getSnapshot() {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (cache.raw === raw) return cache.list
  const list = submissionRepo.listAll()
  cache = { raw, list }
  return list
}

export function useSubmissions() {
  return useSyncExternalStore(submissionRepo.subscribe, getSnapshot, getSnapshot)
}

