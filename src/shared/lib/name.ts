export function formatSurnameInitials(fullName: string | null | undefined) {
  const raw = String(fullName ?? '').trim()
  if (!raw) return ''
  const parts = raw.split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return raw
  const surname = parts[0]
  const initials = parts
    .slice(1)
    .map((p) => p.trim()[0])
    .filter(Boolean)
    .map((ch) => ch.toUpperCase())
    .join('.')
  if (!initials) return surname
  return `${surname} ${initials}.`
}

