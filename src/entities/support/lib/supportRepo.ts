import type { SupportMessage, SupportThread } from '../model/supportThread'
import { createId } from '@/shared/lib/id'

const THREADS_KEY = 'ui-create-works.supportThreads.v1'
const MESSAGES_KEY = 'ui-create-works.supportMessages.v1'

function readThreads(): SupportThread[] {
  try {
    const raw = localStorage.getItem(THREADS_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return data as SupportThread[]
  } catch {
    return []
  }
}

function writeThreads(threads: SupportThread[]) {
  localStorage.setItem(THREADS_KEY, JSON.stringify(threads))
}

function readMessages(): SupportMessage[] {
  try {
    const raw = localStorage.getItem(MESSAGES_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return data as SupportMessage[]
  } catch {
    return []
  }
}

function writeMessages(messages: SupportMessage[]) {
  localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages))
}

export const supportRepo = {
  getOrCreateThreadForUser(userId: string): SupportThread {
    const threads = readThreads()
    const existing = threads.find((t) => t.userId === userId)
    if (existing) return existing
    const now = new Date().toISOString()
    const thread: SupportThread = {
      id: createId('sup'),
      userId,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    }
    threads.push(thread)
    writeThreads(threads)
    return thread
  },

  /** After API create/get thread, sync so local thread for this user uses API id (for correct links and message fetch). */
  ensureThreadFromApi(userId: string, apiThread: SupportThread): void {
    const threads = readThreads()
    const idx = threads.findIndex((t) => t.userId === userId)
    if (idx >= 0) {
      threads[idx] = { ...threads[idx], ...apiThread, userId }
    } else {
      threads.push({ ...apiThread, userId })
    }
    writeThreads(threads)
  },

  getThread(threadId: string): SupportThread | null {
    const t = readThreads().find((thread) => thread.id === threadId) ?? null
    if (t && t.status === undefined) return { ...t, status: 'open' }
    return t
  },

  listThreads(): SupportThread[] {
    return readThreads()
      .map((t) => (t.status === undefined ? { ...t, status: 'open' as const } : t))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  },

  getMessagesForThread(threadId: string): SupportMessage[] {
    return readMessages()
      .filter((m) => m.threadId === threadId)
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  },

  addMessage(threadId: string, fromUserId: string, text: string, attachmentUrls?: string[]): SupportMessage {
    const threads = readThreads()
    const thread = threads.find((t) => t.id === threadId)
    const now = new Date().toISOString()
    const message: SupportMessage = {
      id: createId('supmsg'),
      threadId,
      fromUserId,
      text: text.trim(),
      attachmentUrls: attachmentUrls?.length ? attachmentUrls : undefined,
      createdAt: now,
    }
    const messages = readMessages()
    messages.push(message)
    writeMessages(messages)
    if (thread) {
      thread.updatedAt = now
      writeThreads(threads)
    }
    return message
  },

  closeThread(threadId: string, closedByUserId: string): SupportThread | null {
    const threads = readThreads()
    const idx = threads.findIndex((t) => t.id === threadId)
    if (idx === -1) return null
    const now = new Date().toISOString()
    threads[idx] = { ...threads[idx], status: 'closed', closedAt: now, closedByUserId, updatedAt: now }
    writeThreads(threads)
    return threads[idx]
  },

  setThreadRating(threadId: string, rating: number, comment?: string): SupportThread | null {
    const threads = readThreads()
    const idx = threads.findIndex((t) => t.id === threadId)
    if (idx === -1) return null
    const now = new Date().toISOString()
    threads[idx] = {
      ...threads[idx],
      rating,
      ratingComment: comment?.trim() || undefined,
      ratedAt: now,
      updatedAt: now,
    }
    writeThreads(threads)
    return threads[idx]
  },

  getMessageCount(threadId: string): number {
    return readMessages().filter((m) => m.threadId === threadId).length
  },
}
