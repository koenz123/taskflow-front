import { useCallback, useMemo, useState } from 'react'
import type { Locale, TranslationKey } from './translations'
import { translations } from './translations'
import { I18nContext } from './I18nContext'

const STORAGE_KEY = 'ui-create-works.locale.v1'

function detectInitialLocale(): Locale {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'en' || saved === 'ru') return saved

  const navLang = (navigator.language || '').toLowerCase()
  if (navLang.startsWith('ru')) return 'ru'
  return 'en'
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => detectInitialLocale())

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    localStorage.setItem(STORAGE_KEY, next)
  }, [])

  const t = useCallback(
    (key: TranslationKey) => {
      const value = translations[locale][key]
      return value ?? translations.en[key] ?? key
    },
    [locale],
  )

  const api = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t])

  return <I18nContext.Provider value={api}>{children}</I18nContext.Provider>
}

