import { createId } from '@/shared/lib/id'
import type { Rating } from '../model/rating'

const STORAGE_KEY = 'ui-create-works.ratings.v1'
const CHANGE_EVENT = 'ui-create-works.ratings.change'

function safeParse(json: string | null): Rating[] {
  if (!json) return []
  try {
    const data = JSON.parse(json) as unknown
    if (!Array.isArray(data)) return []
    return data as Rating[]
  } catch {
    return []
  }
}

function readAll(): Rating[] {
  return safeParse(localStorage.getItem(STORAGE_KEY))
}

function writeAll(items: Rating[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function nowIso() {
  return new Date().toISOString()
}

function normalize(raw: unknown): Rating | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = typeof r.id === 'string' ? r.id : createId('rate')
  const contractId = typeof r.contractId === 'string' ? r.contractId : ''
  const fromUserId = typeof r.fromUserId === 'string' ? r.fromUserId : ''
  const toUserId = typeof r.toUserId === 'string' ? r.toUserId : ''
  const createdAt = typeof r.createdAt === 'string' ? r.createdAt : nowIso()
  const rating = typeof r.rating === 'number' ? r.rating : NaN
  if (!contractId || !fromUserId || !toUserId) return null
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) return null
  const comment = typeof r.comment === 'string' && r.comment.trim() ? r.comment.trim() : undefined
  return { id, contractId, fromUserId, toUserId, rating, comment, createdAt }
}

export const ratingRepo = {
  listAll(): Rating[] {
    return readAll()
      .map(normalize)
      .filter(Boolean) as Rating[]
  },

  listForUser(userId: string): Rating[] {
    return this.listAll()
      .filter((r) => r.toUserId === userId)
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },

  listGivenByUser(userId: string): Rating[] {
    return this.listAll()
      .filter((r) => r.fromUserId === userId)
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },

  getForContractPair(contractId: string, fromUserId: string): Rating | null {
    return this.listAll().find((r) => r.contractId === contractId && r.fromUserId === fromUserId) ?? null
  },

  upsert(input: { contractId: string; fromUserId: string; toUserId: string; rating: number; comment?: string }) {
    const all = readAll()
    const now = nowIso()
    const existingIdx = all.findIndex(
      (x) => (x as any)?.contractId === input.contractId && (x as any)?.fromUserId === input.fromUserId,
    )
    const entry: Rating = {
      id: existingIdx === -1 ? createId('rate') : ((all[existingIdx] as any)?.id as string) ?? createId('rate'),
      contractId: input.contractId,
      fromUserId: input.fromUserId,
      toUserId: input.toUserId,
      rating: Math.max(1, Math.min(5, Math.round(input.rating))),
      comment: input.comment?.trim() || undefined,
      createdAt: existingIdx === -1 ? now : ((all[existingIdx] as any)?.createdAt as string) ?? now,
    }
    if (existingIdx === -1) all.push(entry)
    else all[existingIdx] = entry
    writeAll(all)
    return entry
  },

  averageForUser(userId: string) {
    const list = this.listForUser(userId)
    if (!list.length) return null
    const sum = list.reduce((s, r) => s + r.rating, 0)
    return sum / list.length
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

