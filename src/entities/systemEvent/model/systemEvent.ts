export type SystemEventType = 'force_majeure'

export type SystemEvent = {
  id: string
  type: SystemEventType
  startAt: string // ISO datetime
  endAt?: string // ISO datetime
  affectedTaskIds?: string[] // if empty/undefined -> all tasks
  createdAt: string // ISO datetime
}

