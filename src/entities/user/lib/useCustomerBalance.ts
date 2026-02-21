import { useSyncExternalStore } from 'react'
import { balanceRepo } from './balanceRepo'
import { serverBalanceRepo } from './serverBalanceRepo'

const USE_API = import.meta.env.VITE_DATA_SOURCE === 'api'

export function useCustomerBalance(userId: string | null | undefined) {
  if (USE_API) {
    return useSyncExternalStore(serverBalanceRepo.subscribe, () => serverBalanceRepo.get(), () => 0)
  }
  return useSyncExternalStore(
    balanceRepo.subscribe,
    () => balanceRepo.get(userId),
    () => balanceRepo.get(userId),
  )
}
