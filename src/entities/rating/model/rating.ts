export type Rating = {
  id: string
  contractId: string
  fromUserId: string
  toUserId: string
  rating: number // 1..5
  comment?: string
  createdAt: string // ISO datetime
}

