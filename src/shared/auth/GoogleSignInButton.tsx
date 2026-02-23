import { useMemo, useState } from 'react'
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google'

type Props = {
  clientId: string
  onCredential: (credential: string) => void | Promise<void>
  onError?: (message: string) => void
  disabled?: boolean
  locale?: 'ru' | 'en'
}

// Custom-looking button that still uses the official GIS "button" flow underneath.
// This avoids the FedCM prompt flow (`google.accounts.id.prompt`) which can fail with NetworkError.
export function GoogleSignInButton(props: Props) {
  const locale = props.locale === 'ru' ? 'ru' : 'en'
  const canUse = useMemo(() => Boolean(String(props.clientId ?? '').trim()), [props.clientId])
  const [busy, setBusy] = useState(false)

  return (
    <div className="authGoogleBtnWrap" aria-disabled={!canUse || props.disabled || busy}>
      <div className="authGoogleBtn authGoogleBtnVisual" aria-hidden="true">
        <span className="authGoogleBtn__icon">
          <svg width="18" height="18" viewBox="0 0 48 48" focusable="false" aria-hidden="true">
            <path
              fill="#FFC107"
              d="M43.611 20.083H42V20H24v8h11.303C33.67 32.657 29.223 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.651-.389-3.917z"
            />
            <path
              fill="#FF3D00"
              d="M6.306 14.691l6.571 4.819C14.655 16.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
            />
            <path
              fill="#4CAF50"
              d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.635-3.317-11.277-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
            />
            <path
              fill="#1976D2"
              d="M43.611 20.083H42V20H24v8h11.303a12.07 12.07 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.651-.389-3.917z"
            />
          </svg>
        </span>
        <span className="authGoogleBtn__text">
          {busy ? (locale === 'ru' ? 'Подключаем…' : 'Connecting…') : locale === 'ru' ? 'Войти через Google' : 'Continue with Google'}
        </span>
        <span className="authGoogleBtn__chev">→</span>
      </div>

      <div className="authGoogleBtnOverlay">
        {canUse ? (
          <GoogleLogin
            onSuccess={async (resp: CredentialResponse) => {
              const credential = String(resp.credential ?? '').trim()
              if (!credential) {
                props.onError?.('missing_credential')
                return
              }
              try {
                setBusy(true)
                await props.onCredential(credential)
              } catch {
                props.onError?.('auth_failed')
              } finally {
                setBusy(false)
              }
            }}
            onError={() => props.onError?.('google_login_failed')}
            useOneTap={false}
            // Keep the official flow, but avoid FedCM-specific button mode.
            use_fedcm_for_button={false}
            text="continue_with"
            shape="pill"
            size="large"
            width="420"
          />
        ) : null}
      </div>
    </div>
  )
}

