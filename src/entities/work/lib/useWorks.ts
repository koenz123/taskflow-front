import { useEffect, useState } from 'react'
import { workRepo } from './workRepo'
import type { Work } from '../model/work'

export function useWorks(userId?: string | null) {
  const [works, setWorks] = useState<Work[]>([])

  useEffect(() => {
    if (!userId) {
      return
    }

    let canceled = false

    const load = async () => {
      try {
        const list = await workRepo.listForUser(userId)
        if (!canceled) setWorks(list)
      } catch {
        if (!canceled) setWorks([])
      }
    }

    load()
    const unsubscribe = workRepo.subscribe(() => {
      load()
    })

    return () => {
      canceled = true
      unsubscribe()
    }
  }, [userId])

  return works
}
