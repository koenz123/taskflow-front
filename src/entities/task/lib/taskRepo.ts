import type { LocalizedText, Task, TaskStatus } from '../model/task'
import type { TaskApplication } from '../model/application'
import { createId } from '@/shared/lib/id'
import { applicationRepo } from './applicationRepo'

const STORAGE_KEY_V2 = 'ui-create-works.tasks.v2'
const STORAGE_KEY_V1 = 'ui-create-works.tasks.v1'
export const TTL_MS = 24 * 60 * 60 * 1000

function calcExpiresAt(createdAtIso: string) {
  const ms = Date.parse(createdAtIso)
  const base = Number.isFinite(ms) ? ms : Date.now()
  return new Date(base + TTL_MS).toISOString()
}

function safeParse(json: string | null): unknown[] | null {
  if (!json) return null
  try {
    const data = JSON.parse(json) as unknown
    if (!Array.isArray(data)) return null
    return data
  } catch {
    return null
  }
}

function isLocalizedText(value: unknown): value is LocalizedText {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.en === 'string' && typeof v.ru === 'string'
}

function normalizeStatus(value: unknown): TaskStatus {
  if (
    value === 'draft' ||
    value === 'open' ||
    value === 'in_progress' ||
    value === 'review' ||
    value === 'dispute' ||
    value === 'closed' ||
    value === 'archived'
  ) {
    return value
  }
  return 'open'
}

export function normalizeTask(raw: unknown): Task | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  const id = typeof r.id === 'string' ? r.id : createId('task')
  const createdAt = typeof r.createdAt === 'string' ? r.createdAt : new Date().toISOString()
  const status = normalizeStatus(r.status)
  const expiresAt =
    typeof r.expiresAt === 'string' && r.expiresAt.trim() ? r.expiresAt : calcExpiresAt(createdAt)

  // Legacy v1 shape: title/shortDescription/description are strings.
  const title: LocalizedText =
    isLocalizedText(r.title) ? r.title : { en: String(r.title ?? ''), ru: String(r.title ?? '') }
  const shortDescription: LocalizedText =
    isLocalizedText(r.shortDescription)
      ? r.shortDescription
      : { en: String(r.shortDescription ?? ''), ru: String(r.shortDescription ?? '') }
  const description: LocalizedText =
    isLocalizedText(r.description)
      ? r.description
      : { en: String(r.description ?? ''), ru: String(r.description ?? '') }
  const requirements: LocalizedText | undefined = (() => {
    if (r.requirements === undefined || r.requirements === null) return undefined
    if (isLocalizedText(r.requirements)) return r.requirements
    const str = String(r.requirements ?? '').trim()
    if (!str) return undefined
    return { en: str, ru: str }
  })()

  let descriptionFile: Task['descriptionFile'] | undefined = (() => {
    const v = (r as any).descriptionFile as unknown
    if (!v || typeof v !== 'object') return undefined
    const rr = v as Record<string, unknown>
    const name = typeof rr.name === 'string' ? rr.name.trim() : ''
    const text = typeof rr.text === 'string' ? rr.text : ''
    if (!name || !text) return undefined
    return { name, text }
  })()

  let descriptionFiles: Task['descriptionFiles'] | undefined = (() => {
    const v = (r as any).descriptionFiles as unknown
    if (!Array.isArray(v)) return undefined
    const normalized = v
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const rr = item as Record<string, unknown>
        const name = typeof rr.name === 'string' ? rr.name.trim() : ''
        const text = typeof rr.text === 'string' ? rr.text : ''
        if (!name || !text) return null
        return { name, text }
      })
      .filter(Boolean) as Array<{ name: string; text: string }>
    return normalized.length ? normalized.slice(0, 3) : undefined
  })()

  // Backward compatibility: if only legacy single-file is present, expose it as an array too.
  if (!descriptionFiles && descriptionFile) descriptionFiles = [descriptionFile]
  // And vice-versa: if new array exists, keep legacy field populated with the first item.
  if (!descriptionFile && descriptionFiles?.length) descriptionFile = descriptionFiles[0]

  const executorMode: NonNullable<Task['executorMode']> = (() => {
    const v = (r as any).executorMode as unknown
    if (v === 'blogger_ad' || v === 'customer_post' || v === 'ai') return v
    // Backward-compatible default: previously tasks were delivered to the customer for publishing.
    return 'customer_post'
  })()

  const deliverables: Task['deliverables'] | undefined = (() => {
    const v = (r as any).deliverables as unknown
    if (!Array.isArray(v)) return undefined
    const normalized = v
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const rr = item as Record<string, unknown>
        const platform = typeof rr.platform === 'string' ? rr.platform.trim() : ''
        const quantityRaw = typeof rr.quantity === 'number' && Number.isFinite(rr.quantity) ? Math.floor(rr.quantity) : NaN
        const quantity = Number.isFinite(quantityRaw) ? Math.max(1, quantityRaw) : 1
        if (!platform) return null
        return { platform, quantity }
      })
      .filter(Boolean) as NonNullable<Task['deliverables']>
    return normalized.length ? normalized : undefined
  })()

  const reference: Task['reference'] | undefined = (() => {
    const v = (r as any).reference as unknown
    if (!v || typeof v !== 'object') return undefined
    const rr = v as Record<string, unknown>
    const kind = rr.kind
    if (kind === 'url') {
      const url = typeof rr.url === 'string' ? rr.url.trim() : ''
      if (!url) return undefined
      return { kind: 'url' as const, url }
    }
    if (kind === 'video') {
      const blobId = typeof rr.blobId === 'string' ? rr.blobId.trim() : ''
      const name = typeof rr.name === 'string' ? rr.name.trim() : ''
      const mimeType = typeof rr.mimeType === 'string' && rr.mimeType.trim() ? rr.mimeType.trim() : undefined
      if (!blobId || !name) return undefined
      return { kind: 'video' as const, blobId, name, mimeType }
    }
    if (kind === 'videos') {
      const rawVideos = (rr as any).videos as unknown
      if (!Array.isArray(rawVideos)) return undefined
      const normalized = rawVideos
        .map((item) => {
          if (!item || typeof item !== 'object') return null
          const rrr = item as Record<string, unknown>
          const blobId = typeof rrr.blobId === 'string' ? rrr.blobId.trim() : ''
          const name = typeof rrr.name === 'string' ? rrr.name.trim() : ''
          const mimeType = typeof rrr.mimeType === 'string' && rrr.mimeType.trim() ? rrr.mimeType.trim() : undefined
          if (!blobId || !name) return null
          return { blobId, name, mimeType }
        })
        .filter(Boolean) as Array<{ blobId: string; name: string; mimeType?: string }>
      if (!normalized.length) return undefined
      // Safety: cap stored references to 3 videos.
      return { kind: 'videos' as const, videos: normalized.slice(0, 3) }
    }
    return undefined
  })()

  if (!title.en && !title.ru) return null

  const assignedExecutorIds = Array.isArray(r.assignedExecutorIds)
    ? r.assignedExecutorIds.filter(
        (id): id is string => typeof id === 'string' && id.trim().length > 0,
      )
    : typeof r.assignedToUserId === 'string' && r.assignedToUserId.trim().length > 0
      ? [r.assignedToUserId]
      : []
  const maxExecutors =
    typeof r.maxExecutors === 'number' && Number.isFinite(r.maxExecutors) && r.maxExecutors > 0
      ? Math.max(1, Math.floor(r.maxExecutors))
      : 1

  const completionVideoUrl =
    typeof r.completionVideoUrl === 'string' && r.completionVideoUrl.trim()
      ? r.completionVideoUrl.trim()
      : undefined
  const completionLinks = (() => {
    const value = (r as any).completionLinks as unknown
    if (!Array.isArray(value)) return undefined
    const normalized = value
      .map((x) => {
        if (!x || typeof x !== 'object') return null
        const rr = x as Record<string, unknown>
        const platform = typeof rr.platform === 'string' ? rr.platform.trim() : ''
        const url = typeof rr.url === 'string' ? rr.url.trim() : ''
        if (!platform || !url) return null
        return { platform, url }
      })
      .filter(Boolean) as Array<{ platform: string; url: string }>
    return normalized.length ? normalized : undefined
  })()
  // Legacy fields retained in storage, but no longer used by the UI.
  // We ignore them intentionally to keep the "draft -> publish" flow simple.

  const task: Task = {
    id,
    title,
    shortDescription,
    requirements,
    description,
    descriptionFiles,
    descriptionFile,
    reference,
    executorMode,
    deliverables,
    status,
    createdAt,
    expiresAt,
    assignedExecutorIds,
    maxExecutors,
    completionVideoUrl,
    completionLinks,
  }

  if (typeof r.createdByUserId === 'string' && r.createdByUserId.trim()) task.createdByUserId = r.createdByUserId
  if (typeof r.assignedToUserId === 'string' && r.assignedToUserId.trim()) {
    if (!task.assignedExecutorIds.includes(r.assignedToUserId)) {
      task.assignedExecutorIds.push(r.assignedToUserId)
    }
  }
  if (typeof r.takenAt === 'string' && r.takenAt.trim()) task.takenAt = r.takenAt
  if (typeof r.completedAt === 'string' && r.completedAt.trim()) task.completedAt = r.completedAt
  if (typeof r.reviewSubmittedAt === 'string' && r.reviewSubmittedAt.trim()) task.reviewSubmittedAt = r.reviewSubmittedAt

  if (typeof r.category === 'string' && r.category.trim()) task.category = r.category
  if (typeof r.location === 'string' && r.location.trim()) task.location = r.location
  if (typeof r.budgetAmount === 'number') task.budgetAmount = r.budgetAmount
  if (typeof r.budgetCurrency === 'string' && r.budgetCurrency.trim()) task.budgetCurrency = r.budgetCurrency
  if (typeof r.dueDate === 'string' && r.dueDate.trim()) task.dueDate = r.dueDate

  // Safety: multi-executor tasks must not become "closed" while there are free slots.
  // This can happen if an earlier version closed the whole task after approving the first contract.
  if (task.status === 'closed' && task.assignedExecutorIds.length < task.maxExecutors) {
    task.status = 'in_progress'
    task.completedAt = undefined
  }

  return task
}

function readAll(): Task[] {
  const v2 = safeParse(localStorage.getItem(STORAGE_KEY_V2))
  if (v2 && v2.length > 0) {
    const normalized = v2.map(normalizeTask).filter(Boolean) as Task[]
    if (normalized.length > 0) return normalized
  }

  // Migrate from v1 if present.
  const v1 = safeParse(localStorage.getItem(STORAGE_KEY_V1))
  if (v1 && v1.length > 0) {
    const migrated = v1.map(normalizeTask).filter(Boolean) as Task[]
    if (migrated.length > 0) {
      writeAll(migrated)
      return migrated
    }
  }

  // No tasks yet: do not auto-seed demo data.
  return []
}

function writeAll(tasks: Task[]) {
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(tasks))
  window.dispatchEvent(new Event('ui-create-works.tasks.change'))
}

export const taskRepo = {
  list(): Task[] {
    return readAll()
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },

  getById(taskId: string): Task | null {
    return readAll().find((t) => t.id === taskId) ?? null
  },

  create(
    input: Omit<
      Task,
      | 'id'
      | 'createdAt'
      | 'expiresAt'
      | 'status'
      | 'assignedExecutorIds'
      | 'completionVideoUrl'
      | 'completionLinks'
      | 'reviewSubmittedAt'
    > &
      Partial<Pick<Task, 'status' | 'maxExecutors' | 'completionVideoUrl' | 'completionLinks'>> & { expiresAt?: string },
  ): Task {
    const now = new Date().toISOString()
    const expiresAt =
      typeof input.expiresAt === 'string' && input.expiresAt.trim() ? input.expiresAt : calcExpiresAt(now)
    const { expiresAt: _ignoredExpiresAt, ...rest } = input
    const maxExecutorsInput = typeof input.maxExecutors === 'number' ? Math.floor(input.maxExecutors) : 1
    const maxExecutors = Number.isFinite(maxExecutorsInput) && maxExecutorsInput > 0 ? maxExecutorsInput : 1
    const task: Task = {
      id: createId('task'),
      createdAt: now,
      expiresAt,
      status: 'open',
      ...rest,
      maxExecutors,
      assignedExecutorIds: [],
      completionVideoUrl: input.completionVideoUrl?.trim() || undefined,
      completionLinks: Array.isArray(input.completionLinks) && input.completionLinks.length ? input.completionLinks : undefined,
    }

    const tasks = readAll()
    tasks.push(task)
    writeAll(tasks)
    return task
  },

  update(taskId: string, updater: (task: Task) => Task): Task | null {
    const tasks = readAll()
    const idx = tasks.findIndex((t) => t.id === taskId)
    if (idx === -1) return null
    const updated = updater(tasks[idx])
    tasks[idx] = updated
    writeAll(tasks)
    return updated
  },

  addExecutor(taskId: string, executorUserId: string): Task | null {
    return this.update(taskId, (task) => {
      if (!executorUserId) return task
      if (task.assignedExecutorIds.length >= task.maxExecutors) return task
      if (task.assignedExecutorIds.includes(executorUserId)) return task
      const nextAssigned = [...task.assignedExecutorIds, executorUserId]
      return {
        ...task,
        status: 'in_progress',
        takenAt: task.takenAt || new Date().toISOString(),
        assignedExecutorIds: nextAssigned,
      }
    })
  },

  removeExecutor(taskId: string, executorUserId: string): Task | null {
    return this.update(taskId, (task) => {
      const nextAssigned = task.assignedExecutorIds.filter((id) => id !== executorUserId)
      return {
        ...task,
        status: nextAssigned.length ? 'in_progress' : 'open',
        assignedExecutorIds: nextAssigned,
        takenAt: nextAssigned.length ? task.takenAt : undefined,
        completedAt: nextAssigned.length ? task.completedAt : undefined,
      }
    })
  },

  delete(taskId: string): boolean {
    const tasks = readAll()
    const next = tasks.filter((t) => t.id !== taskId)
    if (next.length === tasks.length) return false
    writeAll(next)
    return true
  },

  archive(taskId: string): Task | null {
    return this.update(taskId, (task) => ({ ...task, status: 'archived' }))
  },

  repost(taskId: string): Task | null {
    const now = new Date().toISOString()
    const updated = this.update(taskId, (task) => ({
      ...task,
      status: 'open',
      createdAt: now,
      expiresAt: (() => {
        const prevDurationMs = Date.parse(task.expiresAt) - Date.parse(task.createdAt)
        const minDurationMs = 1_000 // 1 second
        const durationMs =
          Number.isFinite(prevDurationMs) && prevDurationMs >= minDurationMs ? prevDurationMs : TTL_MS
        return new Date(Date.now() + durationMs).toISOString()
      })(),
      assignedExecutorIds: [],
      takenAt: undefined,
      completedAt: undefined,
      reviewSubmittedAt: undefined,
      completionVideoUrl: undefined,
      completionLinks: undefined,
    }))
    // When reposting, treat the task as "new" for executors: clear old applications.
    if (updated) {
      applicationRepo.deleteForTask(taskId)
    }
    return updated
  },

}

export function archiveStaleTasks(applications: TaskApplication[] = []): string[] {
  const tasks = readAll()
  const now = Date.now()
  const archivedIds: string[] = []
  let changed = false

  const updated = tasks.map((task) => {
    if (task.status !== 'open') return task
    if (task.assignedExecutorIds.length) return task
    if (applications.some((app) => app.taskId === task.id)) return task
    const expMs = Date.parse(task.expiresAt)
    if (Number.isFinite(expMs)) {
      if (expMs > now) return task
    } else {
      const createdMs = Date.parse(task.createdAt)
      if (!Number.isFinite(createdMs) || now - createdMs < TTL_MS) return task
    }
    changed = true
    archivedIds.push(task.id)
    return { ...task, status: 'archived' as TaskStatus }
  })

  if (changed) {
    writeAll(updated)
  }

  return archivedIds
}

export function archiveExpiredTasks(nowMs: number = Date.now()): string[] {
  const tasks = readAll()
  const archivedIds: string[] = []
  let changed = false

  const updated = tasks.map((task) => {
    if (task.status !== 'open') return task
    if (task.assignedExecutorIds.length) return task
    const expMs = Date.parse(task.expiresAt)
    if (!Number.isFinite(expMs) || expMs > nowMs) return task
    changed = true
    archivedIds.push(task.id)
    return { ...task, status: 'archived' as TaskStatus }
  })

  if (changed) {
    writeAll(updated)
  }  return archivedIds
}