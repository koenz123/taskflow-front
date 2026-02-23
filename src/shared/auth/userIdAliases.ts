export function userIdAliases(user: { id: string; telegramUserId?: string | null }): string[] {
  const out: string[] = []
  const add = (v: unknown) => {
    const s = typeof v === 'string' || typeof v === 'number' ? String(v).trim() : ''
    if (!s) return
    if (out.includes(s)) return
    out.push(s)
  }

  add(user.id)
  add(user.telegramUserId)
  if (user.telegramUserId) add(`tg_${user.telegramUserId}`)
  return out
}

export function userIdMatches(user: { id: string; telegramUserId?: string | null }, idLike: unknown): boolean {
  const key = typeof idLike === 'string' || typeof idLike === 'number' ? String(idLike).trim() : ''
  if (!key) return false
  return userIdAliases(user).includes(key)
}

export function executorIdAliases(user: { id: string; role?: string | null; telegramUserId?: string | null }): string[] {
  // Backward compatible helper: executors may be referenced by telegram id in some backend stores.
  // For other roles, return only user.id to avoid accidental matches.
  if (user.role === 'executor') return userIdAliases(user)
  return [user.id]
}

