export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'ui-create-works.theme.v1'

function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light'
}

export function getStoredTheme(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return isTheme(v) ? v : null
  } catch {
    return null
  }
}

export function getActiveTheme(): Theme {
  const attr = document.documentElement.getAttribute('data-theme')
  return isTheme(attr) ? attr : 'dark'
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // ignore
  }
  applyTheme(theme)
}

export function initTheme(defaultTheme: Theme = 'dark'): Theme {
  const stored = getStoredTheme()
  const theme = stored ?? defaultTheme
  applyTheme(theme)
  return theme
}

export function toggleTheme(): Theme {
  const next: Theme = getActiveTheme() === 'dark' ? 'light' : 'dark'
  setTheme(next)
  return next
}

