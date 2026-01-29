import { createContext, useContext } from 'react'
import type { Locale, TranslationKey } from './translations'

export type I18nApi = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: TranslationKey) => string
}

export const I18nContext = createContext<I18nApi | null>(null)

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}

