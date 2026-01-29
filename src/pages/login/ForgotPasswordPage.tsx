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
        <h1 style={{ margin: 0 }}>{t('auth.forgotPassword')}</h1>
        <p style={{ margin: '10px 0 0', opacity: 0.85 }}>{t('auth.forgotPasswordHint')}</p>

        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12, marginTop: 14 }}>
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

          {submitted && !isValid ? <div style={{ fontSize: 12, color: '#ffb4b4' }}>{t('auth.fillRequired')}</div> : null}
          {sent ? <div style={{ fontSize: 12, opacity: 0.9 }}>{t('auth.forgotPasswordSent')}</div> : null}

          <button type="submit" className="submitBtn" style={{ marginTop: 6, borderRadius: 12 }}>
            {t('auth.sendLink')}
          </button>
        </form>

        <div style={{ marginTop: 14, fontSize: 13, opacity: 0.92, lineHeight: 1.5 }}>
          <div>
            {t('auth.noAccountJoin')}{' '}
            <Link to={registerLink('customer')}>{t('auth.joinAsCustomer')}</Link> {t('auth.or')}{' '}
            <Link to={registerLink('executor')}>{t('auth.joinAsExecutor')}</Link>.
          </div>
          <div style={{ marginTop: 8 }}>
            <Link to={paths.login}>{t('auth.backToLogin')}</Link>
          </div>
        </div>
      </div>
    </main>
  )
}

