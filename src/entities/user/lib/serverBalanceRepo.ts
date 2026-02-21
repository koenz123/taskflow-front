import { api } from '@/shared/api/api'

type Snapshot = { balance: number; loaded: boolean }

let snapshot: Snapshot = { balance: 0, loaded: false }
const listeners = new Set<() => void>()
let inflight: Promise<void> | null = null

function emit() {
  for (const l of listeners) l()
}

export const serverBalanceRepo = {
  get() {
    return snapshot.balance
  },

  async refresh() {
    if (inflight) return await inflight
    inflight = (async () => {
      try {
        const data = await api.get<{ userId: string; balance: number }>('/balance')
        snapshot = { balance: Number(data.balance) || 0, loaded: true }
        emit()
      } finally {
        inflight = null
      }
    })()
    return await inflight
  },

  async adjust(delta: number, reason: string) {
    const d = Number(delta)
    if (!Number.isFinite(d) || d === 0) throw new Error('invalid_delta')
    if (!String(reason || '').trim()) throw new Error('missing_reason')
    const data = await api.post<{ userId: string; balance: number }>('/balance/adjust', { delta: d, reason })
    snapshot = { balance: Number(data.balance) || 0, loaded: true }
    emit()
    return snapshot.balance
  },

  subscribe(cb: () => void) {
    listeners.add(cb)
    // lazy refresh on first subscriber
    if (!snapshot.loaded) void serverBalanceRepo.refresh().catch(() => {})
    return () => listeners.delete(cb)
  },
}

