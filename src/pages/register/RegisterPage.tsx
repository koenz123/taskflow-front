import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { paths } from '@/app/router/paths'
import { useI18n } from '@/shared/i18n/I18nContext'
import type { TranslationKey } from '@/shared/i18n/translations'
import { useAuth } from '@/shared/auth/AuthContext'
import { PHONE_COUNTRIES, findPhoneCountry } from '@/shared/phone/countries'
import { CustomSelect } from '@/shared/ui/custom-select/CustomSelect'

type Role = 'customer' | 'executor'

type FormState = {
  role: Role
  fullName: string
  phoneCountryId: string
  phoneNational: string
  email: string
  password: string
  passwordConfirm: string
  company: string
}

type FormErrors = Partial<Record<keyof FormState, string>>

const PASSWORD_MIN_LEN = 8

function isValidEmail(value: string) {
  // Simple pragmatic email check (client-side)
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

function validate(form: FormState, t: (key: TranslationKey) => string): FormErrors {
  const errors: FormErrors = {}

  if (!form.fullName.trim()) errors.fullName = t('validation.fullNameRequired')
  const phoneCountry = findPhoneCountry(form.phoneCountryId) ?? PHONE_COUNTRIES[0]
  const national = phoneDigitsOnly(form.phoneNational)
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

  if (!form.email.trim()) errors.email = t('validation.emailRequired')
  else if (!isValidEmail(form.email)) errors.email = t('validation.emailInvalid')

  if (!form.password) errors.password = t('validation.passwordRequired')
  else if (form.password.length < PASSWORD_MIN_LEN) errors.password = t('validation.passwordMinLength')

  if (!form.passwordConfirm) errors.passwordConfirm = t('validation.passwordConfirmRequired')
  if (form.password && form.passwordConfirm && form.password !== form.passwordConfirm) {
    errors.passwordConfirm = t('validation.passwordsDoNotMatch')
  }

  return errors
}

export function RegisterPage() {
  const { t, locale } = useI18n()
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const USE_API = import.meta.env.VITE_DATA_SOURCE === 'api'
  const roleFromQuery = (() => {
    const qs = new URLSearchParams(location.search)
    const role = qs.get('role')
    return role === 'customer' || role === 'executor' ? role : null
  })()
  const backToFromQuery = (() => {
    const qs = new URLSearchParams(location.search)
    const backTo = (qs.get('backTo') ?? '').trim()
    return backTo.startsWith('/') ? backTo : null
  })()
  const [form, setForm] = useState<FormState>({
    role: roleFromQuery ?? 'customer',
    fullName: '',
    phoneCountryId: locale === 'ru' ? 'RU' : 'US',
    phoneNational: '',
    email: '',
    password: '',
    passwordConfirm: '',
    company: '',
  })
  const [touched, setTouched] = useState<Partial<Record<keyof FormState, boolean>>>({})
  const [submitted, setSubmitted] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [emailTakenKind, setEmailTakenKind] = useState<null | 'taken' | 'pending'>(null)

  const loginHref = useMemo(() => {
    const email = form.email.trim()
    const params = new URLSearchParams()
    if (email) params.set('email', email)
    if (backToFromQuery) params.set('backTo', backToFromQuery)
    const q = params.toString()
    return q ? `${paths.login}?${q}` : paths.login
  }, [backToFromQuery, form.email])

  // If user hits /register while already authenticated, redirect into the app.
  useEffect(() => {
    if (auth.status !== 'authenticated') return
    const role = auth.user?.role
    const fallback = role === 'executor' ? paths.tasks : role === 'customer' ? paths.customerTasks : paths.profile
    navigate(backToFromQuery ?? fallback, { replace: true })
  }, [auth.status, auth.user?.role, backToFromQuery, navigate])

  const errors = useMemo(() => validate(form, t), [form, t])

  const visibleErrors = submitted
    ? errors
    : (Object.fromEntries(
        Object.entries(errors).filter(([key]) => touched[key as keyof FormState]),
      ) as FormErrors)

  const isValid = Object.keys(errors).length === 0
  const showCompany = form.role === 'customer'

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitted(true)
    setFormError(null)
    setEmailTakenKind(null)

    if (!isValid) return

    try {
      const country = findPhoneCountry(form.phoneCountryId) ?? PHONE_COUNTRIES[0]
      const phone = formatE164(country.dial, form.phoneNational)
      await auth.signUp({
        role: form.role,
        fullName: form.fullName,
        phone,
        email: form.email,
        company: form.role === 'customer' ? form.company : undefined,
        password: form.password,
      })
      if (USE_API) {
        const params = new URLSearchParams()
        params.set('email', form.email.trim())
        if (backToFromQuery) params.set('backTo', backToFromQuery)
        navigate(`${paths.verifyEmail}?${params.toString()}`, { replace: true })
        return
      }

      navigate(`${paths.verifyEmailSent}?email=${encodeURIComponent(form.email.trim())}`)
    } catch (e) {
      if (e instanceof Error && e.message === 'email_taken') {
        setEmailTakenKind('taken')
        setFormError(t('auth.emailTaken'))
      } else if (e instanceof Error && e.message === 'email_pending') {
        setEmailTakenKind('pending')
        setFormError(t('auth.emailPending'))
      }
      else setFormError(t('auth.genericError'))
    }
  }

  return (
    <div className="authCard">
      <div>
        <h1 className="authTitle">{t('register.title')}</h1>
        <p className="authSubtitle">{t('auth.register.subtitle')}</p>
      </div>

      <div className="authRoleSwitch" role="group" aria-label={t('register.roleLabel')}>
        <button
          type="button"
          className={form.role === 'customer' ? 'authRoleBtn authRoleBtn--active' : 'authRoleBtn'}
          onClick={() => setField('role', 'customer')}
        >
          {t('register.role.client')}
        </button>
        <button
          type="button"
          className={form.role === 'executor' ? 'authRoleBtn authRoleBtn--active' : 'authRoleBtn'}
          onClick={() =>
            setForm((prev) => ({
              ...prev,
              role: 'executor',
              company: '',
            }))
          }
        >
          {t('register.role.contractor')}
        </button>
      </div>

      <form className="authForm" onSubmit={onSubmit}>
        {formError ? <div className="authErrorBanner">{formError}</div> : null}
        {emailTakenKind ? (
          <div className="authRow" style={{ marginTop: 8 }}>
            <Link className="authLink" to={loginHref}>
              {t('register.signInLink')}
            </Link>
            {emailTakenKind === 'pending' ? (
              <Link className="authLink" to={`${paths.verifyEmail}?email=${encodeURIComponent(form.email.trim())}`}>
                {t('verifyEmail.sent.resend')}
              </Link>
            ) : null}
          </div>
        ) : null}

        <label className="authField">
          <span className="authLabel">{t('register.fullName')}</span>
          <input
            className="authInput"
            value={form.fullName}
            onChange={(e) => setField('fullName', e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, fullName: true }))}
            placeholder="John Smith"
            autoComplete="name"
          />
          {visibleErrors.fullName ? <span className="authFieldError">{visibleErrors.fullName}</span> : null}
        </label>

        <label className="authField">
          <span className="authLabel">{t('register.phone')}</span>
          <div className="authPhoneControl">
            <div className="authPhoneControl__country">
              <CustomSelect<string>
                label=""
                value={form.phoneCountryId}
                options={PHONE_COUNTRIES.map((c) => ({
                  value: c.id,
                  label: `${locale === 'ru' ? c.labelRu : c.labelEn} (${c.dial})`,
                }))}
                onChange={(nextId) => {
                  setForm((prev) => ({
                    ...prev,
                    phoneCountryId: nextId,
                    phoneNational: normalizePhoneNational(prev.phoneNational, nextId),
                  }))
                }}
              />
            </div>

            <input
              className="authPhoneControl__input"
              value={form.phoneNational}
              onChange={(e) => setField('phoneNational', normalizePhoneNational(e.target.value, form.phoneCountryId))}
              onBlur={() => setTouched((t) => ({ ...t, phoneNational: true }))}
              placeholder={locale === 'ru' ? 'Номер телефона' : 'Phone number'}
              autoComplete="tel"
              inputMode="tel"
            />
          </div>
          {visibleErrors.phoneNational ? <span className="authFieldError">{visibleErrors.phoneNational}</span> : null}
        </label>

        <label className="authField">
          <span className="authLabel">{t('register.email')}</span>
          <input
            className="authInput"
            value={form.email}
            onChange={(e) => setField('email', e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
            placeholder="name@example.com"
            autoComplete="email"
            inputMode="email"
          />
          {visibleErrors.email ? <span className="authFieldError">{visibleErrors.email}</span> : null}
        </label>

        <label className="authField">
          <span className="authLabel">{t('register.password')}</span>
          <input
            className="authInput"
            value={form.password}
            onChange={(e) => setField('password', e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, password: true }))}
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
          />
          {visibleErrors.password ? <span className="authFieldError">{visibleErrors.password}</span> : null}
        </label>

        <label className="authField">
          <span className="authLabel">{t('register.passwordConfirm')}</span>
          <input
            className="authInput"
            value={form.passwordConfirm}
            onChange={(e) => setField('passwordConfirm', e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, passwordConfirm: true }))}
            type="password"
            autoComplete="new-password"
            placeholder="Repeat password"
          />
          {visibleErrors.passwordConfirm ? <span className="authFieldError">{visibleErrors.passwordConfirm}</span> : null}
        </label>

        <label
          className={showCompany ? 'authField authCompanyField' : 'authField authCompanyField authCompanyField--hidden'}
          aria-hidden={!showCompany}
        >
          <span className="authLabel">
            {t('register.company')} <span style={{ opacity: 0.7, fontWeight: 400 }}>{t('common.optional')}</span>
          </span>
          <input
            className="authInput"
            value={form.company}
            onChange={(e) => setField('company', e.target.value)}
            placeholder="Acme Inc."
            autoComplete="organization"
            disabled={!showCompany}
            tabIndex={showCompany ? 0 : -1}
          />
        </label>

        <button className="authBtn authBtn--primary" type="submit" disabled={!isValid}>
          {t('register.submit')}
        </button>

        <p className="authFooterText">
          {t('register.haveAccount')}{' '}
          <Link className="authLink" to={loginHref}>
            {t('register.signInLink')}
          </Link>
        </p>
      </form>
    </div>
  )
}

