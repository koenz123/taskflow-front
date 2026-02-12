type SendVerificationResponse = { ok: true }
type PendingSignup = {
  role: 'customer' | 'executor'
  fullName: string
  phone: string
  email: string
  company?: string
  passwordHash: string
  createdAt: string
}

type VerifyResponse = { email: string; alreadyVerified?: boolean; pending?: PendingSignup | null }
type IsVerifiedResponse = { verified: boolean }

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

export async function sendEmailVerification(email: string) {
  const res = await fetch(`${API_BASE}/auth/send-verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) throw new Error(`send_verification_failed_${res.status}`)
  ;(await res.json().catch(() => null)) as SendVerificationResponse | null
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
  ;(await res.json().catch(() => null)) as SendVerificationResponse | null
}

export async function verifyEmailByToken(token: string): Promise<VerifyResponse> {
  const res = await fetch(`${API_BASE}/auth/verify-email?token=${encodeURIComponent(token)}`)
  if (!res.ok) throw new Error(`verify_failed_${res.status}`)
  const data = (await res.json()) as VerifyResponse
  if (!data?.email) throw new Error('verify_invalid_response')
  return data
}

export async function isEmailVerified(email: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/auth/is-verified?email=${encodeURIComponent(email)}`)
  if (!res.ok) return false
  const data = (await res.json().catch(() => null)) as IsVerifiedResponse | null
  return Boolean(data?.verified)
}

export async function consumePendingSignup(token: string) {
  const res = await fetch(`${API_BASE}/auth/consume-pending`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  if (!res.ok) throw new Error(`consume_failed_${res.status}`)
  ;(await res.json().catch(() => null)) as SendVerificationResponse | null
}


