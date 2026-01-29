export type TaskStatus = 'open' | 'in_progress' | 'closed'

export type LocalizedText = {
  en: string
  ru: string
}

export type Task = {
  id: string
  title: LocalizedText
  shortDescription: LocalizedText
  description: LocalizedText

  createdByUserId?: string
  assignedToUserId?: string
  takenAt?: string // ISO datetime
  completedAt?: string // ISO datetime

  category?: string
  location?: string

  budgetAmount?: number
  budgetCurrency?: string

  dueDate?: string // ISO date: YYYY-MM-DD
  expiresAt: string // ISO datetime, createdAt + 24h by default
  status: TaskStatus

  createdAt: string // ISO datetime
}

