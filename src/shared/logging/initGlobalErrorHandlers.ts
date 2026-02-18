import { logError } from './logger'

function toPlainErrorPayload(err: unknown) {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack }
  }
  return { message: String(err) }
}

export function initGlobalErrorHandlers() {
  // window.onerror
  window.addEventListener('error', (event) => {
    const payload = {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      ...(event.error ? { error: toPlainErrorPayload(event.error) } : null),
    }
    logError('GLOBAL_ERROR', payload)
  })

  // Promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    logError('UNHANDLED_REJECTION', {
      reason: toPlainErrorPayload(event.reason),
    })
  })
}

