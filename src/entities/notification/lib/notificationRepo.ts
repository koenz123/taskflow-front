import type { Notification } from '../model/notification'
import { createId } from '@/shared/lib/id'

const STORAGE_KEY = 'ui-create-works.notifications.v1'
const CHANGE_EVENT = 'ui-create-works.notifications.change'

function safeParse(json: string | null): Notification[] {
  if (!json) return []
  try {
    const data = JSON.parse(json) as unknown
    if (!Array.isArray(data)) return []
    return data as Notification[]
  } catch {
    return []
  }
}

function readAll(): Notification[] {
  return safeParse(localStorage.getItem(STORAGE_KEY))
}

function writeAll(items: Notification[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export const notificationRepo = {
  listForUser(userId: string): Notification[] {
    return readAll()
      .filter((n) => n.recipientUserId === userId)
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },

  unreadCountForUser(userId: string): number {
    return readAll().filter((n) => n.recipientUserId === userId && !n.readAt).length
  },

  addTaskTaken(input: { recipientUserId: string; actorUserId: string; taskId: string }) {
    const now = new Date().toISOString()
    const n: Notification = {
      id: createId('notif'),
      type: 'task_taken',
      recipientUserId: input.recipientUserId,
      actorUserId: input.actorUserId,
      taskId: input.taskId,
      createdAt: now,
    }
    const all = readAll()
    all.push(n)
    writeAll(all)
    return n
  },

  addDisputeOpened(input: { recipientUserId: string; actorUserId: string; taskId: string; disputeId: string }) {
    const now = new Date().toISOString()
    const n: Notification = {
      id: createId('notif'),
      type: 'dispute_opened',
      recipientUserId: input.recipientUserId,
      actorUserId: input.actorUserId,
      taskId: input.taskId,
      disputeId: input.disputeId,
      createdAt: now,
    }
    const all = readAll()
    all.push(n)
    writeAll(all)
    return n
  },

  addDisputeMessage(input: { recipientUserId: string; actorUserId: string; taskId: string; disputeId: string; message?: string }) {
    const now = new Date().toISOString()
    const n: Notification = {
      id: createId('notif'),
      type: 'dispute_message',
      recipientUserId: input.recipientUserId,
      actorUserId: input.actorUserId,
      taskId: input.taskId,
      disputeId: input.disputeId,
      message: input.message?.trim() ? input.message.trim().slice(0, 240) : undefined,
      createdAt: now,
    }
    const all = readAll()
    all.push(n)
    writeAll(all)
    return n
  },

  addDisputeStatus(input: { recipientUserId: string; actorUserId: string; taskId: string; disputeId: string; status: string; note?: string }) {
    const now = new Date().toISOString()
    const n: Notification = {
      id: createId('notif'),
      type: 'dispute_status',
      recipientUserId: input.recipientUserId,
      actorUserId: input.actorUserId,
      taskId: input.taskId,
      disputeId: input.disputeId,
      disputeStatus: input.status,
      message: input.note?.trim() ? input.note.trim().slice(0, 240) : undefined,
      createdAt: now,
    }
    const all = readAll()
    all.push(n)
    writeAll(all)
    return n
  },

  addDisputeSlaThreshold(input: {
    recipientUserId: string
    actorUserId: string
    taskId: string
    disputeId: string
    hoursLeft: number
  }) {
    const now = new Date().toISOString()
    const all = readAll()
    const hoursLeft = Math.floor(input.hoursLeft)
    const existing = all.find(
      (n) =>
        n.type === 'dispute_sla_threshold' &&
        n.recipientUserId === input.recipientUserId &&
        n.disputeId === input.disputeId &&
        n.slaHoursLeft === hoursLeft,
    )
    if (existing) return existing
    const n: Notification = {
      id: createId('notif'),
      type: 'dispute_sla_threshold',
      recipientUserId: input.recipientUserId,
      actorUserId: input.actorUserId,
      taskId: input.taskId,
      disputeId: input.disputeId,
      slaHoursLeft: hoursLeft,
      createdAt: now,
    }
    all.push(n)
    writeAll(all)
    return n
  },

  addRateCustomer(input: { recipientUserId: string; actorUserId: string; taskId: string }) {
    const now = new Date().toISOString()
    const all = readAll()
    const existing = all.find(
      (n) =>
        n.type === 'rate_customer' &&
        n.recipientUserId === input.recipientUserId &&
        n.taskId === input.taskId &&
        !n.readAt,
    )
    if (existing) return existing
    const n: Notification = {
      id: createId('notif'),
      type: 'rate_customer',
      recipientUserId: input.recipientUserId,
      actorUserId: input.actorUserId,
      taskId: input.taskId,
      createdAt: now,
    }
    all.push(n)
    writeAll(all)
    return n
  },

  unreadDisputeCountForUser(userId: string): number {
    return readAll().filter(
      (n) =>
        n.recipientUserId === userId &&
        !n.readAt &&
        (n.type === 'dispute_opened' || n.type === 'dispute_message' || n.type === 'dispute_status' || n.type === 'dispute_sla_threshold'),
    ).length
  },

  markReadForDispute(userId: string, disputeId: string) {
    const all = readAll()
    const now = new Date().toISOString()
    let changed = false
    const updated = all.map((n) => {
      if (n.recipientUserId !== userId) return n
      if (n.disputeId !== disputeId) return n
      if (n.readAt) return n
      changed = true
      return { ...n, readAt: now }
    })
    if (changed) writeAll(updated)
  },

  addExecutorViolationWarning(input: { recipientUserId: string; taskId: string; violationId: string; violationType: Notification['violationType'] }) {
    const now = new Date().toISOString()
    const all = readAll()
    const existing = all.find(
      (n) =>
        n.type === 'executor_violation_warning' &&
        n.recipientUserId === input.recipientUserId &&
        n.violationId === input.violationId,
    )
    if (existing) return existing
    const n: Notification = {
      id: createId('notif'),
      type: 'executor_violation_warning',
      recipientUserId: input.recipientUserId,
      // System notification (no specific actor).
      actorUserId: 'system',
      taskId: input.taskId,
      violationId: input.violationId,
      violationType: input.violationType,
      createdAt: now,
    }
    all.push(n)
    writeAll(all)
    return n
  },

  addExecutorViolationRatingPenalty(input: {
    recipientUserId: string
    taskId: string
    violationId: string
    violationType: Notification['violationType']
    deltaPercent: number
  }) {
    const now = new Date().toISOString()
    const all = readAll()
    const existing = all.find(
      (n) =>
        n.type === 'executor_violation_rating_penalty' &&
        n.recipientUserId === input.recipientUserId &&
        n.violationId === input.violationId,
    )
    if (existing) return existing
    const n: Notification = {
      id: createId('notif'),
      type: 'executor_violation_rating_penalty',
      recipientUserId: input.recipientUserId,
      actorUserId: 'system',
      taskId: input.taskId,
      violationId: input.violationId,
      violationType: input.violationType,
      sanctionDeltaPercent: input.deltaPercent,
      createdAt: now,
    }
    all.push(n)
    writeAll(all)
    return n
  },

  addExecutorViolationRespondBlock(input: {
    recipientUserId: string
    taskId: string
    violationId: string
    violationType: Notification['violationType']
    until: string
    durationHours: number
  }) {
    const now = new Date().toISOString()
    const all = readAll()
    const existing = all.find(
      (n) =>
        n.type === 'executor_violation_respond_block' &&
        n.recipientUserId === input.recipientUserId &&
        n.violationId === input.violationId,
    )
    if (existing) return existing
    const n: Notification = {
      id: createId('notif'),
      type: 'executor_violation_respond_block',
      recipientUserId: input.recipientUserId,
      actorUserId: 'system',
      taskId: input.taskId,
      violationId: input.violationId,
      violationType: input.violationType,
      sanctionUntil: input.until,
      sanctionDurationHours: input.durationHours,
      createdAt: now,
    }
    all.push(n)
    writeAll(all)
    return n
  },

  addExecutorViolationBan(input: { recipientUserId: string; taskId: string; violationId: string; violationType: Notification['violationType'] }) {
    const now = new Date().toISOString()
    const all = readAll()
    const existing = all.find(
      (n) =>
        n.type === 'executor_violation_ban' &&
        n.recipientUserId === input.recipientUserId &&
        n.violationId === input.violationId,
    )
    if (existing) return existing
    const n: Notification = {
      id: createId('notif'),
      type: 'executor_violation_ban',
      recipientUserId: input.recipientUserId,
      actorUserId: 'system',
      taskId: input.taskId,
      violationId: input.violationId,
      violationType: input.violationType,
      createdAt: now,
    }
    all.push(n)
    writeAll(all)
    return n
  },

  addTaskExecutorNoStart(input: { recipientUserId: string; executorUserId: string; taskId: string; violationId: string }) {
    const now = new Date().toISOString()
    const all = readAll()
    const existing = all.find(
      (n) =>
        n.type === 'task_executor_no_start' &&
        n.recipientUserId === input.recipientUserId &&
        n.violationId === input.violationId,
    )
    if (existing) return existing
    const n: Notification = {
      id: createId('notif'),
      type: 'task_executor_no_start',
      recipientUserId: input.recipientUserId,
      actorUserId: input.executorUserId,
      taskId: input.taskId,
      violationId: input.violationId,
      createdAt: now,
    }
    all.push(n)
    writeAll(all)
    return n
  },

  addTaskExecutorOverdue(input: { recipientUserId: string; executorUserId: string; taskId: string; violationId: string }) {
    const now = new Date().toISOString()
    const all = readAll()
    const existing = all.find(
      (n) => n.type === 'task_executor_overdue' && n.recipientUserId === input.recipientUserId && n.violationId === input.violationId,
    )
    if (existing) return existing
    const n: Notification = {
      id: createId('notif'),
      type: 'task_executor_overdue',
      recipientUserId: input.recipientUserId,
      actorUserId: input.executorUserId,
      taskId: input.taskId,
      violationId: input.violationId,
      createdAt: now,
    }
    all.push(n)
    writeAll(all)
    return n
  },

  addTaskApplication(input: { recipientUserId: string; actorUserId: string; taskId: string }) {
    const now = new Date().toISOString()
    const n: Notification = {
      id: createId('notif'),
      type: 'task_application',
      recipientUserId: input.recipientUserId,
      actorUserId: input.actorUserId,
      taskId: input.taskId,
      createdAt: now,
    }
    const all = readAll()
    all.push(n)
    writeAll(all)
    return n
  },

  addTaskApplicationCancelled(input: { recipientUserId: string; actorUserId: string; taskId: string }) {
    const now = new Date().toISOString()
    const n: Notification = {
      id: createId('notif'),
      type: 'task_application_cancelled',
      recipientUserId: input.recipientUserId,
      actorUserId: input.actorUserId,
      taskId: input.taskId,
      createdAt: now,
    }
    const all = readAll()
    all.push(n)
    writeAll(all)
    return n
  },

  addTaskCompleted(input: {
    recipientUserId: string
    actorUserId: string
    taskId: string
    completionVideoUrl?: string
  }) {
    const now = new Date().toISOString()
    const n: Notification = {
      id: createId('notif'),
      type: 'task_completed',
      recipientUserId: input.recipientUserId,
      actorUserId: input.actorUserId,
      taskId: input.taskId,
      completionVideoUrl: input.completionVideoUrl,
      createdAt: now,
    }
    const all = readAll()
    all.push(n)
    writeAll(all)
    return n
  },

  addTaskSubmitted(input: {
    recipientUserId: string
    actorUserId: string
    taskId: string
    completionVideoUrl?: string
  }) {
    const now = new Date().toISOString()
    const n: Notification = {
      id: createId('notif'),
      type: 'task_submitted',
      recipientUserId: input.recipientUserId,
      actorUserId: input.actorUserId,
      taskId: input.taskId,
      completionVideoUrl: input.completionVideoUrl,
      createdAt: now,
    }
    const all = readAll()
    all.push(n)
    writeAll(all)
    return n
  },

  addTaskApproved(input: { recipientUserId: string; actorUserId: string; taskId: string }) {
    const now = new Date().toISOString()
    const n: Notification = {
      id: createId('notif'),
      type: 'task_approved',
      recipientUserId: input.recipientUserId,
      actorUserId: input.actorUserId,
      taskId: input.taskId,
      createdAt: now,
    }
    const all = readAll()
    all.push(n)
    writeAll(all)
    return n
  },

  addTaskRevision(input: { recipientUserId: string; actorUserId: string; taskId: string; message?: string }) {
    const now = new Date().toISOString()
    const n: Notification = {
      id: createId('notif'),
      type: 'task_revision',
      recipientUserId: input.recipientUserId,
      actorUserId: input.actorUserId,
      taskId: input.taskId,
      message: input.message?.trim() || undefined,
      createdAt: now,
    }
    const all = readAll()
    all.push(n)
    writeAll(all)
    return n
  },

  addTaskPauseRequested(input: { recipientUserId: string; actorUserId: string; taskId: string; message?: string }) {
    const now = new Date().toISOString()
    const n: Notification = {
      id: createId('notif'),
      type: 'task_pause_requested',
      recipientUserId: input.recipientUserId,
      actorUserId: input.actorUserId,
      taskId: input.taskId,
      message: input.message?.trim() || undefined,
      createdAt: now,
    }
    const all = readAll()
    all.push(n)
    writeAll(all)
    return n
  },

  addTaskPauseRejected(input: { recipientUserId: string; actorUserId: string; taskId: string; message?: string }) {
    const now = new Date().toISOString()
    const n: Notification = {
      id: createId('notif'),
      type: 'task_pause_rejected',
      recipientUserId: input.recipientUserId,
      actorUserId: input.actorUserId,
      taskId: input.taskId,
      message: input.message?.trim() || undefined,
      createdAt: now,
    }
    const all = readAll()
    all.push(n)
    writeAll(all)
    return n
  },

  addTaskPauseAccepted(input: { recipientUserId: string; actorUserId: string; taskId: string; message?: string }) {
    const now = new Date().toISOString()
    const n: Notification = {
      id: createId('notif'),
      type: 'task_pause_accepted',
      recipientUserId: input.recipientUserId,
      actorUserId: input.actorUserId,
      taskId: input.taskId,
      message: input.message?.trim() || undefined,
      createdAt: now,
    }
    const all = readAll()
    all.push(n)
    writeAll(all)
    return n
  },

  addTaskUnclaimed(input: { recipientUserId: string; actorUserId: string; taskId: string }) {
    const now = new Date().toISOString()
    const all = readAll()
    const existing = all.find(
      (n) =>
        n.type === 'task_unclaimed' &&
        n.recipientUserId === input.recipientUserId &&
        n.taskId === input.taskId,
    )
    if (existing) return existing
    const n: Notification = {
      id: createId('notif'),
      type: 'task_unclaimed',
      recipientUserId: input.recipientUserId,
      actorUserId: input.actorUserId,
      taskId: input.taskId,
      createdAt: now,
    }
    all.push(n)
    writeAll(all)
    return n
  },

  addTaskAssigned(input: { recipientUserId: string; actorUserId: string; taskId: string }) {
    const now = new Date().toISOString()
    const n: Notification = {
      id: createId('notif'),
      type: 'task_assigned',
      recipientUserId: input.recipientUserId,
      actorUserId: input.actorUserId,
      taskId: input.taskId,
      createdAt: now,
    }
    const all = readAll()
    all.push(n)
    writeAll(all)
    return n
  },

  addTaskAssignedElse(input: { recipientUserId: string; actorUserId: string; taskId: string }) {
    const now = new Date().toISOString()
    const n: Notification = {
      id: createId('notif'),
      type: 'task_assigned_else',
      recipientUserId: input.recipientUserId,
      actorUserId: input.actorUserId,
      taskId: input.taskId,
      createdAt: now,
    }
    const all = readAll()
    all.push(n)
    writeAll(all)
    return n
  },

  markAllRead(userId: string) {
    const all = readAll()
    const now = new Date().toISOString()
    let changed = false
    const updated = all.map((n) => {
      if (n.recipientUserId !== userId) return n
      if (n.readAt) return n
      changed = true
      return { ...n, readAt: now }
    })
    if (changed) writeAll(updated)
  },

  clearAll(userId: string) {
    const all = readAll()
    const next = all.filter((n) => n.recipientUserId !== userId)
    if (next.length === all.length) return
    writeAll(next)
  },

  markRead(notificationId: string) {
    const all = readAll()
    const idx = all.findIndex((n) => n.id === notificationId)
    if (idx === -1) return
    if (all[idx].readAt) return
    const now = new Date().toISOString()
    all[idx] = { ...all[idx], readAt: now }
    writeAll(all)
  },
}

