export type UserRole = 'customer' | 'executor'

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
  company?: string
  socials?: Partial<Record<SocialPlatform, string>>
  avatarDataUrl?: string

  passwordHash: string
  createdAt: string
  updatedAt: string
}

