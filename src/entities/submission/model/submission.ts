export type SubmissionFile =
  | {
      kind: 'external_url'
      url: string
      title?: string
      mediaType?: 'video' | 'image' | 'file'
    }
  | {
      kind: 'upload'
      url: string
      workId?: string
      title?: string
      mediaType?: 'video' | 'image' | 'file'
    }

export type SubmissionStatus = 'submitted' | 'superseded'

export type Submission = {
  id: string
  contractId: string
  message?: string
  files: SubmissionFile[]
  status: SubmissionStatus
  createdAt: string // ISO datetime
}

