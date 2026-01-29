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

  addTaskCompleted(input: { recipientUserId: string; actorUserId: string; taskId: string }) {
    const now = new Date().toISOString()
    const n: Notification = {
      id: createId('notif'),
      type: 'task_completed',
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

