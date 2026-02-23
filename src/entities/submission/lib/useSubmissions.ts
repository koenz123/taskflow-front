import { useSyncExternalStore } from 'react'
import type { Submission } from '../model/submission'
import { submissionRepo } from './submissionRepo'
import { ApiError, api } from '@/shared/api/api'
import { sessionRepo } from '@/shared/auth/sessionRepo'

const STORAGE_KEY = 'ui-create-works.submissions.v1'
const USE_API = import.meta.env.VITE_DATA_SOURCE === 'api'

type Cache = {
  raw: string | null
  list: Submission[]
}

let cache: Cache = { raw: null, list: [] }

let apiSnapshot: Submission[] = []
let apiStore: { subs: Set<() => void> } = { subs: new Set() }
let apiRefreshing = false
let apiHasLoaded = false
let apiLoadedForToken: string | null = null

function notifyApi() {
  for (const cb of apiStore.subs) cb()
}

export async function fetchSubmissions() {
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
    apiRefreshing = false
    notifyApi()
    return
  }
  try {
    const raw = await api.get<any>('/submissions')
    const list = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : Array.isArray(raw?.data) ? raw.data : []
    apiSnapshot = (list as unknown[]).map((x) => submissionRepo.normalize(x)).filter(Boolean) as Submission[]
    apiHasLoaded = true
  } catch {
    // keep previous
  }
  apiRefreshing = false
  notifyApi()
}

export async function refreshSubmissions() {
  if (!USE_API) return
  apiHasLoaded = false
  await fetchSubmissions()
}

export async function createSubmissionApi(input: { contractId: string; message?: string; files: Submission['files'] }) {
  if (!USE_API) return null as Submission | null
  const token = sessionRepo.getToken()
  if (!token) throw new Error('unauthenticated')

  const body = { message: input.message?.trim() || undefined, files: input.files }

  const attempts: Array<() => Promise<unknown>> = [
    // original contract-scoped route (may not exist on prod)
    () => api.post(`/contracts/${input.contractId}/submissions`, body),
    // flat route variant
    () => api.post(`/submissions`, { contractId: input.contractId, ...body }),
    // alternative nesting
    () => api.post(`/submissions`, { contractId: input.contractId, submission: body }),
    // another common alias
    () => api.post(`/contracts/${input.contractId}/submit`, body),
  ]

  let lastErr: unknown = null
  for (const run of attempts) {
    try {
      const raw = await run()
      const s =
        submissionRepo.normalize(raw) ??
        submissionRepo.normalize((raw as any)?.submission) ??
        submissionRepo.normalize((raw as any)?.data) ??
        submissionRepo.normalize((raw as any)?.result)
      if (s) {
        apiSnapshot = apiSnapshot.concat([s])
        apiHasLoaded = true
        notifyApi()
      } else {
        // still refresh so UI updates
        await refreshSubmissions()
      }
      return s
    } catch (e) {
      lastErr = e
      if (e instanceof ApiError && e.status === 404) continue
      throw e
    }
  }
  if (lastErr) throw lastErr
  return null
}

function subscribeApi(cb: () => void) {
  apiStore.subs.add(cb)
  void fetchSubmissions()
  const onSession = () => {
    void refreshSubmissions()
  }
  window.addEventListener('ui-create-works.session.change', onSession)
  window.addEventListener('storage', onSession)
  return () => {
    apiStore.subs.delete(cb)
    window.removeEventListener('ui-create-works.session.change', onSession)
    window.removeEventListener('storage', onSession)
  }
}

function getSnapshot() {
  if (USE_API) return apiSnapshot
  const raw = localStorage.getItem(STORAGE_KEY)
  if (cache.raw === raw) return cache.list
  const list = submissionRepo.listAll()
  cache = { raw, list }
  return list
}

export function useSubmissions() {
  if (USE_API) {
    return useSyncExternalStore(subscribeApi, getSnapshot, getSnapshot)
  }
  return useSyncExternalStore(submissionRepo.subscribe, getSnapshot, getSnapshot)
}

