import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import './help-tip.css'

type Props = {
  open: boolean
  onToggle: () => void
  onClose: () => void
  content: string
  ariaLabel?: string
  title?: string
  triggerLabel?: React.ReactNode
  footer?: React.ReactNode
}

function inferTitleFromAriaLabel(ariaLabel?: string): string | null {
  const raw = (ariaLabel ?? '').trim()
  if (!raw) return null
  // Common patterns: "Подсказка: X", "Help: X"
  const idx = raw.indexOf(':')
  if (idx === -1) return null
  const after = raw.slice(idx + 1).trim()
  return after || null
}

function titleCaseFirst(value: string): string {
  const s = value.trim()
  if (!s) return ''
  return s[0]!.toLocaleUpperCase() + s.slice(1)
}

function stopLabelActivation(e: React.SyntheticEvent) {
  // Many HelpTips are rendered inside <label>. Prevent label activation/focus.
  e.preventDefault()
  e.stopPropagation()
}

function isToggleKey(e: React.KeyboardEvent) {
  return e.key === 'Enter' || e.key === ' '
}

export function HelpTip({ open, onToggle, onClose, content, ariaLabel, title, triggerLabel, footer }: Props) {
  const inferredTitle = title?.trim() || inferTitleFromAriaLabel(ariaLabel) || null
  const headerTitle = titleCaseFirst(inferredTitle ?? (ariaLabel ?? ''))

  useEffect(() => {
    if (!open) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  return (
    <span className={`helpTip${triggerLabel ? ' helpTip--withLabel' : ''}`}>
      {triggerLabel ? (
        <span
          className="helpTip__labelBtn"
          role="button"
          tabIndex={0}
          onPointerDown={stopLabelActivation}
          onClick={(e) => {
            stopLabelActivation(e)
            onToggle()
          }}
          onKeyDown={(e) => {
            if (!isToggleKey(e)) return
            stopLabelActivation(e)
            onToggle()
          }}
        >
          {triggerLabel}
        </span>
      ) : null}
      <span
        className={`helpTip__btn${open ? ' helpTip__btn--active' : ''}`}
        aria-label={ariaLabel ?? 'Help'}
        aria-haspopup="dialog"
        aria-expanded={open}
        role="button"
        tabIndex={0}
        onPointerDown={stopLabelActivation}
        onClick={(e) => {
          stopLabelActivation(e)
          onToggle()
        }}
        onKeyDown={(e) => {
          if (!isToggleKey(e)) return
          stopLabelActivation(e)
          onToggle()
        }}
      >
        ?
      </span>
      {open
        ? createPortal(
            <div
              className="helpTipOverlay"
              role="dialog"
              aria-modal="true"
              aria-label={ariaLabel ?? 'Help'}
              onPointerDown={() => onClose()}
            >
              <div className="helpTipModal" onPointerDown={(e) => e.stopPropagation()}>
                <div className="helpTipModal__header">
                  <div className="helpTipModal__title">{headerTitle}</div>
                  <button
                    type="button"
                    className="helpTipModal__close"
                    aria-label="Закрыть"
                    onClick={() => onClose()}
                  >
                    ×
                  </button>
                </div>
                <div className="helpTipModal__content">{content}</div>
                {footer ? <div className="helpTipModal__footer">{footer}</div> : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </span>
  )
}

