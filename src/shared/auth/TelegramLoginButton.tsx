import { useEffect, useRef } from 'react'

export type TgUser = {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

export function TelegramLoginButton({
  botName,
  onAuth,
}: {
  botName: string // username бота без @
  onAuth: (user: TgUser) => void | Promise<void>
}) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handler = (e: any) => {
      try {
        const maybe = onAuth(e.detail)
        if (maybe && typeof (maybe as any).catch === 'function') {
          ;(maybe as Promise<void>).catch(() => {})
        }
      } catch {
        // ignore
      }
    }

    window.addEventListener('tg-auth', handler)
    return () => {
      window.removeEventListener('tg-auth', handler)
    }
  }, [onAuth])

  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.async = true
    script.setAttribute('data-telegram-login', botName)
    script.setAttribute('data-size', 'large')
    script.setAttribute('data-userpic', 'true')
    script.setAttribute('data-request-access', 'write')
    script.setAttribute('data-origin', window.location.origin)
    script.setAttribute('data-onauth', 'onTelegramAuth(user)')

    ref.current?.appendChild(script)

    return () => {
      if (ref.current) ref.current.innerHTML = ''
    }
  }, [botName])

  return <div ref={ref} />
}

