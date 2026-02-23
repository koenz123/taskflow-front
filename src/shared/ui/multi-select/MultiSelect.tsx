import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import './multi-select.css'
import { Icon } from '@/shared/ui/icon/Icon'

export type MultiSelectOption = { value: string; label: string }

type Props = {
  label: React.ReactNode
  ariaLabel?: string
  placeholder: string
  value: string[]
  options: MultiSelectOption[]
  allowCustom?: boolean
  customPlaceholder?: string
  onChange: (next: string[]) => void
}

function normalizeValue(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

export function MultiSelect({
  label,
  ariaLabel,
  placeholder,
  value,
  options,
  allowCustom,
  customPlaceholder,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [customValue, setCustomValue] = useState('')
  const ref = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties | undefined>(undefined)

  const selected = useMemo(() => new Set(value.map(normalizeValue).filter(Boolean)), [value])
  const normalizedOptions = useMemo(() => {
    const map = new Map<string, MultiSelectOption>()
    for (const opt of options) {
      const v = normalizeValue(opt.value)
      if (!v) continue
      if (!map.has(v)) map.set(v, { value: v, label: opt.label })
    }
    return Array.from(map.values())
  }, [options])

  const mergedOptions = useMemo(() => {
    const map = new Map<string, MultiSelectOption>()
    for (const opt of normalizedOptions) map.set(opt.value, opt)
    for (const v of selected) {
      if (!map.has(v)) map.set(v, { value: v, label: v })
    }
    const list = Array.from(map.values())
    if (!query.trim()) return list
    const q = query.trim().toLowerCase()
    return list.filter((opt) => opt.label.toLowerCase().includes(q) || opt.value.toLowerCase().includes(q))
  }, [normalizedOptions, selected, query])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const el = ref.current
      if (!el) return
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open) return

    const syncPanel = () => {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return
      const top = Math.round(rect.bottom + 8)
      const left = Math.round(rect.left)
      const width = Math.round(rect.width)
      const maxHeight = Math.max(80, Math.min(320, Math.round(window.innerHeight - rect.bottom - 16)))
      setPanelStyle({ position: 'fixed', top, left, width, maxHeight, visibility: 'visible' })
    }

    // Ensure we don't render a "static" panel for a frame.
    setPanelStyle({ position: 'fixed', top: 0, left: 0, width: 0, maxHeight: 0, visibility: 'hidden' })
    syncPanel()

    window.addEventListener('resize', syncPanel)
    // Keep the panel attached to the button during page scroll.
    window.addEventListener('scroll', syncPanel, { passive: true, capture: true })
    return () => {
      window.removeEventListener('resize', syncPanel)
      window.removeEventListener('scroll', syncPanel, { capture: true } as unknown as AddEventListenerOptions)
    }
  }, [open])

  const selectedLabels = useMemo(() => {
    const map = new Map(normalizedOptions.map((opt) => [opt.value, opt.label]))
    return value
      .map(normalizeValue)
      .filter(Boolean)
      .map((v) => map.get(v) ?? v)
  }, [value, normalizedOptions])

  const toggle = (v: string) => {
    const nv = normalizeValue(v)
    if (!nv) return
    const next = new Set(selected)
    if (next.has(nv)) next.delete(nv)
    else next.add(nv)
    onChange(Array.from(next))
  }

  const addCustom = () => {
    const nv = normalizeValue(customValue)
    if (!nv) return
    const next = new Set(selected)
    next.add(nv)
    onChange(Array.from(next))
    setCustomValue('')
    setQuery('')
  }

  return (
    <div className="multiSelect" ref={ref}>
      <div className="multiSelect__label">{label}</div>
      <button
        type="button"
        className={`multiSelect__button${open ? ' multiSelect__button--open' : ''}`}
        onMouseDown={(e) => {
          // Prevent browser from scrolling the page when the button receives focus near viewport edges.
          // (Causes a small "jump" in some cases.)
          e.preventDefault()
        }}
        ref={buttonRef}
        onClick={() => {
          setOpen((v) => !v)
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`multiSelect__value${selectedLabels.length ? '' : ' multiSelect__value--placeholder'}`}>
          {selectedLabels.length ? selectedLabels.join(', ') : placeholder}
        </span>
        <span className="multiSelect__chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <div
          className="multiSelect__panel"
          role="listbox"
          aria-label={typeof ariaLabel === 'string' ? ariaLabel : typeof label === 'string' ? label : 'Multi select'}
          style={panelStyle}
        >
          <input
            className="multiSelect__search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск…"
            autoComplete="off"
          />

          <div className="multiSelect__options">
            {mergedOptions.map((opt) => {
              const checked = selected.has(opt.value)
              return (
                <button
                  key={opt.value}
                  type="button"
                  className={`multiSelect__option${checked ? ' multiSelect__option--checked' : ''}`}
                  onClick={() => toggle(opt.value)}
                >
                  <span className="multiSelect__check" aria-hidden="true">
                    {checked ? <Icon name="check" size={16} /> : null}
                  </span>
                  <span className="multiSelect__optionLabel">{opt.label}</span>
                </button>
              )
            })}
          </div>

          {allowCustom ? (
            <div className="multiSelect__custom">
              <input
                className="multiSelect__customInput"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                placeholder={customPlaceholder ?? 'Добавить своё…'}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addCustom()
                  }
                }}
              />
              <button type="button" className="multiSelect__add" onClick={addCustom} disabled={!customValue.trim()}>
                Добавить
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

