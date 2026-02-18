import { api, ApiError } from '@/shared/api/api'
import type { Goal } from '../model/goal'
import { logError, logEvent } from '@/shared/logging/logger'

export async function createGoal(title: string, userId: string): Promise<Goal> {
  const trimmed = title.trim()
  if (!trimmed) throw new Error('goal_title_empty')

  logEvent('goal_create_requested', { titleLen: trimmed.length })

  try {
    const goal = await api.post<Goal>(
      '/goals',
      { title: trimmed },
      {
        headers: {
          'x-user-id': userId,
        },
      },
    )
    logEvent('goal_created', { goalId: goal.id })
    return goal
  } catch (e) {
    const requestId = e instanceof ApiError ? e.requestId : null
    const message = e instanceof Error ? e.message : String(e)
    logError('API_GOAL_CREATE_FAILED', { requestId, message })
    throw e
  }
}

