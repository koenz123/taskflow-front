import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import { App } from '@/app/App'
import { I18nProvider } from '@/shared/i18n/I18nProvider'
import { AuthProvider } from '@/shared/auth/AuthProvider'
import { ToastProvider } from '@/shared/ui/toast/ToastProvider'
import { initTheme } from '@/shared/theme/theme'

if (import.meta.env.DEV) {
  void import('@/shared/dev/exposeDevTools')
}

// Apply theme before first render to avoid flicker.
initTheme('dark')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </I18nProvider>
  </StrictMode>,
)
