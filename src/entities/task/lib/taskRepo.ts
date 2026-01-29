import type { LocalizedText, Task, TaskStatus } from '../model/task'
import { createId } from '@/shared/lib/id'

const STORAGE_KEY_V2 = 'ui-create-works.tasks.v2'
const STORAGE_KEY_V1 = 'ui-create-works.tasks.v1'
const TTL_MS = 24 * 60 * 60 * 1000

function calcExpiresAt(createdAtIso: string) {
  const ms = Date.parse(createdAtIso)
  const base = Number.isFinite(ms) ? ms : Date.now()
  return new Date(base + TTL_MS).toISOString()
}

function safeParse(json: string | null): unknown[] | null {
  if (!json) return null
  try {
    const data = JSON.parse(json) as unknown
    if (!Array.isArray(data)) return null
    return data
  } catch {
    return null
  }
}

function isLocalizedText(value: unknown): value is LocalizedText {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.en === 'string' && typeof v.ru === 'string'
}

function normalizeStatus(value: unknown): TaskStatus {
  if (value === 'open' || value === 'in_progress' || value === 'closed') return value
  return 'open'
}

function normalizeTask(raw: unknown): Task | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  const id = typeof r.id === 'string' ? r.id : createId('task')
  const createdAt = typeof r.createdAt === 'string' ? r.createdAt : new Date().toISOString()
  const status = normalizeStatus(r.status)
  const expiresAt =
    typeof r.expiresAt === 'string' && r.expiresAt.trim() ? r.expiresAt : calcExpiresAt(createdAt)

  // Legacy v1 shape: title/shortDescription/description are strings.
  const title: LocalizedText =
    isLocalizedText(r.title) ? r.title : { en: String(r.title ?? ''), ru: String(r.title ?? '') }
  const shortDescription: LocalizedText =
    isLocalizedText(r.shortDescription)
      ? r.shortDescription
      : { en: String(r.shortDescription ?? ''), ru: String(r.shortDescription ?? '') }
  const description: LocalizedText =
    isLocalizedText(r.description)
      ? r.description
      : { en: String(r.description ?? ''), ru: String(r.description ?? '') }

  if (!title.en && !title.ru) return null

  const task: Task = {
    id,
    title,
    shortDescription,
    description,
    status,
    createdAt,
    expiresAt,
  }

  if (typeof r.createdByUserId === 'string' && r.createdByUserId.trim()) task.createdByUserId = r.createdByUserId
  if (typeof r.assignedToUserId === 'string' && r.assignedToUserId.trim()) task.assignedToUserId = r.assignedToUserId
  if (typeof r.takenAt === 'string' && r.takenAt.trim()) task.takenAt = r.takenAt
  if (typeof r.completedAt === 'string' && r.completedAt.trim()) task.completedAt = r.completedAt

  if (typeof r.category === 'string' && r.category.trim()) task.category = r.category
  if (typeof r.location === 'string' && r.location.trim()) task.location = r.location
  if (typeof r.budgetAmount === 'number') task.budgetAmount = r.budgetAmount
  if (typeof r.budgetCurrency === 'string' && r.budgetCurrency.trim()) task.budgetCurrency = r.budgetCurrency
  if (typeof r.dueDate === 'string' && r.dueDate.trim()) task.dueDate = r.dueDate

  return task
}

function seedTasks(): Task[] {
  const now = new Date().toISOString()
  const expiresAt = calcExpiresAt(now)
  const today = new Date()
  const in7days = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)

  return [
    {
      id: 'seed_task_1',
      title: {
        en: 'Video idea: “3 quick tips” about our product',
        ru: 'Идея видео: “3 быстрых совета” про наш продукт',
      },
      shortDescription: {
        en: 'Create a short vertical video for TikTok/Reels/Shorts with 3 tips and a strong CTA.',
        ru: 'Сделать короткое вертикальное видео для TikTok/Reels/Shorts: 3 совета + сильный CTA.',
      },
      description: {
        en:
          'Platform: TikTok / Instagram Reels / YouTube Shorts\n' +
          'Format: 9:16, talking head or UGC style\n' +
          'Length: 20–30 seconds\n\n' +
          'Requirements:\n' +
          '- Hook in first 2 seconds\n' +
          '- 3 tips (on-screen text + voice)\n' +
          '- Brand colors and subtle logo\n' +
          '- End with CTA (“Try it today”)\n\n' +
          'Deliverables:\n' +
          '- MP4 + editable project file (optional)\n' +
          '- 1 revision included\n',
        ru:
          'Платформа: TikTok / Instagram Reels / YouTube Shorts\n' +
          'Формат: 9:16, talking head или UGC\n' +
          'Длина: 20–30 секунд\n\n' +
          'Требования:\n' +
          '- Хук в первые 2 секунды\n' +
          '- 3 совета (текст на экране + озвучка)\n' +
          '- Цвета бренда и аккуратный логотип\n' +
          '- В конце CTA (“Попробуйте сегодня”)\n\n' +
          'Результат:\n' +
          '- MP4 + исходники (опционально)\n' +
          '- 1 правка включена\n',
      },
      category: 'TikTok / Reels / Shorts',
      location: '9:16 • UGC',
      budgetAmount: 300,
      budgetCurrency: 'USD',
      dueDate: in7days.toISOString().slice(0, 10),
      status: 'open',
      createdAt: now,
      expiresAt,
    },
    {
      id: 'seed_task_2',
      title: {
        en: 'Video idea: customer review montage',
        ru: 'Идея видео: монтаж отзывов клиентов',
      },
      shortDescription: {
        en: 'Edit short clips into a 30–45s social video with captions and upbeat pacing.',
        ru: 'Смонтировать короткие клипы в 30–45с ролик для соцсетей с субтитрами и динамикой.',
      },
      description: {
        en:
          'Platform: Instagram Reels\n' +
          'Format: 9:16\n' +
          'Length: 30–45 seconds\n\n' +
          'Materials:\n' +
          '- 8–10 short clips from customers (provided)\n' +
          '- Brand guidelines (provided)\n\n' +
          'Requirements:\n' +
          '- Add captions\n' +
          '- Add light transitions, keep it clean\n' +
          '- Music: use trending audio or similar vibe\n' +
          '- Export ready for upload\n',
        ru:
          'Платформа: Instagram Reels\n' +
          'Формат: 9:16\n' +
          'Длина: 30–45 секунд\n\n' +
          'Материалы:\n' +
          '- 8–10 коротких клипов от клиентов (дадим)\n' +
          '- Гайд по бренду (дадим)\n\n' +
          'Требования:\n' +
          '- Добавить субтитры\n' +
          '- Лёгкие переходы, без перегруза\n' +
          '- Музыка: трендовая или похожая по вайбу\n' +
          '- Экспорт под загрузку\n',
      },
      category: 'Instagram Reels',
      location: '9:16 • captions',
      budgetAmount: 200,
      budgetCurrency: 'USD',
      status: 'open',
      createdAt: now,
      expiresAt,
    },
  ]
}

function readAll(): Task[] {
  const v2 = safeParse(localStorage.getItem(STORAGE_KEY_V2))
  if (v2 && v2.length > 0) {
    const normalized = v2.map(normalizeTask).filter(Boolean) as Task[]
    if (normalized.length > 0) return normalized
  }

  // Migrate from v1 if present.
  const v1 = safeParse(localStorage.getItem(STORAGE_KEY_V1))
  if (v1 && v1.length > 0) {
    const migrated = v1.map(normalizeTask).filter(Boolean) as Task[]
    if (migrated.length > 0) {
      writeAll(migrated)
      return migrated
    }
  }

  const seeded = seedTasks()
  writeAll(seeded)
  return seeded
}

function writeAll(tasks: Task[]) {
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(tasks))
  window.dispatchEvent(new Event('ui-create-works.tasks.change'))
}

export const taskRepo = {
  list(): Task[] {
    return readAll()
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },

  getById(taskId: string): Task | null {
    return readAll().find((t) => t.id === taskId) ?? null
  },

  create(
    input: Omit<Task, 'id' | 'createdAt' | 'expiresAt' | 'status'> & Partial<Pick<Task, 'status'>>,
  ): Task {
    const now = new Date().toISOString()
    const task: Task = {
      id: createId('task'),
      createdAt: now,
      expiresAt: calcExpiresAt(now),
      status: 'open',
      ...input,
    }

    const tasks = readAll()
    tasks.push(task)
    writeAll(tasks)
    return task
  },

  update(taskId: string, updater: (task: Task) => Task): Task | null {
    const tasks = readAll()
    const idx = tasks.findIndex((t) => t.id === taskId)
    if (idx === -1) return null
    const updated = updater(tasks[idx])
    tasks[idx] = updated
    writeAll(tasks)
    return updated
  },

  delete(taskId: string): boolean {
    const tasks = readAll()
    const next = tasks.filter((t) => t.id !== taskId)
    if (next.length === tasks.length) return false
    writeAll(next)
    return true
  },

}

