import { useSyncExternalStore } from 'react'
import type { Rating } from '../model/rating'
import { ratingRepo } from './ratingRepo'

const STORAGE_KEY = 'ui-create-works.ratings.v1'

type Cache = {
  raw: string | null
  list: Rating[]
}

let cache: Cache = { raw: null, list: [] }

function getSnapshot() {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (cache.raw === raw) return cache.list
  const list = ratingRepo.listAll()
  cache = { raw, list }
  return list
}

export function useRatings() {
  return useSyncExternalStore(ratingRepo.subscribe, getSnapshot, getSnapshot)
}

