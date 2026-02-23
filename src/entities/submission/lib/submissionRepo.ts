import { createId } from '@/shared/lib/id'
import type { Submission, SubmissionFile } from '../model/submission'

const STORAGE_KEY = 'ui-create-works.submissions.v1'
const CHANGE_EVENT = 'ui-create-works.submissions.change'

function safeParse(json: string | null): Submission[] {
  if (!json) return []
  try {
    const data = JSON.parse(json) as unknown
    if (!Array.isArray(data)) return []
    return data as Submission[]
  } catch {
    return []
  }
}

function readAll(): Submission[] {
  return safeParse(localStorage.getItem(STORAGE_KEY))
}

function writeAll(items: Submission[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function nowIso() {
  return new Date().toISOString()
}

function normalizeFiles(value: unknown): SubmissionFile[] {
  if (!Array.isArray(value)) return []
  return value
    .map((x) => {
      if (typeof x === 'string' && x.trim()) {
        return { kind: 'external_url' as const, url: x.trim(), mediaType: 'video' as const }
      }
      if (!x || typeof x !== 'object') return null
      const r = x as Record<string, unknown>
      const kind = (typeof r.kind === 'string' ? r.kind : typeof r.type === 'string' ? r.type : '').trim()
      const url =
        (typeof r.url === 'string' ? r.url.trim() : '') ||
        (typeof (r as any).path === 'string' ? String((r as any).path).trim() : '') ||
        (typeof (r as any).fileUrl === 'string' ? String((r as any).fileUrl).trim() : '') ||
        (typeof (r as any).mediaUrl === 'string' ? String((r as any).mediaUrl).trim() : '') ||
        (typeof (r as any).link === 'string' ? String((r as any).link).trim() : '') ||
        (typeof (r as any).href === 'string' ? String((r as any).href).trim() : '') ||
        (typeof (r as any).src === 'string' ? String((r as any).src).trim() : '')
      if (!url) return null

      const title =
        (typeof r.title === 'string' && r.title.trim() ? r.title.trim() : undefined) ??
        (typeof (r as any).name === 'string' && String((r as any).name).trim() ? String((r as any).name).trim() : undefined) ??
        (typeof (r as any).filename === 'string' && String((r as any).filename).trim()
          ? String((r as any).filename).trim()
          : undefined)
      const mediaType =
        r.mediaType === 'video' || r.mediaType === 'image' || r.mediaType === 'file' ? r.mediaType : undefined

      if (kind === 'external_url' || kind === 'url' || kind === 'link') {
        return { kind: 'external_url' as const, url, title, mediaType }
      }
      if (kind === 'upload' || kind === 'file' || kind === 'attachment' || kind === 'video') {
        const workId = typeof r.workId === 'string' && r.workId.trim() ? r.workId : undefined
        return { kind: 'upload' as const, url, title, mediaType, workId }
      }
      // Default: preserve URL as external link.
      return { kind: 'external_url' as const, url, title, mediaType }
    })
    .filter(Boolean) as SubmissionFile[]
}

function normalize(raw: unknown): Submission | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = typeof r.id === 'string' ? r.id : createId('sub')
  const contractId = typeof r.contractId === 'string' ? r.contractId : ''
  if (!contractId) return null
  const createdAt = typeof r.createdAt === 'string' ? r.createdAt : nowIso()
  const message = typeof r.message === 'string' && r.message.trim() ? r.message.trim() : undefined
  const completionVideoUrl = typeof (r as any).completionVideoUrl === 'string' ? String((r as any).completionVideoUrl).trim() : ''
  const files = (() => {
    const normalized = normalizeFiles(r.files)
    if (normalized.length) return normalized
    // Some backends expose the main deliverable as a flat field.
    if (completionVideoUrl) {
      return [{ kind: 'upload' as const, url: completionVideoUrl, title: 'video', mediaType: 'video' as const }]
    }
    return []
  })()
  const status = r.status === 'superseded' ? 'superseded' : 'submitted'
  return { id, contractId, createdAt, message, files, status }
}

export const submissionRepo = {
  normalize(raw: unknown): Submission | null {
    return normalize(raw)
  },

  normalizeFiles(value: unknown): SubmissionFile[] {
    return normalizeFiles(value)
  },

  listAll(): Submission[] {
    return readAll()
      .map(normalize)
      .filter(Boolean) as Submission[]
  },

  listForContract(contractId: string): Submission[] {
    return this.listAll()
      .filter((s) => s.contractId === contractId)
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },

  latestForContract(contractId: string): Submission | null {
    return this.listForContract(contractId)[0] ?? null
  },

  create(input: { contractId: string; message?: string; files?: SubmissionFile[] }): Submission {
    const now = nowIso()
    const all = this.listAll()
    // Supersede previous submissions for the same contract.
    const updated: Submission[] = all.map((s): Submission =>
      s.contractId === input.contractId ? { ...s, status: 'superseded' } : s,
    )

    const submission: Submission = {
      id: createId('sub'),
      contractId: input.contractId,
      message: input.message?.trim() || undefined,
      files: Array.isArray(input.files) ? input.files : [],
      status: 'submitted',
      createdAt: now,
    }
    updated.push(submission)
    writeAll(updated)
    return submission
  },

  subscribe(callback: () => void) {
    const handler = () => callback()
    window.addEventListener(CHANGE_EVENT, handler)
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) handler()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(CHANGE_EVENT, handler)
      window.removeEventListener('storage', onStorage)
    }
  },
}

