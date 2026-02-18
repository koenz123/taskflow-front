export type LogContext = {
  userId?: string
}

export type LogEntry =
  | {
      ts: string
      kind: 'event'
      name: string
      data?: Record<string, unknown>
      ctx?: LogContext
    }
  | {
      ts: string
      kind: 'error'
      code: string
      data?: Record<string, unknown>
      ctx?: LogContext
    }

const STORAGE_KEY = 'ui-create-works.logs.v1'
const MAX_ENTRIES = 200

let ctx: LogContext = {}

function nowIso() {
  return new Date().toISOString()
}

function safeParse(raw: string | null): LogEntry[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw) as unknown
    return Array.isArray(v) ? (v as LogEntry[]) : []
  } catch {
    return []
  }
}

function safeWrite(entries: LogEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)))
  } catch {
    // ignore (private mode/quota)
  }
}

function append(entry: LogEntry) {
  // Console is still useful during infra bring-up.
  if (entry.kind === 'event') console.info('[event]', entry.name, { data: entry.data, ctx: entry.ctx })
  else console.error('[error]', entry.code, { data: entry.data, ctx: entry.ctx })

  try {
    const prev = safeParse(localStorage.getItem(STORAGE_KEY))
    prev.push(entry)
    safeWrite(prev)
  } catch {
    // ignore
  }
}

export function setLogContext(next: LogContext) {
  ctx = { ...ctx, ...next }
}

export function logEvent(name: string, data?: Record<string, unknown>) {
  append({
    ts: nowIso(),
    kind: 'event',
    name,
    data,
    ctx,
  })
}

export function logError(code: string, data?: Record<string, unknown>) {
  append({
    ts: nowIso(),
    kind: 'error',
    code,
    data,
    ctx,
  })
}

