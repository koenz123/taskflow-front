import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { paths, taskDetailsPath } from '@/app/router/paths'
import { taskRepo } from '@/entities/task/lib/taskRepo'
import { useI18n } from '@/shared/i18n/I18nContext'
import type { TranslationKey } from '@/shared/i18n/translations'
import './create-task.css'
import type { LocalizedText } from '@/entities/task/model/task'
import { useAuth } from '@/shared/auth/AuthContext'

type FormState = {
  title: string
  shortDescription: string
  description: string
  category: string
  location: string
  budgetAmount: string
  budgetCurrency: string
}

type FormErrors = Partial<Record<keyof FormState, string>>

function validate(form: FormState, t: (key: TranslationKey) => string): FormErrors {
  const errors: FormErrors = {}
  if (!form.title.trim()) errors.title = t('validation.taskTitleRequired')
  if (!form.shortDescription.trim()) errors.shortDescription = t('validation.taskShortRequired')
  if (!form.description.trim()) errors.description = t('validation.taskFullRequired')
  return errors
}

function toLocalizedText(value: string, locale: 'en' | 'ru'): LocalizedText {
  return locale === 'ru' ? { ru: value, en: value } : { en: value, ru: value }
}

export function CreateTaskPage() {
  const { t, locale } = useI18n()
  const auth = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState<FormState>({
    title: '',
    shortDescription: '',
    description: '',
    category: '',
    location: 'Remote',
    budgetAmount: '',
    budgetCurrency: 'USD',
  })
  const [touched, setTouched] = useState<Partial<Record<keyof FormState, boolean>>>({})
  const [submitted, setSubmitted] = useState(false)

  const errors = useMemo(() => validate(form, t), [form, t])
  const isValid = Object.keys(errors).length === 0

  const visibleErrors = submitted
    ? errors
    : (Object.fromEntries(
        Object.entries(errors).filter(([key]) => touched[key as keyof FormState]),
      ) as FormErrors)

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitted(true)
    if (!isValid) return

    if (!auth.user) {
      navigate(paths.login)
      return
    }
    if (auth.user.role !== 'customer') {
      return
    }

    const budgetAmount = form.budgetAmount.trim() ? Number(form.budgetAmount) : undefined

    const task = taskRepo.create({
      createdByUserId: auth.user.id,
      title: toLocalizedText(form.title.trim(), locale),
      shortDescription: toLocalizedText(form.shortDescription.trim(), locale),
      description: toLocalizedText(form.description.trim(), locale),
      category: form.category.trim() || undefined,
      location: form.location.trim() || undefined,
      budgetAmount: budgetAmount && Number.isFinite(budgetAmount) ? budgetAmount : undefined,
      budgetCurrency: form.budgetCurrency.trim() || undefined,
    })

    navigate(taskDetailsPath(task.id))
  }

  // Hide publishing UI until user signs in.
  if (!auth.user) {
    return (
      <div className="createTaskPage">
        <div className="createTaskCard">
          <h1 className="createTaskTitle">{t('task.create.title')}</h1>
          <div style={{ opacity: 0.9, marginTop: 8 }}>{t('task.actions.signInToPost')}</div>
          <div className="actionsRow" style={{ marginTop: 14 }}>
            <Link className="primaryLink" to={paths.login}>
              {t('auth.signIn')}
            </Link>
            <Link className="secondaryLink" to={paths.register}>
              {t('auth.signUp')}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Hide publishing UI for executors entirely.
  if (auth.user?.role === 'executor') {
    return (
      <div className="createTaskPage">
        <div className="createTaskCard">
          <h1 className="createTaskTitle">{t('task.create.title')}</h1>
          <div style={{ opacity: 0.9, marginTop: 8 }}>{t('task.actions.onlyClientsCanPost')}</div>
          <div className="actionsRow" style={{ marginTop: 14 }}>
            <Link className="primaryLink" to={paths.tasks}>
              {t('task.details.backToTasks')}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="createTaskPage">
      <div className="createTaskCard">
        <h1 className="createTaskTitle">{t('task.create.title')}</h1>

        <form onSubmit={onSubmit} className="form">
          <label className="field">
            <span className="field__label">{t('task.create.titleField')}</span>
            <input
              className="field__input"
              value={form.title}
              onChange={(e) => setField('title', e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, title: true }))}
              placeholder={t('task.create.placeholder.title')}
              autoComplete="off"
            />
            {visibleErrors.title ? <span className="field__error">{visibleErrors.title}</span> : null}
          </label>

          <label className="field">
            <span className="field__label">{t('task.create.shortDescription')}</span>
            <textarea
              className="field__textarea"
              value={form.shortDescription}
              onChange={(e) => setField('shortDescription', e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, shortDescription: true }))}
              placeholder={t('task.create.placeholder.short')}
            />
            {visibleErrors.shortDescription ? (
              <span className="field__error">{visibleErrors.shortDescription}</span>
            ) : null}
          </label>

          <label className="field">
            <span className="field__label">{t('task.create.fullDescription')}</span>
            <textarea
              className="field__textarea"
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, description: true }))}
              placeholder={t('task.create.placeholder.full')}
            />
            {visibleErrors.description ? <span className="field__error">{visibleErrors.description}</span> : null}
          </label>

          <div className="grid2">
            <label className="field">
              <span className="field__label">
                {t('task.create.category')} <span className="field__hint">{t('common.optional')}</span>
              </span>
              <input
                className="field__input"
                value={form.category}
                onChange={(e) => setField('category', e.target.value)}
                placeholder={t('task.create.placeholder.category')}
              />
            </label>

            <label className="field">
              <span className="field__label">
                {t('task.create.location')} <span className="field__hint">{t('common.optional')}</span>
              </span>
              <input
                className="field__input"
                value={form.location}
                onChange={(e) => setField('location', e.target.value)}
                placeholder={t('task.create.placeholder.location')}
              />
            </label>
          </div>

          <div className="grid2">
            <label className="field">
              <span className="field__label">
                {t('task.create.budgetAmount')} <span className="field__hint">{t('common.optional')}</span>
              </span>
              <input
                className="field__input"
                value={form.budgetAmount}
                onChange={(e) => setField('budgetAmount', e.target.value)}
                placeholder={t('task.create.placeholder.amount')}
                inputMode="decimal"
              />
            </label>

            <label className="field">
              <span className="field__label">
                {t('task.create.currency')} <span className="field__hint">{t('common.optional')}</span>
              </span>
              <input
                className="field__input"
                value={form.budgetCurrency}
                onChange={(e) => setField('budgetCurrency', e.target.value)}
                placeholder={t('task.create.placeholder.currency')}
              />
            </label>
          </div>

          <div className="actionsRow">
            <button className="primaryBtn" type="submit">
              {t('task.create.publish')}
            </button>
            <Link className="secondaryLink" to={paths.tasks}>
              {t('common.cancel')}
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}

