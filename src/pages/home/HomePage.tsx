import { Link } from 'react-router-dom'
import { paths } from '@/app/router/paths'
import { useI18n } from '@/shared/i18n/I18nContext'

export function HomePage() {
  const { t } = useI18n()

  return (
    <main style={{ padding: 24, maxWidth: 920, margin: '0 auto' }}>
      <div
        style={{
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 18,
          padding: 22,
          background: 'rgba(255,255,255,0.05)',
          boxShadow: '0 22px 70px rgba(0,0,0,0.22)',
        }}
      >
        <h1 style={{ marginTop: 0, marginBottom: 8, fontSize: 34, lineHeight: 1.15 }}>UI Create Works</h1>
        <p style={{ marginTop: 0, opacity: 0.9, lineHeight: 1.6 }}>{t('home.welcome')}</p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
          <Link className="primaryLink" to={paths.tasks}>
            {t('home.browseTasks')}
          </Link>
        </div>
      </div>
    </main>
  )
}

