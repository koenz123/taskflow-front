import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { paths } from '@/app/router/paths'
import { useI18n } from '@/shared/i18n/I18nContext'
import { sendEmailVerification } from '@/shared/auth/emailVerificationApi'

export function VerifyEmailSentPage() {
  const { t, locale } = useI18n()
  const location = useLocation()
  const qs = useMemo(() => new URLSearchParams(location.search), [location.search])
  const email = (qs.get('email') ?? '').trim()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function onResend() {
    if (!email) return
    setBusy(true)
    setMessage(null)
    try {
      await sendEmailVerification(email)
      setMessage(locale === 'ru' ? 'Письмо отправлено ещё раз.' : 'Verification email sent again.')
    } catch {
      setMessage(locale === 'ru' ? 'Не удалось отправить письмо. Попробуйте позже.' : 'Failed to send email. Try again later.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="authCard">
      <div>
        <h1 className="authTitle">{t('verifyEmail.sent.title')}</h1>
        <p className="authSubtitle">{t('verifyEmail.sent.subtitle')}</p>
      </div>

      {email ? (
        <div className="authErrorBanner" style={{ background: 'rgba(124,58,237,0.12)', borderColor: 'rgba(124,58,237,0.22)' }}>
          {locale === 'ru' ? 'Почта:' : 'Email:'} <strong>{email}</strong>
        </div>
      ) : null}

      {message ? <div className="authErrorBanner">{message}</div> : null}

      <button type="button" className="authBtn authBtn--primary" onClick={onResend} disabled={busy || !email}>
        {busy ? (locale === 'ru' ? 'Отправляем…' : 'Sending…') : t('verifyEmail.sent.resend')}
      </button>

      <p className="authFooterText" style={{ marginTop: 10 }}>
        <Link className="authLink" to={paths.login}>
          {t('verifyEmail.sent.toLogin')}
        </Link>
      </p>
    </div>
  )
}

