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
  size = 'large',
  userpic = true,
  radius,
}: {
  botName: string // username бота без @
  onAuth: (user: TgUser) => void | Promise<void>
  size?: 'large' | 'medium' | 'small'
  userpic?: boolean
  radius?: number
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
    script.setAttribute('data-size', size)
    script.setAttribute('data-userpic', userpic ? 'true' : 'false')
    if (typeof radius === 'number' && Number.isFinite(radius)) {
      script.setAttribute('data-radius', String(Math.max(0, Math.min(999, Math.floor(radius)))))
    }
    script.setAttribute('data-request-access', 'write')
    script.setAttribute('data-origin', window.location.origin)
    script.setAttribute('data-onauth', 'onTelegramAuth(user)')

    ref.current?.appendChild(script)

    return () => {
      if (ref.current) ref.current.innerHTML = ''
    }
  }, [botName, radius, size, userpic])

  return <div ref={ref} />
}

