import { useSyncExternalStore } from 'react'
import { notificationRepo } from './notificationRepo'
import type { Notification } from '../model/notification'
import { api } from '@/shared/api/api'
import { sessionRepo } from '@/shared/auth/sessionRepo'
import { createId } from '@/shared/lib/id'

const CHANGE_EVENT = 'ui-create-works.notifications.change'
const STORAGE_KEY = 'ui-create-works.notifications.v1'
const USE_API = import.meta.env.VITE_DATA_SOURCE === 'api'

type Cache = {
  userId: string | null
  raw: string | null
  list: Notification[]
}

let cache: Cache = { userId: null, raw: null, list: [] }

let apiSnapshot: Notification[] = []
let apiStore: { subs: Set<() => void> } = { subs: new Set() }
let apiRefreshing = false
let apiHasLoaded = false
let apiLoadedForToken: string | null = null
let apiPollId: number | null = null

function notifyApi() {
  for (const cb of apiStore.subs) cb()
}

const KNOWN_TYPES = new Set<Notification['type']>([
  'task_application',
  'task_application_cancelled',
  'task_taken',
  'task_assigned',
  'task_assigned_else',
  'task_submitted',
  'task_resubmitted',
  'task_approved',
  'task_revision',
  'task_pause_requested',
  'task_pause_accepted',
  'task_pause_rejected',
  'task_completed',
  'task_unclaimed',
  'task_executor_no_start',
  'task_executor_overdue',
  'dispute_opened',
  'dispute_message',
  'dispute_status',
  'dispute_sla_threshold',
  'rate_customer',
  'rate_executor',
  'executor_violation_warning',
  'executor_violation_rating_penalty',
  'executor_violation_respond_block',
  'executor_violation_ban',
])

function normalizeType(raw: unknown): Notification['type'] {
  const s0 = typeof raw === 'string' ? raw.trim() : ''
  if (!s0) return 'task_taken'
  const last = s0.includes(':') ? s0.split(':').pop()!.trim() : s0
  const snake = last
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .toLowerCase()
  // Backend canonical meta.type → UI NotificationType.
  const mapped = (() => {
    // executor/customer interactions
    if (snake === 'task_application_created') return 'task_application'
    if (snake === 'task_pause_requested') return 'task_pause_requested'
    if (snake === 'task_pause_accepted') return 'task_pause_accepted'
    if (snake === 'task_pause_rejected') return 'task_pause_rejected'

    // lifecycle
    if (snake === 'assignment_selected') return 'task_assigned'
    if (snake === 'assignment_removed') return 'task_assigned_else'
    if (snake === 'task_revision_requested') return 'task_revision'
    if (snake === 'task_submitted') return 'task_submitted'
    if (snake === 'task_resubmitted') return 'task_resubmitted'

    // disputes
    if (snake === 'dispute_opened') return 'dispute_opened'
    if (snake === 'dispute_message') return 'dispute_message'

    // ratings (who receives)
    if (snake === 'rating_received_customer') return 'rate_customer'
    if (snake === 'rating_received_executor') return 'rate_executor'

    // SLA / overdue
    if (snake === 'executor_no_start_12h') return 'task_executor_no_start'
    if (snake === 'executor_overdue') return 'task_executor_overdue'

    return snake
  })()
  if (KNOWN_TYPES.has(mapped as Notification['type'])) return mapped as Notification['type']
  return 'task_taken'
}

function normalizeNotification(raw: any): Notification | null {
  if (!raw || typeof raw !== 'object') return null
  const meta = raw?.meta && typeof raw.meta === 'object' ? raw.meta : null
  const id =
    String(raw.id ?? raw._id ?? raw.notificationId ?? raw.notifId ?? '').trim() ||
    createId('notif_api')
  const recipientUserId = String(
    raw.recipientUserId ??
      raw.recipientUserID ??
      raw.recipientId ??
      raw.userId ??
      raw.userID ??
      raw.toUserId ??
      raw.toUserID ??
      '',
  ).trim()
  const actorUserId = String(
    raw.actorUserId ??
      raw.actorUserID ??
      raw.actorId ??
      raw.actor ??
      raw.fromUserId ??
      raw.fromUserID ??
      raw.senderUserId ??
      raw.senderUserID ??
      meta?.actorUserId ??
      meta?.actorUserID ??
      meta?.actorId ??
      meta?.actor ??
      meta?.fromUserId ??
      meta?.fromUserID ??
      meta?.senderUserId ??
      meta?.senderUserID ??
      meta?.customerUserId ??
      meta?.customerId ??
      meta?.clientId ??
      meta?.executorUserId ??
      meta?.executorId ??
      '',
  ).trim() || 'system'
  const taskId = String(
    raw.taskId ??
      raw.taskID ??
      raw.task ??
      raw.task?.id ??
      raw.task?.taskId ??
      raw.payload?.taskId ??
      raw.data?.taskId ??
      meta?.taskId ??
      meta?.taskID ??
      raw.entityId ??
      raw.entityID ??
      '',
  ).trim() || 'unknown_task'
  const createdAt =
    String(raw.createdAt ?? raw.created_at ?? raw.date ?? raw.time ?? '').trim() ||
    new Date().toISOString()
  // recipientUserId may be omitted by backend because it's derived from JWT.
  // We still keep the notification in UI.
  const safeRecipient = recipientUserId || sessionRepo.getUserId() || 'unknown_user'
  const n: Notification = {
    id,
    type: normalizeType(raw.type ?? raw.kind ?? raw.eventType ?? raw.meta?.type ?? raw.meta?.kind ?? raw.meta?.eventType),
    recipientUserId: safeRecipient,
    actorUserId,
    taskId,
    disputeId: raw.disputeId ? String(raw.disputeId) : meta?.disputeId ? String(meta.disputeId) : undefined,
    disputeStatus: raw.disputeStatus ? String(raw.disputeStatus) : undefined,
    slaHoursLeft: typeof raw.slaHoursLeft === 'number' ? raw.slaHoursLeft : undefined,
    completionVideoUrl: raw.completionVideoUrl ? String(raw.completionVideoUrl) : undefined,
    message: raw.message ? String(raw.message) : raw.text ? String(raw.text) : undefined,
    violationId: raw.violationId ? String(raw.violationId) : undefined,
    violationType: raw.violationType === 'no_start_12h' || raw.violationType === 'no_submit_24h' ? raw.violationType : undefined,
    sanctionDeltaPercent: typeof raw.sanctionDeltaPercent === 'number' ? raw.sanctionDeltaPercent : undefined,
    sanctionUntil: raw.sanctionUntil ? String(raw.sanctionUntil) : undefined,
    sanctionDurationHours: typeof raw.sanctionDurationHours === 'number' ? raw.sanctionDurationHours : undefined,
    createdAt,
    readAt: raw.readAt ? String(raw.readAt) : raw.read_at ? String(raw.read_at) : undefined,
  }
  return n
}

function setApiSnapshot(next: Notification[]) {
  apiSnapshot = next
  notifyApi()
}

export function markNotificationReadOptimistic(notificationId: string) {
  if (!USE_API) return
  const id = String(notificationId || '').trim()
  if (!id) return
  const now = new Date().toISOString()
  let changed = false
  const next = apiSnapshot.map((n) => {
    if (n.id !== id) return n
    if (n.readAt) return n
    changed = true
    return { ...n, readAt: now }
  })
  if (changed) setApiSnapshot(next)
}

export function markNotificationsReadOptimistic(notificationIds: string[]) {
  if (!USE_API) return
  const idsArr = Array.from(new Set((notificationIds ?? []).map((x) => String(x || '').trim()).filter(Boolean)))
  if (!idsArr.length) return
  const ids = new Set(idsArr)
  const now = new Date().toISOString()
  let changed = false
  const next = apiSnapshot.map((n) => {
    if (!ids.has(n.id)) return n
    if (n.readAt) return n
    changed = true
    return { ...n, readAt: now }
  })
  if (changed) setApiSnapshot(next)
}

export function markAllNotificationsReadOptimistic() {
  if (!USE_API) return
  const now = new Date().toISOString()
  let changed = false
  const next = apiSnapshot.map((n) => {
    if (n.readAt) return n
    changed = true
    return { ...n, readAt: now }
  })
  if (changed) setApiSnapshot(next)
}

export async function fetchNotifications() {
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
    setApiSnapshot([])
    apiHasLoaded = true
    apiRefreshing = false
    return
  }
  try {
    const raw = await api.get<any>('/notifications')
    const items =
      Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.items)
          ? raw.items
          : Array.isArray(raw?.notifications)
            ? raw.notifications
            : Array.isArray(raw?.data)
              ? raw.data
              : []

    const list = items
      .map(normalizeNotification)
      .filter(Boolean) as Notification[]
    setApiSnapshot(list)
    apiHasLoaded = true

    // Best-effort: fetch actor profiles so notifications show "who".
    try {
      const ids = Array.from(new Set(list.map((n) => n.actorUserId).filter((x) => x && x !== 'system').slice(0, 120)))
      if (ids.length) {
        const { fetchUsersByIds } = await import('@/entities/user/lib/useUsers')
        void fetchUsersByIds(ids)
      }
    } catch {
      // ignore
    }
  } catch {
    // keep previous
  }
  apiRefreshing = false
}

export async function refreshNotifications() {
  if (!USE_API) return
  apiHasLoaded = false
  await fetchNotifications()
}

function subscribeApi(cb: () => void) {
  apiStore.subs.add(cb)
  void fetchNotifications()
  const onSession = () => {
    void refreshNotifications()
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') void refreshNotifications()
  }
  if (apiPollId === null && typeof window !== 'undefined') {
    apiPollId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void refreshNotifications()
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

function subscribe(onStoreChange: () => void) {
  const onChange = () => onStoreChange()
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

function getSnapshot(userId: string | null): Notification[] {
  if (!userId) {
    if (cache.userId !== null || cache.raw !== null || cache.list.length) {
      cache = { userId: null, raw: null, list: [] }
    }
    return cache.list
  }

  const raw = localStorage.getItem(STORAGE_KEY)
  if (cache.userId === userId && cache.raw === raw) return cache.list

  const list = notificationRepo.listForUser(userId)
  cache = { userId, raw, list }
  return list
}

export function useNotifications(userId?: string | null) {
  if (USE_API) {
    return useSyncExternalStore(subscribeApi, () => apiSnapshot, () => [])
  }
  return useSyncExternalStore(subscribe, () => getSnapshot(userId ?? null), () => [])
}

