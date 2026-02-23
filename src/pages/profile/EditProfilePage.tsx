import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
  const [socialVideos, setSocialVideos] = useState<Partial<Record<SocialPlatform, File | null>>>(() => ({}))
  const [isSocialsOpen, setIsSocialsOpen] = useState(false)
  const [socialsDraft, setSocialsDraft] = useState<Partial<Record<SocialPlatform, string>>>(() => user?.socials ?? {})
  const [socialVideosDraft, setSocialVideosDraft] = useState<Partial<Record<SocialPlatform, File | null>>>(() => ({}))
  const [socialVideoErrors, setSocialVideoErrors] = useState<Partial<Record<SocialPlatform, string>>>(() => ({}))
  const [socialsModalError, setSocialsModalError] = useState<string | null>(null)
  const [socialsHelpOpen, setSocialsHelpOpen] = useState(false)
  const [socialsModerationPending, setSocialsModerationPending] = useState(false)
  const [socialsModerationSubmittedAt, setSocialsModerationSubmittedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  useEffect(() => {
    const myId = String(user?.id ?? '').trim()
    if (!myId) return
    try {
      const raw = localStorage.getItem('ui-create-works.socialsModeration.v1')
      const parsed = raw ? (JSON.parse(raw) as any) : null
      const rec = parsed && typeof parsed === 'object' ? parsed[myId] : null
      const pending = Boolean(rec && rec.status === 'pending')
      setSocialsModerationPending(pending)
      setSocialsModerationSubmittedAt(typeof rec?.submittedAt === 'string' ? rec.submittedAt : null)
    } catch {
      setSocialsModerationPending(false)
      setSocialsModerationSubmittedAt(null)
    }
  }, [user?.id])

  function markSocialsModerationPending() {
    const myId = String(user?.id ?? '').trim()
    if (!myId) return
    const submittedAt = new Date().toISOString()
    setSocialsModerationPending(true)
    setSocialsModerationSubmittedAt(submittedAt)
    try {
      const key = 'ui-create-works.socialsModeration.v1'
      const raw = localStorage.getItem(key)
      const parsed = raw ? (JSON.parse(raw) as any) : {}
      const next = parsed && typeof parsed === 'object' ? parsed : {}
      next[myId] = { status: 'pending', submittedAt }
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      // ignore
    }
  }

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

  const socialsHelpVideoUrl: string | null = null

  const missingRequiredSocialVideosCount = useMemo(() => {
    let missing = 0
    for (const p of socialPlatforms) {
      const hasValue = Boolean((socialsDraft[p.key] ?? '').trim())
      if (!hasValue) continue
      const attached = socialVideosDraft[p.key] ?? null
      if (!attached) missing += 1
    }
    return missing
  }, [socialsDraft, socialVideosDraft])

  const completeSocialPairsCount = useMemo(() => {
    let complete = 0
    for (const p of socialPlatforms) {
      const hasValue = Boolean((socialsDraft[p.key] ?? '').trim())
      if (!hasValue) continue
      const attached = socialVideosDraft[p.key] ?? null
      if (attached) complete += 1
    }
    return complete
  }, [socialsDraft, socialVideosDraft])

  const canSubmitSocialsForModeration = completeSocialPairsCount > 0 && missingRequiredSocialVideosCount === 0

  useEffect(() => {
    if (!socialsModalError) return
    if (canSubmitSocialsForModeration) setSocialsModalError(null)
  }, [canSubmitSocialsForModeration, socialsModalError])

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
                footer={
                  <button
                    type="button"
                    className="helpTipModal__actionBtn"
                    disabled={!socialsHelpVideoUrl}
                    title={!socialsHelpVideoUrl ? t('profile.socialsHelp.videoMissingHint') : undefined}
                    onClick={() => {
                      if (!socialsHelpVideoUrl) return
                      window.open(socialsHelpVideoUrl, '_blank', 'noopener,noreferrer')
                    }}
                  >
                    {t('profile.socialsHelp.watchVideo')}
                  </button>
                }
              />
            </div>
            <div className="editProfileSocialsHint">{t('profile.socialsHint')}</div>
          </div>

          <button
            type="button"
            onClick={() => {
              setSocialsDraft(socials)
              setSocialVideosDraft(socialVideos)
              setSocialVideoErrors({})
              setSocialsModalError(null)
              setIsSocialsOpen(true)
            }}
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
                  footer={
                    <button
                      type="button"
                      className="helpTipModal__actionBtn"
                      disabled={!socialsHelpVideoUrl}
                      title={!socialsHelpVideoUrl ? t('profile.socialsHelp.videoMissingHint') : undefined}
                      onClick={() => {
                        if (!socialsHelpVideoUrl) return
                        window.open(socialsHelpVideoUrl, '_blank', 'noopener,noreferrer')
                      }}
                    >
                      {t('profile.socialsHelp.watchVideo')}
                    </button>
                  }
                />
              </div>
            </div>
            {socialsModerationPending ? (
              <div className="editProfileModerationBanner" role="status">
                <div style={{ fontWeight: 750 }}>
                  {t('profile.socialsModerationPendingTitle')}
                </div>
                <div style={{ opacity: 0.9, marginTop: 4 }}>
                  {t('profile.socialsModerationPendingText')}
                  {socialsModerationSubmittedAt ? (
                    <span style={{ opacity: 0.8 }}>
                      {' '}
                      {locale === 'ru'
                        ? `(${new Date(socialsModerationSubmittedAt).toLocaleString('ru-RU')})`
                        : `(${new Date(socialsModerationSubmittedAt).toLocaleString('en-US')})`}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
            {socialsModalError ? (
              <div className="editProfileError" style={{ marginTop: 10 }}>
                {socialsModalError}
              </div>
            ) : null}

            <div
              className="editProfileSocialsGrid"
            >
              {socialPlatforms.map((p) => (
                <label key={p.key} className="editProfileField">
                  <span className="editProfileLabel">{p.label}</span>
                  {(() => {
                    const hasValue = Boolean((socialsDraft[p.key] ?? '').trim())
                    const fileInputId = `social-video-${p.key}`
                    const attached = socialVideosDraft[p.key] ?? null
                    const errorText = socialVideoErrors[p.key] ?? null

                    return (
                      <>
                        <div className="editProfileInputWithAction">
                          <input
                            value={socialsDraft[p.key] ?? ''}
                            disabled={socialsModerationPending}
                            onChange={(e) => {
                              const value = e.target.value
                              setSocialsDraft((prev) => ({ ...prev, [p.key]: value }))
                              const nowHasValue = Boolean(value.trim())
                              if (!nowHasValue) {
                                setSocialVideosDraft((prev) => ({ ...prev, [p.key]: null }))
                                setSocialVideoErrors((prev) => {
                                  const next = { ...prev }
                                  delete next[p.key]
                                  return next
                                })
                              }
                            }}
                            placeholder={p.key === 'telegram' ? '@username or https://t.me/username' : '@username or URL'}
                            className="editProfileInput"
                          />
                          <input
                            id={fileInputId}
                            type="file"
                            accept="video/*"
                            className="editProfileHiddenFileInput"
                            disabled={socialsModerationPending}
                            onChange={(e) => {
                              const file = e.target.files?.[0] ?? null
                              setSocialVideosDraft((prev) => ({ ...prev, [p.key]: file }))
                              if (file) {
                                setSocialVideoErrors((prev) => {
                                  const next = { ...prev }
                                  delete next[p.key]
                                  return next
                                })
                              }
                              setSocialsModalError(null)
                            }}
                          />
                          {hasValue ? (
                            <button
                              type="button"
                              className="editProfileInputActionBtn"
                              disabled={socialsModerationPending}
                              onClick={() => {
                                const el = document.getElementById(fileInputId) as HTMLInputElement | null
                                el?.click()
                              }}
                            >
                              {t('profile.socialsAttachVideo')}
                            </button>
                          ) : null}
                        </div>
                        {errorText ? <div className="editProfileError">{errorText}</div> : null}
                        {attached ? (
                          <div className="editProfileAttachedVideoHint">
                            {t('profile.socialsAttachedVideo')}: {attached.name}
                          </div>
                        ) : null}
                      </>
                    )
                  })()}
                </label>
              ))}
            </div>

            <div className="editProfileModalActions">
              {!socialsModerationPending ? (
                <button
                  type="button"
                  onClick={() => {
                    setSocialsModalError(null)
                    const missingKeys: SocialPlatform[] = []
                    for (const p of socialPlatforms) {
                      const hasValue = Boolean((socialsDraft[p.key] ?? '').trim())
                      if (!hasValue) continue
                      const attached = socialVideosDraft[p.key] ?? null
                      if (!attached) missingKeys.push(p.key)
                    }
                    if (missingKeys.length > 0) {
                      const next = Object.fromEntries(
                        missingKeys.map((k) => [k, t('profile.socialsVideoRequired')]),
                      ) as Partial<Record<SocialPlatform, string>>
                      setSocialVideoErrors(next)
                      return
                    }
                    if (completeSocialPairsCount === 0) {
                      setSocialsModalError(t('profile.socialsModerationNothingError'))
                      return
                    }
                    setSocials(socialsDraft)
                    setSocialVideos(socialVideosDraft)
                    markSocialsModerationPending()
                    showToast({
                      tone: 'success',
                      message: locale === 'ru' ? 'Социальные сети отправлены на модерацию.' : 'Social links were submitted for moderation.',
                    })
                    setIsSocialsOpen(false)
                  }}
                  className={`editProfileBtn editProfileBtn--primary${canSubmitSocialsForModeration ? '' : ' editProfileBtn--inactive'}`}
                  aria-disabled={!canSubmitSocialsForModeration}
                  title={
                    !canSubmitSocialsForModeration
                      ? missingRequiredSocialVideosCount > 0
                        ? t('profile.socialsVideoRequired')
                        : t('profile.socialsSubmitRequiresPair')
                      : undefined
                  }
                >
                  {t('profile.socialsSubmitForModeration')}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setSocialVideoErrors({})
                  setSocialsModalError(null)
                  setIsSocialsOpen(false)
                }}
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

