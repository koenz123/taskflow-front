import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import './toast.css'

export type ToastTone = 'success' | 'info' | 'error'

type ToastItem = {
  id: string
  message: string
  tone: ToastTone
  closing: boolean
}

type ShowToastInput = {
  message: string
  tone?: ToastTone
  durationMs?: number
}

type ToastApi = {
  showToast: (input: ShowToastInput) => string
  closeToast: (id: string) => void
  clearToasts: () => void
}

const ToastContext = createContext<ToastApi | null>(null)

const DEFAULT_DURATION_MS = 5000
const CLOSE_ANIMATION_MS = 260
const MAX_TOASTS = 4

function makeId() {
  const c = globalThis.crypto as Crypto | undefined
  if (c?.randomUUID) return c.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timersRef = useRef<Map<string, { auto?: number; remove?: number }>>(new Map())

  const beginClose = useCallback((id: string) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, closing: true } : t)))

    const timers = timersRef.current.get(id)
    if (timers?.auto) window.clearTimeout(timers.auto)
    if (timers?.remove) window.clearTimeout(timers.remove)

    const remove = window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
      timersRef.current.delete(id)
    }, CLOSE_ANIMATION_MS)

    timersRef.current.set(id, { remove })
  }, [])

  const api = useMemo<ToastApi>(() => {
    return {
      showToast: ({ message, tone = 'info', durationMs = DEFAULT_DURATION_MS }) => {
        const trimmed = message.trim()
        if (!trimmed) return ''
        const id = makeId()
        setToasts((prev) => {
          const next = [{ id, message: trimmed, tone, closing: false }, ...prev]
          return next.slice(0, MAX_TOASTS)
        })

        const auto = window.setTimeout(() => beginClose(id), Math.max(0, durationMs))
        timersRef.current.set(id, { auto })
        return id
      },
      closeToast: (id: string) => {
        if (!id) return
        beginClose(id)
      },
      clearToasts: () => {
        for (const [, timers] of timersRef.current) {
          if (timers.auto) window.clearTimeout(timers.auto)
          if (timers.remove) window.clearTimeout(timers.remove)
        }
        timersRef.current.clear()
        setToasts([])
      },
    }
  }, [beginClose])

  useEffect(() => {
    return () => {
      for (const [, timers] of timersRef.current) {
        if (timers.auto) window.clearTimeout(timers.auto)
        if (timers.remove) window.clearTimeout(timers.remove)
      }
      timersRef.current.clear()
    }
  }, [])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toastViewport" aria-live="polite" aria-relevant="additions removals" aria-atomic="true">
        {toasts.map((t) => {
          const role = t.tone === 'error' ? 'alert' : 'status'
          return (
            <div
              key={t.id}
              className={`toastItem toastItem--${t.tone}${t.closing ? ' toastItem--closing' : ''}`}
              role={role}
            >
              <div className="toastItem__message">{t.message}</div>
              <button
                type="button"
                className="toastItem__close"
                aria-label="Закрыть"
                onClick={() => beginClose(t.id)}
              >
                ×
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within <ToastProvider>.')
  }
  return ctx
}

