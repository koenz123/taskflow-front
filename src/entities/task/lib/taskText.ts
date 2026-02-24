import type { LocalizedText } from '../model/task'

export type Locale = 'en' | 'ru'

export function pickText(text: LocalizedText | null | undefined, locale: Locale) {
  if (!text) return ''
  return text[locale] || text.en || text.ru || ''
}

