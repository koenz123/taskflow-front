/** Только 6 платформ: подтверждение через OAuth на стороне платформы */
export type SocialPlatform =
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'telegram'
  | 'whatsapp'
  | 'vk'

function toProfileUrl(value: string, base: string) {
  const cleaned = value.trim()
  if (!cleaned) return ''
  if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) return cleaned
  const handle = cleaned.replace(/^@/, '').trim()
  return handle ? `${base}${handle}` : ''
}

function cleanHandle(value: string) {
  return value.trim().replace(/^@/, '')
}

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
      const digits = cleaned.replace(/[^\d+]/g, '')
      if (!digits) return ''
      return `https://wa.me/${digits.replace('+', '')}`
    },
  },
  { key: 'vk', label: 'VK', simpleIconsSlug: 'vk', normalize: (v) => toProfileUrl(v, 'https://vk.com/') },
]
