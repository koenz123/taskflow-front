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

export const socialPlatforms: Array<{
  key: SocialPlatform
  label: string
  simpleIconsSlug: string
  normalize: (input: string) => string
}> = [
  {
    key: 'instagram',
    label: 'Instagram',
    simpleIconsSlug: 'instagram',
    normalize: (v) => toProfileUrl(v, 'https://instagram.com/'),
  },
  {
    key: 'tiktok',
    label: 'TikTok',
    simpleIconsSlug: 'tiktok',
    normalize: (v) => {
      const cleaned = cleanHandle(v)
      if (cleaned.startsWith('http')) return cleaned
      if (!cleaned) return ''
      const handle = cleaned.startsWith('@') ? cleaned : `@${cleaned}`
      return `https://www.tiktok.com/${handle}`
    },
  },
  {
    key: 'youtube',
    label: 'YouTube',
    simpleIconsSlug: 'youtube',
    normalize: (v) => {
      const cleaned = cleanHandle(v)
      if (cleaned.startsWith('http')) return cleaned
      if (!cleaned) return ''
      const handle = cleaned.startsWith('@') ? cleaned : `@${cleaned}`
      return `https://www.youtube.com/${handle}`
    },
  },
  {
    key: 'telegram',
    label: 'Telegram',
    simpleIconsSlug: 'telegram',
    normalize: (v) => toProfileUrl(v, 'https://t.me/'),
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    simpleIconsSlug: 'whatsapp',
    normalize: (v) => {
      const cleaned = v.trim()
      if (!cleaned) return ''
      if (cleaned.startsWith('http')) return cleaned
      // For WhatsApp we typically store a wa.me link or a phone number.
      const digits = cleaned.replace(/[^\d+]/g, '')
      if (!digits) return ''
      return `https://wa.me/${digits.replace('+', '')}`
    },
  },
  { key: 'vk', label: 'VK', simpleIconsSlug: 'vk', normalize: (v) => toProfileUrl(v, 'https://vk.com/') },
  { key: 'x', label: 'X', simpleIconsSlug: 'x', normalize: (v) => toProfileUrl(v, 'https://x.com/') },
  {
    key: 'facebook',
    label: 'Facebook',
    simpleIconsSlug: 'facebook',
    normalize: (v) => toProfileUrl(v, 'https://facebook.com/'),
  },
  {
    key: 'linkedin',
    label: 'LinkedIn',
    simpleIconsSlug: 'linkedin',
    normalize: (v) => toProfileUrl(v, 'https://www.linkedin.com/in/'),
  },
  {
    key: 'discord',
    label: 'Discord',
    simpleIconsSlug: 'discord',
    normalize: (v) => v.trim(), // Usually an invite link or username.
  },
  { key: 'twitch', label: 'Twitch', simpleIconsSlug: 'twitch', normalize: (v) => toProfileUrl(v, 'https://twitch.tv/') },
  {
    key: 'snapchat',
    label: 'Snapchat',
    simpleIconsSlug: 'snapchat',
    normalize: (v) => toProfileUrl(v, 'https://www.snapchat.com/add/'),
  },
  {
    key: 'pinterest',
    label: 'Pinterest',
    simpleIconsSlug: 'pinterest',
    normalize: (v) => toProfileUrl(v, 'https://pinterest.com/'),
  },
  { key: 'reddit', label: 'Reddit', simpleIconsSlug: 'reddit', normalize: (v) => toProfileUrl(v, 'https://reddit.com/user/') },
]

function cleanHandle(value: string) {
  return value.trim().replace(/^@/, '')
}

function toProfileUrl(value: string, base: string) {
  const cleaned = value.trim()
  if (!cleaned) return ''
  if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) return cleaned
  return `${base}${cleanHandle(cleaned)}`
}

