const STORAGE_KEY = 'ui-create-works.session.v1'
const STORAGE_KEY_TEMP = 'ui-create-works.session.temp.v1'
const STORAGE_KEY_TOKEN = 'ui-create-works.session.token.v1'
const STORAGE_KEY_TOKEN_TEMP = 'ui-create-works.session.token.temp.v1'
const STORAGE_KEY_TG = 'ui-create-works.session.telegramUserId.v1'
const STORAGE_KEY_TG_TEMP = 'ui-create-works.session.telegramUserId.temp.v1'

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

  getToken(): string | null {
    return sessionStorage.getItem(STORAGE_KEY_TOKEN_TEMP) ?? localStorage.getItem(STORAGE_KEY_TOKEN) ?? null
  },

  setToken(token: string, opts?: { remember?: boolean }) {
    const remember = opts?.remember ?? true
    const value = token.trim()
    if (!value) return
    if (remember) {
      localStorage.setItem(STORAGE_KEY_TOKEN, value)
      sessionStorage.removeItem(STORAGE_KEY_TOKEN_TEMP)
    } else {
      sessionStorage.setItem(STORAGE_KEY_TOKEN_TEMP, value)
      localStorage.removeItem(STORAGE_KEY_TOKEN)
    }
    emit()
  },

  getTelegramUserId(): string | null {
    return sessionStorage.getItem(STORAGE_KEY_TG_TEMP) ?? localStorage.getItem(STORAGE_KEY_TG) ?? null
  },

  setTelegramUserId(telegramUserId: string, opts?: { remember?: boolean }) {
    const remember = opts?.remember ?? true
    const value = telegramUserId.trim()
    if (!value) return
    if (remember) {
      localStorage.setItem(STORAGE_KEY_TG, value)
      sessionStorage.removeItem(STORAGE_KEY_TG_TEMP)
    } else {
      sessionStorage.setItem(STORAGE_KEY_TG_TEMP, value)
      localStorage.removeItem(STORAGE_KEY_TG)
    }
    emit()
  },

  clear() {
    localStorage.removeItem(STORAGE_KEY)
    sessionStorage.removeItem(STORAGE_KEY_TEMP)
    localStorage.removeItem(STORAGE_KEY_TOKEN)
    sessionStorage.removeItem(STORAGE_KEY_TOKEN_TEMP)
    localStorage.removeItem(STORAGE_KEY_TG)
    sessionStorage.removeItem(STORAGE_KEY_TG_TEMP)
    emit()
  },
}

