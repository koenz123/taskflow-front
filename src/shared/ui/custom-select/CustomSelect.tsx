import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import './custom-select.css'
import { Icon } from '@/shared/ui/icon/Icon'

interface CustomSelectProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: Array<{ value: T; label: string }>
  label: React.ReactNode
  disabled?: boolean
}

const HIDDEN_PANEL_STYLE: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: 0,
  maxHeight: 0,
  visibility: 'hidden',
}

export function CustomSelect<T extends string>({ value, onChange, options, label, disabled }: CustomSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const dropdownRef = useRef<HTMLUListElement | null>(null)
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>(() => HIDDEN_PANEL_STYLE)

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  useLayoutEffect(() => {
    if (!isOpen) return

    const syncPanel = () => {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return
      const top = Math.round(rect.bottom + 8)
      const maxLabelLen = options.reduce((m, o) => Math.max(m, o.label.length), 0)
      // Rough estimate: ~7.5px per character + padding/checkmark.
      const estimated = Math.round(maxLabelLen * 7.5 + 64)
      const width = Math.max(Math.round(rect.width), Math.min(360, Math.max(180, estimated)))
      const viewportPadding = 8
      const clampedLeft = Math.min(
        Math.max(rect.left, viewportPadding),
        Math.max(viewportPadding, window.innerWidth - width - viewportPadding),
      )
      const left = Math.round(clampedLeft)
      const maxHeight = Math.max(80, Math.min(320, Math.round(window.innerHeight - rect.bottom - 16)))
      setPanelStyle({ position: 'fixed', top, left, width, maxHeight, visibility: 'visible' })
    }

    // Avoid rendering a "static" panel for a frame.
    setPanelStyle(HIDDEN_PANEL_STYLE)
    syncPanel()

    window.addEventListener('resize', syncPanel)
    // Keep the panel attached to the button during page scroll.
    window.addEventListener('scroll', syncPanel, { passive: true, capture: true })
    return () => {
      window.removeEventListener('resize', syncPanel)
      // Remove capture listener reliably.
      window.removeEventListener('scroll', syncPanel, true)
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen) return
    // Reset between opens to prevent a "static" dropdown frame.
    setPanelStyle(HIDDEN_PANEL_STYLE)
  }, [isOpen])

  useEffect(() => {
    if (disabled) setIsOpen(false)
  }, [disabled])

  useEffect(() => {
    if (!isOpen) return
    const el = dropdownRef.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      // If the dropdown can scroll in this direction, keep scroll inside it.
      const canScroll = el.scrollHeight > el.clientHeight
      if (!canScroll) return

      const delta = e.deltaY
      const atTop = el.scrollTop <= 0
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1
      const scrollingUp = delta < 0
      const scrollingDown = delta > 0

      if ((scrollingUp && !atTop) || (scrollingDown && !atBottom)) {
        // Let browser perform the default scroll on dropdown,
        // but prevent parent containers from hijacking the wheel.
        e.stopPropagation()
      }
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel as EventListener)
  }, [isOpen])

  const selectedOption = options.find((opt) => opt.value === value)

  return (
    <div className="customSelectContainer" ref={containerRef}>
      <label className="customSelectLabel">{label}</label>
      <button
        type="button"
        className={`customSelectButton${isOpen ? ' customSelectButton--open' : ''}`}
        onClick={() => {
          if (disabled) return
          setIsOpen((prev) => !prev)
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        ref={buttonRef}
        disabled={disabled}
      >
        <span className="customSelectValue">{selectedOption?.label || value}</span>
        <span className="customSelectArrow" aria-hidden="true">
          ▾
        </span>
      </button>

      {isOpen ? (
        <ul
          className="customSelectDropdown"
          role="listbox"
          ref={dropdownRef}
          style={panelStyle}
        >
          {options.map((option) => (
            <li key={option.value} role="option" aria-selected={option.value === value}>
              <button
                type="button"
                className={`customSelectOption${option.value === value ? ' customSelectOption--selected' : ''}`}
                onClick={() => {
                  onChange(option.value)
                  setIsOpen(false)
                }}
              >
                <span className="customSelectOptionLabel">{option.label}</span>
                {option.value === value ? (
                  <span className="customSelectCheck" aria-hidden="true">
                    <Icon name="check" size={16} />
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
