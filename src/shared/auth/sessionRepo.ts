const STORAGE_KEY = 'ui-create-works.session.v1'
const STORAGE_KEY_TEMP = 'ui-create-works.session.temp.v1'

type Session = {
  userId: string
}

function safeParse(json: string | null): Session | null {
  if (!json) return null
  try {
    const data = JSON.parse(json) as unknown
    if (!data || typeof data !== 'object') return null
    const d = data as Record<string, unknown>
    if (typeof d.userId !== 'string') return null
    return { userId: d.userId }
  } catch {
    return null
  }
}

function emit() {
  window.dispatchEvent(new Event('ui-create-works.session.change'))
}

export const sessionRepo = {
  getUserId(): string | null {
    return (
      safeParse(sessionStorage.getItem(STORAGE_KEY_TEMP))?.userId ??
      safeParse(localStorage.getItem(STORAGE_KEY))?.userId ??
      null
    )
  },

  setUserId(userId: string, opts?: { remember?: boolean }) {
    const remember = opts?.remember ?? true
    if (remember) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ userId }))
      sessionStorage.removeItem(STORAGE_KEY_TEMP)
    } else {
      sessionStorage.setItem(STORAGE_KEY_TEMP, JSON.stringify({ userId }))
      localStorage.removeItem(STORAGE_KEY)
    }
    emit()
  },

  clear() {
    localStorage.removeItem(STORAGE_KEY)
    sessionStorage.removeItem(STORAGE_KEY_TEMP)
    emit()
  },
}

