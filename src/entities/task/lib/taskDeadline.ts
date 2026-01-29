import type { Locale } from '@/shared/i18n/translations'

export function timeLeftMs(expiresAtIso: string, nowMs: number) {
  const exp = Date.parse(expiresAtIso)
  if (!Number.isFinite(exp)) return 0
  return Math.max(0, exp - nowMs)
}

export function formatTimeLeft(ms: number, locale: Locale) {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60) % 60
  const hours = Math.floor(totalSeconds / 3600) % 24
  const days = Math.floor(totalSeconds / 86400)

  const hLabel = locale === 'ru' ? 'ч' : 'h'
  const mLabel = locale === 'ru' ? 'м' : 'm'
  const dLabel = locale === 'ru' ? 'д' : 'd'

  if (days > 0) return `${days}${dLabel} ${hours}${hLabel}`
  if (hours > 0) return `${hours}${hLabel} ${minutes}${mLabel}`
  return `${minutes}${mLabel}`
}

