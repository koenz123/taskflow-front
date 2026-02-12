export type TaskStatus = 'draft' | 'open' | 'in_progress' | 'review' | 'dispute' | 'closed' | 'archived'

export type LocalizedText = {
  en: string
  ru: string
}

export type TaskExecutorMode = 'blogger_ad' | 'customer_post' | 'ai'

export type TaskDeliverable = {
  platform: string
  quantity: number
}

export type TaskReferenceVideo = {
  blobId: string
  name: string
  mimeType?: string
}

export type TaskReference =
  | { kind: 'url'; url: string }
  // Legacy single video reference (kept for backward compatibility)
  | ({ kind: 'video' } & TaskReferenceVideo)
  | { kind: 'videos'; videos: TaskReferenceVideo[] }

export type Task = {
  id: string
  title: LocalizedText
  shortDescription: LocalizedText
  requirements?: LocalizedText
  description: LocalizedText
  /**
   * Optional attached text files with extended brief.
   * `descriptionFile` is kept for backward compatibility (legacy single-file shape).
   */
  descriptionFiles?: Array<{
    name: string
    text: string
  }>
  descriptionFile?: {
    name: string
    text: string
  }
  reference?: TaskReference

  createdByUserId?: string
  /**
   * Who executes the task (and where the result is published).
   *
   * - blogger_ad: result is published on executor social (sponsored placement)
   * - customer_post: executor delivers result for customer to publish
   * - ai: future AI generator (hidden from executor marketplace for now)
   */
  executorMode?: TaskExecutorMode
  /**
   * Requested video count per platform.
   * Example: [{ platform: 'TikTok', quantity: 10 }]
   */
  deliverables?: TaskDeliverable[]
  assignedExecutorIds: string[]
  takenAt?: string // ISO datetime
  completedAt?: string // ISO datetime
  reviewSubmittedAt?: string // ISO datetime
  category?: string
  location?: string

  budgetAmount?: number
  budgetCurrency?: string

  dueDate?: string // ISO date: YYYY-MM-DD
  expiresAt: string // ISO datetime, createdAt + 24h by default
  status: TaskStatus

  maxExecutors: number
  completionVideoUrl?: string
  completionLinks?: Array<{
    platform: string
    url: string
  }>
  editWindowExpiresAt?: string
  lockedAfterPublish?: boolean

  createdAt: string // ISO datetime
}

