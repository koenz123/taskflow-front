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
      if (!x || typeof x !== 'object') return null
      const r = x as Record<string, unknown>
      const kind = r.kind
      const url = typeof r.url === 'string' ? r.url.trim() : ''
      if (!url) return null

      const title = typeof r.title === 'string' && r.title.trim() ? r.title.trim() : undefined
      const mediaType =
        r.mediaType === 'video' || r.mediaType === 'image' || r.mediaType === 'file' ? r.mediaType : undefined

      if (kind === 'external_url') {
        return { kind: 'external_url' as const, url, title, mediaType }
      }
      if (kind === 'upload') {
        const workId = typeof r.workId === 'string' && r.workId.trim() ? r.workId : undefined
        return { kind: 'upload' as const, url, title, mediaType, workId }
      }
      return null
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
  const files = normalizeFiles(r.files)
  const status = r.status === 'superseded' ? 'superseded' : 'submitted'
  return { id, contractId, createdAt, message, files, status }
}

export const submissionRepo = {
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

