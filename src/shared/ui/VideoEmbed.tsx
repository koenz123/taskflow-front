import { useCallback, useState, type CSSProperties, type MutableRefObject, type Ref } from 'react'
import { useI18n } from '@/shared/i18n/I18nContext'

type Props = {
  src: string
  sources?: string[]
  videoRef?: Ref<HTMLVideoElement>
  className?: string
  style?: CSSProperties
  controls?: boolean
  onPlay?: () => void
  onPause?: () => void
  onEnded?: () => void
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return
  if (typeof ref === 'function') ref(value)
  else (ref as MutableRefObject<T | null>).current = value
}

function isAbsoluteUrl(input: string) {
  return input.startsWith('http://') || input.startsWith('https://') || input.startsWith('data:') || input.startsWith('blob:')
}

function joinUrl(base: string, path: string) {
  if (isAbsoluteUrl(path)) return path
  const b = base.endsWith('/') ? base.slice(0, -1) : base
  const p = path.startsWith('/') ? path : `/${path}`
  return `${b}${p}`
}

function uniq(list: string[]) {
  const out: string[] = []
  const seen = new Set<string>()
  for (const v of list) {
    const s = v.trim()
    if (!s) continue
    if (seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out
}

function buildSources(src: string, sources?: string[]) {
  const s = src.trim()
  if (!s) return []
  if (sources?.length) return uniq(sources)
  if (isAbsoluteUrl(s)) return [s]
  const normalized = s.startsWith('/') ? s : `/${s}`
  const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'
  const withApi = normalized.startsWith(`${API_BASE}/`) ? normalized : joinUrl(API_BASE, normalized)
  return uniq([normalized, withApi])
}

export function VideoEmbed({
  src,
  sources: sourcesProp,
  videoRef,
  className,
  style,
  controls = true,
  onPlay,
  onPause,
  onEnded,
}: Props) {
  const { t } = useI18n()
  const [failed, setFailed] = useState(false)
  const sources = buildSources(src, sourcesProp)

  const setRef = useCallback(
    (el: HTMLVideoElement | null) => {
      assignRef(videoRef, el)
    },
    [videoRef],
  )

  if (failed) {
    return (
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ fontSize: 12, opacity: 0.85, color: '#ff9b9b' }}>{t('video.unsupported')}</div>
        <a href={sources[0] ?? src} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent)' }}>
          {t('profile.videoLink')}
        </a>
      </div>
    )
  }

  return (
    <video
      ref={setRef}
      controls={controls}
      playsInline
      preload="metadata"
      src={sources[0] ?? src}
      onError={() => setFailed(true)}
      onPlay={() => onPlay?.()}
      onPause={() => onPause?.()}
      onEnded={() => onEnded?.()}
      className={className}
      style={{ width: '100%', borderRadius: 10, marginTop: 6, maxHeight: 240, objectFit: 'cover', ...style }}
    >
      {sources.length > 1 ? sources.map((s) => <source key={s} src={s} />) : null}
    </video>
  )
}

