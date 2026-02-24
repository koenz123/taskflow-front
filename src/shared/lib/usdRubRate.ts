const STORAGE_KEY = 'ui-create-works.fx.usdRubRate.v1'

type Cache = {
  rate: number
  updatedAt: number
}

export const USD_RUB_FALLBACK_RATE = 90
export const USD_RUB_MAX_AGE_MS = 6 * 60 * 60 * 1000 // 6 hours

function isValidRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

export function readUsdRubRateCache(): Cache | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as unknown
    if (typeof data !== 'object' || data === null) return null
    const obj = data as Partial<Cache>
    if (!isValidRate(obj.rate) || typeof obj.updatedAt !== 'number') return null
    return { rate: obj.rate, updatedAt: obj.updatedAt }
  } catch {
    return null
  }
}

export function writeUsdRubRateCache(rate: number) {
  if (!isValidRate(rate)) return
  const payload: Cache = { rate, updatedAt: Date.now() }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

export function getUsdRubRateCachedOrFallback() {
  return readUsdRubRateCache()?.rate ?? USD_RUB_FALLBACK_RATE
}

/**
 * Sum in RUB to use for balance/freeze/payout.
 * Balance is stored in RUB: if task is in RUB use amount as-is; if in USD convert to RUB.
 */
export function taskEscrowAmountInRub(
  task: { budgetAmount?: number; budgetCurrency?: string },
  rate?: number
): number {
  const amount = Number(task.budgetAmount)
  if (!Number.isFinite(amount) || amount <= 0) return 0
  const r = typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : getUsdRubRateCachedOrFallback()
  return task.budgetCurrency === 'RUB' ? amount : Math.round(amount * r * 100) / 100
}

/**
 * Contract escrow amount in RUB. Backend now returns escrowCurrency: 'RUB' — then use escrowAmount as-is.
 * If escrowCurrency is USD (legacy), convert to RUB.
 */
export function contractEscrowAmountInRub(
  contract: { escrowAmount?: number; escrowCurrency?: string },
  rate?: number
): number {
  const amount = Number(contract.escrowAmount)
  if (!Number.isFinite(amount) || amount < 0) return 0
  if (contract.escrowCurrency === 'RUB') return amount
  const r = typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : getUsdRubRateCachedOrFallback()
  return contract.escrowCurrency === 'USD' ? Math.round(amount * r * 100) / 100 : amount
}

async function fetchUsdRubRateFromPublicApi() {
  // No API key required.
  // Response example: { rates: { RUB: 90.12, ... }, ... }
  const res = await fetch('https://open.er-api.com/v6/latest/USD')
  if (!res.ok) throw new Error(`FX fetch failed: ${res.status}`)
  const json = (await res.json()) as unknown
  if (typeof json !== 'object' || json === null) throw new Error('FX response invalid')
  const rates = (json as { rates?: Record<string, unknown> }).rates
  const rub = rates?.RUB
  if (!isValidRate(rub)) throw new Error('FX RUB rate missing')
  return rub
}

export async function refreshUsdRubRate(maxAgeMs: number = USD_RUB_MAX_AGE_MS) {
  const cached = readUsdRubRateCache()
  if (cached && Date.now() - cached.updatedAt <= maxAgeMs) return cached.rate

  try {
    const rate = await fetchUsdRubRateFromPublicApi()
    writeUsdRubRateCache(rate)
    return rate
  } catch {
    // Best-effort fallback: keep existing cached rate if any.
    return cached?.rate ?? USD_RUB_FALLBACK_RATE
  }
}

