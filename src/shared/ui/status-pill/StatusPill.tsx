import './status-pill.css'

export type StatusTone =
  | 'draft'
  | 'open'
  | 'in_progress'
  | 'review'
  | 'dispute'
  | 'closed'
  | 'archived'
  | 'paused'
  | 'overdue'
  | 'pending'
  | 'neutral'

export function StatusPill(props: { tone: StatusTone; label: string; className?: string }) {
  const toneClass = props.tone ? `statusPill--${props.tone}` : 'statusPill--neutral'
  return <span className={`statusPill ${toneClass}${props.className ? ` ${props.className}` : ''}`}>{props.label}</span>
}

