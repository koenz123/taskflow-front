import { Link, Outlet, useLocation } from 'react-router-dom'
import { paths } from '@/app/router/paths'
import { useI18n } from '@/shared/i18n/I18nContext'
import './auth-shell.css'
import '@/pages/auth/auth-form.css'
import { getActiveTheme, setTheme } from '@/shared/theme/theme'
import { useState } from 'react'

export function AuthShell() {
  const { locale, setLocale, t } = useI18n()
  const location = useLocation()
  const [theme, setThemeState] = useState(() => getActiveTheme())

  const isAuthRoute =
    location.pathname === paths.login || location.pathname === paths.register || location.pathname === paths.forgotPassword
    || location.pathname === paths.verifyEmail || location.pathname === paths.verifyEmailSent

  return (
    <main className="authShell">
      <header className="authShell__topbar">
        <Link className="authShell__brand" to={paths.home}>
          TaskFlow
        </Link>

        <div className="authShell__actions">
          <div className="authShell__lang" role="group" aria-label="Language">
            <button
              type="button"
              className={locale === 'ru' ? 'authShell__langBtn authShell__langBtn--active' : 'authShell__langBtn'}
              onClick={() => setLocale('ru')}
            >
              RU
            </button>
            <button
              type="button"
              className={locale === 'en' ? 'authShell__langBtn authShell__langBtn--active' : 'authShell__langBtn'}
              onClick={() => setLocale('en')}
            >
              EN
            </button>
          </div>

          <button
            type="button"
            className="authShell__themeBtn"
            aria-label={locale === 'ru' ? 'Тема' : 'Theme'}
            title={theme === 'dark' ? (locale === 'ru' ? 'Тёмная тема' : 'Dark theme') : (locale === 'ru' ? 'Светлая тема' : 'Light theme')}
            onClick={() => {
              const next = theme === 'dark' ? 'light' : 'dark'
              setTheme(next)
              setThemeState(next)
            }}
          >
            <span aria-hidden="true">{theme === 'dark' ? '🌙' : '☀️'}</span>
          </button>

          <Link className="authShell__home" to={paths.home}>
            {t('common.backHome')}
          </Link>
        </div>
      </header>

      <div className="authShell__body">
        <div className="authShell__container" data-auth-route={isAuthRoute ? '1' : '0'}>
          <Outlet />
        </div>
      </div>
    </main>
  )
}

