import { useI18n } from '@/shared/i18n/I18nContext'
import './footer.css'

export function Footer() {
  const { t } = useI18n()

  return (
    <footer className="footer" aria-label="Footer">
      <div className="footer__inner">
        <div className="footer__center">
          <span className="footer__brand">UI Create Works</span>
          <span className="footer__dot" aria-hidden="true">
            •
          </span>
          <span className="footer__tagline">{t('footer.tagline')}</span>
        </div>
      </div>
    </footer>
  )
}

