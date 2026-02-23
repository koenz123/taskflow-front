import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import { App } from '@/app/App'
import { I18nProvider } from '@/shared/i18n/I18nProvider'
import { AuthProvider } from '@/shared/auth/AuthProvider'
import { ToastProvider } from '@/shared/ui/toast/ToastProvider'
import { initTheme } from '@/shared/theme/theme'
import { initGlobalErrorHandlers } from '@/shared/logging/initGlobalErrorHandlers'
import { ErrorBoundary } from '@/shared/logging/ErrorBoundary'
import { GoogleOAuthProvider } from '@react-oauth/google'

// Apply theme before first render to avoid flicker.
initTheme('dark')

initGlobalErrorHandlers()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''}>
        <AuthProvider>
          <ToastProvider>
            <BrowserRouter>
              <ErrorBoundary>
                <App />
              </ErrorBoundary>
            </BrowserRouter>
          </ToastProvider>
        </AuthProvider>
      </GoogleOAuthProvider>
    </I18nProvider>
  </StrictMode>,
)
