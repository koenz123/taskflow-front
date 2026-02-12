import { useMemo, useState } from 'react'
import { socialPlatforms } from './socialPlatforms'

export type SocialMap = Partial<Record<(typeof socialPlatforms)[number]['key'], string>>

export function SocialLinks({ socials }: { socials?: SocialMap }) {
  if (!socials) return null

  const items = useMemo(() => {
    return socialPlatforms
      .map((p) => ({ ...p, url: socials[p.key]?.trim() || '' }))
      .filter((x) => x.url)
  }, [socials])

  const [brokenKeys, setBrokenKeys] = useState<Record<string, true>>({})

  if (items.length === 0) return null

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {items.map((x) => (
        <a
          key={x.key}
          href={x.url}
          target="_blank"
          rel="noreferrer"
          title={x.label}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.14)',
            background: 'rgba(255,255,255,0.06)',
            display: 'grid',
            placeItems: 'center',
            textDecoration: 'none',
          }}
        >
          {brokenKeys[x.key] ? (
            <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>
              {x.label.slice(0, 1).toUpperCase()}
            </span>
          ) : (
            <img
              src={`https://cdn.simpleicons.org/${x.simpleIconsSlug}/ffffff`}
              alt={x.label}
              width={18}
              height={18}
              loading="lazy"
              referrerPolicy="no-referrer"
              style={{ display: 'block' }}
              onError={() => setBrokenKeys((prev) => ({ ...prev, [x.key]: true }))}
            />
          )}
        </a>
      ))}
    </div>
  )
}

