import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/shared/auth/AuthProvider'
import { paths } from '@/app/router/paths'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const location = useLocation()

  if (auth.status === 'loading') return null
  if (auth.status === 'unauthenticated') {
    const backTo = `${location.pathname}${location.search}`
    return <Navigate to={`${paths.login}?backTo=${encodeURIComponent(backTo)}`} replace />
  }
  return <>{children}</>
}

