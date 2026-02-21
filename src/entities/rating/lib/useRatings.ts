import { useSyncExternalStore } from 'react'
import type { Rating } from '../model/rating'
import { ratingRepo } from './ratingRepo'
import { ApiError, api } from '@/shared/api/api'
import { sessionRepo } from '@/shared/auth/sessionRepo'

const STORAGE_KEY = 'ui-create-works.ratings.v1'
const USE_API = import.meta.env.VITE_DATA_SOURCE === 'api'

type Cache = {
  raw: string | null
  list: Rating[]
}

let cache: Cache = { raw: null, list: [] }

let apiSnapshot: Rating[] = []
let apiStore: { subs: Set<() => void> } = { subs: new Set() }
let apiRefreshing = false
let apiHasLoaded = false
let apiLoadedForToken: string | null = null
let apiPollId: number | null = null

function notifyApi() {
  for (const cb of apiStore.subs) cb()
}

function sameList(a: Rating[], b: Rating[]) {
  if (a === b) return true
  if (a.length !== b.length) return false
  if (a.length === 0) return true
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false
    if (a[i].createdAt !== b[i].createdAt) return false
    if (a[i].rating !== b[i].rating) return false
    if (a[i].comment !== b[i].comment) return false
    if (a[i].contractId !== b[i].contractId) return false
    if (a[i].fromUserId !== b[i].fromUserId) return false
    if (a[i].toUserId !== b[i].toUserId) return false
  }
  return true
}

export async function fetchRatings() {
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
    let next: Rating[]
    try {
      next = await api.get<Rating[]>('/ratings')
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        next = await api.get<Rating[]>('/reviews')
      } else {
        throw e
      }
    }
    if (!sameList(apiSnapshot, next)) apiSnapshot = next
    apiHasLoaded = true
  } catch {
    // keep previous
  }
  apiRefreshing = false
  notifyApi()
}

export async function refreshRatings() {
  if (!USE_API) return
  apiHasLoaded = false
  await fetchRatings()
}

export async function createRatingApi(input: {
  contractId: string
  toUserId: string
  rating: number
  comment?: string
}) {
  if (!USE_API) throw new Error('not_api_mode')
  const token = sessionRepo.getToken()
  if (!token) throw new Error('unauthenticated')

  const body: any = {
    contractId: input.contractId,
    toUserId: input.toUserId,
    rating: input.rating,
  }
  if (typeof input.comment === 'string' && input.comment.trim()) body.comment = input.comment.trim()

  const attempts: Array<() => Promise<unknown>> = [
    () => api.post('/ratings', body),
    () => api.post('/reviews', body),
    () =>
      api.post(`/contracts/${encodeURIComponent(input.contractId)}/rating`, {
        rating: input.rating,
        comment: body.comment,
        toUserId: input.toUserId,
      }),
    () =>
      api.post(`/contracts/${encodeURIComponent(input.contractId)}/rate`, {
        rating: input.rating,
        comment: body.comment,
        toUserId: input.toUserId,
      }),
  ]

  let lastErr: unknown = null
  for (const run of attempts) {
    try {
      const created = await run()
      await refreshRatings()
      return created as any
    } catch (e) {
      lastErr = e
      if (e instanceof ApiError && e.status === 404) continue
      throw e
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('ratings_endpoint_not_found')
}

function subscribeApi(cb: () => void) {
  apiStore.subs.add(cb)
  void fetchRatings()
  const onSession = () => {
    void refreshRatings()
  }
  if (apiPollId === null && typeof window !== 'undefined') {
    apiPollId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void refreshRatings()
    }, 30_000)
  }
  window.addEventListener('ui-create-works.session.change', onSession)
  window.addEventListener('storage', onSession)
  return () => {
    apiStore.subs.delete(cb)
    if (apiStore.subs.size === 0 && apiPollId !== null) {
      window.clearInterval(apiPollId)
      apiPollId = null
    }
    window.removeEventListener('ui-create-works.session.change', onSession)
    window.removeEventListener('storage', onSession)
  }
}

function getLocalSnapshot() {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (cache.raw === raw) return cache.list
  const list = ratingRepo.listAll()
  cache = { raw, list }
  return list
}

export function useRatings() {
  if (USE_API) return useSyncExternalStore(subscribeApi, () => apiSnapshot, () => [])
  return useSyncExternalStore(ratingRepo.subscribe, getLocalSnapshot, getLocalSnapshot)
}

