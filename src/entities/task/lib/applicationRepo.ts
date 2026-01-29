import { createId } from '@/shared/lib/id'
import type { TaskApplication } from '../model/application'

const STORAGE_KEY = 'ui-create-works.taskApplications.v1'
const CHANGE_EVENT = 'ui-create-works.taskApplications.change'

function safeParse(json: string | null): TaskApplication[] {
  if (!json) return []
  try {
    const data = JSON.parse(json) as unknown
    if (!Array.isArray(data)) return []
    return data as TaskApplication[]
  } catch {
    return []
  }
}

function readAll(): TaskApplication[] {
  return safeParse(localStorage.getItem(STORAGE_KEY))
}

function writeAll(items: TaskApplication[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export const applicationRepo = {
  listAll(): TaskApplication[] {
    return readAll().slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },

  listForTask(taskId: string): TaskApplication[] {
    return this.listAll().filter((app) => app.taskId === taskId)
  },

  listForExecutor(executorUserId: string): TaskApplication[] {
    return this.listAll().filter((app) => app.executorUserId === executorUserId)
  },

  listForCustomer(userTaskIds: string[]): TaskApplication[] {
    return this.listAll().filter((app) => userTaskIds.includes(app.taskId))
  },

  create(input: { taskId: string; executorUserId: string; message?: string }): TaskApplication {
    const now = new Date().toISOString()
    const app: TaskApplication = {
      id: createId('app'),
      taskId: input.taskId,
      executorUserId: input.executorUserId,
      message: input.message?.trim() || undefined,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    }
    const all = readAll()
    all.push(app)
    writeAll(all)
    return app
  },

  updateStatus(applicationId: string, status: TaskApplication['status']) {
    const now = new Date().toISOString()
    const all = readAll()
    const idx = all.findIndex((app) => app.id === applicationId)
    if (idx === -1) return null
    const updated = { ...all[idx], status, updatedAt: now }
    all[idx] = updated
    writeAll(all)
    return updated
  },

  select(applicationId: string): TaskApplication | null {
    const all = readAll()
    const target = all.find((app) => app.id === applicationId)
    if (!target) return null
    const now = new Date().toISOString()
    const updated: TaskApplication[] = all.map((app) => {
      if (app.taskId !== target.taskId) return app
      if (app.id === applicationId) return { ...app, status: 'selected' as TaskApplication['status'], updatedAt: now }
      if (app.status === 'pending') return { ...app, status: 'rejected' as TaskApplication['status'], updatedAt: now }
      return app
    })
    writeAll(updated)
    return updated.find((app) => app.id === applicationId) ?? null
  },

  reject(applicationId: string) {
    return this.updateStatus(applicationId, 'rejected')
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
