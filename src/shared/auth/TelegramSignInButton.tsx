import { TelegramLoginButton, type TgUser } from './TelegramLoginButton'

export function TelegramSignInButton(props: {
  botName: string
  locale: 'ru' | 'en'
  onAuth: (user: TgUser) => void | Promise<void>
}) {
  return (
    <div className="authTelegramBtnWrap" aria-hidden={false}>
      <div className="authTelegramBtn" aria-hidden="true">
        <span className="authTelegramBtn__icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <path
              fill="currentColor"
              d="M9.53 15.73 9.2 20.38c.47 0 .68-.2.93-.45l2.24-2.14 4.64 3.39c.85.47 1.45.22 1.66-.79l3.01-14.1h0c.25-1.22-.44-1.7-1.27-1.39L2.1 9.58c-1.2.47-1.18 1.15-.2 1.45l4.62 1.44L17.3 6.2c.5-.3.96-.13.58.17"
            />
          </svg>
        </span>
        <span className="authTelegramBtn__text">
          {props.locale === 'ru' ? 'Войти через Telegram' : 'Continue with Telegram'}
        </span>
        <span className="authTelegramBtn__chev" aria-hidden="true">
          →
        </span>
      </div>

      <div className="authTelegramBtnOverlay" aria-hidden="true">
        <TelegramLoginButton botName={props.botName} onAuth={props.onAuth} />
      </div>
    </div>
  )
}

