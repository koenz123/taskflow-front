import { useSyncExternalStore } from 'react'
import type { DisputeMessage } from '../model/disputeMessage'
import { disputeMessageRepo } from './disputeMessageRepo'
import { ApiError, api } from '@/shared/api/api'
import { sessionRepo } from '@/shared/auth/sessionRepo'

const STORAGE_KEY = 'ui-create-works.disputeMessages.v1'
const USE_API = import.meta.env.VITE_DATA_SOURCE === 'api'
const EMPTY: DisputeMessage[] = []

type Cache = {
  disputeId: string | null
  raw: string | null
  list: DisputeMessage[]
}

let cache: Cache = { disputeId: null, raw: null, list: [] }

// API store (per disputeId)
const apiSnapshotByDisputeId = new Map<string, DisputeMessage[]>()
const apiHasLoadedByDisputeId = new Map<string, boolean>()
const apiRefreshingByDisputeId = new Map<string, boolean>()
const inflightByDisputeId = new Map<string, Promise<void>>()
const subsByDisputeId = new Map<string, Set<() => void>>()
let apiLoadedForToken: string | null = null
let apiPollId: number | null = null

function sameList(a: DisputeMessage[], b: DisputeMessage[]) {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false
    if (a[i].createdAt !== b[i].createdAt) return false
    if (a[i].text !== b[i].text) return false
    if (a[i].kind !== b[i].kind) return false
  }
  return true
}

function notifyDispute(disputeId: string) {
  const subs = subsByDisputeId.get(disputeId)
  if (!subs) return
  for (const cb of subs) cb()
}

export async function fetchDisputeMessages(disputeId: string) {
  if (!USE_API) return
  const token = sessionRepo.getToken()
  if (apiLoadedForToken !== token) {
    apiLoadedForToken = token
    // invalidate all loaded flags
    apiHasLoadedByDisputeId.clear()
  }
  if (!token) {
    apiSnapshotByDisputeId.set(disputeId, EMPTY)
    apiHasLoadedByDisputeId.set(disputeId, true)
    notifyDispute(disputeId)
    return
  }
  if (apiHasLoadedByDisputeId.get(disputeId)) return
  if (apiRefreshingByDisputeId.get(disputeId)) return
  apiRefreshingByDisputeId.set(disputeId, true)

  const existingInflight = inflightByDisputeId.get(disputeId)
  if (existingInflight) return await existingInflight

  const p = (async () => {
    try {
      let next: DisputeMessage[]
      try {
        next = await api.get<DisputeMessage[]>(`/disputes/${encodeURIComponent(disputeId)}/messages`)
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          next = await api.get<DisputeMessage[]>(`/dispute-messages?disputeId=${encodeURIComponent(disputeId)}`)
        } else if (e instanceof ApiError && e.status === 403) {
          next = []
        } else {
          throw e
        }
      }
      const prev = apiSnapshotByDisputeId.get(disputeId) ?? []
      if (!sameList(prev, next)) {
        apiSnapshotByDisputeId.set(disputeId, next)
        notifyDispute(disputeId)
      }
      apiHasLoadedByDisputeId.set(disputeId, true)
    } catch {
      // keep previous; 403 is handled above with empty list + hasLoaded
    } finally {
      apiRefreshingByDisputeId.set(disputeId, false)
      inflightByDisputeId.delete(disputeId)
    }
  })()
  inflightByDisputeId.set(disputeId, p)
  return await p
}

export async function refreshDisputeMessages(disputeId: string) {
  if (!USE_API) return
  apiHasLoadedByDisputeId.set(disputeId, false)
  await fetchDisputeMessages(disputeId)
}

export async function postDisputeMessage(input: {
  disputeId: string
  text: string
  kind?: DisputeMessage['kind']
  attachments?: unknown[]
}) {
  if (!USE_API) throw new Error('not_api_mode')
  const token = sessionRepo.getToken()
  if (!token) throw new Error('unauthenticated')

  const body: any = { text: input.text }
  if (input.kind) body.kind = input.kind
  if (Array.isArray(input.attachments) && input.attachments.length) body.attachments = input.attachments

  try {
    await api.post(`/disputes/${encodeURIComponent(input.disputeId)}/messages`, body)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      await api.post(`/dispute-messages`, { disputeId: input.disputeId, ...body })
    } else {
      throw e
    }
  }

  await refreshDisputeMessages(input.disputeId)
}

function getLocalSnapshot(disputeId: string | null) {
  if (!disputeId) {
    if (cache.disputeId !== null || cache.raw !== null || cache.list.length) {
      cache = { disputeId: null, raw: null, list: [] }
    }
    return cache.list
  }
  const raw = localStorage.getItem(STORAGE_KEY)
  if (cache.disputeId === disputeId && cache.raw === raw) return cache.list
  const list = disputeMessageRepo
    .listForDispute(disputeId)
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  cache = { disputeId, raw, list }
  return list
}

export function useDisputeMessages(disputeId?: string | null) {
  const id = disputeId ?? null
  if (USE_API) {
    const subscribe = (cb: () => void) => {
      if (!id) return () => {}
      let set = subsByDisputeId.get(id)
      if (!set) {
        set = new Set()
        subsByDisputeId.set(id, set)
      }
      set.add(cb)
      void fetchDisputeMessages(id)
      const onSession = () => {
        void refreshDisputeMessages(id)
      }
      const onVisible = () => {
        if (document.visibilityState === 'visible' && id) void refreshDisputeMessages(id)
      }
      if (apiPollId === null && typeof window !== 'undefined') {
        apiPollId = window.setInterval(() => {
          if (document.visibilityState !== 'visible') return
          for (const key of subsByDisputeId.keys()) {
            void refreshDisputeMessages(key)
          }
        }, 3_000)
      }
      window.addEventListener('ui-create-works.session.change', onSession)
      window.addEventListener('storage', onSession)
      document.addEventListener('visibilitychange', onVisible)
      return () => {
        set!.delete(cb)
        if (set!.size === 0) subsByDisputeId.delete(id)
        if (subsByDisputeId.size === 0 && apiPollId !== null) {
          window.clearInterval(apiPollId)
          apiPollId = null
        }
        window.removeEventListener('ui-create-works.session.change', onSession)
        window.removeEventListener('storage', onSession)
        document.removeEventListener('visibilitychange', onVisible)
      }
    }
    const getSnapshot = () => (id ? apiSnapshotByDisputeId.get(id) ?? EMPTY : EMPTY)
    return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY)
  }

  return useSyncExternalStore(disputeMessageRepo.subscribe, () => getLocalSnapshot(id), () => [])
}

