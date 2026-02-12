const STORAGE_KEY = 'ui-create-works.balanceFreezes.v1'

type FreezeEntry = {
  taskId: string
  customerId: string
  executorId: string
  amount: number
  createdAt: string
}

function safeParse(json: string | null): FreezeEntry[] {
  if (!json) return []
  try {
    const data = JSON.parse(json) as unknown
    if (!Array.isArray(data)) return []
    return data
  } catch {
    return []
  }
}

function readAll(): FreezeEntry[] {
  return safeParse(localStorage.getItem(STORAGE_KEY))
}

function writeAll(entries: FreezeEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  window.dispatchEvent(new Event('ui-create-works.balanceFreezes.change'))
}

export const balanceFreezeRepo = {
  list() {
    return readAll()
  },

  listForTask(taskId: string) {
    return readAll().filter((e) => e.taskId === taskId)
  },

  listForCustomer(customerId: string | null | undefined) {
    if (!customerId) return []
    return readAll().filter((e) => e.customerId === customerId)
  },

  listForExecutor(executorId: string | null | undefined) {
    if (!executorId) return []
    return readAll().filter((e) => e.executorId === executorId)
  },

  totalFrozen(customerId: string | null | undefined) {
    if (!customerId) return 0
    return readAll().reduce((sum, entry) => {
      if (entry.customerId === customerId) return sum + entry.amount
      return sum
    }, 0)
  },

  freeze(customerId: string, taskId: string, executorId: string, amount: number) {
    if (!customerId || !taskId || !executorId || !(amount > 0)) return false
    const all = readAll()
    if (all.some((entry) => entry.taskId === taskId && entry.executorId === executorId)) return true
    all.push({
      taskId,
      customerId,
      executorId,
      amount,
      createdAt: new Date().toISOString(),
    })
    writeAll(all)
    return true
  },

  release(taskId: string, executorId: string) {
    const all = readAll()
    const idx = all.findIndex((entry) => entry.taskId === taskId && entry.executorId === executorId)
    if (idx === -1) return 0
    const [removed] = all.splice(idx, 1)
    writeAll(all)
    return removed.amount
  },

  /**
   * Like `release`, but returns the full entry for more context.
   * Useful for contract-level escrow resolution.
   */
  releaseEntry(taskId: string, executorId: string) {
    const all = readAll()
    const idx = all.findIndex((entry) => entry.taskId === taskId && entry.executorId === executorId)
    if (idx === -1) return null
    const [removed] = all.splice(idx, 1)
    writeAll(all)
    return removed
  },

  /**
   * Claim escrow only for a specific executor on a task (contract-level).
   * This removes the freeze entry and returns it; caller should pay out.
   */
  claimFor(taskId: string, executorId: string) {
    return this.releaseEntry(taskId, executorId)
  },

  claim(taskId: string) {
    const all = readAll()
    const claimed = all.filter((entry) => entry.taskId === taskId)
    if (!claimed.length) return []
    const remaining = all.filter((entry) => entry.taskId !== taskId)
    writeAll(remaining)
    return claimed
  },

  subscribe(callback: () => void) {
    const handler = () => callback()
    window.addEventListener('ui-create-works.balanceFreezes.change', handler)
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) handler()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('ui-create-works.balanceFreezes.change', handler)
      window.removeEventListener('storage', onStorage)
    }
  },
}
