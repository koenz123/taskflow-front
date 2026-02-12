import { useSyncExternalStore } from 'react'
import type { RatingAdjustment } from '../model/ratingAdjustment'
import { ratingAdjustmentRepo } from './ratingAdjustmentRepo'

const STORAGE_KEY = 'ui-create-works.ratingAdjustments.v1'

type Cache = {
  raw: string | null
  list: RatingAdjustment[]
}

let cache: Cache = { raw: null, list: [] }

function getSnapshot() {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (cache.raw === raw) return cache.list
  const list = ratingAdjustmentRepo.listAll()
  cache = { raw, list }
  return list
}

export function useRatingAdjustments() {
  return useSyncExternalStore(ratingAdjustmentRepo.subscribe, getSnapshot, getSnapshot)
}

