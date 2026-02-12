export type ApplicationStatus = 'pending' | 'selected' | 'rejected'

export type TaskApplication = {
  id: string
  taskId: string
  executorUserId: string
  message?: string
  status: ApplicationStatus
  contractId?: string
  createdAt: string
  updatedAt: string
}
