import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { paths } from '@/app/router/paths'
import { useI18n } from '@/shared/i18n/I18nContext'
import { consumePendingSignup, verifyEmailByToken } from '@/shared/auth/emailVerificationApi'
import { userRepo } from '@/entities/user/lib/userRepo'

type Status = 'idle' | 'loading' | 'success' | 'error'

export function VerifyEmailPage() {
  const { t, locale } = useI18n()
  const location = useLocation()
  const qs = useMemo(() => new URLSearchParams(location.search), [location.search])
  const token = (qs.get('token') ?? '').trim()
  const [status, setStatus] = useState<Status>('idle')
  const [details, setDetails] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setDetails(locale === 'ru' ? 'Нет токена подтверждения.' : 'Missing verification token.')
      return
    }

    let cancelled = false
    setStatus('loading')
    setDetails(null)
    void (async () => {
      try {
        // This call is idempotent on the server and will also return pending signup data (if any).
        const result = await verifyEmailByToken(token)
        if (result.pending) {
          userRepo.createVerifiedFromPending(result.pending)
          await consumePendingSignup(token).catch(() => {})
        } else {
          // Fallback: if user already exists locally (older flow), just mark verified.
          userRepo.markEmailVerified(result.email)
        }
        if (cancelled) return
        setStatus('success')
        setDetails(result.email)
      } catch {
        if (cancelled) return
        setStatus('error')
        setDetails(locale === 'ru' ? 'Не удалось подтвердить почту. Ссылка могла устареть.' : 'Failed to verify email. The link may have expired.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, locale])

  return (
    <div className="authCard">
      <div>
        <h1 className="authTitle">{t('verifyEmail.verify.title')}</h1>
        <p className="authSubtitle">{t('verifyEmail.verify.subtitle')}</p>
      </div>

      {status === 'loading' ? <div className="authErrorBanner">{t('verifyEmail.verify.loading')}</div> : null}
      {status === 'success' ? (
        <div className="authErrorBanner" style={{ background: 'rgba(34,197,94,0.10)', borderColor: 'rgba(34,197,94,0.25)' }}>
          {locale === 'ru' ? 'Почта подтверждена:' : 'Email verified:'} <strong>{details}</strong>
        </div>
      ) : null}
      {status === 'error' ? <div className="authErrorBanner">{details}</div> : null}

      <p className="authFooterText">
        <Link className="authLink" to={paths.login}>
          {locale === 'ru' ? 'Перейти ко входу' : 'Go to login'}
        </Link>
      </p>
    </div>
  )
}

