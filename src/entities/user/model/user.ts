export type UserRole = 'customer' | 'executor' | 'arbiter' | 'pending'

export type SocialPlatform =
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'telegram'
  | 'whatsapp'
  | 'vk'
  | 'x'
  | 'facebook'
  | 'linkedin'
  | 'discord'
  | 'twitch'
  | 'snapchat'
  | 'pinterest'
  | 'reddit'

export type User = {
  id: string
  role: UserRole

  fullName: string
  phone: string
  email: string
  emailVerified?: boolean
  telegramUserId?: string | null
  company?: string
  socials?: Partial<Record<SocialPlatform, string>>
  avatarDataUrl?: string

  personalId: string

  passwordHash: string
  createdAt: string
  updatedAt: string
}

