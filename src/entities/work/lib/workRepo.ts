import type { Work, WorkMediaType } from '../model/work'

export type CreateWorkInput = {
  ownerId: string
  title: string
  description?: string
  mediaUrl?: string
  mediaType?: WorkMediaType
  file?: File | null
  onProgress?: (progress: { loaded: number; total?: number; percent?: number }) => void
}

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'
const listeners = new Set<() => void>()

async function fetchJson<T>(input: RequestInfo, init?: RequestInit) {
  const res = await fetch(input, init)
  if (!res.ok) {
    const payload = await res.json().catch(() => null)
    const error = new Error(payload?.error ?? res.statusText)
    throw error
  }
  return (await res.json()) as T
}

function broadcast() {
  for (const listener of listeners) listener()
}

export const workRepo = {
  async listForUser(userId: string) {
    const url = `${API_BASE}/users/${userId}/works`
    return fetchJson<Work[]>(url)
  },

  async create(input: CreateWorkInput) {
    const formData = new FormData()
    formData.append('ownerId', input.ownerId)
    formData.append('title', input.title.trim())
    formData.append('description', (input.description ?? '').trim())
    if (input.mediaUrl?.trim()) formData.append('externalUrl', input.mediaUrl.trim())
    formData.append('mediaType', input.mediaType ?? 'video')
    if (input.file) formData.append('file', input.file)

    const work = input.file ? await postMultipartWithProgress(formData, input.onProgress) : await fetchJson<Work>(`${API_BASE}/videos`, { method: 'POST', body: formData })
    broadcast()
    return work
  },

  async delete(workId: string) {
    await fetch(`${API_BASE}/videos/${workId}`, { method: 'DELETE' })
    broadcast()
  },

  async update(workId: string, input: { title?: string; description?: string }) {
    const updated = await fetchJson<Work>(`${API_BASE}/videos/${workId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(typeof input.title === 'string' ? { title: input.title } : null),
        ...(typeof input.description === 'string' ? { description: input.description } : null),
      }),
    })
    broadcast()
    return updated
  },

  subscribe(callback: () => void) {
    listeners.add(callback)
    return () => {
      listeners.delete(callback)
    }
  },
}

function postMultipartWithProgress(formData: FormData, onProgress?: (p: { loaded: number; total?: number; percent?: number }) => void) {
  return new Promise<Work>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE}/videos`)
    // Avoid "infinite" hanging if server never responds.
    xhr.timeout = 10 * 60 * 1000

    xhr.onloadstart = () => {
      console.log('[workRepo] upload: onloadstart')
    }

    xhr.upload.onprogress = (e) => {
      if (!onProgress) return
      const total = typeof e.total === 'number' && e.total > 0 ? e.total : undefined
      const percent = total ? Math.round((e.loaded / total) * 100) : undefined
      onProgress({ loaded: e.loaded, total, percent })
    }

    xhr.upload.onload = () => {
      console.log('[workRepo] upload: upload.onload (request body fully sent)')
    }

    xhr.upload.onerror = () => {
      console.error('[workRepo] upload: upload.onerror')
    }

    xhr.onload = () => {
      try {
        const text = xhr.responseText || ''
        const json = text ? JSON.parse(text) : null
        if (xhr.status >= 200 && xhr.status < 300) {
          return resolve(json as Work)
        }
        return reject(new Error(json?.error ?? xhr.statusText))
      } catch (e) {
        return reject(e instanceof Error ? e : new Error('upload_failed'))
      }
    }

    xhr.onloadend = () => {
      console.log('[workRepo] upload: onloadend', { status: xhr.status })
    }

    xhr.onerror = () => {
      reject(new Error('network_error'))
    }

    xhr.onabort = () => {
      reject(new Error('upload_aborted'))
    }

    xhr.ontimeout = () => {
      reject(new Error('upload_timeout'))
    }

    xhr.send(formData)
  })
}
