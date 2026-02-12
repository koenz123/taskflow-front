export type WorkMediaType = 'video' | 'photo'

export type Work = {
  id: string
  ownerId: string
  title: string
  description?: string
  mediaUrl?: string
  mediaType?: WorkMediaType
  mediaFileName?: string
  mediaStorageName?: string | null
  videoUrl?: string
  videoFileName?: string
  videoStorageName?: string | null
  createdAt: string
}
