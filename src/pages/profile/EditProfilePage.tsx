import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { paths } from '@/app/router/paths'
import { useAuth } from '@/shared/auth/AuthContext'
import { useI18n } from '@/shared/i18n/I18nContext'
import { socialPlatforms } from '@/shared/social/socialPlatforms'
import { HelpTip } from '@/shared/ui/help-tip/HelpTip'
import { useToast } from '@/shared/ui/toast/ToastProvider'
import type { SocialPlatform } from '@/entities/user/model/user'
import { PHONE_COUNTRIES, findPhoneCountry } from '@/shared/phone/countries'
import { CustomSelect } from '@/shared/ui/custom-select/CustomSelect'
import './edit-profile.css'

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function isValidPhone(value: string) {
  // Accepts "+", spaces, (), "-", etc. Validates by digits count.
  const digits = value.replace(/\D/g, '')
  return digits.length >= 10 && digits.length <= 15
}

function phoneDigitsOnly(value: string) {
  return value.replace(/\D/g, '')
}

function formatE164(dial: string, nationalDigits: string) {
  const d = phoneDigitsOnly(dial)
  const n = phoneDigitsOnly(nationalDigits)
  if (!d) return n ? `+${n}` : ''
  if (!n) return `+${d}`
  return `+${d}${n}`
}

function normalizePhoneNational(input: string, countryId: string) {
  const c = findPhoneCountry(countryId) ?? PHONE_COUNTRIES[0]
  const max = c.nationalDigitsExact ?? c.nationalDigitsMax ?? 15
  const dialDigits = phoneDigitsOnly(c.dial)
  const digits = phoneDigitsOnly(input)
  const rest = digits.startsWith(dialDigits) ? digits.slice(dialDigits.length) : digits
  return rest.slice(0, Math.max(0, max))
}

function inferPhoneCountryIdFromPhone(phone: string | null | undefined): string | null {
  const raw = String(phone ?? '').trim()
  if (!raw) return null
  const digits = phoneDigitsOnly(raw)
  if (!digits) return null
  const list = PHONE_COUNTRIES.slice().sort((a, b) => phoneDigitsOnly(b.dial).length - phoneDigitsOnly(a.dial).length)
  for (const c of list) {
    const dial = phoneDigitsOnly(c.dial)
    if (!dial) continue
    if (digits.startsWith(dial)) return c.id
  }
  return null
}

export function EditProfilePage() {
  const { t, locale } = useI18n()
  const auth = useAuth()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const user = auth.user

  const [fullName, setFullName] = useState(user?.fullName ?? '')
  const initialPhoneCountryId = useMemo(() => {
    const inferred = inferPhoneCountryIdFromPhone(user?.phone)
    if (inferred) return inferred
    return locale === 'ru' ? 'RU' : 'US'
  }, [locale, user?.phone])
  const [phoneCountryId, setPhoneCountryId] = useState(initialPhoneCountryId)
  const [phoneNational, setPhoneNational] = useState(() => {
    const inferred = inferPhoneCountryIdFromPhone(user?.phone)
    const key = inferred ?? (locale === 'ru' ? 'RU' : 'US')
    const c = findPhoneCountry(key) ?? PHONE_COUNTRIES[0]
    const dialDigits = phoneDigitsOnly(c.dial)
    const digits = phoneDigitsOnly(user?.phone ?? '')
    const rest = dialDigits && digits.startsWith(dialDigits) ? digits.slice(dialDigits.length) : digits
    return normalizePhoneNational(rest, key)
  })
  const [email, setEmail] = useState(user?.email ?? '')
  const [company, setCompany] = useState(user?.company ?? '')
  const [socials, setSocials] = useState<Partial<Record<SocialPlatform, string>>>(() => user?.socials ?? {})
  const [isSocialsOpen, setIsSocialsOpen] = useState(false)
  const [socialsHelpOpen, setSocialsHelpOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  const [touched, setTouched] = useState<{ fullName?: boolean; phoneNational?: boolean; email?: boolean }>({})
  const [submitted, setSubmitted] = useState(false)

  const fieldErrors = useMemo(() => {
    const errors: { fullName?: string; phoneNational?: string; email?: string } = {}
    if (!fullName.trim()) errors.fullName = t('validation.fullNameRequired')
    const phoneCountry = findPhoneCountry(phoneCountryId) ?? PHONE_COUNTRIES[0]
    const national = phoneDigitsOnly(phoneNational)
    const max = phoneCountry.nationalDigitsExact ?? phoneCountry.nationalDigitsMax ?? 15
    const min = phoneCountry.nationalDigitsExact ?? Math.min(10, max)
    if (!national) errors.phoneNational = t('validation.phoneRequired')
    else if (!isValidPhone(formatE164(phoneCountry.dial, national)) || national.length > max) {
      errors.phoneNational = t('validation.phoneInvalid')
    } else if (phoneCountry.nationalDigitsExact && national.length !== phoneCountry.nationalDigitsExact) {
      errors.phoneNational = t('validation.phoneInvalid')
    } else if (!phoneCountry.nationalDigitsExact && national.length < min) {
      errors.phoneNational = t('validation.phoneInvalid')
    }
    if (!email.trim()) errors.email = t('validation.emailRequired')
    else if (!isValidEmail(email)) errors.email = t('validation.emailInvalid')
    return errors
  }, [email, fullName, phoneCountryId, phoneNational, t])

  const visibleFieldErrors = submitted
    ? fieldErrors
    : (Object.fromEntries(
        Object.entries(fieldErrors).filter(([key]) => touched[key as keyof typeof touched]),
      ) as typeof fieldErrors)

  const isValid = Object.keys(fieldErrors).length === 0

  // Sync socials from server (e.g. after OAuth connect redirect)
  useEffect(() => {
    if (user?.socials) setSocials(user.socials)
  }, [user?.socials])

  // Toast when returning from platform OAuth with ?connected=platform
  useEffect(() => {
    const connected = searchParams.get('connected')
    if (!connected) return
    const platform = socialPlatforms.find((p) => p.key === connected)
    const label = platform?.label ?? connected
    showToast({ tone: 'success', message: t('profile.socialsConnectedToast', { platform: label }) })
    setSearchParams((prev) => {
      prev.delete('connected')
      return prev
    })
  }, [searchParams, setSearchParams, showToast, t])

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

  const apiBase = (import.meta.env.VITE_API_BASE ?? '/api').replace(/\/$/, '')
  const connectBase =
    typeof window !== 'undefined' && !apiBase.startsWith('http')
      ? `${window.location.origin}${apiBase.startsWith('/') ? '' : '/'}${apiBase}`
      : apiBase
  const getConnectUrl = (platform: SocialPlatform) => `${connectBase}/auth/connect/${platform}`

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitted(true)
    setError(null)
    if (!isValid) {
      return
    }
    try {
      const normalized: Partial<Record<SocialPlatform, string>> = {}
      for (const p of socialPlatforms) {
        const raw = socials[p.key]?.trim() ?? ''
        const url = p.normalize(raw)
        if (url) normalized[p.key] = url
      }
      const country = findPhoneCountry(phoneCountryId) ?? PHONE_COUNTRIES[0]
      const phone = formatE164(country.dial, phoneNational)
      await auth.updateProfile({ fullName, phone, email, company, socials: normalized })
      navigate(paths.profile)
    } catch {
      setError(t('auth.genericError'))
    }
  }

  return (
    <main className="editProfilePage">
      <h1 className="editProfileTitle">{t('profile.edit')}</h1>

      <form onSubmit={onSubmit} className="editProfileForm">
        {error ? <div className="editProfileError">{error}</div> : null}

        <label className="editProfileField">
          <span className="editProfileLabel">{t('register.fullName')}</span>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            onBlur={() => setTouched((prev) => ({ ...prev, fullName: true }))}
            className="editProfileInput"
          />
          {visibleFieldErrors.fullName ? (
            <div className="editProfileError">{visibleFieldErrors.fullName}</div>
          ) : null}
        </label>

        <label className="editProfileField">
          <span className="editProfileLabel">{t('register.phone')}</span>
          <div className="editProfilePhoneControl">
            <div className="editProfilePhoneControl__country">
              <CustomSelect<string>
                label=""
                value={phoneCountryId}
                options={PHONE_COUNTRIES.map((c) => ({
                  value: c.id,
                  label: `${locale === 'ru' ? c.labelRu : c.labelEn} (${c.dial})`,
                }))}
                onChange={(nextId) => {
                  setPhoneCountryId(nextId)
                  setPhoneNational((prev) => normalizePhoneNational(prev, nextId))
                }}
              />
            </div>
            <input
              value={phoneNational}
              onChange={(e) => setPhoneNational(normalizePhoneNational(e.target.value, phoneCountryId))}
              onBlur={() => setTouched((prev) => ({ ...prev, phoneNational: true }))}
              inputMode="tel"
              className="editProfilePhoneControl__input"
              placeholder=""
            />
          </div>
          {visibleFieldErrors.phoneNational ? (
            <div className="editProfileError">{visibleFieldErrors.phoneNational}</div>
          ) : null}
        </label>

        <label className="editProfileField">
          <span className="editProfileLabel">{t('register.email')}</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
            inputMode="email"
            className="editProfileInput"
          />
          {visibleFieldErrors.email ? (
            <div className="editProfileError">{visibleFieldErrors.email}</div>
          ) : null}
        </label>

        <label className="editProfileField">
          <span className="editProfileLabel">
            {t('register.company')} <span className="editProfileOptional">{t('common.optional')}</span>
          </span>
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className="editProfileInput"
          />
        </label>

        <div style={{ marginTop: 6 }}>
          <div className="editProfileSocialsHead">
            <div className="editProfileSocialsHeadLeft">
              <div className="editProfileLabel">{t('profile.socialsModalTitle')}</div>
              <HelpTip
                open={socialsHelpOpen}
                onToggle={() => setSocialsHelpOpen((v) => !v)}
                onClose={() => setSocialsHelpOpen(false)}
                ariaLabel={t('profile.socialsHelp.aria')}
                title={t('profile.socialsHelp.title')}
                content={t('profile.socialsHelp.text')}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsSocialsOpen(true)}
            className="editProfileSocialsBtn"
          >
            {t('profile.socialsButton')}
          </button>
        </div>

        <div className="editProfileActions">
          <button
            type="submit"
            className="editProfileBtn editProfileBtn--primary"
          >
            {t('task.edit.save')}
          </button>
          <Link to={paths.profile} className="editProfileCancelLink">
            {t('common.cancel')}
          </Link>
        </div>
      </form>

      {isSocialsOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('profile.socialsModalTitle')}
          className="editProfileOverlay"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="editProfileModal"
          >
            <div className="editProfileModalTop">
              <div className="editProfileModalTitleRow">
                <h2 className="editProfileModalTitle">{t('profile.socialsModalTitle')}</h2>
                <HelpTip
                  open={socialsHelpOpen}
                  onToggle={() => setSocialsHelpOpen((v) => !v)}
                  onClose={() => setSocialsHelpOpen(false)}
                  ariaLabel={t('profile.socialsHelp.aria')}
                  title={t('profile.socialsHelp.title')}
                  content={t('profile.socialsHelp.text')}
                />
              </div>
            </div>

            <div className="editProfileSocialsGrid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginTop: 16 }}>
              {socialPlatforms.map((p) => {
                const connected = Boolean((user?.socials?.[p.key] ?? socials[p.key] ?? '').trim())
                return (
                  <div
                    key={p.key}
                    className="editProfileField"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      padding: 12,
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 12,
                      gap: 8,
                    }}
                  >
                    <img
                      src={`https://cdn.simpleicons.org/${p.simpleIconsSlug}/ffffff`}
                      alt=""
                      width={32}
                      height={32}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      style={{ opacity: connected ? 1 : 0.6 }}
                    />
                    <span className="editProfileLabel" style={{ fontSize: 14 }}>{p.label}</span>
                    {connected ? (
                      <span style={{ fontSize: 12, opacity: 0.9, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-success, #22c55e)' }} />
                        {t('profile.socialsConnected')}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="editProfileBtn editProfileBtn--primary"
                        style={{ fontSize: 13, padding: '6px 12px' }}
                        title={t('profile.socialsConnectHint')}
                        onClick={() => {
                          window.location.href = getConnectUrl(p.key)
                        }}
                      >
                        {t('profile.socialsConnect')}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="editProfileModalActions" style={{ marginTop: 24 }}>
              <button
                type="button"
                onClick={() => setIsSocialsOpen(false)}
                className="editProfileBtn editProfileBtn--primary"
              >
                {t('profile.socialsSave')}
              </button>
              <button
                type="button"
                onClick={() => setIsSocialsOpen(false)}
                className="editProfileBtn"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

