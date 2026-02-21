import { sessionRepo } from '@/shared/auth/sessionRepo'

export type UploadResult = {
  url: string
  path: string
  storageName: string
  originalName: string
  mimeType: string
  mediaType: string
  size: number
}

function isAbsoluteUrl(input: string) {
  return input.startsWith('http://') || input.startsWith('https://')
}

function joinUrl(base: string, path: string) {
  if (isAbsoluteUrl(path)) return path
  const b = base.endsWith('/') ? base.slice(0, -1) : base
  const p = path.startsWith('/') ? path : `/${path}`
  return `${b}${p}`
}

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

export async function uploadFileToServer(file: Blob, filename: string): Promise<UploadResult> {
  const token = sessionRepo.getToken()
  if (!token) throw new Error('unauthenticated')

  const form = new FormData()
  form.append('file', file, filename || 'file')

  const url = joinUrl(API_BASE, '/uploads')
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })

  if (!res.ok && res.status === 413) {
    // nginx "Request Entity Too Large"
    throw new Error('payload_too_large')
  }

  const data = (await res.json().catch(() => null)) as any
  if (!res.ok) {
    const msg =
      typeof data?.error === 'string'
        ? data.error
        : typeof data?.message === 'string'
          ? data.message
          : `upload_failed_${res.status}`
    throw new Error(msg)
  }
  const normalizeUrl = (input: unknown) => {
    const url = typeof input === 'string' ? input.trim() : ''
    if (!url) return url
    try {
      const u = new URL(url)
      // Avoid mixed content when backend mistakenly returns http in prod.
      if (typeof window !== 'undefined' && window.location?.protocol === 'https:' && u.protocol === 'http:') {
        u.protocol = 'https:'
      }
      return u.toString()
    } catch {
      return url
    }
  }
  const out = data as UploadResult
  return { ...out, url: normalizeUrl(out?.url) }
}

