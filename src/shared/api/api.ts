type ApiRequestOptions = {
  headers?: Record<string, string>
  signal?: AbortSignal
}

import { sessionRepo } from '@/shared/auth/sessionRepo'

export class ApiError extends Error {
  status: number | null
  requestId: string | null
  url: string
  payload: unknown

  constructor(message: string, input: { status: number | null; requestId: string | null; url: string; payload: unknown }) {
    super(message)
    this.name = 'ApiError'
    this.status = input.status
    this.requestId = input.requestId
    this.url = input.url
    this.payload = input.payload
  }
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

async function readJsonSafe(res: Response) {
  return (await res.json().catch(() => null)) as unknown
}

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

function headerRequestId(res: Response) {
  return res.headers.get('x-request-id') || res.headers.get('x-requestid') || null
}

function authHeader() {
  const token = sessionRepo.getToken()
  return token ? { Authorization: `Bearer ${token}` } : null
}

function isAbortError(e: unknown) {
  return e instanceof DOMException && e.name === 'AbortError'
}

const inflightGet = new Map<string, Promise<unknown>>()

async function request<TResponse>(input: {
  method: 'GET' | 'POST' | 'PATCH'
  path: string
  body?: unknown
  options?: ApiRequestOptions
}): Promise<TResponse> {
  const url = joinUrl(API_BASE, input.path)
  const auth = authHeader()
  const authKey = typeof auth?.Authorization === 'string' ? auth.Authorization : ''

  // Dedupe identical GETs to prevent resource storms.
  if (input.method === 'GET') {
    const key = `${input.method} ${url} ${authKey}`
    const existing = inflightGet.get(key)
    if (existing) return (await existing) as TResponse
    const p = (async () => {
      try {
        let res: Response
        try {
          res = await fetch(url, {
            method: 'GET',
            signal: input.options?.signal,
            headers: {
              ...(auth ?? null),
              ...(input.options?.headers ?? null),
            },
          })
        } catch (e) {
          if (isAbortError(e)) throw new ApiError('aborted', { status: null, requestId: null, url, payload: null })
          const err = e instanceof Error ? e : new Error('network_error')
          const { logError } = await import('@/shared/logging/logger')
          logError('API_NETWORK_ERROR', { url, message: err.message })
          throw new ApiError(err.message, { status: null, requestId: null, url, payload: null })
        }

        const data = await readJsonSafe(res)
        if (!res.ok) {
          const message =
            (data && typeof data === 'object' && 'error' in data && typeof (data as any).error === 'string'
              ? (data as any).error
              : null) ?? `request_failed_${res.status}`
          const requestId = headerRequestId(res)
          const { logError } = await import('@/shared/logging/logger')
          logError('API_REQUEST_FAILED', { url, status: res.status, requestId, message })
          throw new ApiError(message, { status: res.status, requestId, url, payload: data })
        }

        return data as TResponse
      } finally {
        inflightGet.delete(key)
      }
    })()
    inflightGet.set(key, p as Promise<unknown>)
    return (await p) as TResponse
  }

  // Non-GET requests are not deduped.
  let res: Response
  try {
    res = await fetch(url, {
      method: input.method,
      signal: input.options?.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(auth ?? null),
        ...(input.options?.headers ?? null),
      },
      body: JSON.stringify(input.body),
    })
  } catch (e) {
    if (isAbortError(e)) throw new ApiError('aborted', { status: null, requestId: null, url, payload: null })
    const err = e instanceof Error ? e : new Error('network_error')
    const { logError } = await import('@/shared/logging/logger')
    logError('API_NETWORK_ERROR', { url, message: err.message })
    throw new ApiError(err.message, { status: null, requestId: null, url, payload: null })
  }

  const data = await readJsonSafe(res)
  if (!res.ok) {
    const message =
      (data && typeof data === 'object' && 'error' in data && typeof (data as any).error === 'string'
        ? (data as any).error
        : null) ?? `request_failed_${res.status}`
    const requestId = headerRequestId(res)
    const { logError } = await import('@/shared/logging/logger')
    logError('API_REQUEST_FAILED', { url, status: res.status, requestId, message })
    throw new ApiError(message, { status: res.status, requestId, url, payload: data })
  }

  return data as TResponse
}

export const api = {
  async get<TResponse>(path: string, options?: ApiRequestOptions): Promise<TResponse> {
    return await request<TResponse>({ method: 'GET', path, options })
  },

  async post<TResponse>(path: string, body: unknown, options?: ApiRequestOptions): Promise<TResponse> {
    return await request<TResponse>({ method: 'POST', path, body, options })
  },

  async patch<TResponse>(path: string, body: unknown, options?: ApiRequestOptions): Promise<TResponse> {
    return await request<TResponse>({ method: 'PATCH', path, body, options })
  },
}

