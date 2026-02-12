import { userRepo } from '@/entities/user/lib/userRepo'
import { sessionRepo } from '@/shared/auth/sessionRepo'

declare global {
  interface Window {
    __uiCreateWorks?: {
      pruneCustomersExceptEmail: (emailToKeep: string) => { removed: number; keptUserId: string }
    }
  }
}

function ensureSessionValid() {
  const userId = sessionRepo.getUserId()
  if (!userId) return
  const exists = userRepo.getById(userId)
  if (!exists) sessionRepo.clear()
}

window.__uiCreateWorks = {
  pruneCustomersExceptEmail: (emailToKeep: string) => {
    const result = userRepo.pruneCustomersExceptEmail(emailToKeep)
    ensureSessionValid()
    return result
  },
}

