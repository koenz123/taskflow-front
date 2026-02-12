export function timeAgo(iso: string, locale: 'ru' | 'en', nowMs: number = Date.now()): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return iso

  const diffSec = Math.max(0, Math.floor((nowMs - t) / 1000))
  if (diffSec < 5) return locale === 'ru' ? 'только что' : 'just now'
  if (diffSec < 60) return locale === 'ru' ? `${diffSec}с назад` : `${diffSec}s ago`

  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return locale === 'ru' ? `${diffMin}м назад` : `${diffMin}m ago`

  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return locale === 'ru' ? `${diffH}ч назад` : `${diffH}h ago`

  const diffD = Math.floor(diffH / 24)
  if (diffD === 1) return locale === 'ru' ? 'вчера' : 'yesterday'
  if (diffD < 7) return locale === 'ru' ? `${diffD}д назад` : `${diffD}d ago`

  // Fallback: show date for older items.
  return new Date(t).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US')
}

