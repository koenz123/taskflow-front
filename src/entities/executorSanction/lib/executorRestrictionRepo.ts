import type { ExecutorRestriction } from '../model/restriction'

const STORAGE_KEY = 'ui-create-works.executorRestrictions.v1'
const CHANGE_EVENT = 'ui-create-works.executorRestrictions.change'

type Store = Record<string, ExecutorRestriction>

function safeParse(json: string | null): Store {
  if (!json) return {}
  try {
    const data = JSON.parse(json) as unknown
    if (!data || typeof data !== 'object') return {}
    return data as Store
  } catch {
    return {}
  }
}

function readAll(): Store {
  return safeParse(localStorage.getItem(STORAGE_KEY))
}

function writeAll(store: Store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function nowIso() {
  return new Date().toISOString()
}

export const executorRestrictionRepo = {
  get(executorId: string): ExecutorRestriction {
    const store = readAll()
    const r = store[executorId]
    if (!r) return { executorId, accountStatus: 'active', updatedAt: nowIso() }
    const respondBlockedUntil =
      typeof (r as any).respondBlockedUntil === 'string' && (r as any).respondBlockedUntil.trim()
        ? ((r as any).respondBlockedUntil as string)
        : undefined
    const accountStatus = (r as any).accountStatus === 'banned' ? 'banned' : 'active'
    const updatedAt = typeof (r as any).updatedAt === 'string' ? ((r as any).updatedAt as string) : nowIso()
    return { executorId, respondBlockedUntil, accountStatus, updatedAt }
  },

  setRespondBlockedUntil(executorId: string, untilIso: string) {
    const store = readAll()
    const prev = this.get(executorId)
    const prevMs = prev.respondBlockedUntil ? Date.parse(prev.respondBlockedUntil) : NaN
    const nextMs = Date.parse(untilIso)
    const finalUntil =
      Number.isFinite(prevMs) && Number.isFinite(nextMs) ? new Date(Math.max(prevMs, nextMs)).toISOString() : untilIso
    store[executorId] = { ...prev, respondBlockedUntil: finalUntil, updatedAt: nowIso() }
    writeAll(store)
    return store[executorId]
  },

  ban(executorId: string) {
    const store = readAll()
    const prev = this.get(executorId)
    store[executorId] = { ...prev, accountStatus: 'banned', updatedAt: nowIso() }
    writeAll(store)
    return store[executorId]
  },

  unblock(executorId: string) {
    const store = readAll()
    const prev = this.get(executorId)
    store[executorId] = {
      ...prev,
      accountStatus: 'active',
      respondBlockedUntil: undefined,
      updatedAt: nowIso(),
    }
    writeAll(store)
    return store[executorId]
  },

  listBanned(): string[] {
    const store = readAll()
    return Object.keys(store).filter((id) => (store[id] as any).accountStatus === 'banned')
  },

  canRespond(
    executorId: string,
    nowMs: number = Date.now(),
  ):
    | { ok: true; reason: null; until: null }
    | { ok: false; reason: 'banned'; until: null }
    | { ok: false; reason: 'blocked'; until: string } {
    const r = this.get(executorId)
    if (r.accountStatus === 'banned') return { ok: false, reason: 'banned', until: null }
    if (r.respondBlockedUntil) {
      const untilMs = Date.parse(r.respondBlockedUntil)
      if (Number.isFinite(untilMs) && nowMs < untilMs) {
        return { ok: false, reason: 'blocked', until: r.respondBlockedUntil }
      }
    }
    return { ok: true, reason: null, until: null }
  },

  subscribe(callback: () => void) {
    const handler = () => callback()
    window.addEventListener(CHANGE_EVENT, handler)
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) handler()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(CHANGE_EVENT, handler)
      window.removeEventListener('storage', onStorage)
    }
  },
}

