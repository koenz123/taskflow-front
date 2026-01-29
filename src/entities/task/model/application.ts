export type ApplicationStatus = 'pending' | 'selected' | 'rejected'

export type TaskApplication = {
  id: string
  taskId: string
  executorUserId: string
  message?: string
  status: ApplicationStatus
  createdAt: string
  updatedAt: string
}
