import { sessionRepo } from '@/shared/auth/sessionRepo'

type Tone = 'success' | 'info' | 'error'

function isAbsoluteUrl(input: string) {
  return input.startsWith('http://') || input.startsWith('https://')
}

function joinUrl(base: string, path: string) {
  if (isAbsoluteUrl(path)) return path
  const b = base.endsWith('/') ? base.slice(0, -1) : base
  const p = path.startsWith('/') ? path : `/${path}`
  return `${b}${p}`
}

export async function notifyToTelegramAndUi(params: {
  toast: (msg: string, tone?: Tone) => void
  /** Для пользователей, вошедших через Telegram — уведомление в TG */
  telegramUserId?: string | null
  /** Для пользователей, зарегистрированных по почте — уведомление на email */
  email?: string | null
  text: string
  tone?: Tone
}) {
  const { toast, telegramUserId, email, text, tone = 'info' } = params

  // 1) UI
  toast(text, tone)

  // 2) Канал доставки: TG и/или email (бэк сам решит куда слать по переданным полям)
  const hasChannel = (telegramUserId && String(telegramUserId).trim()) || (email && String(email).trim())
  if (!hasChannel) return

  try {
    const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'
    const url = joinUrl(API_BASE, '/notify')
    const token = sessionRepo.getToken()
    const body: Record<string, unknown> = { text }
    if (telegramUserId && String(telegramUserId).trim()) body.telegramUserId = String(telegramUserId).trim()
    if (email && String(email).trim()) body.email = String(email).trim()
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : null),
      },
      body: JSON.stringify(body),
    })
  } catch {
    // молча, чтобы не ломать UX
  }
}

