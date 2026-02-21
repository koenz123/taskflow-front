import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { paths } from '@/app/router/paths'
import { useI18n } from '@/shared/i18n/I18nContext'
import { consumePendingSignup, sendVerificationCode, verifyEmailByCode } from '@/shared/auth/emailVerificationApi'
import { sessionRepo } from '@/shared/auth/sessionRepo'

export function VerifyEmailPage() {
  const { t, locale } = useI18n()
  const location = useLocation()
  const navigate = useNavigate()
  const qs = useMemo(() => new URLSearchParams(location.search), [location.search])
  const email = (qs.get('email') ?? '').trim()
  const backTo = (() => {
    const raw = (qs.get('backTo') ?? '').trim()
    return raw.startsWith('/') ? raw : null
  })()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [resendBusy, setResendBusy] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  return (
    <div className="authCard">
      <div>
        <h1 className="authTitle">{t('verifyEmail.verify.title')}</h1>
        <p className="authSubtitle">{t('verifyEmail.verify.subtitle')}</p>
      </div>

      {email ? (
        <div className="authErrorBanner" style={{ background: 'rgba(124,58,237,0.12)', borderColor: 'rgba(124,58,237,0.22)' }}>
          {locale === 'ru' ? 'Почта:' : 'Email:'} <strong>{email}</strong>
        </div>
      ) : (
        <div className="authErrorBanner">{locale === 'ru' ? 'Не указан email для подтверждения.' : 'Missing email to verify.'}</div>
      )}

      {status === 'success' ? (
        <div className="authErrorBanner" style={{ background: 'rgba(34,197,94,0.10)', borderColor: 'rgba(34,197,94,0.25)' }}>
          {locale === 'ru' ? 'Почта подтверждена.' : 'Email verified.'}
        </div>
      ) : null}
      {status === 'error' && message ? <div className="authErrorBanner">{message}</div> : null}

      <label className="authField" style={{ marginTop: 6 }}>
        <span className="authLabel">{locale === 'ru' ? 'Код из письма' : 'Email code'}</span>
        <input
          className="authInput"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={locale === 'ru' ? 'Например: 123456' : 'E.g. 123456'}
          inputMode="numeric"
          autoComplete="one-time-code"
        />
      </label>

      <button
        type="button"
        className="authBtn authBtn--primary"
        disabled={!email || !code.trim() || busy}
        onClick={() => {
          if (!email) return
          const trimmed = code.trim()
          if (!trimmed) return
          setBusy(true)
          setStatus('idle')
          setMessage(null)
          void (async () => {
            try {
              await verifyEmailByCode({ email, code: trimmed })
              const consumed = await consumePendingSignup({ email, code: trimmed })

              const token = (consumed && typeof consumed === 'object' && 'token' in consumed && typeof (consumed as any).token === 'string'
                ? String((consumed as any).token)
                : null)
              const userId = (consumed && typeof consumed === 'object' && 'user' in consumed && (consumed as any).user && typeof (consumed as any).user.id === 'string'
                ? String((consumed as any).user.id)
                : null)
              const tg = (consumed && typeof consumed === 'object' && 'user' in consumed && (consumed as any).user && typeof (consumed as any).user.telegramUserId === 'string'
                ? String((consumed as any).user.telegramUserId)
                : null)

              if (token && userId) {
                sessionRepo.clear()
                sessionRepo.setToken(token, { remember: true })
                sessionRepo.setUserId(userId, { remember: true })
                if (tg) sessionRepo.setTelegramUserId(tg, { remember: true })
                navigate(backTo ?? paths.home, { replace: true })
                return
              }

              setStatus('success')
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e)
              setStatus('error')
              setMessage(
                locale === 'ru'
                  ? `Не удалось подтвердить код: ${msg}`
                  : `Failed to verify code: ${msg}`,
              )
            } finally {
              setBusy(false)
            }
          })()
        }}
      >
        {busy ? (locale === 'ru' ? 'Проверяем…' : 'Verifying…') : (locale === 'ru' ? 'Подтвердить' : 'Verify')}
      </button>

      <button
        type="button"
        className="authBtn"
        disabled={!email || resendBusy || busy}
        onClick={() => {
          if (!email) return
          setResendBusy(true)
          setMessage(null)
          void (async () => {
            try {
              await sendVerificationCode(email)
              setStatus('idle')
              setMessage(t('verifyEmail.verify.resend.success'))
            } catch {
              setStatus('error')
              setMessage(t('verifyEmail.verify.resend.error'))
            } finally {
              setResendBusy(false)
            }
          })()
        }}
      >
        {resendBusy ? (locale === 'ru' ? 'Отправляем…' : 'Sending…') : t('verifyEmail.verify.resend')}
      </button>

      <p className="authFooterText">
        <Link className="authLink" to={`${paths.login}${email ? `?email=${encodeURIComponent(email)}` : ''}`}>
          {locale === 'ru' ? 'Перейти ко входу' : 'Go to login'}
        </Link>
      </p>
    </div>
  )
}

