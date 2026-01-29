import { Link } from 'react-router-dom'
import { paths } from '@/app/router/paths'
import { useI18n } from '@/shared/i18n/I18nContext'

export function NotFoundPage() {
  const { t } = useI18n()

  return (
    <main style={{ padding: 24 }}>
      <h1>404</h1>
      <p>{t('notFound.title')}</p>
      <p>
        <Link to={paths.home}>{t('common.backHome')}</Link>
      </p>
    </main>
  )
}

