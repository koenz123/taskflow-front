import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
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
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [submitted, setSubmitted] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const isValid = useMemo(() => email.trim() !== '' && password !== '', [email, password])

  useEffect(() => {
    const qs = new URLSearchParams(location.search)
    const fromQuery = (qs.get('email') ?? '').trim()
    if (fromQuery) setEmail(fromQuery)
  }, [location.search])

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitted(true)
    setFormError(null)
    if (!isValid) return

    try {
      await auth.signIn(email, password, { remember: rememberMe })
      navigate(paths.tasks)
    } catch (e) {
      if (e instanceof Error && e.message === 'email_not_verified') {
        setFormError(t('auth.emailNotVerified'))
      } else {
        setFormError(t('auth.invalidCredentials'))
      }
    }
  }

  return (
    <div className="authCard">
      <div>
        <h1 className="authTitle">{t('login.title')}</h1>
        <p className="authSubtitle">{t('auth.login.subtitle')}</p>
      </div>

      <form className="authForm" onSubmit={onSubmit}>
        {submitted && !isValid ? <div className="authErrorBanner">{t('auth.fillRequired')}</div> : null}
        {formError ? <div className="authErrorBanner">{formError}</div> : null}

        <label className="authField">
          <span className="authLabel">{t('auth.email')}</span>
          <input
            className="authInput"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            autoComplete="email"
            inputMode="email"
          />
        </label>

        <label className="authField">
          <span className="authLabel">{t('auth.password')}</span>
          <input
            className="authInput"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
          />
        </label>

        <div className="authRow">
          <label className="authCheckbox">
            <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
            {t('auth.rememberMe')}
          </label>
          <Link to={paths.forgotPassword} className="authLink">
            {t('auth.forgotPassword')}
          </Link>
        </div>

        <button type="submit" className="authBtn authBtn--primary" disabled={!isValid}>
          {t('auth.signIn')}
        </button>

        <button
          type="button"
          className="authBtn authBtn--google"
          onClick={() => window.open('https://accounts.google.com/signin', '_blank')}
        >
          {t('auth.signInWithGoogle')}
        </button>

        <p className="authFooterText">
          {t('auth.noAccountJoin')}{' '}
          <Link className="authLink" to={registerLink('customer')}>
            {t('auth.joinAsCustomer')}
          </Link>{' '}
          {t('auth.or')}{' '}
          <Link className="authLink" to={registerLink('executor')}>
            {t('auth.joinAsExecutor')}
          </Link>
          .
        </p>
      </form>
    </div>
  )
}

