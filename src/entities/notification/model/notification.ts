export type NotificationType = 'task_application' | 'task_taken' | 'task_assigned' | 'task_completed'

export type Notification = {
  id: string
  type: NotificationType

  recipientUserId: string
  actorUserId: string
  taskId: string

  createdAt: string // ISO datetime
  readAt?: string // ISO datetime
}

