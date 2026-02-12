import { useSyncExternalStore } from 'react'
import { balanceRepo } from './balanceRepo'

export function useCustomerBalance(userId: string | null | undefined) {
  return useSyncExternalStore(
    balanceRepo.subscribe,
    () => balanceRepo.get(userId),
    () => balanceRepo.get(userId),
  )
}
