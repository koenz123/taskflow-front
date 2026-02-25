export type SupportThreadStatus = 'open' | 'closed'

export type SupportThread = {
  id: string
  userId: string
  /** Display name for arbiter (e.g. from API: user.fullName). Prefer over showing userId. */
  userFullName?: string
  status?: SupportThreadStatus
  closedAt?: string
  closedByUserId?: string
  rating?: number
  ratingComment?: string
  ratedAt?: string
  createdAt: string
  updatedAt: string
}

export type SupportMessage = {
  id: string
  threadId: string
  fromUserId: string
  text: string
  attachmentUrls?: string[]
  createdAt: string
}
