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
  telegramUserId?: string | null
  text: string
  tone?: Tone
}) {
  const { toast, telegramUserId, text, tone = 'info' } = params

  // 1) UI
  toast(text, tone)

  // 2) TG (если привязан)
  if (!telegramUserId) return

  try {
    const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'
    const url = joinUrl(API_BASE, '/notify')
    const token = sessionRepo.getToken()
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : null),
      },
      body: JSON.stringify({ telegramUserId, text }),
    })
  } catch {
    // молча, чтобы не ломать UX
  }
}

