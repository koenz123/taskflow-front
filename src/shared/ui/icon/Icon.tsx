import type { ReactNode } from 'react'
import './icon.css'

export type IconName =
  | 'bell'
  | 'moon'
  | 'sun'
  | 'calendar'
  | 'phone'
  | 'film'
  | 'clipboard'
  | 'plus'
  | 'note'
  | 'user'
  | 'users'
  | 'palette'
  | 'gavel'
  | 'chat'
  | 'star'
  | 'check'
  | 'ban'
  | 'x'
  | 'upload'
  | 'repeat'
  | 'party'
  | 'pencil'
  | 'pause'
  | 'playPause'
  | 'finish'
  | 'hourglass'
  | 'timer'
  | 'clock'
  | 'warning'
  | 'chartDown'
  | 'refresh'

export type IconProps = {
  name: IconName
  size?: number
  className?: string
  title?: string
}

function Svg(props: {
  size: number
  title?: string
  className?: string
  children: ReactNode
  viewBox?: string
}) {
  const { size, title, className, children, viewBox } = props
  const ariaHidden = !title
  return (
    <svg
      className={['icon', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox={viewBox ?? '0 0 24 24'}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={ariaHidden ? 'presentation' : 'img'}
      aria-hidden={ariaHidden}
      aria-label={title}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  )
}

export function Icon(props: IconProps) {
  const size = typeof props.size === 'number' && Number.isFinite(props.size) ? props.size : 18
  const common = { size, title: props.title, className: props.className }

  switch (props.name) {
    case 'bell':
      return (
        <Svg {...common}>
          <path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </Svg>
      )
    case 'moon':
      return (
        <Svg {...common}>
          <path d="M21 13.2A8.5 8.5 0 1110.8 3a7 7 0 1010.2 10.2z" />
        </Svg>
      )
    case 'sun':
      return (
        <Svg {...common}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="M4.93 4.93l1.41 1.41" />
          <path d="M17.66 17.66l1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="M4.93 19.07l1.41-1.41" />
          <path d="M17.66 6.34l1.41-1.41" />
        </Svg>
      )
    case 'calendar':
      return (
        <Svg {...common}>
          <path d="M7 3v3" />
          <path d="M17 3v3" />
          <path d="M4 7h16" />
          <path d="M6 5h12a2 2 0 012 2v13a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2z" />
        </Svg>
      )
    case 'phone':
      return (
        <Svg {...common}>
          <rect x="8" y="2.5" width="8" height="19" rx="2" />
          <path d="M11 18.5h2" />
        </Svg>
      )
    case 'film':
      return (
        <Svg {...common}>
          <rect x="3" y="6" width="18" height="14" rx="2" />
          <path d="M7 6v14" />
          <path d="M17 6v14" />
          <path d="M3 10h18" />
          <path d="M3 16h18" />
        </Svg>
      )
    case 'clipboard':
      return (
        <Svg {...common}>
          <rect x="7" y="4" width="10" height="16" rx="2" />
          <path d="M9 4V3.5A1.5 1.5 0 0110.5 2h3A1.5 1.5 0 0115 3.5V4" />
          <path d="M9.5 9h5" />
          <path d="M9.5 13h5" />
        </Svg>
      )
    case 'plus':
      return (
        <Svg {...common}>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </Svg>
      )
    case 'note':
      return (
        <Svg {...common}>
          <path d="M7 3h10a2 2 0 012 2v14l-3-2-3 2-3-2-3 2V5a2 2 0 012-2z" />
          <path d="M9 7h6" />
          <path d="M9 11h6" />
        </Svg>
      )
    case 'user':
      return (
        <Svg {...common}>
          <path d="M20 21a8 8 0 10-16 0" />
          <circle cx="12" cy="8" r="4" />
        </Svg>
      )
    case 'users':
      return (
        <Svg {...common}>
          <path d="M17 21a6 6 0 00-12 0" />
          <path d="M20 21a5 5 0 00-6-4.8" />
          <path d="M4 21a5 5 0 016-4.8" />
          <circle cx="12" cy="8" r="3.5" />
          <path d="M18 8.5a2.5 2.5 0 10-5 0" />
          <path d="M6 8.5a2.5 2.5 0 115 0" />
        </Svg>
      )
    case 'palette':
      return (
        <Svg {...common}>
          <path d="M12 3a9 9 0 109 9c0 2-1.5 3-3 3h-1a2 2 0 00-2 2c0 1.1-.9 2-2 2a9 9 0 01-1-18z" />
          <path d="M7.5 10.5h.01" />
          <path d="M9.5 7.5h.01" />
          <path d="M14.5 7.5h.01" />
          <path d="M16.5 10.5h.01" />
        </Svg>
      )
    case 'gavel':
      return (
        <Svg {...common}>
          <path d="M14 12l-4-4" />
          <path d="M13 7l4 4" />
          <path d="M2 22l9-9" />
          <path d="M7 17l5 5" />
          <path d="M16.5 3.5l4 4" />
        </Svg>
      )
    case 'chat':
      return (
        <Svg {...common}>
          <path d="M21 15a4 4 0 01-4 4H8l-5 3V7a4 4 0 014-4h10a4 4 0 014 4z" />
          <path d="M8 9h8" />
          <path d="M8 13h6" />
        </Svg>
      )
    case 'star':
      return (
        <Svg {...common}>
          <path d="M12 2l3 7 7 .6-5.4 4.6 1.7 7.2L12 18l-6.3 3.4 1.7-7.2L2 9.6 9 9l3-7z" />
        </Svg>
      )
    case 'check':
      return (
        <Svg {...common}>
          <path d="M20 6L9 17l-5-5" />
        </Svg>
      )
    case 'ban':
      return (
        <Svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M7 7l10 10" />
        </Svg>
      )
    case 'x':
      return (
        <Svg {...common}>
          <path d="M18 6L6 18" />
          <path d="M6 6l12 12" />
        </Svg>
      )
    case 'upload':
      return (
        <Svg {...common}>
          <path d="M12 16V4" />
          <path d="M7 9l5-5 5 5" />
          <path d="M4 20h16" />
        </Svg>
      )
    case 'repeat':
      return (
        <Svg {...common}>
          <path d="M17 1l4 4-4 4" />
          <path d="M3 11V9a4 4 0 014-4h14" />
          <path d="M7 23l-4-4 4-4" />
          <path d="M21 13v2a4 4 0 01-4 4H3" />
        </Svg>
      )
    case 'party':
      return (
        <Svg {...common}>
          <path d="M4 20l4-4" />
          <path d="M8 16l4 4" />
          <path d="M12 20l8-8" />
          <path d="M14 6l4 4" />
          <path d="M16 4l4 4" />
          <path d="M6 10l2 2" />
          <path d="M4 12l2 2" />
        </Svg>
      )
    case 'pencil':
      return (
        <Svg {...common}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
        </Svg>
      )
    case 'pause':
      return (
        <Svg {...common}>
          <path d="M8 6v12" />
          <path d="M16 6v12" />
        </Svg>
      )
    case 'playPause':
      return (
        <Svg {...common}>
          <path d="M7 6v12" />
          <path d="M17 6v12" />
          <path d="M11 6l6 6-6 6z" />
        </Svg>
      )
    case 'finish':
      return (
        <Svg {...common}>
          <path d="M6 3v18" />
          <path d="M6 3l14 5-14 5" />
        </Svg>
      )
    case 'hourglass':
      return (
        <Svg {...common}>
          <path d="M6 2h12" />
          <path d="M6 22h12" />
          <path d="M8 2v6a4 4 0 004 4 4 4 0 004-4V2" />
          <path d="M16 22v-6a4 4 0 00-4-4 4 4 0 00-4 4v6" />
        </Svg>
      )
    case 'timer':
      return (
        <Svg {...common}>
          <path d="M10 2h4" />
          <path d="M12 14l3-3" />
          <circle cx="12" cy="14" r="8" />
        </Svg>
      )
    case 'clock':
      return (
        <Svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v6l4 2" />
        </Svg>
      )
    case 'warning':
      return (
        <Svg {...common}>
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.3 4.3a2 2 0 013.4 0l8 14A2 2 0 0120 21H4a2 2 0 01-1.7-2.7z" />
        </Svg>
      )
    case 'chartDown':
      return (
        <Svg {...common}>
          <path d="M3 3v18h18" />
          <path d="M7 9l4 4 3-3 5 5" />
          <path d="M19 15v4h-4" />
        </Svg>
      )
    case 'refresh':
      return (
        <Svg {...common}>
          <path d="M21 12a9 9 0 10-3 6.7" />
          <path d="M21 3v6h-6" />
        </Svg>
      )
    default:
      return null
  }
}

