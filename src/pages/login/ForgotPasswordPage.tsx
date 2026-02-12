import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { paths } from '@/app/router/paths'
import { useI18n } from '@/shared/i18n/I18nContext'
import { userRepo } from '@/entities/user/lib/userRepo'

function registerLink(role: 'customer' | 'executor') {
  return `${paths.register}?role=${role}`
}

export function ForgotPasswordPage() {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [sent, setSent] = useState(false)

  const isValid = useMemo(() => email.trim() !== '', [email])

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitted(true)
    if (!isValid) return
    // Best-effort UX: do not reveal if email exists (no backend anyway)
    void userRepo.findByEmail(email.trim())
    setSent(true)
  }

  return (
    <div className="authCard">
      <div>
        <h1 className="authTitle">{t('auth.forgotPassword')}</h1>
        <p className="authSubtitle">{t('auth.forgot.subtitle')}</p>
      </div>

      <form className="authForm" onSubmit={onSubmit}>
        {submitted && !isValid ? <div className="authErrorBanner">{t('auth.fillRequired')}</div> : null}
        {sent ? (
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

        <button type="submit" className="authBtn authBtn--primary" disabled={!isValid}>
          {t('auth.sendLink')}
        </button>

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

