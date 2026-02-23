import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { paths } from '@/app/router/paths'
import { useI18n } from '@/shared/i18n/I18nContext'
import { userRepo } from '@/entities/user/lib/userRepo'
import { api, ApiError } from '@/shared/api/api'

function registerLink(role: 'customer' | 'executor') {
  return `${paths.register}?role=${role}`
}

const PASSWORD_MIN_LEN = 8

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function randomCode6() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export function ForgotPasswordPage() {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [sent, setSent] = useState(false)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const USE_API = import.meta.env.VITE_DATA_SOURCE === 'api'
  const trimmedEmail = email.trim()

  const step: 'request' | 'reset' | 'done' = done ? 'done' : sent ? 'reset' : 'request'

  const requestValid = useMemo(() => trimmedEmail !== '' && isValidEmail(trimmedEmail), [trimmedEmail])
  const resetValid = useMemo(() => {
    if (!requestValid) return false
    if (!code.trim()) return false
    if (!newPassword) return false
    if (newPassword.length < PASSWORD_MIN_LEN) return false
    if (newPasswordConfirm !== newPassword) return false
    return true
  }, [code, newPassword, newPasswordConfirm, requestValid])

  async function requestResetApi(email: string) {
    const attempts: Array<() => Promise<any>> = [
      () => api.post('/auth/forgot-password', { email }),
      () => api.post('/auth/forgot-password/request', { email }),
      () => api.post('/auth/password/forgot', { email }),
      () => api.post('/auth/reset-password/request', { email }),
      () => api.post('/auth/reset-password', { email }),
    ]
    let lastErr: unknown = null
    for (const run of attempts) {
      try {
        return await run()
      } catch (e) {
        lastErr = e
        if (e instanceof ApiError && e.status === 404) continue
        throw e
      }
    }
    throw lastErr ?? new Error('request_failed')
  }

  function resetErrorText(e: unknown) {
    if (e instanceof ApiError) {
      const payloadError =
        e.payload && typeof e.payload === 'object' && 'error' in e.payload && typeof (e.payload as any).error === 'string'
          ? String((e.payload as any).error)
          : ''
      const s = `${payloadError} ${e.message}`.toLowerCase()
      if (s.includes('expired') || s.includes('timeout') || s.includes('time')) return t('auth.reset.codeExpired')
      if (s.includes('invalid') || s.includes('wrong') || s.includes('token') || s.includes('code') || s.includes('otp')) {
        return t('auth.reset.invalidCode')
      }
      if (s.includes('password') && (s.includes('min') || s.includes('short') || s.includes('length'))) {
        return t('auth.reset.weakPassword', { min: PASSWORD_MIN_LEN })
      }
      return t('auth.resetPasswordFailed')
    }
    return t('auth.resetPasswordFailed')
  }

  async function confirmResetApi(input: { email: string; code: string; newPassword: string }) {
    const email = input.email
    const code = input.code
    const password = input.newPassword

    // Try multiple common payload shapes and endpoints.
    const bodies: unknown[] = [
      { email, code, password },
      { email, code, newPassword: password },
      { email, token: code, password },
      { email, token: code, newPassword: password },
      { email, otp: code, password },
      { email, otp: code, newPassword: password },
      { email, resetCode: code, password },
      { email, resetCode: code, newPassword: password },
      { email, verificationCode: code, password },
      { email, verificationCode: code, newPassword: password },
      { email, code, password, passwordConfirm: password },
      { email, token: code, password, passwordConfirm: password },
    ]

    const calls: Array<() => Promise<any>> = []
    for (const body of bodies) {
      calls.push(() => api.post('/auth/reset-password', body))
      calls.push(() => api.post('/auth/reset-password/confirm', body))
      calls.push(() => api.post('/auth/password/reset', body))
      calls.push(() => api.post('/auth/forgot-password/confirm', body))
      calls.push(() => api.patch('/auth/reset-password', body))
      calls.push(() => api.patch('/auth/reset-password/confirm', body))
      calls.push(() => api.patch('/auth/password/reset', body))
    }

    let lastErr: unknown = null
    for (const run of calls) {
      try {
        return await run()
      } catch (e) {
        lastErr = e
        if (e instanceof ApiError) {
          if (e.status === 404) continue
          // 400 often means "wrong field names". Try next variant unless it's clearly an invalid/expired code.
          if (e.status === 400) {
            const payloadError =
              e.payload && typeof e.payload === 'object' && 'error' in e.payload && typeof (e.payload as any).error === 'string'
                ? String((e.payload as any).error)
                : ''
            const s = `${payloadError} ${e.message}`.toLowerCase()
            if (s.includes('invalid') || s.includes('expired') || s.includes('wrong') || s.includes('not found')) {
              throw e
            }
            continue
          }
        }
        throw e
      }
    }
    throw lastErr ?? new Error('request_failed')
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    void (async () => {
      setSubmitted(true)
      setError(null)

      if (step === 'request') {
        if (!requestValid) return
        setBusy(true)
        try {
          if (USE_API) {
            await requestResetApi(trimmedEmail)
          } else {
            // Local mode simulation: store a 6-digit code.
            const code = randomCode6()
            localStorage.setItem(`ui-create-works.passwordReset.${trimmedEmail.toLowerCase()}`, code)
          }
          setSent(true)
        } catch (e) {
          // Don't reveal account existence; still move forward.
          setSent(true)
        } finally {
          setBusy(false)
        }
        return
      }

      if (step === 'reset') {
        if (!resetValid) return
        setBusy(true)
        try {
          if (USE_API) {
            await confirmResetApi({ email: trimmedEmail, code: code.trim(), newPassword })
          } else {
            const key = `ui-create-works.passwordReset.${trimmedEmail.toLowerCase()}`
            const expected = localStorage.getItem(key)
            if (!expected || expected.trim() !== code.trim()) throw new Error('invalid_code')
            await userRepo.setPasswordByEmail(trimmedEmail, newPassword)
            localStorage.removeItem(key)
          }
          setDone(true)
        } catch (e) {
          setError(resetErrorText(e))
        } finally {
          setBusy(false)
        }
      }
    })()
  }

  return (
    <div className="authCard">
      <div>
        <h1 className="authTitle">{t('auth.forgotPassword')}</h1>
        <p className="authSubtitle">{t('auth.forgot.subtitle')}</p>
      </div>

      <form className="authForm" onSubmit={onSubmit}>
        {error ? <div className="authErrorBanner">{error}</div> : null}
        {submitted && step === 'request' && !requestValid ? (
          <div className="authErrorBanner">{t('auth.forgot.invalidEmail')}</div>
        ) : null}
        {sent && step === 'reset' ? (
          <div
            className="authErrorBanner"
            style={{
              borderColor: 'rgba(255,255,255,0.14)',
              background: 'rgba(255,255,255,0.03)',
              color: 'rgba(255,255,255,0.9)',
            }}
          >
            {t('auth.forgotPasswordSent')}
          </div>
        ) : null}
        {done ? (
          <div
            className="authErrorBanner"
            style={{
              borderColor: 'rgba(34,197,94,0.28)',
              background: 'rgba(34,197,94,0.08)',
              color: 'rgba(216,255,232,0.95)',
            }}
          >
            {t('auth.resetPasswordSuccess')}
          </div>
        ) : null}

        <label className="authField">
          <span className="authLabel">{t('auth.email')}</span>
          <input
            className="authInput"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            autoComplete="email"
            inputMode="email"
            disabled={step !== 'request' || busy}
          />
        </label>

        {step === 'done' ? (
          <Link className="authBtn authBtn--primary" to={paths.login}>
            {t('auth.backToLogin')}
          </Link>
        ) : step === 'reset' ? (
          <>
            <label className="authField">
              <span className="authLabel">{t('auth.resetCode')}</span>
              <input
                className="authInput"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t('auth.resetCode.placeholder')}
                inputMode="numeric"
                autoComplete="one-time-code"
                disabled={busy}
              />
            </label>
            <label className="authField">
              <span className="authLabel">{t('auth.newPassword')}</span>
              <input
                className="authInput"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                type="password"
                autoComplete="new-password"
                disabled={busy}
              />
            </label>
            <label className="authField">
              <span className="authLabel">{t('auth.newPasswordConfirm')}</span>
              <input
                className="authInput"
                value={newPasswordConfirm}
                onChange={(e) => setNewPasswordConfirm(e.target.value)}
                type="password"
                autoComplete="new-password"
                disabled={busy}
              />
            </label>
            {submitted && !resetValid ? <div className="authErrorBanner">{t('auth.reset.invalid')}</div> : null}
            <button type="submit" className="authBtn authBtn--primary" disabled={!resetValid || busy}>
              {busy ? t('common.loading') : t('auth.resetPassword')}
            </button>
          </>
        ) : (
          <button type="submit" className="authBtn authBtn--primary" disabled={!requestValid || busy}>
            {busy ? t('common.loading') : t('auth.sendLink')}
          </button>
        )}

        <div className="authFooterText">
          <div>
            {t('auth.noAccountJoin')}{' '}
            <Link className="authLink" to={registerLink('customer')}>
              {t('auth.joinAsCustomer')}
            </Link>{' '}
            {t('auth.or')}{' '}
            <Link className="authLink" to={registerLink('executor')}>
              {t('auth.joinAsExecutor')}
            </Link>
            .
          </div>
          <div style={{ marginTop: 8 }}>
            <Link className="authLink" to={paths.login}>
              {t('auth.backToLogin')}
            </Link>
          </div>
        </div>
      </form>
    </div>
  )
}

