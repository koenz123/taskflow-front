import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { paths, taskDetailsPath } from '@/app/router/paths'
import { taskRepo } from '@/entities/task/lib/taskRepo'
import { useI18n } from '@/shared/i18n/I18nContext'
import type { TranslationKey } from '@/shared/i18n/translations'
import './edit-task.css'

type FormState = {
  title: string
  shortDescription: string
  requirements: string
  description: string
  category: string
  location: string
  budgetAmount: string
  budgetCurrency: string
  maxExecutors: string
}

type FormErrors = Partial<Record<keyof FormState, string>>

const TITLE_WORDS_MIN = 2
const TITLE_WORDS_MAX = 8
const SHORT_WORDS_MIN = 5
const SHORT_WORDS_MAX = 25
const REQ_WORDS_MIN = 5
const REQ_WORDS_MAX = 120
const FULL_WORDS_MIN = 15
const FULL_WORDS_MAX = 200

function countWords(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return 0
  try {
    return (trimmed.match(/\p{L}[\p{L}\p{N}'’-]*/gu) ?? []).length
  } catch {
    return trimmed.split(/\s+/).filter(Boolean).length
  }
}

function validate(form: FormState, t: (key: TranslationKey) => string): FormErrors {
  const errors: FormErrors = {}
  const title = form.title.trim()
  const short = form.shortDescription.trim()
  const req = form.requirements.trim()
  const full = form.description.trim()

  if (!title) errors.title = t('validation.taskTitleRequired')
  else {
    const wc = countWords(title)
    if (wc < TITLE_WORDS_MIN || wc > TITLE_WORDS_MAX) errors.title = t('validation.taskTitleLength')
  }

  if (!short) errors.shortDescription = t('validation.taskShortRequired')
  else {
    const wc = countWords(short)
    if (wc < SHORT_WORDS_MIN || wc > SHORT_WORDS_MAX) errors.shortDescription = t('validation.taskShortLength')
  }

  if (!req) errors.requirements = localeFallback(t, 'validation.taskRequirementsRequired', 'Requirements are required')
  else {
    const wc = countWords(req)
    if (wc < REQ_WORDS_MIN || wc > REQ_WORDS_MAX) {
      errors.requirements = localeFallback(t, 'validation.taskRequirementsLength', 'Requirements length is invalid')
    }
  }

  if (!full) errors.description = t('validation.taskFullRequired')
  else {
    const wc = countWords(full)
    if (wc < FULL_WORDS_MIN || wc > FULL_WORDS_MAX) errors.description = t('validation.taskFullLength')
  }

  const max = form.maxExecutors.trim()
  const maxNum = max ? Number(max) : NaN
  if (!max) errors.maxExecutors = t('validation.maxExecutorsRequired')
  else if (!Number.isFinite(maxNum) || !Number.isInteger(maxNum) || maxNum < 1 || maxNum > 10) {
    errors.maxExecutors = t('validation.maxExecutorsRange')
  }

  return errors
}

function localeFallback(
  t: (key: TranslationKey) => string,
  key: TranslationKey,
  fallback: string,
) {
  const value = t(key)
  return value === key ? fallback : value
}

export function EditTaskPage() {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const { taskId } = useParams()

  const task = useMemo(() => (taskId ? taskRepo.getById(taskId) : null), [taskId])
  const [form, setForm] = useState<FormState>(() => ({
    title: task?.title[locale] ?? '',
    shortDescription: task?.shortDescription[locale] ?? '',
    requirements: task?.requirements?.[locale] ?? '',
    description: task?.description[locale] ?? '',
    category: task?.category ?? '',
    location: task?.location ?? '',
    budgetAmount: task?.budgetAmount ? String(task.budgetAmount) : '',
    budgetCurrency: task?.budgetCurrency ?? 'USD',
    maxExecutors: String(task?.maxExecutors ?? 1),
  }))
  const [touched, setTouched] = useState<Partial<Record<keyof FormState, boolean>>>({})
  const [submitted, setSubmitted] = useState(false)

  const errors = useMemo(() => validate(form, t), [form, t])
  const isValid = Object.keys(errors).length === 0
  const visibleErrors = submitted
    ? errors
    : (Object.fromEntries(
        Object.entries(errors).filter(([key]) => touched[key as keyof FormState]),
      ) as FormErrors)

  if (!taskId || !task) {
    return (
      <main style={{ padding: 24 }}>
        <h1>{t('task.details.notFound')}</h1>
        <p>
          <Link to={paths.tasks}>{t('task.details.backToTasks')}</Link>
        </p>
      </main>
    )
  }

  const id = taskId

  const titleCount = countWords(form.title)
  const shortCount = countWords(form.shortDescription)
  const reqCount = countWords(form.requirements)
  const fullCount = countWords(form.description)

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitted(true)
    if (!isValid) return

    const maxExecutorsValue = Math.floor(Number(form.maxExecutors))
    taskRepo.update(id, (prev) => ({
      ...prev,
      title: { ...prev.title, [locale]: form.title.trim() },
      shortDescription: { ...prev.shortDescription, [locale]: form.shortDescription.trim() },
      requirements: { ...(prev.requirements ?? { en: '', ru: '' }), [locale]: form.requirements.trim() },
      description: { ...prev.description, [locale]: form.description.trim() },
      category: form.category.trim() || undefined,
      location: form.location.trim() || undefined,
      budgetAmount: form.budgetAmount.trim() ? Number(form.budgetAmount) : undefined,
      budgetCurrency: form.budgetCurrency.trim() || undefined,
      maxExecutors: maxExecutorsValue,
    }))

    navigate(taskDetailsPath(id))
  }

  return (
    <div className="editTaskPage">
      <div className="editTaskCard">
        <h1 className="editTaskTitle">{t('task.edit.title')}</h1>

        <form onSubmit={onSubmit}>
          <label className="field">
            <span className="field__labelRow">
              <span className="field__label">{t('task.create.titleField')}</span>
              <span className={`field__counter ${titleCount >= TITLE_WORDS_MAX ? 'field__counter--danger' : ''}`}>
                {titleCount}/{TITLE_WORDS_MAX}
              </span>
            </span>
            <input
              className="field__input"
              value={form.title}
              onChange={(e) => setField('title', e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, title: true }))}
            />
            {visibleErrors.title ? <span className="field__error">{visibleErrors.title}</span> : null}
          </label>

          <label className="field">
            <span className="field__labelRow">
              <span className="field__label">{t('task.create.shortDescription')}</span>
              <span className={`field__counter ${shortCount >= SHORT_WORDS_MAX ? 'field__counter--danger' : ''}`}>
                {shortCount}/{SHORT_WORDS_MAX}
              </span>
            </span>
            <textarea
              className="field__textarea"
              value={form.shortDescription}
              onChange={(e) => setField('shortDescription', e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, shortDescription: true }))}
            />
            {visibleErrors.shortDescription ? (
              <span className="field__error">{visibleErrors.shortDescription}</span>
            ) : null}
          </label>

          <label className="field">
            <span className="field__labelRow">
              <span className="field__label">{locale === 'ru' ? 'Требования' : 'Requirements'}</span>
              <span className={`field__counter ${reqCount >= REQ_WORDS_MAX ? 'field__counter--danger' : ''}`}>
                {reqCount}/{REQ_WORDS_MAX}
              </span>
            </span>
            <textarea
              className="field__textarea"
              value={form.requirements}
              onChange={(e) => setField('requirements', e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, requirements: true }))}
              rows={4}
            />
            {visibleErrors.requirements ? <span className="field__error">{visibleErrors.requirements}</span> : null}
          </label>

          <label className="field">
            <span className="field__labelRow">
              <span className="field__label">{t('task.create.fullDescription')}</span>
              <span className={`field__counter ${fullCount >= FULL_WORDS_MAX ? 'field__counter--danger' : ''}`}>
                {fullCount}/{FULL_WORDS_MAX}
              </span>
            </span>
            <textarea
              className="field__textarea"
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, description: true }))}
            />
            {visibleErrors.description ? <span className="field__error">{visibleErrors.description}</span> : null}
          </label>

          <div className="grid2">
            <label className="field">
              <span className="field__label">{t('task.create.category')}</span>
              <input
                className="field__input"
                value={form.category}
                onChange={(e) => setField('category', e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, category: true }))}
              />
            </label>

            <label className="field">
              <span className="field__label">{t('task.create.location')}</span>
              <input
                className="field__input"
                value={form.location}
                onChange={(e) => setField('location', e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, location: true }))}
              />
            </label>
          </div>

          <div className="grid2">
            <label className="field">
              <span className="field__label">{t('task.create.budgetAmount')}</span>
              <input
                className="field__input"
                value={form.budgetAmount}
                onChange={(e) => setField('budgetAmount', e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, budgetAmount: true }))}
                inputMode="decimal"
              />
            </label>

            <label className="field">
              <span className="field__label">{t('task.create.currency')}</span>
              <input
                className="field__input"
                value={form.budgetCurrency}
                onChange={(e) => setField('budgetCurrency', e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, budgetCurrency: true }))}
              />
            </label>
          </div>

          <label className="field">
            <span className="field__label">{t('task.create.maxExecutors')}</span>
            <input
              className="field__input"
              value={form.maxExecutors}
              onChange={(e) =>
                setField('maxExecutors', e.target.value.replace(/[^\d]/g, '').slice(0, 2))
              }
              onBlur={() => setTouched((t) => ({ ...t, maxExecutors: true }))}
              placeholder={t('task.create.maxExecutors.placeholder')}
              inputMode="numeric"
              min={1}
              max={10}
            />
            {visibleErrors.maxExecutors ? (
              <span className="field__error">{visibleErrors.maxExecutors}</span>
            ) : null}
          </label>

          <div className="actionsRow">
            <button
              type="button"
              className="secondaryLink"
              onClick={() => {
                navigate(-1)
              }}
            >
              <span aria-hidden="true" style={{ marginRight: 8 }}>
                ←
              </span>
              {t('task.details.back')}
            </button>
            <button className="primaryBtn" type="submit">
              {t('task.edit.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

