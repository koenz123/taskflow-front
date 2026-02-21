import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/shared/auth/AuthProvider'
import { paths } from '@/app/router/paths'

/**
 * Global auth guard for the "app" area.
 * Unauthenticated users must not see any app pages (only landing + auth pages).
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const location = useLocation()

  if (auth.status === 'loading') return null
  if (auth.status === 'unauthenticated') {
    const backTo = `${location.pathname}${location.search}`
    return <Navigate to={`${paths.register}?backTo=${encodeURIComponent(backTo)}`} replace />
  }
  return <>{children}</>
}

