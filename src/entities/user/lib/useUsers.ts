import { useSyncExternalStore } from 'react'
import type { User } from '../model/user'
import { userRepo } from './userRepo'
import { ApiError, api } from '@/shared/api/api'
import { sessionRepo } from '@/shared/auth/sessionRepo'

const EVENT_NAME = 'ui-create-works.users.change'
const USE_API = import.meta.env.VITE_DATA_SOURCE === 'api'

let cachedSnapshot: User[] | null = null

const inflightById = new Map<string, Promise<User | null>>()
const failedUntilById = new Map<string, number>()
let lastToken: string | null = null

export async function fetchUserById(userId: string): Promise<User | null> {
  const id = String(userId || '').trim()
  if (!id) return null
  const existing = userRepo.getById(id)
  if (!USE_API) return existing
  if (existing) return existing
  const token = sessionRepo.getToken()
  if (lastToken !== token) {
    lastToken = token
    failedUntilById.clear()
  }
  if (!token) return null

  const failedUntil = failedUntilById.get(id) ?? 0
  if (failedUntil > Date.now()) return null

  const p = inflightById.get(id)
  if (p) return p

  const run = (async () => {
    try {
      const raw = await api.get<any>(`/users/${encodeURIComponent(id)}`)
      const u = userRepo.upsertFromServer({
        id: String(raw?.id ?? id),
        role: raw?.role,
        fullName: raw?.fullName ?? '',
        email: raw?.email ?? '',
        phone: raw?.phone ?? '',
        telegramUserId: raw?.telegramUserId ?? null,
        company: raw?.company,
        socials: raw?.socials,
        avatarDataUrl: raw?.avatarDataUrl,
        emailVerified: true,
      })
      return u
    } catch (e) {
      // Avoid spamming non-existent endpoints in production setups.
      if (e instanceof ApiError && e.status === 404) {
        failedUntilById.set(id, Date.now() + 10 * 60_000)
      } else {
        failedUntilById.set(id, Date.now() + 30_000)
      }
      return null
    } finally {
      inflightById.delete(id)
    }
  })()

  inflightById.set(id, run)
  return run
}

export async function fetchUsersByIds(ids: string[]) {
  const uniq = Array.from(new Set((ids ?? []).map((x) => String(x || '').trim()).filter(Boolean)))
  if (!uniq.length) return
  if (!USE_API) {
    await Promise.all(uniq.map((id) => fetchUserById(id)))
    return
  }

  const token = sessionRepo.getToken()
  if (!token) return

  // Prefer batch endpoint when available.
  try {
    const joined = uniq.join(',')
    const list = (await api.get<any[]>(`/users?ids=${encodeURIComponent(joined)}`)) ?? []
    for (const raw of list) {
      if (!raw?.id) continue
      userRepo.upsertFromServer({
        id: String(raw.id),
        role: raw.role,
        fullName: raw.fullName ?? '',
        email: raw.email ?? '',
        phone: raw.phone ?? '',
        telegramUserId: raw.telegramUserId ?? null,
        company: raw.company,
        socials: raw.socials,
        avatarDataUrl: raw.avatarDataUrl,
        emailVerified: true,
      })
    }
    return
  } catch (e) {
    // If batch is missing or fails, fallback to individual fetches.
    if (e instanceof ApiError && e.status === 404) {
      // brief cooldown to avoid retry storm
      for (const id of uniq) failedUntilById.set(id, Math.max(failedUntilById.get(id) ?? 0, Date.now() + 60_000))
    }
  }

  await Promise.all(uniq.map((id) => fetchUserById(id)))
}

function subscribe(callback: () => void) {
  const handler = () => {
    cachedSnapshot = userRepo.list()
    callback()
  }

  window.addEventListener(EVENT_NAME, handler)
  const onStorage = (e: StorageEvent) => {
    if (e.key === 'ui-create-works.users.v1') handler()
  }
  window.addEventListener('storage', onStorage)

  return () => {
    window.removeEventListener(EVENT_NAME, handler)
    window.removeEventListener('storage', onStorage)
  }
}

function getSnapshot() {
  if (!cachedSnapshot) cachedSnapshot = userRepo.list()
  return cachedSnapshot
}

export function useUsers() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

