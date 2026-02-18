import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/shared/auth/AuthProvider'
import { paths } from '@/app/router/paths'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const auth = useAuth()

  if (auth.status === 'loading') return null
  if (auth.status === 'unauthenticated') return <Navigate to={paths.login} replace />
  return <>{children}</>
}

