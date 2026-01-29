import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { paths } from '@/app/router/paths'
import { useAuth } from '@/shared/auth/AuthContext'
import { useI18n } from '@/shared/i18n/I18nContext'
import { socialPlatforms } from '@/shared/social/socialPlatforms'
import type { SocialPlatform } from '@/entities/user/model/user'

export function EditProfilePage() {
  const { t } = useI18n()
  const auth = useAuth()
  const navigate = useNavigate()

  const user = auth.user

  const [fullName, setFullName] = useState(user?.fullName ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [company, setCompany] = useState(user?.company ?? '')
  const [socials, setSocials] = useState<Partial<Record<SocialPlatform, string>>>(() => user?.socials ?? {})
  const [isSocialsOpen, setIsSocialsOpen] = useState(false)
  const [socialsDraft, setSocialsDraft] = useState<Partial<Record<SocialPlatform, string>>>(() => user?.socials ?? {})
  const [error, setError] = useState<string | null>(null)

  const isValid = useMemo(() => fullName.trim() && phone.trim() && email.trim(), [fullName, phone, email])

  useEffect(() => {
    if (!isSocialsOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsSocialsOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isSocialsOpen])

  if (!user) {
    return (
      <main style={{ padding: 24 }}>
        <h1>{t('profile.edit')}</h1>
        <p>
          <Link to={paths.login}>{t('auth.signIn')}</Link>
        </p>
      </main>
    )
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!isValid) {
      setError(t('auth.fillRequired'))
      return
    }
    try {
      const normalized: Partial<Record<SocialPlatform, string>> = {}
      for (const p of socialPlatforms) {
        const raw = socials[p.key]?.trim() ?? ''
        const url = p.normalize(raw)
        if (url) normalized[p.key] = url
      }
      auth.updateProfile({ fullName, phone, email, company, socials: normalized })
      navigate(paths.profile)
    } catch {
      setError(t('auth.genericError'))
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ marginTop: 0 }}>{t('profile.edit')}</h1>

      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
        {error ? <div style={{ fontSize: 12, color: '#ffb4b4' }}>{error}</div> : null}

        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 13, opacity: 0.9 }}>{t('register.fullName')}</span>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
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
          <span style={{ fontSize: 13, opacity: 0.9 }}>{t('register.phone')}</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
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
          <span style={{ fontSize: 13, opacity: 0.9 }}>{t('register.email')}</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
          <span style={{ fontSize: 13, opacity: 0.9 }}>
            {t('register.company')} <span style={{ opacity: 0.7 }}>{t('common.optional')}</span>
          </span>
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
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

        <div style={{ marginTop: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, opacity: 0.9 }}>{t('profile.socials')}</div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>{t('profile.socialsHint')}</div>
          </div>

          <button
            type="button"
            onClick={() => {
              setSocialsDraft(socials)
              setIsSocialsOpen(true)
            }}
            style={{
              marginTop: 10,
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'rgba(255,255,255,0.06)',
              color: 'inherit',
              padding: '10px 12px',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            {t('profile.socialsButton')}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
          <button
            type="submit"
            style={{
              borderRadius: 12,
              border: '1px solid rgba(99,102,241,0.65)',
              background: 'rgba(99,102,241,0.22)',
              color: 'inherit',
              padding: '12px 14px',
              cursor: 'pointer',
            }}
          >
            {t('task.edit.save')}
          </button>
          <Link to={paths.profile} style={{ alignSelf: 'center', textDecoration: 'none', color: 'inherit', opacity: 0.9 }}>
            {t('common.cancel')}
          </Link>
        </div>
      </form>

      {isSocialsOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('profile.socialsModalTitle')}
          onClick={() => setIsSocialsOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(920px, 100%)',
              maxHeight: 'min(80vh, 720px)',
              overflow: 'auto',
              borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(18,18,18,0.96)',
              backdropFilter: 'blur(10px)',
              padding: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>{t('profile.socialsModalTitle')}</h2>
            </div>

            <div
              className="__socialsGridFix"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 12,
                marginTop: 12,
              }}
            >
              {socialPlatforms.map((p) => (
                <label key={p.key} style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 13, opacity: 0.9 }}>{p.label}</span>
                  <input
                    value={socialsDraft[p.key] ?? ''}
                    onChange={(e) => setSocialsDraft((prev) => ({ ...prev, [p.key]: e.target.value }))}
                    placeholder={p.key === 'telegram' ? '@username or https://t.me/username' : '@username or URL'}
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
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
              <button
                type="button"
                onClick={() => {
                  setSocials(socialsDraft)
                  setIsSocialsOpen(false)
                }}
                style={{
                  borderRadius: 12,
                  border: '1px solid rgba(99,102,241,0.65)',
                  background: 'rgba(99,102,241,0.22)',
                  color: 'inherit',
                  padding: '12px 14px',
                  cursor: 'pointer',
                }}
              >
                {t('task.edit.save')}
              </button>
              <button
                type="button"
                onClick={() => setIsSocialsOpen(false)}
                style={{
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.14)',
                  background: 'rgba(255,255,255,0.06)',
                  color: 'inherit',
                  padding: '12px 14px',
                  cursor: 'pointer',
                }}
              >
                {t('common.cancel')}
              </button>
            </div>

            <style>{`
@media (max-width: 860px) {
  .__socialsGridFix { grid-template-columns: 1fr !important; }
}
            `}</style>
          </div>
        </div>
      ) : null}
    </main>
  )
}

