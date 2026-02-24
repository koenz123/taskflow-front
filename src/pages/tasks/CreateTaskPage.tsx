import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { paths, taskDetailsPath } from '@/app/router/paths'
import { taskRepo } from '@/entities/task/lib/taskRepo'
import { refreshTasks } from '@/entities/task/lib/useTasks'
import { useI18n } from '@/shared/i18n/I18nContext'
import type { TranslationKey } from '@/shared/i18n/translations'
import './create-task.css'
import type { LocalizedText, Task } from '@/entities/task/model/task'
import { useAuth } from '@/shared/auth/AuthContext'
import { ApiError, api } from '@/shared/api/api'
import { MultiSelect } from '@/shared/ui/multi-select/MultiSelect'
import { CustomSelect } from '@/shared/ui/custom-select/CustomSelect'
import { TASK_FORMAT_OPTIONS, TASK_PLATFORM_OPTIONS } from '@/entities/task/lib/taskMetaCatalog'
import { HelpTip } from '@/shared/ui/help-tip/HelpTip'
import { createId } from '@/shared/lib/id'
import { deleteBlob, putBlob } from '@/shared/lib/blobStore'
import { uploadFileToServer } from '@/shared/api/uploads'

type FormState = {
  executorMode: 'blogger_ad' | 'customer_post' | 'ai'
  title: string
  description: string
  referenceUrl: string
  formatRequirements: string
  platforms: string[]
  platformVideoCounts: Record<string, string>
  formats: string[]
  budgetAmount: string
  budgetCurrency: 'USD' | 'RUB'
  maxExecutors: string
}

type FormErrors = Partial<Record<keyof FormState, string>>

const TITLE_MAX_CHARS = 60
const DESCRIPTION_MAX_CHARS = 1000
const FORMAT_REQUIREMENTS_MAX_CHARS = 500
const FOREVER_EXPIRES_AT = '9999-12-31T23:59:59.999Z'
const MAX_REFERENCE_VIDEO_MB = 1024
const MAX_REFERENCE_VIDEOS = 3
const MAX_DESCRIPTION_FILES = 3
const USE_API = import.meta.env.VITE_DATA_SOURCE === 'api'

type ReferenceVideoItem = {
  blobId: string
  name: string
  mimeType?: string
}

type PersistedCreateTaskDraftV1 = {
  v: 1
  savedAt: number
  form: FormState
  descriptionFiles: NonNullable<Task['descriptionFiles']>
  referenceVideos: ReferenceVideoItem[]
  currencyTouched: boolean
}

function parsePersistedDraft(raw: string | null): PersistedCreateTaskDraftV1 | null {
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as any
    if (!data || typeof data !== 'object') return null
    if (data.v !== 1) return null
    if (!data.form || typeof data.form !== 'object') return null
    return data as PersistedCreateTaskDraftV1
  } catch {
    return null
  }
}

function maxBudgetIntDigits(currency: FormState['budgetCurrency']) {
  return currency === 'RUB' ? 5 : 4
}

function maxBudgetIntValue(currency: FormState['budgetCurrency']) {
  const digits = maxBudgetIntDigits(currency)
  return Math.pow(10, digits) - 1
}

function sanitizeMoneyInput(value: string, opts?: { maxIntDigits?: number }) {
  // only digits and a single comma
  const cleaned = value.replace(/[^\d,]/g, '')
  const parts = cleaned.split(',')
  const maxIntDigits = opts?.maxIntDigits
  const int = maxIntDigits ? parts[0].slice(0, maxIntDigits) : parts[0]
  if (parts.length === 1) return int
  const frac = parts.slice(1).join('').slice(0, 2)
  return `${int},${frac}`
}

function parseMoney(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!/^\d+(,\d{1,2})?$/.test(trimmed)) return null
  const normalized = trimmed.replace(',', '.')
  const num = Number(normalized)
  if (!Number.isFinite(num)) return null
  return num
}

function splitList(value: string | undefined | null) {
  if (!value) return []
  return value
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
}

function validate(
  form: FormState,
  referenceVideos: ReferenceVideoItem[],
  locale: 'en' | 'ru',
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): FormErrors {
  const errors: FormErrors = {}
  const isAi = form.executorMode === 'ai'
  const title = form.title.trim()
  const desc = form.description.trim()
  const formatReq = form.formatRequirements.trim()
  const referenceUrl = form.referenceUrl.trim()

  if (!title) errors.title = t('validation.taskTitleRequired')
  else {
    if (title.length > TITLE_MAX_CHARS) errors.title = t('validation.taskTitleLength')
  }

  if (!desc) errors.description = t('validation.taskFullRequired')
  else if (desc.length > DESCRIPTION_MAX_CHARS) errors.description = t('validation.taskFullLength')

  if (!referenceVideos.length && !referenceUrl) {
    errors.referenceUrl =
      locale === 'ru'
        ? 'Референс обязателен: вставьте ссылку или прикрепите видео.'
        : 'Reference is required: paste a link or attach a video.'
  } else if (!referenceVideos.length && referenceUrl) {
    const ok = (() => {
      if (!/^https?:\/\//i.test(referenceUrl)) return false
      try {
        // eslint-disable-next-line no-new
        new URL(referenceUrl)
        return true
      } catch {
        return false
      }
    })()
    if (!ok) {
      errors.referenceUrl =
        locale === 'ru'
          ? 'Ссылка должна начинаться с http:// или https://.'
          : 'Link must start with http:// or https://.'
    }
  }

  if (formatReq.length > FORMAT_REQUIREMENTS_MAX_CHARS) {
    errors.formatRequirements = t('validation.taskRequirementsLength')
  }

  // Per-platform quantity (defaults to 1)
  if (form.platforms.length) {
    const counts = form.platformVideoCounts ?? {}
    const bad = form.platforms.some((p) => {
      const raw = (counts[p] ?? '1').trim()
      const n = Number(raw)
      return !Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 50
    })
    if (bad) {
      errors.platformVideoCounts =
        locale === 'ru'
          ? 'Укажите корректное количество видео для каждой платформы (1–50).'
          : 'Please set a valid video quantity for each platform (1–50).'
    }
  }

  if (!isAi) {
    if (!form.budgetAmount.trim()) errors.budgetAmount = t('validation.budgetRequired')
    else {
      const amount = parseMoney(form.budgetAmount)
      if (amount === null) {
        errors.budgetAmount = t('validation.budgetInvalid')
      } else {
        const maxInt = maxBudgetIntValue(form.budgetCurrency)
        if (Math.floor(amount) > maxInt) {
          errors.budgetAmount = t('validation.budgetTooLarge', { max: maxInt, currency: form.budgetCurrency })
        }
      }
    }

    if (!form.budgetCurrency) errors.budgetCurrency = t('validation.currencyRequired')

    const max = form.maxExecutors.trim()
    const maxNum = max ? Number(max) : NaN
    if (!max) errors.maxExecutors = t('validation.maxExecutorsRequired')
    else if (!Number.isFinite(maxNum) || !Number.isInteger(maxNum) || maxNum < 1 || maxNum > 10) {
      errors.maxExecutors = t('validation.maxExecutorsRange')
    }
  }

  return errors
}

function toLocalizedText(value: string, locale: 'en' | 'ru'): LocalizedText {
  return locale === 'ru' ? { ru: value, en: value } : { en: value, ru: value }
}

function toShortText(description: string, locale: 'en' | 'ru'): LocalizedText {
  const trimmed = description.trim()
  const limit = 200
  const short =
    trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit).trimEnd()}…`
  return toLocalizedText(short, locale)
}

export function CreateTaskPage() {
  const { t, locale } = useI18n()
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const stateDraft = (location.state as { draft?: Task } | null | undefined)?.draft
  const stateBackTo =
    (location.state as { backTo?: string } | null | undefined)?.backTo &&
    typeof (location.state as any).backTo === 'string'
      ? ((location.state as any).backTo as string)
      : null
  const draft = stateDraft

  const platformOptions = TASK_PLATFORM_OPTIONS
  const formatOptions = TASK_FORMAT_OPTIONS

  const mapDraft: FormState = useMemo(() => {
    if (!draft) {
      return {
        executorMode: 'customer_post',
        title: '',
        description: '',
        referenceUrl: '',
        formatRequirements: '',
        platforms: [],
        platformVideoCounts: {},
        formats: [],
        budgetAmount: '',
        budgetCurrency: (locale === 'ru' ? 'RUB' : 'USD') as 'RUB' | 'USD',
        maxExecutors: '',
      }
    }
    const localized = (text: LocalizedText) => text[locale] || text.en || ''
    const countsFromDraft: Record<string, string> = {}
    for (const d of draft.deliverables ?? []) {
      if (!d?.platform) continue
      countsFromDraft[d.platform] = String(Math.max(1, Math.floor(d.quantity ?? 1)))
    }
    return {
      executorMode: draft.executorMode === 'blogger_ad' || draft.executorMode === 'ai' ? draft.executorMode : 'customer_post',
      title: localized(draft.title),
      description: localized(draft.description),
      referenceUrl: draft.reference?.kind === 'url' ? draft.reference.url : '',
      formatRequirements: draft.requirements ? localized(draft.requirements) : '',
      platforms: splitList(draft.category ?? ''),
      platformVideoCounts: countsFromDraft,
      formats: splitList(draft.location ?? ''),
      budgetAmount: draft.budgetAmount ? String(draft.budgetAmount) : '',
      budgetCurrency: (draft.budgetCurrency === 'RUB' ? 'RUB' : 'USD') as 'USD' | 'RUB',
      maxExecutors: draft.maxExecutors ? String(draft.maxExecutors) : '',
    }
  }, [draft, locale])

  const [form, setForm] = useState<FormState>(() => mapDraft)
  const [touched, setTouched] = useState<Partial<Record<keyof FormState, boolean>>>({})
  const [submitted, setSubmitted] = useState(false)
  const [currencyTouched, setCurrencyTouched] = useState(false)
  const [descriptionFiles, setDescriptionFiles] = useState<NonNullable<Task['descriptionFiles']>>(() => {
    const fromNew = Array.isArray(draft?.descriptionFiles) ? (draft?.descriptionFiles ?? []).slice(0, MAX_DESCRIPTION_FILES) : null
    if (fromNew && fromNew.length) return fromNew
    return draft?.descriptionFile ? [draft.descriptionFile] : []
  })
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [fileBusy, setFileBusy] = useState(false)
  const [descriptionLimitOpen, setDescriptionLimitOpen] = useState(false)
  const [openHelpId, setOpenHelpId] = useState<string | null>(null)
  const [referenceVideos, setReferenceVideos] = useState<ReferenceVideoItem[]>(() => {
    const ref = draft?.reference
    if (!ref) return []
    if (ref.kind === 'video') return [{ blobId: ref.blobId, name: ref.name, mimeType: ref.mimeType }]
    if (ref.kind === 'videos') return (ref.videos ?? []).slice(0, MAX_REFERENCE_VIDEOS)
    return []
  })
  const referenceFileInputRef = useRef<HTMLInputElement | null>(null)
  const [referenceBusy, setReferenceBusy] = useState(false)
  const [referenceLimitOpen, setReferenceLimitOpen] = useState(false)
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false)
  const [draftHydrated, setDraftHydrated] = useState(false)

  const storageKey = useMemo(() => {
    const userId = auth.user?.id ?? 'anon'
    const draftId = draft?.id ?? 'new'
    return `taskflow.createTaskDraft.v1:${userId}:${draftId}`
  }, [auth.user?.id, draft?.id])

  const clearSavedDraft = useCallback(() => {
    try {
      localStorage.removeItem(storageKey)
    } catch {}
  }, [storageKey])

  useEffect(() => {
    const fromNew = Array.isArray(draft?.descriptionFiles) ? (draft?.descriptionFiles ?? []).slice(0, MAX_DESCRIPTION_FILES) : null
    if (fromNew && fromNew.length) {
      setDescriptionFiles(fromNew)
      return
    }
    setDescriptionFiles(draft?.descriptionFile ? [draft.descriptionFile] : [])
  }, [draft?.id])

  useEffect(() => {
    const ref = draft?.reference
    if (!ref) {
      setReferenceVideos([])
      return
    }
    if (ref.kind === 'video') {
      setReferenceVideos([{ blobId: ref.blobId, name: ref.name, mimeType: ref.mimeType }])
      return
    }
    if (ref.kind === 'videos') {
      setReferenceVideos((ref.videos ?? []).slice(0, MAX_REFERENCE_VIDEOS))
      return
    }
    setReferenceVideos([])
  }, [draft?.id])

  useEffect(() => {
    // Restore in-progress draft from localStorage (persisted across refresh).
    const saved = (() => {
      try {
        return parsePersistedDraft(localStorage.getItem(storageKey))
      } catch {
        return null
      }
    })()
    if (saved?.form) setForm(saved.form)
    if (Array.isArray(saved?.descriptionFiles)) setDescriptionFiles(saved.descriptionFiles)
    if (Array.isArray(saved?.referenceVideos)) setReferenceVideos(saved.referenceVideos)
    if (typeof saved?.currencyTouched === 'boolean') setCurrencyTouched(saved.currencyTouched)
    setDraftHydrated(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  useEffect(() => {
    if (!draftHydrated) return
    const payload: PersistedCreateTaskDraftV1 = {
      v: 1,
      savedAt: Date.now(),
      form,
      descriptionFiles,
      referenceVideos,
      currencyTouched,
    }
    const id = window.setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(payload))
      } catch {}
    }, 250)
    return () => window.clearTimeout(id)
  }, [draftHydrated, form, descriptionFiles, referenceVideos, currencyTouched, storageKey])

  const hasUnsavedInput = useMemo(() => {
    if (form.title.trim()) return true
    if (form.description.trim()) return true
    if (form.referenceUrl.trim()) return true
    if (referenceVideos.length) return true
    if (descriptionFiles.length) return true
    if (form.formatRequirements.trim()) return true
    if (form.platforms.length) return true
    if (Object.keys(form.platformVideoCounts ?? {}).some((k) => (form.platformVideoCounts[k] ?? '').trim())) return true
    if (form.formats.length) return true
    if (form.budgetAmount.trim()) return true
    if (form.maxExecutors.trim()) return true
    return false
  }, [descriptionFiles.length, form, referenceVideos.length])

  useEffect(() => {
    if (!confirmCancelOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConfirmCancelOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [confirmCancelOpen])

  useEffect(() => {
    if (currencyTouched) return
    setForm((prev) => ({ ...prev, budgetCurrency: locale === 'ru' ? 'RUB' : 'USD' }))
  }, [locale, currencyTouched])

  useEffect(() => {
    if (!referenceLimitOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setReferenceLimitOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [referenceLimitOpen])

  useEffect(() => {
    if (!descriptionLimitOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDescriptionLimitOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [descriptionLimitOpen])

  const errors = useMemo(() => validate(form, referenceVideos, locale, t), [form, referenceVideos, locale, t])
  const isValid = Object.keys(errors).length === 0

  const visibleErrors = submitted
    ? errors
    : (Object.fromEntries(
        Object.entries(errors).filter(([key]) => touched[key as keyof FormState]),
      ) as FormErrors)

  const titleChars = form.title.length
  const descChars = form.description.length
  const formatReqChars = form.formatRequirements.length

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitted(true)
    if (!isValid) return

    if (auth.status === 'unauthenticated' || !auth.user) {
      navigate(paths.login)
      return
    }
    if (auth.user.role !== 'customer') {
      if (auth.user.role === 'pending') navigate(paths.chooseRole)
      return
    }

    const isAi = form.executorMode === 'ai'
    const budgetAmount = isAi ? null : parseMoney(form.budgetAmount)
    const maxExecutorsValue = isAi ? 1 : Math.floor(Number(form.maxExecutors))
    const expiresAt = FOREVER_EXPIRES_AT
    const counts = form.platformVideoCounts ?? {}
    const deliverables = form.platforms
      .map((p) => {
        const raw = (counts[p] ?? '1').trim()
        const n = Number(raw)
        const quantity =
          Number.isFinite(n) && Number.isInteger(n) ? Math.max(1, Math.min(50, n)) : 1
        return { platform: p, quantity }
      })
      .filter((d) => d.platform.trim().length > 0)
    const nextData = {
      executorMode: form.executorMode,
      deliverables: deliverables.length ? deliverables : undefined,
      title: toLocalizedText(form.title.trim(), locale),
      shortDescription: toShortText(form.description, locale),
      requirements: form.formatRequirements.trim()
        ? toLocalizedText(form.formatRequirements.trim(), locale)
        : undefined,
      description: toLocalizedText(form.description.trim(), locale),
      descriptionFiles: descriptionFiles.length ? descriptionFiles.map((f) => ({ ...f })) : undefined,
      // Backward compatibility (legacy single file).
      descriptionFile: descriptionFiles.length ? { ...descriptionFiles[0] } : undefined,
      reference: referenceVideos.length
        ? ({ kind: 'videos' as const, videos: referenceVideos.slice(0, MAX_REFERENCE_VIDEOS) } as Task['reference'])
        : form.referenceUrl.trim()
          ? ({ kind: 'url' as const, url: form.referenceUrl.trim() } as Task['reference'])
          : undefined,
      category: form.platforms.length ? form.platforms.join(', ') : undefined,
      location: form.formats.length ? form.formats.join(', ') : undefined,
      budgetAmount: isAi ? undefined : (budgetAmount ?? undefined),
      budgetCurrency: isAi ? undefined : form.budgetCurrency,
      expiresAt,
      maxExecutors: maxExecutorsValue,
    }

    let task: Task
    if (USE_API) {
      let created: Task
      try {
        created = await api.post<Task>('/tasks', nextData)
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          alert(locale === 'ru' ? 'Сессия истекла. Войдите снова.' : 'Session expired. Please sign in again.')
          navigate(paths.login)
          return
        }
        if (e instanceof ApiError) {
          const details = (() => {
            try {
              return JSON.stringify(e.payload)
            } catch {
              return String(e.payload)
            }
          })()
          alert(
            locale === 'ru'
              ? `Не удалось создать задание (HTTP ${e.status ?? '—'}: ${e.message}).\n${details}`
              : `Failed to create task (HTTP ${e.status ?? '—'}: ${e.message}).\n${details}`,
          )
          return
        }
        alert(
          locale === 'ru'
            ? 'Не удалось опубликовать задание. Попробуйте ещё раз.'
            : 'Failed to publish task. Please try again.',
        )
        return
      }

      task = created
      await refreshTasks()
    } else {
      // If we're coming back from the final publish step, update the existing draft
      // instead of creating duplicates.
      const existingDraft = draft?.id ? taskRepo.getById(draft.id) : null
      task =
        existingDraft && existingDraft.status === 'draft'
          ? (taskRepo.update(existingDraft.id, (prev) => ({
              ...prev,
              ...nextData,
              createdByUserId: auth.user!.id,
              status: 'draft',
            })) ?? existingDraft)
          : taskRepo.create({ ...nextData, createdByUserId: auth.user!.id, status: 'draft' as const } as any)
    }

    clearSavedDraft()
    navigate(taskDetailsPath(task.id), {
      state: stateBackTo ? { backTo: stateBackTo } : { fromCreateDraft: true },
    })
  }

  // Hide publishing UI until user signs in.
  if (auth.status !== 'authenticated' || !auth.user) {
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
            <Link className="secondaryLink" to={paths.chooseRole}>
              {locale === 'ru' ? 'Сменить роль' : 'Switch role'}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="createTaskPage" key={location.key ?? 'create-task'}>
      <div className="createTaskCard">
        <h1 className="createTaskTitle">{t('task.create.title')}</h1>
        <p className="createTaskSubtitle">
          {form.executorMode === 'ai'
            ? locale === 'ru'
              ? 'ИИ‑исполнитель пока не подключён. Такие задания сейчас будут отображаться только в вашем профиле.'
              : 'AI executor is not connected yet. For now, these tasks will be shown only in your profile.'
            : locale === 'ru'
              ? 'Заполните описание и технические требования — исполнители увидят описание в ленте.'
              : 'Fill the description and technical requirements — executors will see the description in the feed.'}
        </p>

        <form onSubmit={onSubmit} className="form">
          <div className="field">
            <span className="field__labelRow">
              <HelpTip
                triggerLabel={<span className="field__label">{locale === 'ru' ? 'Тип исполнителя' : 'Executor type'}</span>}
                open={openHelpId === 'executorMode'}
                onToggle={() => setOpenHelpId((v) => (v === 'executorMode' ? null : 'executorMode'))}
                onClose={() => setOpenHelpId(null)}
                ariaLabel={locale === 'ru' ? 'Подсказка: тип исполнителя' : 'Help: executor type'}
                content={
                  locale === 'ru'
                    ? [
                        'Выберите, кто будет выполнять задание и где будет опубликован результат.',
                        '',
                        '1) Реклама у блогера — ролик публикуется в соцсети исполнителя и является заказной интеграцией.',
                        '2) Контент для вашего аккаунта — исполнитель делает ролик, а публикуете его вы (скачивание/публикация со стороны заказчика).',
                        '3) ИИ‑исполнитель — в будущем генерация видео по вашему ТЗ. Пока ИИ не подключён: такие задания не показываются исполнителям в общей ленте и видны только вам в профиле.',
                      ].join('\n')
                    : [
                        'Choose who executes the task and where the result will be published.',
                        '',
                        '1) Blogger ad — the video is posted on the executor’s social account as sponsored content.',
                        '2) Content for your account — the executor produces the video and you publish it on your own social account (you can download it from the app).',
                        '3) AI executor — future video generation by your instructions. AI is not connected yet: these tasks are hidden from the executor marketplace and are visible only in your profile.',
                      ].join('\n')
                }
              />
            </span>
            <div className="executorModeGrid" role="radiogroup" aria-label={locale === 'ru' ? 'Тип исполнителя' : 'Executor type'}>
              <label className={`executorModeOption${form.executorMode === 'blogger_ad' ? ' executorModeOption--active' : ''}`}>
                <input
                  className="executorModeOption__input"
                  type="radio"
                  name="executorMode"
                  value="blogger_ad"
                  checked={form.executorMode === 'blogger_ad'}
                  onChange={() => {
                    setField('executorMode', 'blogger_ad')
                    setTouched((t) => ({ ...t, executorMode: true }))
                  }}
                />
                <span className="executorModeOption__title">
                  {locale === 'ru' ? 'Реклама у блогера' : 'Blogger ad'}
                </span>
                <span className="executorModeOption__desc">
                  {locale === 'ru'
                    ? 'Ролик будет опубликован в соцсети исполнителя как рекламная интеграция.'
                    : 'The video will be posted on the executor’s social account as sponsored content.'}
                </span>
              </label>

              <label className={`executorModeOption${form.executorMode === 'customer_post' ? ' executorModeOption--active' : ''}`}>
                <input
                  className="executorModeOption__input"
                  type="radio"
                  name="executorMode"
                  value="customer_post"
                  checked={form.executorMode === 'customer_post'}
                  onChange={() => {
                    setField('executorMode', 'customer_post')
                    setTouched((t) => ({ ...t, executorMode: true }))
                  }}
                />
                <span className="executorModeOption__title">
                  {locale === 'ru' ? 'Контент для вашего аккаунта' : 'Content for your account'}
                </span>
                <span className="executorModeOption__desc">
                  {locale === 'ru'
                    ? 'Исполнитель сдаёт ролик, а публикуете его вы у себя.'
                    : 'The executor delivers the video, and you publish it on your own account.'}
                </span>
              </label>

              <label className={`executorModeOption${form.executorMode === 'ai' ? ' executorModeOption--active' : ''}`}>
                <input
                  className="executorModeOption__input"
                  type="radio"
                  name="executorMode"
                  value="ai"
                  checked={form.executorMode === 'ai'}
                  onChange={() => {
                    setField('executorMode', 'ai')
                    setTouched((t) => ({ ...t, executorMode: true }))
                  }}
                />
                <span className="executorModeOption__title">
                  {locale === 'ru' ? 'ИИ‑исполнитель (скоро)' : 'AI executor (soon)'}
                </span>
                <span className="executorModeOption__desc">
                  {locale === 'ru'
                    ? 'Генерация видео по вашему ТЗ. Пока скрыто от исполнителей и видно только вам.'
                    : 'Video generation by your instructions. Hidden from executors for now.'}
                </span>
              </label>
            </div>
          </div>

          <label className="field">
            <span className="field__labelRow">
              <HelpTip
                triggerLabel={<span className="field__label">{t('task.create.titleField')}</span>}
                open={openHelpId === 'title'}
                onToggle={() => setOpenHelpId((v) => (v === 'title' ? null : 'title'))}
                onClose={() => setOpenHelpId(null)}
                ariaLabel={locale === 'ru' ? 'Подсказка: название' : 'Help: title'}
                content={
                  locale === 'ru'
                    ? [
                        'Название — это “витрина” задания: первое, что видит исполнитель в ленте. Оно должно быть коротким и однозначным.',
                        '',
                        'Что написать:',
                        '- Что нужно сделать (тип результата): “UGC‑видео”, “озвучка”, “монтаж”, “сценарий”, “ролик‑обзор”.',
                        '- Про что/какая тема: продукт, сервис, сценарий использования.',
                        '- Один ключевой параметр: длительность/количество/срок (если критично).',
                        '',
                        'Советы:',
                        '- Пишите конкретно: “Снять UGC‑ролик 9:16 про приложение для учёта финансов” лучше, чем “Сделать видео”.',
                        '- Избегайте двусмысленностей и внутренних терминов компании.',
                        '- Название ограничено 60 символами — оставляйте только самое главное.',
                        '',
                        'Примеры:',
                        '- “UGC‑ролик 9:16: обзор приложения, 25–30 сек”',
                        '- “Монтаж Reels из ваших клипов + субтитры (до 40 сек)”',
                      ].join('\n')
                    : [
                        'The title is the “front cover” of your task. Contractors see it first in the feed, so it must be short and unambiguous.',
                        '',
                        'What to include:',
                        '- The deliverable type: UGC video, edit, script, voiceover, review, etc.',
                        '- The topic/product/service.',
                        '- One key parameter if critical (duration / quantity / deadline).',
                        '',
                        'Tips:',
                        '- Be specific and keep only what matters most.',
                        '- Title is limited to 60 characters.',
                        '',
                        'Examples:',
                        '- “UGC 9:16 video: app review, 25–30s”',
                        '- “Reels edit + subtitles (up to 40s)”',
                      ].join('\n')
                }
              />
            </span>
            <div className="field__control">
              <input
                className="field__input"
                value={form.title}
                onChange={(e) => setField('title', e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, title: true }))}
                placeholder={t('task.create.placeholder.title')}
                autoComplete="off"
              />
              <span className={`field__counterInField ${titleChars >= TITLE_MAX_CHARS ? 'field__counter--danger' : ''}`}>
                {titleChars}/{TITLE_MAX_CHARS}
              </span>
            </div>
            {visibleErrors.title ? <span className="field__error">{visibleErrors.title}</span> : null}
          </label>

          <label className="field">
            <span className="field__labelRow">
              <HelpTip
                triggerLabel={<span className="field__label">{locale === 'ru' ? 'Описание' : 'Description'}</span>}
                open={openHelpId === 'description'}
                onToggle={() => setOpenHelpId((v) => (v === 'description' ? null : 'description'))}
                onClose={() => setOpenHelpId(null)}
                ariaLabel={locale === 'ru' ? 'Подсказка: описание' : 'Help: description'}
                content={
                  locale === 'ru'
                    ? [
                        'Описание — это главный бриф. Здесь исполнитель должен понять задачу “от и до”.',
                        '',
                        'Что важно описать (коротко и по пунктам):',
                        '1) Контекст: продукт/услуга и для кого (ЦА).',
                        '2) Цель: что должно измениться после просмотра.',
                        '3) Ключевые тезисы: 1–2 мысли, которые обязательно должны прозвучать.',
                        '4) План: хук → основная часть → CTA (что сделать зрителю).',
                        '5) Ограничения: что нельзя упоминать/показывать, обязательные фразы.',
                        '',
                        'Важно:',
                        '- Описание ограничено 1000 символами. Если деталей много — прикрепите .txt файл.',
                      ].join('\n')
                    : [
                        'Description is your main brief. A contractor should understand the task end-to-end from it.',
                        '',
                        'What to include (bullet points):',
                        '1) Context (product/service, audience).',
                        '2) Goal (what outcome you want).',
                        '3) Key message (1–2 must-have points).',
                        '4) Outline (hook → body → CTA).',
                        '5) Constraints (do/don’t, mandatory mentions).',
                        '',
                        'Limit: 1000 characters. If you have a lot of details — attach a .txt file.',
                      ].join('\n')
                }
              />
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,text/plain"
              className="field__fileInputHidden"
              onChange={(e) => {
                const files = Array.from(e.currentTarget.files ?? [])
                e.currentTarget.value = ''
                if (!files.length) return

                const remaining = Math.max(0, MAX_DESCRIPTION_FILES - descriptionFiles.length)
                if (remaining <= 0) {
                  setDescriptionLimitOpen(true)
                  return
                }

                const toAdd = files.slice(0, remaining)
                if (files.length > remaining) setDescriptionLimitOpen(true)

                setFileBusy(true)
                void (async () => {
                  try {
                    const items = await Promise.all(toAdd.map(async (file) => ({ name: file.name, text: await file.text() })))
                    setDescriptionFiles((prev) => [...prev, ...items].slice(0, MAX_DESCRIPTION_FILES))
                  } finally {
                    setFileBusy(false)
                  }
                })()
              }}
              multiple
            />

            <div className="field__control field__control--textarea">
              <textarea
                className="field__textarea"
                value={form.description}
                onChange={(e) => setField('description', e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, description: true }))}
                placeholder={locale === 'ru' ? 'Опишите задачу для исполнителя…' : 'Describe the task for the contractor…'}
                rows={7}
              />
              <div className="field__bottomRight">
                <span className={`field__counterInField ${descChars >= DESCRIPTION_MAX_CHARS ? 'field__counter--danger' : ''}`}>
                  {descChars}/{DESCRIPTION_MAX_CHARS}
                </span>
              </div>
            </div>

            <div className="referenceActionsRow">
              <button
                type="button"
                className={`field__refBtn field__refBtn--full${
                  descriptionFiles.length >= MAX_DESCRIPTION_FILES ? ' field__refBtn--inactive' : ''
                }`}
                onClick={() => {
                  if (fileBusy) return
                  if (descriptionFiles.length >= MAX_DESCRIPTION_FILES) {
                    setDescriptionLimitOpen(true)
                    return
                  }
                  fileInputRef.current?.click()
                }}
                disabled={fileBusy}
                aria-disabled={descriptionFiles.length >= MAX_DESCRIPTION_FILES}
              >
                {fileBusy
                  ? locale === 'ru'
                    ? 'Загрузка…'
                    : 'Loading…'
                  : locale === 'ru'
                    ? 'Прикрепить файл'
                    : 'Attach file'}
              </button>
            </div>

            {descriptionFiles.length ? (
              <div className="deliverablesBox" style={{ marginTop: 10 }}>
                <div className="deliverablesList" style={{ maxHeight: 'none' }}>
                  {descriptionFiles.map((f, idx) => (
                    <div key={`${f.name}-${idx}`} className={`deliverablesRow${idx === 0 ? ' deliverablesRow--first' : ''}`}>
                      <span className="deliverablesRow__platform" title={f.name}>
                        {f.name}
                      </span>
                      <div className="deliverablesRow__controls">
                        <button
                          type="button"
                          className="deliverablesRow__btn"
                          aria-label={locale === 'ru' ? `Удалить файл: ${f.name}` : `Remove file: ${f.name}`}
                          onPointerDown={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                          }}
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setDescriptionFiles((prev) => prev.filter((_, i) => i !== idx))
                          }}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {visibleErrors.description ? <span className="field__error">{visibleErrors.description}</span> : null}
          </label>

          <label className="field">
            <span className="field__labelRow">
              <HelpTip
                triggerLabel={<span className="field__label">{locale === 'ru' ? 'Референс' : 'Reference'}</span>}
                open={openHelpId === 'reference'}
                onToggle={() => setOpenHelpId((v) => (v === 'reference' ? null : 'reference'))}
                onClose={() => setOpenHelpId(null)}
                ariaLabel={locale === 'ru' ? 'Подсказка: референс' : 'Help: reference'}
                content={
                  locale === 'ru'
                    ? [
                        'Референс — пример, на который должен ориентироваться исполнитель.',
                        '',
                        'Можно указать:',
                        '- Ссылку на видео (YouTube, TikTok, Reels и т.д.).',
                        `- Или прикрепить видео‑файлы (до ${MAX_REFERENCE_VIDEOS} шт.).`,
                        '',
                        'Что хороший референс должен показывать:',
                        '- Стиль монтажа и темп.',
                        '- Подачу (UGC / talking head / туториал).',
                        '- Примерный хронометраж.',
                        '- Тональность и уровень “энергии”.',
                        '',
                        'Поле обязательное: выберите минимум один вариант — ссылка или видео.',
                      ].join('\n')
                    : [
                        'Reference is an example the contractor should follow.',
                        '',
                        'You can provide:',
                        '- A video link (YouTube, TikTok, Reels, etc.)',
                        `- Or attach video files (up to ${MAX_REFERENCE_VIDEOS}).`,
                        '',
                        'A good reference shows:',
                        '- Editing style and pace',
                        '- Delivery style (UGC / talking head / tutorial)',
                        '- Approximate duration',
                        '- Tone and energy',
                        '',
                        'This field is required: choose at least one option — either a link or videos.',
                      ].join('\n')
                }
              />
            </span>

            <div className="field__controlRow">
              <input
                className="field__input"
                value={form.referenceUrl}
                disabled={referenceVideos.length > 0}
                onChange={(e) => {
                  const next = e.target.value
                  if (referenceVideos.length) {
                    const ids = referenceVideos.map((x) => x.blobId)
                    setReferenceVideos([])
                    for (const id of ids) void deleteBlob(id).catch(() => {})
                  }
                  setField('referenceUrl', next)
                }}
                onBlur={() => setTouched((t) => ({ ...t, referenceUrl: true }))}
                placeholder={
                  referenceVideos.length
                    ? locale === 'ru'
                      ? 'Видео прикреплены'
                      : 'Video attached'
                    : locale === 'ru'
                      ? 'Вставьте ссылку на референс…'
                      : 'Paste a reference link…'
                }
                autoComplete="off"
              />

              <input
                ref={referenceFileInputRef}
                type="file"
                accept="video/*"
                className="field__fileInputHidden"
                onChange={(e) => {
                  const files = Array.from(e.currentTarget.files ?? [])
                  e.currentTarget.value = ''
                  if (!files.length) return

                  // In API mode, reference videos must be uploaded to server (public URL),
                  // because blobId/idb: is not accessible to other users.
                  if (USE_API) {
                    const file = files[0] ?? null
                    if (!file) return
                    const maxBytes = MAX_REFERENCE_VIDEO_MB * 1024 * 1024
                    if (file.size > maxBytes) {
                      alert(
                        locale === 'ru'
                          ? `Файл «${file.name}» слишком большой (максимум ${MAX_REFERENCE_VIDEO_MB} МБ).`
                          : `File “${file.name}” is too large (max ${MAX_REFERENCE_VIDEO_MB} MB).`,
                      )
                      return
                    }
                    if (!file.type.startsWith('video/')) {
                      alert(locale === 'ru' ? `Файл «${file.name}» не является видео.` : `File “${file.name}” is not a video.`)
                      return
                    }
                    setReferenceBusy(true)
                    void (async () => {
                      try {
                        const uploaded = await uploadFileToServer(file, file.name || 'reference.mp4')
                        setReferenceVideos([])
                        setField('referenceUrl', uploaded.url)
                      } catch (e) {
                        const code = e instanceof Error ? e.message : 'upload_failed'
                        const msg =
                          code === 'payload_too_large'
                            ? locale === 'ru'
                              ? 'Файл слишком большой для сервера (HTTP 413). Нужно увеличить лимит загрузки в nginx (client_max_body_size).'
                              : 'File is too large for the server (HTTP 413). Increase nginx upload limit (client_max_body_size).'
                            : locale === 'ru'
                              ? `Не удалось загрузить видео: ${code}`
                              : `Failed to upload video: ${code}`
                        alert(msg)
                      } finally {
                        setReferenceBusy(false)
                      }
                    })()
                    return
                  }

                  const remaining = Math.max(0, MAX_REFERENCE_VIDEOS - referenceVideos.length)
                  if (remaining <= 0) {
                    alert(locale === 'ru' ? `Можно прикрепить максимум ${MAX_REFERENCE_VIDEOS} видео.` : `You can attach up to ${MAX_REFERENCE_VIDEOS} videos.`)
                    return
                  }

                  const toAdd = files.slice(0, remaining)

                  setReferenceBusy(true)
                  void (async () => {
                    try {
                      if (form.referenceUrl.trim()) setField('referenceUrl', '')

                      const added: ReferenceVideoItem[] = []
                      for (const file of toAdd) {
                        const maxBytes = MAX_REFERENCE_VIDEO_MB * 1024 * 1024
                        if (file.size > maxBytes) {
                          alert(
                            locale === 'ru'
                              ? `Файл «${file.name}» слишком большой (максимум ${MAX_REFERENCE_VIDEO_MB} МБ).`
                              : `File “${file.name}” is too large (max ${MAX_REFERENCE_VIDEO_MB} MB).`,
                          )
                          continue
                        }
                        if (!file.type.startsWith('video/')) {
                          alert(
                            locale === 'ru'
                              ? `Файл «${file.name}» не является видео.`
                              : `File “${file.name}” is not a video.`,
                          )
                          continue
                        }
                        const blobId = createId('blob')
                        await putBlob(blobId, file)
                        added.push({ blobId, name: file.name, mimeType: file.type })
                      }
                      if (added.length) {
                        setReferenceVideos((prev) => [...prev, ...added].slice(0, MAX_REFERENCE_VIDEOS))
                      }
                    } finally {
                      setReferenceBusy(false)
                    }
                  })()
                }}
              />
            </div>

            <div className="referenceActionsRow">
              <button
                type="button"
                className={`field__refBtn field__refBtn--full${
                  referenceVideos.length >= MAX_REFERENCE_VIDEOS ? ' field__refBtn--inactive' : ''
                }`}
                onClick={() => {
                  if (referenceBusy) return
                  if (referenceVideos.length >= MAX_REFERENCE_VIDEOS) {
                    setReferenceLimitOpen(true)
                    return
                  }
                  referenceFileInputRef.current?.click()
                }}
                disabled={referenceBusy}
                aria-disabled={referenceVideos.length >= MAX_REFERENCE_VIDEOS}
              >
                {referenceBusy
                  ? locale === 'ru'
                    ? 'Загрузка…'
                    : 'Loading…'
                  : locale === 'ru'
                    ? 'Прикрепить видео'
                    : 'Attach video'}
              </button>
            </div>

            {referenceVideos.length ? (
              <div className="deliverablesBox" style={{ marginTop: 10 }}>
                <div className="deliverablesList" style={{ maxHeight: 'none' }}>
                  {referenceVideos.map((v, idx) => (
                    <div key={v.blobId} className={`deliverablesRow${idx === 0 ? ' deliverablesRow--first' : ''}`}>
                      <span className="deliverablesRow__platform" title={v.name}>
                        {v.name}
                      </span>
                      <div className="deliverablesRow__controls">
                        <button
                          type="button"
                          className="deliverablesRow__btn"
                          aria-label={locale === 'ru' ? `Удалить видео: ${v.name}` : `Remove video: ${v.name}`}
                          onPointerDown={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                          }}
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setReferenceVideos((prev) => prev.filter((x) => x.blobId !== v.blobId))
                            void deleteBlob(v.blobId).catch(() => {})
                          }}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {visibleErrors.referenceUrl ? <span className="field__error">{visibleErrors.referenceUrl}</span> : null}
          </label>

          {referenceLimitOpen ? (
            <div
              className="createTaskOverlay"
              role="dialog"
              aria-modal="true"
              aria-label={locale === 'ru' ? 'Лимит видео референса' : 'Reference videos limit'}
              onPointerDown={() => setReferenceLimitOpen(false)}
            >
              <div className="createTaskModal" onPointerDown={(e) => e.stopPropagation()}>
                <div className="createTaskModal__header">
                  <div className="createTaskModal__title">
                    {locale === 'ru' ? 'Можно прикрепить максимум 3 видео' : 'You can attach up to 3 videos'}
                  </div>
                  <button
                    type="button"
                    className="createTaskModal__close"
                    aria-label={locale === 'ru' ? 'Закрыть' : 'Close'}
                    onClick={() => setReferenceLimitOpen(false)}
                  >
                    ×
                  </button>
                </div>
                <div className="createTaskModal__content">
                  {locale === 'ru'
                    ? 'Вы уже прикрепили 3 видео к референсу. Чтобы загрузить другое, удалите одно из прикреплённых видео.'
                    : 'You already attached 3 reference videos. Remove one to upload another.'}
                </div>
                <div className="createTaskModal__actions">
                  <button
                    type="button"
                    className="field__refBtn field__refBtn--full"
                    onClick={() => setReferenceLimitOpen(false)}
                  >
                    {locale === 'ru' ? 'Понятно' : 'OK'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {descriptionLimitOpen ? (
            <div
              className="createTaskOverlay"
              role="dialog"
              aria-modal="true"
              aria-label={locale === 'ru' ? 'Лимит файлов описания' : 'Description files limit'}
              onPointerDown={() => setDescriptionLimitOpen(false)}
            >
              <div className="createTaskModal" onPointerDown={(e) => e.stopPropagation()}>
                <div className="createTaskModal__header">
                  <div className="createTaskModal__title">
                    {locale === 'ru' ? 'Можно прикрепить максимум 3 файла' : 'You can attach up to 3 files'}
                  </div>
                  <button
                    type="button"
                    className="createTaskModal__close"
                    aria-label={locale === 'ru' ? 'Закрыть' : 'Close'}
                    onClick={() => setDescriptionLimitOpen(false)}
                  >
                    ×
                  </button>
                </div>
                <div className="createTaskModal__content">
                  {locale === 'ru'
                    ? 'Можно прикрепить максимум 3 текстовых файла к описанию. Чтобы добавить другой — удалите один из прикреплённых.'
                    : 'You can attach up to 3 text files to the description. Remove one to attach another.'}
                </div>
                <div className="createTaskModal__actions">
                  <button
                    type="button"
                    className="field__refBtn field__refBtn--full"
                    onClick={() => setDescriptionLimitOpen(false)}
                  >
                    {locale === 'ru' ? 'Понятно' : 'OK'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <label className="field">
            <span className="field__labelRow">
              <HelpTip
                triggerLabel={<span className="field__label">{locale === 'ru' ? 'Технические требования' : 'Technical requirements'}</span>}
                open={openHelpId === 'formatReq'}
                onToggle={() => setOpenHelpId((v) => (v === 'formatReq' ? null : 'formatReq'))}
                onClose={() => setOpenHelpId(null)}
                ariaLabel={locale === 'ru' ? 'Подсказка: технические требования' : 'Help: technical requirements'}
                content={
                  locale === 'ru'
                    ? [
                        'Технические требования — это технические и визуальные параметры результата. Здесь лучше писать конкретику, чтобы не было “сюрпризов” при сдаче.',
                        '',
                        'Что обычно указывают:',
                        '- Длительность: например 20–30 сек, 30–45 сек.',
                        '- Озвучка: нужна/не нужна, язык, темп, тон (дружелюбно/экспертно).',
                        '- Музыка: можно/нельзя, громкость относительно голоса.',
                        '- Качество: минимум 1080×1920, 30fps (если важно).',
                        '- Формат сдачи: MP4/MOV, ссылка, исходники (по желанию).',
                        'Лимит поля — 500 символов. Самое важное — в начале.',
                      ].join('\n')
                    : [
                        'Technical requirements are the technical and visual constraints of the deliverable. Be specific to avoid surprises.',
                        '',
                        'Common items:',
                        '- Duration (e.g. 20–30s)',
                        '- Voiceover (yes/no, language, tone)',
                        '- Quality (1080×1920, fps)',
                        '- Delivery format (MP4/MOV, sources if needed)',
                        '',
                        'Limit: 500 characters.',
                      ].join('\n')
                }
              />
            </span>
            <div className="field__control field__control--textarea">
              <textarea
                className="field__textarea"
                value={form.formatRequirements}
                onChange={(e) => setField('formatRequirements', e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, formatRequirements: true }))}
                placeholder={
                  locale === 'ru'
                    ? 'Например: длина 20–30 сек, озвучка нужна (RU), качество 1080p…'
                    : 'E.g. 20–30s, voiceover needed (EN), 1080p…'
                }
                rows={4}
              />
              <span
                className={`field__counterInField ${formatReqChars >= FORMAT_REQUIREMENTS_MAX_CHARS ? 'field__counter--danger' : ''}`}
              >
                {formatReqChars}/{FORMAT_REQUIREMENTS_MAX_CHARS}
              </span>
            </div>
            {visibleErrors.formatRequirements ? (
              <span className="field__error">{visibleErrors.formatRequirements}</span>
            ) : null}
          </label>

          <div className="grid2">
            <MultiSelect
              label={
                <HelpTip
                  triggerLabel={<span>{t('task.create.category')}</span>}
                  open={openHelpId === 'platforms'}
                  onToggle={() => setOpenHelpId((v) => (v === 'platforms' ? null : 'platforms'))}
                  onClose={() => setOpenHelpId(null)}
                  ariaLabel={locale === 'ru' ? 'Подсказка: платформа' : 'Help: platform'}
                  content={
                    locale === 'ru'
                      ? [
                          'Платформа — где вы планируете публиковать результат. Это влияет на подачу, динамику, требования к кадру и CTA.',
                          '',
                          'Зачем выбирать платформу:',
                          '- Исполнитель сразу понимает стиль (TikTok ≠ YouTube ≠ Telegram).',
                          '- Можно заранее учесть ограничения: длительность, безопасные зоны, текст на экране, формат CTA.',
                          '',
                          'Как выбирать:',
                          '- Если публиковать будете в нескольких местах — можно выбрать несколько платформ.',
                        ].join('\n')
                      : [
                          'Platform is where you will publish the result. It affects pacing, framing and CTA.',
                          '',
                          'Why it matters:',
                          '- Different platforms have different native styles and constraints.',
                          '',
                          'Tip: you can select multiple platforms if needed.',
                        ].join('\n')
                  }
                />
              }
              ariaLabel={t('task.create.category')}
              placeholder={t('task.create.placeholder.category')}
              value={form.platforms}
              options={platformOptions}
              allowCustom
              customPlaceholder={locale === 'ru' ? 'Добавить платформу…' : 'Add platform…'}
              onChange={(next) => {
                setForm((prev) => {
                  const nextCounts: Record<string, string> = {}
                  for (const p of next) {
                    const prevValue = prev.platformVideoCounts?.[p]
                    nextCounts[p] = (prevValue ?? '1').trim() || '1'
                  }
                  return { ...prev, platforms: next, platformVideoCounts: nextCounts }
                })
              }}
            />

            <MultiSelect
              label={
                <HelpTip
                  triggerLabel={<span>{t('task.create.location')}</span>}
                  open={openHelpId === 'formats'}
                  onToggle={() => setOpenHelpId((v) => (v === 'formats' ? null : 'formats'))}
                  onClose={() => setOpenHelpId(null)}
                  ariaLabel={locale === 'ru' ? 'Подсказка: формат' : 'Help: format'}
                  content={
                    locale === 'ru'
                      ? [
                          'Формат помогает исполнителю понять вид ролика (соотношение сторон и подача).',
                          '',
                          'Варианты:',
                          '- 9:16 — вертикальное (Shorts/Reels/TikTok).',
                          '- 1:1 — квадрат (лента/обложки).',
                          '- 16:9 — горизонтальное (YouTube/сайты/презентации).',
                          '- Talking head — человек в кадре говорит в камеру.',
                          '- UGC — нативный “как от пользователя” стиль.',
                          '- Motion graphics — анимация/графика/титры/инфографика.',
                          '- Screen recording — запись экрана (приложение/сайт).',
                          '- Voiceover — озвучка поверх видео.',
                          '- С субтитрами — обязательно добавить субтитры.',
                          '- Туториал / how-to — пошагово: “как сделать”.',
                          '- Обзор / review — обзор продукта/сервиса/распаковка.',
                          '',
                          'Совет: выберите 1–3 ключевых формата, а детали (длина, структура, тон, референсы) опишите в требованиях.',
                        ].join('\n')
                      : [
                          'Format helps executors understand the deliverable (aspect ratio and style).',
                          '',
                          'Options:',
                          '- 9:16 — vertical (Shorts/Reels/TikTok).',
                          '- 1:1 — square.',
                          '- 16:9 — horizontal (YouTube/web/presentations).',
                          '- Talking head — person speaking to camera.',
                          '- UGC — native “user-generated” style.',
                          '- Motion graphics — animations/graphics/titles/infographics.',
                          '- Screen recording — app/website screen capture.',
                          '- Voiceover — narration over video.',
                          '- Subtitles — subtitles are required.',
                          '- Tutorial — step-by-step how-to.',
                          '- Review — product/service review.',
                          '',
                          'Tip: pick 1–3 key formats, and describe details (length, structure, tone, references) in the requirements.',
                        ].join('\n')
                  }
                />
              }
              ariaLabel={t('task.create.location')}
              placeholder={t('task.create.placeholder.location')}
              value={form.formats}
              options={formatOptions}
              allowCustom
              customPlaceholder={locale === 'ru' ? 'Добавить формат…' : 'Add format…'}
              onChange={(next) => setField('formats', next)}
            />
          </div>

          {form.platforms.length ? (
            <div className="field">
              <span className="field__labelRow">
                <span className="field__label">
                  {locale === 'ru' ? 'Количество видео по платформам' : 'Video quantity per platform'}
                </span>
              </span>
              <div className="deliverablesBox">
                <div className="deliverablesList">
                  {form.platforms.map((p, idx) => {
                    const raw = (form.platformVideoCounts?.[p] ?? '1').trim()
                    const parsed = Number(raw)
                    const value = Number.isFinite(parsed) ? Math.max(1, Math.min(50, Math.floor(parsed))) : 1
                    const decDisabled = value <= 1
                    const incDisabled = value >= 50
                    return (
                      <div key={p} className={`deliverablesRow${idx === 0 ? ' deliverablesRow--first' : ''}`}>
                        <span className="deliverablesRow__platform" title={p}>
                          {p}
                        </span>
                        <div className="deliverablesRow__controls">
                          <button
                            type="button"
                            className="deliverablesRow__btn"
                            disabled={decDisabled}
                            aria-label={locale === 'ru' ? `Уменьшить количество для ${p}` : `Decrease quantity for ${p}`}
                            onClick={() => {
                              setForm((prev) => ({
                                ...prev,
                                platformVideoCounts: {
                                  ...(prev.platformVideoCounts ?? {}),
                                  [p]: String(Math.max(1, value - 1)),
                                },
                              }))
                            }}
                          >
                            −
                          </button>
                          <input
                            className="deliverablesRow__input"
                            value={raw}
                            onChange={(e) => {
                              const nextRaw = e.target.value.replace(/[^\d]/g, '').slice(0, 2)
                              setForm((prev) => ({
                                ...prev,
                                platformVideoCounts: { ...(prev.platformVideoCounts ?? {}), [p]: nextRaw },
                              }))
                            }}
                            onBlur={() => {
                              setTouched((t) => ({ ...t, platformVideoCounts: true }))
                              // Normalize to 1..50 on blur for stable UX.
                              setForm((prev) => {
                                const current = (prev.platformVideoCounts?.[p] ?? '').trim()
                                const n = Number(current)
                                const normalized =
                                  Number.isFinite(n) && Number.isInteger(n) ? Math.max(1, Math.min(50, n)) : 1
                                return {
                                  ...prev,
                                  platformVideoCounts: { ...(prev.platformVideoCounts ?? {}), [p]: String(normalized) },
                                }
                              })
                            }}
                            inputMode="numeric"
                            min={1}
                            max={50}
                            placeholder="1"
                            aria-label={locale === 'ru' ? `Количество видео для ${p}` : `Video quantity for ${p}`}
                          />
                          <button
                            type="button"
                            className="deliverablesRow__btn"
                            disabled={incDisabled}
                            aria-label={locale === 'ru' ? `Увеличить количество для ${p}` : `Increase quantity for ${p}`}
                            onClick={() => {
                              setForm((prev) => ({
                                ...prev,
                                platformVideoCounts: {
                                  ...(prev.platformVideoCounts ?? {}),
                                  [p]: String(Math.min(50, value + 1)),
                                },
                              }))
                            }}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              {visibleErrors.platformVideoCounts ? (
                <div className="field__error" style={{ marginTop: 8 }}>
                  {visibleErrors.platformVideoCounts}
                </div>
              ) : null}
            </div>
          ) : null}

          {form.executorMode !== 'ai' ? (
            <>
              <div className="grid2">
                <label className="field">
                  <span className="field__labelRow">
                    <HelpTip
                      triggerLabel={<span className="field__label">{t('task.create.budgetAmount')}</span>}
                      open={openHelpId === 'budget'}
                      onToggle={() => setOpenHelpId((v) => (v === 'budget' ? null : 'budget'))}
                      onClose={() => setOpenHelpId(null)}
                      ariaLabel={locale === 'ru' ? 'Подсказка: бюджет' : 'Help: budget'}
                      content={
                        locale === 'ru'
                          ? [
                              'Бюджет — сумма оплаты за работу одного исполнителя по этому заданию.',
                              '',
                              'Как это работает в приложении:',
                              '- Когда вы назначаете исполнителя, сумма резервируется (замораживается) на время выполнения.',
                              '',
                              'Советы по выбору суммы:',
                              '- Слишком низкий бюджет уменьшает количество откликов и качество.',
                              '- Если задача сложная (сценарий + съёмка + монтаж + субтитры) — закладывайте больше.',
                              '',
                              'Если бюджет фиксированный, лучше сразу уточнить, что входит и сколько правок.',
                            ].join('\n')
                          : [
                              'Budget is the payment amount per one contractor for this task.',
                              '',
                              'How it works:',
                              '- When you assign a contractor, the amount is reserved during execution.',
                            ].join('\n')
                      }
                    />
                  </span>
                  <input
                    className="field__input"
                    value={form.budgetAmount}
                    onChange={(e) =>
                      setField(
                        'budgetAmount',
                        sanitizeMoneyInput(e.target.value, { maxIntDigits: maxBudgetIntDigits(form.budgetCurrency) }),
                      )
                    }
                    onBlur={() => setTouched((t) => ({ ...t, budgetAmount: true }))}
                    placeholder={t('task.create.placeholder.amount')}
                    inputMode="decimal"
                  />
                  {visibleErrors.budgetAmount ? <span className="field__error">{visibleErrors.budgetAmount}</span> : null}
                </label>

                <div className="field">
                  <CustomSelect<'USD' | 'RUB'>
                    label={
                      <HelpTip
                        triggerLabel={<span>{t('task.create.currency')}</span>}
                        open={openHelpId === 'currency'}
                        onToggle={() => setOpenHelpId((v) => (v === 'currency' ? null : 'currency'))}
                        onClose={() => setOpenHelpId(null)}
                        ariaLabel={locale === 'ru' ? 'Подсказка: валюта' : 'Help: currency'}
                        content={
                          locale === 'ru'
                            ? [
                                'Валюта — в каких единицах указан бюджет (RUB или USD).',
                                '',
                                'Совет: выбирайте ту валюту, в которой вам удобнее считать и пополнять баланс.',
                              ].join('\n')
                            : [
                                'Currency is the unit for the budget (RUB or USD).',
                                'Pick the currency you use to manage your balance.',
                              ].join('\n')
                        }
                      />
                    }
                    value={form.budgetCurrency}
                    options={[
                      { value: 'USD', label: 'USD ($)' },
                      { value: 'RUB', label: 'RUB (₽)' },
                    ]}
                    onChange={(v) => {
                      setCurrencyTouched(true)
                      setForm((prev) => ({
                        ...prev,
                        budgetCurrency: v,
                        budgetAmount: sanitizeMoneyInput(prev.budgetAmount, { maxIntDigits: maxBudgetIntDigits(v) }),
                      }))
                      setTouched((touched) => ({ ...touched, budgetCurrency: true }))
                    }}
                  />
                  {visibleErrors.budgetCurrency ? (
                    <span className="field__error">{visibleErrors.budgetCurrency}</span>
                  ) : null}
                </div>
              </div>

              <div className="grid2">
                <label className="field">
                  <span className="field__labelRow">
                    <HelpTip
                      triggerLabel={<span className="field__label">{t('task.create.maxExecutors')}</span>}
                      open={openHelpId === 'maxExec'}
                      onToggle={() => setOpenHelpId((v) => (v === 'maxExec' ? null : 'maxExec'))}
                      onClose={() => setOpenHelpId(null)}
                      ariaLabel={locale === 'ru' ? 'Подсказка: количество исполнителей' : 'Help: number of contractors'}
                      content={
                        locale === 'ru'
                          ? [
                              'Кол‑во исполнителей — сколько людей вы сможете назначить на это задание.',
                              '',
                              'Когда это нужно:',
                              '- Хотите получить несколько вариантов креатива/монтажа.',
                              '- Нужно много однотипного контента (серия роликов) и вы готовы делить работу.',
                              '',
                              'Важно:',
                              '- Если вам нужен один исполнитель — оставьте “1”.',
                            ].join('\n')
                          : ['Max contractors is how many people you can assign to this task.'].join('\n')
                      }
                    />
                  </span>
                  <input
                    className="field__input"
                    value={form.maxExecutors}
                    onChange={(e) => setField('maxExecutors', e.target.value.replace(/[^\d]/g, '').slice(0, 2))}
                    onBlur={() => setTouched((t) => ({ ...t, maxExecutors: true }))}
                    placeholder={t('task.create.maxExecutors.placeholder')}
                    inputMode="numeric"
                    min={1}
                    max={10}
                  />
                  {visibleErrors.maxExecutors ? <span className="field__error">{visibleErrors.maxExecutors}</span> : null}
                </label>
              </div>
            </>
          ) : null}

          <div className="actionsRow">
            <button className="createTaskPublishBtn" type="submit">
              {t('task.create.publish')} <span className="btnArrow" aria-hidden="true">→</span>
            </button>
            <button
              type="button"
              className="secondaryLink"
              onClick={() => {
                if (hasUnsavedInput) {
                  setConfirmCancelOpen(true)
                  return
                }
                clearSavedDraft()
                navigate(paths.tasks)
              }}
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      </div>

      {confirmCancelOpen ? (
        <div
          className="createTaskConfirmOverlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setConfirmCancelOpen(false)}
        >
          <div className="createTaskConfirmModal" onClick={(e) => e.stopPropagation()}>
            <header className="createTaskConfirmModal__header">
              <div className="createTaskConfirmModal__title">
                {locale === 'ru' ? 'Отменить создание задания?' : 'Discard task creation?'}
              </div>
              <button
                type="button"
                className="createTaskConfirmModal__close"
                onClick={() => setConfirmCancelOpen(false)}
                aria-label={locale === 'ru' ? 'Закрыть' : 'Close'}
              >
                ×
              </button>
            </header>
            <div className="createTaskConfirmModal__body">
              <div className="createTaskConfirmModal__text">
                {locale === 'ru'
                  ? 'Вы уже начали вводить данные. Если выйти сейчас, они не сохранятся.'
                  : 'You have started filling in the form. If you leave now, your changes will be lost.'}
              </div>
            </div>
            <footer className="createTaskConfirmModal__footer">
              <button type="button" className="createTaskConfirmModal__confirm" onClick={() => setConfirmCancelOpen(false)}>
                {locale === 'ru' ? 'Остаться' : 'Stay'}
              </button>
              <button
                type="button"
                className="createTaskConfirmModal__cancel"
                onClick={() => {
                  clearSavedDraft()
                  if (!USE_API) {
                    for (const v of referenceVideos) void deleteBlob(v.blobId).catch(() => {})
                  }
                  setConfirmCancelOpen(false)
                  navigate(paths.tasks)
                }}
              >
                {locale === 'ru' ? 'Выйти' : 'Leave'}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  )
}

