export function splitMetaList(value: string | undefined | null): string[] {
  const raw = (value ?? '').trim()
  if (!raw) return []

  // Prefer comma-separated, fallback to legacy separators.
  const byComma = raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

  const base =
    byComma.length > 1
      ? byComma
      : raw.includes(' / ')
        ? raw
            .split(' / ')
            .map((x) => x.trim())
            .filter(Boolean)
        : raw.includes('•')
          ? raw
              .split('•')
              .map((x) => x.trim())
              .filter(Boolean)
          : byComma

  const uniq: string[] = []
  const seen = new Set<string>()
  for (const x of base) {
    const key = x.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    uniq.push(x)
  }
  return uniq
}

export function previewMetaList(value: string | undefined | null, maxItems: number): string | null {
  const items = splitMetaList(value)
  if (!items.length) return null
  const shown = items.slice(0, maxItems).join(', ')
  return items.length > maxItems ? `${shown}…` : shown
}

