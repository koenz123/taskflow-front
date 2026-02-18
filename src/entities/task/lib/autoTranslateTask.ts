import type { LocalizedText } from '../model/task'
import type { TranslateLocale } from '@/shared/i18n/translate'
import { guessLocale, translateText } from '@/shared/i18n/translate'
import { taskRepo } from './taskRepo'
import { createGoal } from '@/entities/goal/lib/goalApi'

type Field = 'title' | 'shortDescription' | 'requirements' | 'description'

function otherLocale(locale: TranslateLocale): TranslateLocale {
  return locale === 'ru' ? 'en' : 'ru'
}

function cacheKey(taskId: string, field: Field, target: TranslateLocale) {
  return `ui-create-works.autotranslate.v1:${taskId}:${field}:${target}`
}

function needsTranslation(text: LocalizedText) {
  // If both are identical, it likely means we never translated.
  return text.en.trim() !== '' && text.en === text.ru
}

async function translateField(taskId: string, field: Field, text: LocalizedText, userId: string) {
  const source = guessLocale(text.en)
  const target = otherLocale(source)

  const key = cacheKey(taskId, field, target)
  if (sessionStorage.getItem(key) === '1') return
  sessionStorage.setItem(key, '1')

  // Decide direction based on detected script.
  // If we detect RU, we treat text.ru as source and translate to EN; vice versa.
  const sourceText = source === 'ru' ? text.ru : text.en

  try {
    const translated = await translateText(sourceText, source, target)

    // Create a backend record (temporary logging/integration).
    // userId is passed from the caller (no React hooks here).
    // NOTE: best-effort; if backend is down we still keep UI responsive.
    await createGoal(translated, userId)

    taskRepo.update(taskId, (prev) => {
      const current = prev[field]
      if (!current || !needsTranslation(current)) return prev
      return {
        ...prev,
        [field]: source === 'ru' ? { ru: sourceText, en: translated } : { en: sourceText, ru: translated },
      }
    })
  } catch (e) {
    // Best-effort: translation endpoints may be blocked by CORS or rate limits.
    // Also, backend goal creation may fail (network/CORS) — don't break UI.
    console.error('[autoTranslateTask] translate/createGoal failed', e)
  }
}

export async function autoTranslateIfNeeded(
  taskId: string,
  fields: Pick<Record<Field, LocalizedText>, 'title' | 'shortDescription'> &
    Partial<Record<'requirements' | 'description', LocalizedText>>,
  userId: string,
) {
  if (needsTranslation(fields.title)) await translateField(taskId, 'title', fields.title, userId)
  if (needsTranslation(fields.shortDescription)) await translateField(taskId, 'shortDescription', fields.shortDescription, userId)
  if (fields.requirements && needsTranslation(fields.requirements)) {
    await translateField(taskId, 'requirements', fields.requirements, userId)
  }
  if (fields.description && needsTranslation(fields.description)) await translateField(taskId, 'description', fields.description, userId)
}

