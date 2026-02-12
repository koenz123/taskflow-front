export type ExecutorViolationType = 'no_start_12h' | 'no_submit_24h'

export type ExecutorViolation = {
  id: string
  executorId: string
  type: ExecutorViolationType

  taskId: string
  assignmentId: string

  createdAt: string // ISO datetime
}

