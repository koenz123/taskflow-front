import type { LocalizedText } from '../model/task'

export type Locale = 'en' | 'ru'

export function pickText(text: LocalizedText, locale: Locale) {
  return text[locale] || text.en || text.ru
}

