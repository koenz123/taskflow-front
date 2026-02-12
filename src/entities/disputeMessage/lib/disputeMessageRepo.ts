import { createId } from '@/shared/lib/id'
import type { DisputeMessage } from '../model/disputeMessage'

const STORAGE_KEY = 'ui-create-works.disputeMessages.v1'
const CHANGE_EVENT = 'ui-create-works.disputeMessages.change'

function safeParse(json: string | null): DisputeMessage[] {
  if (!json) return []
  try {
    const data = JSON.parse(json) as unknown
    if (!Array.isArray(data)) return []
    return data as DisputeMessage[]
  } catch {
    return []
  }
}

function readAll(): DisputeMessage[] {
  return safeParse(localStorage.getItem(STORAGE_KEY))
}

function writeAll(items: DisputeMessage[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function nowIso() {
  return new Date().toISOString()
}

function normalize(raw: unknown): DisputeMessage | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = typeof r.id === 'string' ? r.id : createId('dmsg')
  const disputeId = typeof r.disputeId === 'string' ? r.disputeId : ''
  const authorUserId = typeof r.authorUserId === 'string' ? r.authorUserId : ''
  const kindRaw = typeof r.kind === 'string' ? r.kind : 'public'
  const kind = kindRaw === 'system' || kindRaw === 'internal' || kindRaw === 'public' ? kindRaw : 'public'
  const text = typeof r.text === 'string' ? r.text : ''
  if (!disputeId || !authorUserId) return null
  const createdAt = typeof r.createdAt === 'string' ? r.createdAt : nowIso()
  const attachments = Array.isArray(r.attachments) ? (r.attachments as any[]) : null
  return { id, disputeId, authorUserId, kind, text, attachments: attachments ?? undefined, createdAt }
}

export const disputeMessageRepo = {
  listForDispute(disputeId: string): DisputeMessage[] {
    return readAll()
      .map(normalize)
      .filter(Boolean)
      .filter((m) => (m as DisputeMessage).disputeId === disputeId) as DisputeMessage[]
  },

  add(input: { disputeId: string; authorUserId: string; kind?: DisputeMessage['kind']; text: string }): DisputeMessage {
    const now = nowIso()
    const msg: DisputeMessage = {
      id: createId('dmsg'),
      disputeId: input.disputeId,
      authorUserId: input.authorUserId,
      kind: input.kind ?? 'public',
      text: input.text,
      createdAt: now,
    }
    const all = readAll()
    all.push(msg)
    writeAll(all)
    return msg
  },

  addSystem(input: { disputeId: string; text: string }): DisputeMessage {
    return this.add({ disputeId: input.disputeId, authorUserId: 'system', kind: 'system', text: input.text })
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

