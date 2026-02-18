import type { ReactNode } from 'react'
import { Component } from 'react'
import { logError } from './logger'

type Props = { children: ReactNode }
type State = { hasError: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown, info: unknown) {
    logError('REACT_ERROR_BOUNDARY', {
      error: error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) },
      info: typeof info === 'object' ? (info as Record<string, unknown>) : { info: String(info) },
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 16, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
          <h2 style={{ margin: '0 0 8px' }}>Что-то пошло не так</h2>
          <p style={{ margin: 0, opacity: 0.8 }}>Обнови страницу. Если проблема повторится — посмотри логи.</p>
        </div>
      )
    }
    return this.props.children
  }
}

