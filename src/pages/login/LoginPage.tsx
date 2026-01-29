import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { paths } from '@/app/router/paths'
import { useI18n } from '@/shared/i18n/I18nContext'
import { useAuth } from '@/shared/auth/AuthContext'

function registerLink(role: 'customer' | 'executor') {
  return `${paths.register}?role=${role}`
}

export function LoginPage() {
  const { t } = useI18n()
  const auth = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [submitted, setSubmitted] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const isValid = useMemo(() => email.trim() !== '' && password !== '', [email, password])

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitted(true)
    setFormError(null)
    if (!isValid) return

    try {
      await auth.signIn(email, password, { remember: rememberMe })
      navigate(paths.home)
    } catch {
      setFormError(t('auth.invalidCredentials'))
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 520, margin: '0 auto' }}>
      <div
        style={{
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 18,
          padding: 20,
          background: 'rgba(255,255,255,0.05)',
          boxShadow: '0 22px 70px rgba(0,0,0,0.22)',
        }}
      >
        <h1 style={{ margin: 0 }}>{t('login.title')}</h1>
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12, marginTop: 12 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 13, opacity: 0.9 }}>{t('auth.email')}</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            autoComplete="email"
            inputMode="email"
            style={{
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(0,0,0,0.12)',
              color: 'inherit',
              padding: '10px 12px',
              outline: 'none',
            }}
          />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 13, opacity: 0.9 }}>{t('auth.password')}</span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            style={{
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(0,0,0,0.12)',
              color: 'inherit',
              padding: '10px 12px',
              outline: 'none',
            }}
          />
        </label>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, opacity: 0.9 }}>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            {t('auth.rememberMe')}
          </label>
          <Link to={paths.forgotPassword} style={{ fontSize: 13, opacity: 0.9 }}>
            {t('auth.forgotPassword')}
          </Link>
        </div>

        {submitted && !isValid ? (
          <div style={{ fontSize: 12, color: '#ffb4b4' }}>{t('auth.fillRequired')}</div>
        ) : null}
        {formError ? <div style={{ fontSize: 12, color: '#ffb4b4' }}>{formError}</div> : null}

        <button
          type="submit"
          className="submitBtn"
          style={{
            marginTop: 6,
            borderRadius: 12,
          }}
        >
          {t('auth.signIn')}
        </button>

        <button
          type="button"
          className="submitBtn"
          style={{
            marginTop: 4,
            borderRadius: 12,
            background:
              'linear-gradient(90deg, rgba(66,133,244,0.9), rgba(15, 118, 210, 0.95))',
            borderColor: 'rgba(255,255,255,0.14)',
            boxShadow: '0 12px 24px rgba(15, 118, 210, 0.55)',
          }}
          onClick={() => window.open('https://accounts.google.com/signin', '_blank')}
        >
          {t('auth.signInWithGoogle')}
        </button>

        <p style={{ margin: 0, fontSize: 13, opacity: 0.9, lineHeight: 1.5 }}>
          {t('auth.noAccountJoin')}{' '}
          <Link to={registerLink('customer')}>{t('auth.joinAsCustomer')}</Link> {t('auth.or')}{' '}
          <Link to={registerLink('executor')}>{t('auth.joinAsExecutor')}</Link>.
        </p>
        </form>

      </div>
    </main>
  )
}

