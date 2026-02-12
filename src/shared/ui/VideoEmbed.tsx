import { useCallback, useState, type CSSProperties, type MutableRefObject, type Ref } from 'react'
import { useI18n } from '@/shared/i18n/I18nContext'

type Props = {
  src: string
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

export function VideoEmbed({ src, videoRef, className, style, controls = true, onPlay, onPause, onEnded }: Props) {
  const { t } = useI18n()
  const [failed, setFailed] = useState(false)

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
        <a href={src} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#63b3ff' }}>
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
      src={src}
      onError={() => setFailed(true)}
      onPlay={() => onPlay?.()}
      onPause={() => onPause?.()}
      onEnded={() => onEnded?.()}
      className={className}
      style={{ width: '100%', borderRadius: 10, marginTop: 6, maxHeight: 240, objectFit: 'cover', ...style }}
    />
  )
}

