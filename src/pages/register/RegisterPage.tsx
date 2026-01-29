import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { paths } from '@/app/router/paths'
import { useI18n } from '@/shared/i18n/I18nContext'
import type { TranslationKey } from '@/shared/i18n/translations'
import { useAuth } from '@/shared/auth/AuthContext'
import './register-page.css'

type Role = 'customer' | 'executor'

type FormState = {
  role: Role
  fullName: string
  phone: string
  email: string
  password: string
  passwordConfirm: string
  company: string
}

type FormErrors = Partial<Record<keyof FormState, string>>

function validate(form: FormState, t: (key: TranslationKey) => string): FormErrors {
  const errors: FormErrors = {}

  if (!form.fullName.trim()) errors.fullName = t('validation.fullNameRequired')
  if (!form.phone.trim()) errors.phone = t('validation.phoneRequired')
  if (!form.email.trim()) errors.email = t('validation.emailRequired')
  if (!form.password) errors.password = t('validation.passwordRequired')
  if (!form.passwordConfirm) errors.passwordConfirm = t('validation.passwordConfirmRequired')
  if (form.password && form.passwordConfirm && form.password !== form.passwordConfirm) {
    errors.passwordConfirm = t('validation.passwordsDoNotMatch')
  }

  return errors
}

export function RegisterPage() {
  const { t } = useI18n()
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const roleFromQuery = (() => {
    const qs = new URLSearchParams(location.search)
    const role = qs.get('role')
    return role === 'customer' || role === 'executor' ? role : null
  })()
  const [form, setForm] = useState<FormState>({
    role: roleFromQuery ?? 'customer',
    fullName: '',
    phone: '',
    email: '',
    password: '',
    passwordConfirm: '',
    company: '',
  })
  const [touched, setTouched] = useState<Partial<Record<keyof FormState, boolean>>>({})
  const [submitted, setSubmitted] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const errors = useMemo(() => validate(form, t), [form, t])

  const visibleErrors = submitted
    ? errors
    : (Object.fromEntries(
        Object.entries(errors).filter(([key]) => touched[key as keyof FormState]),
      ) as FormErrors)

  const isValid = Object.keys(errors).length === 0

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    void (async () => {
    e.preventDefault()
    setSubmitted(true)
    setFormError(null)

    if (!isValid) return

    try {
      await auth.signUp({
        role: form.role,
        fullName: form.fullName,
        phone: form.phone,
        email: form.email,
        company: form.role === 'customer' ? form.company : undefined,
        password: form.password,
      })
      navigate(paths.profile)
    } catch (e) {
      if (e instanceof Error && e.message === 'email_taken') setFormError(t('auth.emailTaken'))
      else setFormError(t('auth.genericError'))
    }
    })()
  }

  return (
    <div className="registerPage">
      <div className="registerCard">
        <h1 className="registerTitle">{t('register.title')}</h1>

        <div className="roleSwitch" role="group" aria-label={t('register.roleLabel')}>
          <button
            type="button"
            className={form.role === 'customer' ? 'roleBtn roleBtn--active' : 'roleBtn'}
            onClick={() => setField('role', 'customer')}
          >
            {t('register.role.client')}
          </button>
          <button
            type="button"
            className={form.role === 'executor' ? 'roleBtn roleBtn--active' : 'roleBtn'}
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

        <form className="form" onSubmit={onSubmit}>
          {formError ? <div className="field__error">{formError}</div> : null}
          <label className="field">
            <span className="field__label">{t('register.fullName')}</span>
            <input
              className="field__input"
              value={form.fullName}
              onChange={(e) => setField('fullName', e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, fullName: true }))}
              placeholder="John Smith"
              autoComplete="name"
            />
            {visibleErrors.fullName ? <span className="field__error">{visibleErrors.fullName}</span> : null}
          </label>

          <label className="field">
            <span className="field__label">{t('register.phone')}</span>
            <input
              className="field__input"
              value={form.phone}
              onChange={(e) => setField('phone', e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
              placeholder="+1 555 123 4567"
              autoComplete="tel"
              inputMode="tel"
            />
            {visibleErrors.phone ? <span className="field__error">{visibleErrors.phone}</span> : null}
          </label>

          <label className="field">
            <span className="field__label">{t('register.email')}</span>
            <input
              className="field__input"
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              placeholder="name@example.com"
              autoComplete="email"
              inputMode="email"
            />
            {visibleErrors.email ? <span className="field__error">{visibleErrors.email}</span> : null}
          </label>

          <label className="field">
            <span className="field__label">{t('register.password')}</span>
            <input
              className="field__input"
              value={form.password}
              onChange={(e) => setField('password', e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
            />
            {visibleErrors.password ? <span className="field__error">{visibleErrors.password}</span> : null}
          </label>

          <label className="field">
            <span className="field__label">{t('register.passwordConfirm')}</span>
            <input
              className="field__input"
              value={form.passwordConfirm}
              onChange={(e) => setField('passwordConfirm', e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, passwordConfirm: true }))}
              type="password"
              autoComplete="new-password"
              placeholder="Repeat password"
            />
            {visibleErrors.passwordConfirm ? (
              <span className="field__error">{visibleErrors.passwordConfirm}</span>
            ) : null}
          </label>

          {form.role === 'customer' ? (
            <label className="field">
              <span className="field__label">
                {t('register.company')} <span className="field__hint">{t('common.optional')}</span>
              </span>
              <input
                className="field__input"
                value={form.company}
                onChange={(e) => setField('company', e.target.value)}
                placeholder="Acme Inc."
                autoComplete="organization"
              />
            </label>
          ) : null}

          <button className="submitBtn" type="submit">
            {t('register.submit')}
          </button>

          <p className="footerText">
            {t('register.haveAccount')} <Link to={paths.login}>{t('register.signInLink')}</Link>
          </p>
        </form>
      </div>
    </div>
  )
}

