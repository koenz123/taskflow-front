import { useMemo } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { paths } from '@/app/router/paths'
import { useI18n } from '@/shared/i18n/I18nContext'

export function VerifyEmailSentPage() {
  useI18n()
  const location = useLocation()
  const qs = useMemo(() => new URLSearchParams(location.search), [location.search])
  const email = (qs.get('email') ?? '').trim()

  const next = new URLSearchParams()
  if (email) next.set('email', email)
  const backTo = (qs.get('backTo') ?? '').trim()
  if (backTo.startsWith('/')) next.set('backTo', backTo)
  const q = next.toString()
  const to = q ? `${paths.verifyEmail}?${q}` : paths.verifyEmail
  return <Navigate to={to} replace />
}

