export type DisputeMessage = {
  id: string
  disputeId: string
  authorUserId: string
  kind: 'public' | 'system' | 'internal'
  text: string
  attachments?: Array<
    | { kind: 'link'; url: string; title?: string }
    | { kind: 'timestamp'; seconds: number; note?: string }
    | { kind: 'fileRef'; name: string; url?: string }
  >
  createdAt: string // ISO datetime
}

