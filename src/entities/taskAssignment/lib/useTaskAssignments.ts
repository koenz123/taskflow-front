import { useSyncExternalStore } from 'react'
import type { TaskAssignment } from '../model/taskAssignment'
import { taskAssignmentRepo } from './taskAssignmentRepo'
import { api } from '@/shared/api/api'
import { sessionRepo } from '@/shared/auth/sessionRepo'

const STORAGE_KEY = 'ui-create-works.taskAssignments.v1'
const USE_API = import.meta.env.VITE_DATA_SOURCE === 'api'

type Cache = {
  raw: string | null
  list: TaskAssignment[]
}

let cache: Cache = { raw: null, list: [] }

let apiSnapshot: TaskAssignment[] = []
let apiStore: { subs: Set<() => void> } = { subs: new Set() }
let apiRefreshing = false
let apiHasLoaded = false
let apiLoadedForToken: string | null = null
let apiPollId: number | null = null

function notifyApi() {
  for (const cb of apiStore.subs) cb()
}

function sameList(a: TaskAssignment[], b: TaskAssignment[]) {
  if (a === b) return true
  if (a.length !== b.length) return false
  if (a.length === 0) return true
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false
    // updatedAt doesn't exist here; rely on the record identity fields likely to change.
    if (a[i].status !== b[i].status) return false
    if (a[i].submittedAt !== b[i].submittedAt) return false
    if (a[i].acceptedAt !== b[i].acceptedAt) return false
    if (a[i].pausedUntil !== b[i].pausedUntil) return false
    if (a[i].executionDeadlineAt !== b[i].executionDeadlineAt) return false
  }
  return true
}

export async function fetchAssignments() {
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
    notifyApi()
    apiRefreshing = false
    return
  }
  try {
    const next = await api.get<TaskAssignment[]>('/assignments')
    if (!sameList(apiSnapshot, next)) apiSnapshot = next
    apiHasLoaded = true
  } catch {
    // keep previous
  }
  apiRefreshing = false
  notifyApi()
}

export async function refreshAssignments() {
  if (!USE_API) return
  apiHasLoaded = false
  await fetchAssignments()
}

function subscribeApi(cb: () => void) {
  apiStore.subs.add(cb)
  void fetchAssignments()
  const onSession = () => {
    void refreshAssignments()
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') void refreshAssignments()
  }
  if (apiPollId === null && typeof window !== 'undefined') {
    apiPollId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void refreshAssignments()
    }, 3_000)
  }
  window.addEventListener('ui-create-works.session.change', onSession)
  window.addEventListener('storage', onSession)
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    apiStore.subs.delete(cb)
    if (apiStore.subs.size === 0 && apiPollId !== null) {
      window.clearInterval(apiPollId)
      apiPollId = null
    }
    window.removeEventListener('ui-create-works.session.change', onSession)
    window.removeEventListener('storage', onSession)
    document.removeEventListener('visibilitychange', onVisible)
  }
}

function getSnapshot() {
  if (USE_API) return apiSnapshot
  const raw = localStorage.getItem(STORAGE_KEY)
  if (cache.raw === raw) return cache.list
  const list = taskAssignmentRepo.listAll()
  cache = { raw, list }
  return list
}

export function useTaskAssignments() {
  if (USE_API) {
    return useSyncExternalStore(subscribeApi, getSnapshot, getSnapshot)
  }
  return useSyncExternalStore(taskAssignmentRepo.subscribe, getSnapshot, getSnapshot)
}

