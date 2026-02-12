import { workRepo } from './workRepo'

const LEGACY_STORAGE_KEY = 'ui-create-works.works.v1'

type LegacyWork = {
  id: string
  ownerId: string
  title: string
  description: string
  videoUrl?: string
  videoFileName?: string
  videoFileDataUrl?: string
  createdAt: string
}

type MigrationResult = { migrated: boolean }

export async function migrateLocalWorks(ownerId: string): Promise<MigrationResult> {
  if (typeof window === 'undefined') return { migrated: false }
  const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY)
  if (!raw) return { migrated: false }

  let parsed: LegacyWork[]
  try {
    parsed = JSON.parse(raw) as LegacyWork[]
    if (!Array.isArray(parsed)) throw new Error('invalid')
  } catch {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY)
    return { migrated: false }
  }

  const otherWorks = parsed.filter((work) => work.ownerId !== ownerId)
  const myWorks = parsed.filter((work) => work.ownerId === ownerId)
  if (!myWorks.length) {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(otherWorks))
    return { migrated: false }
  }

  const migrated: LegacyWork[] = []
  for (const work of myWorks) {
    if (!work.title?.trim() || !work.ownerId) continue
    let file: File | null = null
    if (work.videoFileDataUrl) {
      try {
        file = await decodeDataUrl(work.videoFileDataUrl, work.videoFileName)
      } catch {
        continue
      }
    }
    if (!file && !work.videoUrl?.trim()) continue

    try {
      await workRepo.create({
        ownerId,
        title: work.title,
        description: work.description ?? '',
        mediaUrl: file ? undefined : work.videoUrl,
        mediaType: file ? (file.type.startsWith('image/') ? 'photo' : 'video') : 'video',
        file,
      })
      migrated.push(work)
    } catch {
      continue
    }
  }

  window.localStorage.setItem(
    LEGACY_STORAGE_KEY,
    JSON.stringify([...otherWorks, ...myWorks.filter((work) => !migrated.includes(work))]),
  )
  return { migrated: migrated.length > 0 }
}

async function decodeDataUrl(dataUrl: string, fileName?: string): Promise<File> {
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  const extension = fileName ? fileName.split('.').pop() : ''
  const safeName = fileName ?? `work-${Date.now()}${extension ? `.${extension}` : ''}`
  return new File([blob], safeName, { type: blob.type || 'video/mp4' })
}
