import { useMemo } from 'react'
import { useAuth } from '@/shared/auth/AuthContext'
import { executorIdAliases } from '@/shared/auth/userIdAliases'
import { useContracts } from '@/entities/contract/lib/useContracts'
import { useDisputes } from './useDisputes'

/**
 * Returns the set of dispute IDs that the current user can see (as participant).
 * Used to filter dispute notification counts and feed so deleted/inaccessible disputes don't inflate the counter.
 */
export function useVisibleDisputeIds(): Set<string> {
  const user = useAuth().user
  const disputes = useDisputes()
  const contracts = useContracts()

  return useMemo(() => {
    if (!user) return new Set<string>()
    if (user.role !== 'customer' && user.role !== 'executor') return new Set(disputes.map((d) => d.id))
    const contractById = new Map(contracts.map((c) => [c.id, c]))
    const executorIdSet = user.role === 'executor' ? new Set(executorIdAliases(user)) : new Set<string>()
    const visible = disputes.filter((d) => {
      const c = contractById.get(d.contractId) ?? null
      if (!c) return false
      return user.role === 'customer' ? c.clientId === user.id : executorIdSet.has(String(c.executorId))
    })
    return new Set(visible.map((d) => d.id))
  }, [user, disputes, contracts])
}
