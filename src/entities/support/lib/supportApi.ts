import type { SupportMessage, SupportThread } from '../model/supportThread'
import { api } from '@/shared/api/api'
import { sessionRepo } from '@/shared/auth/sessionRepo'
import { useSyncExternalStore, useCallback, useEffect, useState } from 'react'

const USE_API = import.meta.env.VITE_DATA_SOURCE === 'api'

let apiThreadsSnapshot: SupportThread[] = []
const apiStore = { subs: new Set<() => void>() }

function notify() {
  for (const cb of apiStore.subs) cb()
}

function normalizeThread(raw: unknown): SupportThread | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = typeof r.id === 'string' ? r.id : typeof (r as any)._id === 'string' ? String((r as any)._id) : ''
  const userId = typeof r.userId === 'string' ? r.userId : ''
  const createdAt = typeof r.createdAt === 'string' ? r.createdAt : new Date().toISOString()
  const updatedAt = typeof r.updatedAt === 'string' ? r.updatedAt : createdAt
  const userFullName =
    typeof (r as any).userFullName === 'string'
      ? (r as any).userFullName.trim() || undefined
      : (r as any).user && typeof (r as any).user === 'object' && typeof (r as any).user.fullName === 'string'
        ? (r as any).user.fullName.trim() || undefined
        : undefined
  const status = (r as any).status === 'closed' ? 'closed' : 'open'
  const closedAt = typeof (r as any).closedAt === 'string' ? (r as any).closedAt : undefined
  const closedByUserId = typeof (r as any).closedByUserId === 'string' ? (r as any).closedByUserId : undefined
  const rating = typeof (r as any).rating === 'number' && (r as any).rating >= 1 && (r as any).rating <= 5 ? (r as any).rating : undefined
  const ratingComment = typeof (r as any).ratingComment === 'string' ? (r as any).ratingComment.trim() || undefined : undefined
  const ratedAt = typeof (r as any).ratedAt === 'string' ? (r as any).ratedAt : undefined
  if (!id || !userId) return null
  return { id, userId, userFullName, status, closedAt, closedByUserId, rating, ratingComment, ratedAt, createdAt, updatedAt }
}

export async function fetchSupportThreads() {
  if (!USE_API) return
  const token = sessionRepo.getToken()
  if (!token) {
    apiThreadsSnapshot = []
    notify()
    return
  }
  try {
    const raw = await api.get<unknown>('/support/threads')
    const list = Array.isArray(raw) ? raw : []
    apiThreadsSnapshot = list.map(normalizeThread).filter(Boolean) as SupportThread[]
  } catch {
    // keep previous
  }
  notify()
}

export async function refreshSupportThreads() {
  if (!USE_API) return
  await fetchSupportThreads()
}

/**
 * Submit a new support message (user side). Creates or gets thread, adds message.
 * When USE_API, posts to backend so arbiter sees it in support-inbox.
 *
 * Backend contract (to avoid 403):
 * - POST /support/threads body { userId, role?, telegramUserId? }. Allow when String(req.user?.id) === String(body.userId).
 *   If the user already has a thread with status closed, create and return a new thread so the user can start a new request.
 *   Allow all auth methods (email, telegram, google) and all roles.
 * - POST /support/threads/:threadId/messages body { fromUserId, text, telegramUserId? }. Allow when
 *   String(req.user?.id) === String(body.fromUserId) or role === 'arbiter'. Do not 403 for Telegram users.
 * - GET /support/threads — when returning threads for arbiter, include user fullName (e.g. userFullName or user.fullName)
 *   so the UI can show ФИО instead of userId.
 * - GET /support/threads/:threadId/messages — return list of messages; allow when
 *   requester is arbiter or String(req.user?.id) === String(thread.userId).
 * - PATCH /support/threads/:threadId body { status: 'closed' } — arbiter closes thread; response: updated thread (status, closedAt, closedByUserId).
 * - POST /support/threads/:threadId/rate body { rating: number, comment?: string } — thread owner rates; response: updated thread (rating, ratingComment, ratedAt).
 * - Messages may include attachmentUrls: string[] (URLs from POST /uploads).
 */
export async function submitSupportMessage(
  userId: string,
  text: string,
  options?: {
    role?: 'customer' | 'executor' | 'arbiter' | 'pending'
    telegramUserId?: string | null
    attachmentUrls?: string[]
  },
): Promise<{ thread: SupportThread; message: SupportMessage } | null> {
  if (!USE_API) return null
  const token = sessionRepo.getToken()
  if (!token) return null
  const uid = typeof userId === 'string' && userId.trim() ? userId.trim() : null
  if (!uid) return null
  try {
    const body: { userId: string; role?: string; telegramUserId?: string } = { userId: uid }
    if (options?.role) body.role = options.role
    if (options?.telegramUserId) body.telegramUserId = options.telegramUserId
    const threadRaw = await api.post<unknown>('/support/threads', body)
    const thread = normalizeThread(threadRaw)
    if (!thread) return null
    const msgBody: { fromUserId: string; text: string; telegramUserId?: string; attachmentUrls?: string[] } = {
      fromUserId: uid,
      text: text.trim(),
    }
    if (options?.telegramUserId) msgBody.telegramUserId = options.telegramUserId
    if (options?.attachmentUrls?.length) msgBody.attachmentUrls = options.attachmentUrls
    const msgRaw = await api.post<unknown>(`/support/threads/${encodeURIComponent(thread.id)}/messages`, msgBody)
    const msg = normalizeMessage(msgRaw, thread.id, uid)
    if (!msg) return { thread, message: { id: '', threadId: thread.id, fromUserId: uid, text: text.trim(), attachmentUrls: options?.attachmentUrls, createdAt: new Date().toISOString() } }
    return { thread, message: msg }
  } catch (e) {
    const err = e as { status?: number }
    if (err?.status === 403) throw e
    return null
  }
}

function normalizeAttachmentUrls(r: Record<string, unknown>): string[] | undefined {
  const raw = (r as any).attachmentUrls ?? (r as any).attachments
  if (Array.isArray(raw)) {
    const urls = raw.map((x: unknown) => (typeof x === 'string' ? x : (x as any)?.url)).filter((u): u is string => typeof u === 'string' && u.length > 0)
    return urls.length > 0 ? urls : undefined
  }
  return undefined
}

function normalizeMessage(raw: unknown, threadId: string, fromUserId: string): SupportMessage | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = typeof r.id === 'string' ? r.id : typeof (r as any)._id === 'string' ? String((r as any)._id) : ''
  const text = typeof r.text === 'string' ? r.text : ''
  const createdAt = typeof r.createdAt === 'string' ? r.createdAt : new Date().toISOString()
  const attachmentUrls = normalizeAttachmentUrls(r)
  return { id: id || 'msg', threadId, fromUserId, text, attachmentUrls, createdAt }
}

function normalizeMessageFromList(raw: unknown, threadId: string): SupportMessage | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const fromUserId = typeof r.fromUserId === 'string' ? r.fromUserId : typeof (r as any).userId === 'string' ? (r as any).userId : ''
  const id = typeof r.id === 'string' ? r.id : typeof (r as any)._id === 'string' ? String((r as any)._id) : ''
  const text = typeof r.text === 'string' ? r.text : ''
  const createdAt = typeof r.createdAt === 'string' ? r.createdAt : new Date().toISOString()
  const attachmentUrls = normalizeAttachmentUrls(r)
  if (!fromUserId) return null
  return { id: id || 'msg', threadId, fromUserId, text, attachmentUrls, createdAt }
}

/** POST a message to an existing thread (reply from owner or arbiter). */
export async function postSupportThreadMessage(
  threadId: string,
  fromUserId: string,
  text: string,
  opts?: { telegramUserId?: string | null; attachmentUrls?: string[] },
): Promise<SupportMessage | null> {
  if (!USE_API || !threadId || !fromUserId || !text.trim()) return null
  const token = sessionRepo.getToken()
  if (!token) return null
  try {
    const msgBody: { fromUserId: string; text: string; telegramUserId?: string; attachmentUrls?: string[] } = {
      fromUserId,
      text: text.trim(),
    }
    if (opts?.telegramUserId) msgBody.telegramUserId = opts.telegramUserId
    if (opts?.attachmentUrls?.length) msgBody.attachmentUrls = opts.attachmentUrls
    const msgRaw = await api.post<unknown>(`/support/threads/${encodeURIComponent(threadId)}/messages`, msgBody)
    return normalizeMessage(msgRaw, threadId, fromUserId)
  } catch (e) {
    const err = e as { status?: number }
    if (err?.status === 403) throw e
    return null
  }
}

/** PATCH /support/threads/:threadId — arbiter closes the thread. */
export async function closeSupportThread(threadId: string): Promise<SupportThread | null> {
  if (!USE_API || !threadId) return null
  const token = sessionRepo.getToken()
  if (!token) return null
  try {
    const raw = await api.patch<unknown>(`/support/threads/${encodeURIComponent(threadId)}`, { status: 'closed' })
    const thread = normalizeThread(raw)
    if (thread) void fetchSupportThreads().then(notify)
    return thread
  } catch (e) {
    const err = e as { status?: number }
    if (err?.status === 403) throw e
    return null
  }
}

/** POST /support/threads/:threadId/rate — thread owner submits rating and optional comment. */
export async function rateSupportThread(threadId: string, rating: number, comment?: string): Promise<SupportThread | null> {
  if (!USE_API || !threadId || rating < 1 || rating > 5) return null
  const token = sessionRepo.getToken()
  if (!token) return null
  try {
    const raw = await api.post<unknown>(`/support/threads/${encodeURIComponent(threadId)}/rate`, { rating, comment: comment?.trim() || undefined })
    const thread = normalizeThread(raw)
    if (thread) void fetchSupportThreads().then(notify)
    return thread
  } catch (e) {
    const err = e as { status?: number }
    if (err?.status === 403) throw e
    return null
  }
}

/** GET /support/threads/:threadId/messages — for arbiter/owner to load messages in thread view. */
export async function fetchSupportThreadMessages(threadId: string): Promise<SupportMessage[]> {
  if (!USE_API || !threadId) return []
  const token = sessionRepo.getToken()
  if (!token) return []
  try {
    const raw = await api.get<unknown>(`/support/threads/${encodeURIComponent(threadId)}/messages`)
    const list = Array.isArray(raw) ? raw : []
    return list.map((item) => normalizeMessageFromList(item, threadId)).filter(Boolean) as SupportMessage[]
  } catch {
    return []
  }
}

/** When USE_API, returns messages for the thread from API and refetch function; otherwise empty (caller uses supportRepo). */
export function useSupportThreadMessages(threadId: string | undefined): { messages: SupportMessage[]; refetch: () => void } {
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const refetch = useCallback(() => {
    if (!USE_API || !threadId) return
    fetchSupportThreadMessages(threadId).then(setMessages)
  }, [threadId])
  useEffect(() => {
    if (!USE_API || !threadId) {
      setMessages([])
      return
    }
    let cancelled = false
    fetchSupportThreadMessages(threadId).then((list) => {
      if (!cancelled) setMessages(list)
    })
    return () => {
      cancelled = true
    }
  }, [threadId])
  return { messages, refetch }
}

function subscribeSupportThreads(cb: () => void) {
  apiStore.subs.add(cb)
  if (USE_API) void fetchSupportThreads()
  return () => { apiStore.subs.delete(cb) }
}

function getSupportThreadsSnapshot() {
  return apiThreadsSnapshot
}

/** When USE_API, returns threads from backend (for arbiter: all threads). When !USE_API returns []. */
export function useSupportThreadsFromApi(): SupportThread[] {
  return useSyncExternalStore(
    subscribeSupportThreads,
    getSupportThreadsSnapshot,
    getSupportThreadsSnapshot,
  )
}
