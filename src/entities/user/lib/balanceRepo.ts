const STORAGE_KEY = 'ui-create-works.customerBalances.v1'
const CHANGE_EVENT = 'ui-create-works.customerBalances.change'

type Balances = Record<string, number>

function safeParse(json: string | null): Balances {
  if (!json) return {}
  try {
    const data = JSON.parse(json) as unknown
    if (typeof data !== 'object' || data === null) return {}
    return Object.entries(data).reduce<Balances>((acc, [key, value]) => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        acc[key] = value
      }
      return acc
    }, {})
  } catch {
    return {}
  }
}

function readAll(): Balances {
  return safeParse(localStorage.getItem(STORAGE_KEY))
}

function writeAll(items: Balances) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function change(userId: string, diff: number) {
  const balances = readAll()
  const current = balances[userId] ?? 0
  const next = Math.max(0, current + diff)
  const updated = { ...balances, [userId]: next }
  writeAll(updated)
  return next
}

export const balanceRepo = {
  get(userId: string | null | undefined) {
    if (!userId) return 0
    const balances = readAll()
    return balances[userId] ?? 0
  },

  deposit(userId: string | null | undefined, amount: number) {
    if (!userId || !Number.isFinite(amount) || amount <= 0) return 0
    return change(userId, amount)
  },

  withdraw(userId: string | null | undefined, amount: number) {
    if (!userId || !Number.isFinite(amount) || amount <= 0) return false
    const current = this.get(userId)
    if (current < amount) return false
    change(userId, -amount)
    return true
  },

  reset(userId: string | null | undefined) {
    if (!userId) return 0
    const balances = readAll()
    const updated = { ...balances, [userId]: 0 }
    writeAll(updated)
    return 0
  },

  subscribe(callback: () => void) {
    const handler = () => callback()
    window.addEventListener(CHANGE_EVENT, handler)
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) handler()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(CHANGE_EVENT, handler)
      window.removeEventListener('storage', onStorage)
    }
  },
}
