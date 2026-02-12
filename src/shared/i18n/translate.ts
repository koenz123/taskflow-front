export type TranslateLocale = 'en' | 'ru'

function hasCyrillic(text: string) {
  return /[\u0400-\u04FF]/.test(text)
}

export function guessLocale(text: string): TranslateLocale {
  return hasCyrillic(text) ? 'ru' : 'en'
}

type LibreResponse = { translatedText?: string }

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

async function tryLibreTranslate(url: string, q: string, source: TranslateLocale, target: TranslateLocale) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q,
      source,
      target,
      format: 'text',
    }),
  })

  if (!res.ok) throw new Error(`translate_failed_${res.status}`)
  const data = (await res.json()) as LibreResponse
  const translatedText = typeof data.translatedText === 'string' ? data.translatedText : null
  if (!translatedText) throw new Error('translate_empty')
  return translatedText
}

const endpoints = [`${API_BASE}/translate`] as const

export async function translateText(q: string, source: TranslateLocale, target: TranslateLocale) {
  const text = q.trim()
  if (!text) return ''
  if (source === target) return text

  let lastError: unknown = null
  for (const url of endpoints) {
    try {
      return await tryLibreTranslate(url, text, source, target)
    } catch (e) {
      lastError = e
    }
  }

  throw lastError ?? new Error('translate_failed')
}

