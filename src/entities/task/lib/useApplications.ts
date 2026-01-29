import { useSyncExternalStore } from 'react'
import { applicationRepo } from './applicationRepo'

function getSnapshot() {
  return applicationRepo.listAll()
}

export function useApplications() {
  return useSyncExternalStore(applicationRepo.subscribe, getSnapshot, getSnapshot)
}
