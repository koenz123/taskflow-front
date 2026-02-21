type IsVerifiedResponse = { verified: boolean }

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

type VerifyEmailCodeResponse = { ok: true; email?: string; alreadyVerified?: boolean }
type ConsumePendingResponse =
  | { ok: true }
  | { token?: string; user?: { id?: string; role?: string; telegramUserId?: string | null } }

export async function sendVerificationCode(emailRaw: string) {
  const email = emailRaw.trim()
  const res = await fetch(`${API_BASE}/auth/send-verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  const data = (await res.json().catch(() => null)) as any
  if (!res.ok) {
    const code = typeof data?.error === 'string' ? data.error : `send_failed_${res.status}`
    throw new Error(code)
  }
  return data as { ok?: true } | null
}

export async function registerPendingSignup(input: {
  role: 'customer' | 'executor'
  fullName: string
  phone: string
  email: string
  company?: string
  passwordHash: string
}) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null
    if (res.status === 409 && data?.error) throw new Error(data.error)
    throw new Error(`register_failed_${res.status}`)
  }
  await res.json().catch(() => null)
}

export async function verifyEmailByCode(input: { email: string; code: string }): Promise<VerifyEmailCodeResponse> {
  const email = input.email.trim()
  const code = input.code.trim()
  const res = await fetch(`${API_BASE}/auth/verify-email-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  })
  const data = (await res.json().catch(() => null)) as any
  if (!res.ok) {
    const code = typeof data?.error === 'string' ? data.error : `verify_failed_${res.status}`
    throw new Error(code)
  }
  return (data ?? { ok: true, email }) as VerifyEmailCodeResponse
}

export async function isEmailVerified(email: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/auth/is-verified?email=${encodeURIComponent(email)}`)
  if (!res.ok) return false
  const data = (await res.json().catch(() => null)) as IsVerifiedResponse | null
  return Boolean(data?.verified)
}

export async function consumePendingSignup(input: { email: string; code: string }): Promise<ConsumePendingResponse> {
  const email = input.email.trim()
  const code = input.code.trim()
  const res = await fetch(`${API_BASE}/auth/consume-pending`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  })
  const data = (await res.json().catch(() => null)) as any
  if (!res.ok) {
    const code = typeof data?.error === 'string' ? data.error : `consume_failed_${res.status}`
    throw new Error(code)
  }
  return (data ?? { ok: true }) as ConsumePendingResponse
}

