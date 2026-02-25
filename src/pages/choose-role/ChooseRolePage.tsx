import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { paths } from '@/app/router/paths'
import { useI18n } from '@/shared/i18n/I18nContext'
import { useAuth } from '@/shared/auth/AuthProvider'

export function ChooseRolePage() {
  const { locale } = useI18n()
  const auth = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (auth.status !== 'authenticated' || !auth.user) return
    if (auth.user.role === 'arbiter') {
      navigate(paths.disputes, { replace: true })
    }
  }, [auth.status, auth.user?.role, navigate])

  if (auth.status === 'loading') {
    return null
  }

  if (auth.status === 'authenticated' && auth.user?.role === 'arbiter') {
    return null
  }

  return (
    <div className="authCard">
      <div>
        <h1 className="authTitle">{locale === 'ru' ? 'Выберите роль' : 'Choose your role'}</h1>
        <p className="authSubtitle">
          {locale === 'ru'
            ? 'Через Telegram мы не знаем, вы заказчик или исполнитель. Выберите роль, чтобы продолжить.'
            : 'Telegram login does not include your app role. Choose a role to continue.'}
        </p>
      </div>

      <div className="authRoleSwitch" role="group" aria-label={locale === 'ru' ? 'Роль' : 'Role'}>
        <button
          type="button"
          className="authRoleBtn"
          onClick={() => {
            void auth.chooseRole('customer').finally(() => {
              navigate(paths.customerTasks, { replace: true })
            })
          }}
        >
          {locale === 'ru' ? 'Заказчик' : 'Customer'}
        </button>
        <button
          type="button"
          className="authRoleBtn"
          onClick={() => {
            void auth.chooseRole('executor').finally(() => {
              navigate(paths.tasks, { replace: true })
            })
          }}
        >
          {locale === 'ru' ? 'Исполнитель' : 'Executor'}
        </button>
      </div>
    </div>
  )
}

