import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { paths } from '@/app/router/paths'
import { useI18n } from '@/shared/i18n/I18nContext'
import { useAuth } from '@/shared/auth/AuthContext'
import { useUsers } from '@/entities/user/lib/useUsers'
import './header.css'
import { useDevMode } from '@/shared/dev/devMode'
import { getActiveTheme, setTheme } from '@/shared/theme/theme'
import {
  markAllNotificationsReadOptimistic,
  markNotificationReadOptimistic,
  markNotificationsReadOptimistic,
  refreshNotifications,
  useNotifications,
} from '@/entities/notification/lib/useNotifications'
import { notificationRepo } from '@/entities/notification/lib/notificationRepo'
import { useTasks } from '@/entities/task/lib/useTasks'
import { buildNotificationFeedVM } from '@/entities/notification/lib/notificationViewModel'
import { api } from '@/shared/api/api'

const DEV_ARBITER_USER_ID = 'user_dev_arbiter'
const USE_API = import.meta.env.VITE_DATA_SOURCE === 'api'

export function Header() {
  const { locale, setLocale, t } = useI18n()
  const auth = useAuth()
  const devMode = useDevMode()
  const users = useUsers()
  const tasks = useTasks()
  const notifications = useNotifications(auth.user?.id)
  const location = useLocation()
  const navigate = useNavigate()
  const [theme, setThemeState] = useState(() => getActiveTheme())
  const [isLangOpen, setIsLangOpen] = useState(false)
  const langRef = useRef<HTMLDivElement | null>(null)
  const [isNotifOpen, setIsNotifOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement | null>(null)

  const flag = useMemo(() => (locale === 'ru' ? '🇷🇺' : '🇺🇸'), [locale])

  const userById = useMemo(() => {
    const map = new Map<string, (typeof users)[number]>()
    for (const u of users) map.set(u.id, u)
    return map
  }, [users])

  const taskById = useMemo(() => {
    const map = new Map<string, (typeof tasks)[number]>()
    for (const x of tasks) map.set(x.id, x)
    return map
  }, [tasks])

  const isArbiter = Boolean(auth.user?.role === 'arbiter' && devMode.enabled && !USE_API)
  const canJumpToArbiter = Boolean(auth.user && devMode.enabled && !USE_API && auth.user.role !== 'arbiter')
  const arbiterExists = Boolean(userById.get(DEV_ARBITER_USER_ID))
  const avatarUrl = auth.user?.avatarDataUrl ?? null
  const avatarLabel = auth.user?.fullName?.trim() || auth.user?.email || ''
  const avatarInitials = useMemo(() => {
    const name = (auth.user?.fullName ?? '').trim()
    if (!name) return 'U'
    const parts = name.split(/\s+/).filter(Boolean)
    const first = parts[0]?.[0] ?? 'U'
    const second = parts.length > 1 ? parts[1]?.[0] : parts[0]?.[1]
    const raw = (first + (second ?? '')).toUpperCase()
    return raw.slice(0, 2)
  }, [auth.user?.fullName])
  const roleLabel = (role: string) => {
    if (locale === 'ru') {
      if (role === 'customer') return 'Заказчик'
      if (role === 'executor') return 'Исполнитель'
      if (role === 'arbiter') return 'Арбитр'
    }
    if (role === 'customer') return 'Customer'
    if (role === 'executor') return 'Executor'
    if (role === 'arbiter') return 'Arbiter'
    return role
  }

  const switchableUsers = useMemo(() => {
    // Arbiter can switch into any user (dev tool).
    // Keep current user included to avoid empty select state.
    if (!auth.user) return []
    const list = users.slice()
    // Stable ordering: arbiter first, then customers, then executors, then others by name/email.
    const rank = (role: string) => (role === 'arbiter' ? 0 : role === 'customer' ? 1 : role === 'executor' ? 2 : 9)
    return list.sort((a, b) => {
      const ra = rank(a.role)
      const rb = rank(b.role)
      if (ra !== rb) return ra - rb
      const an = (a.fullName || a.email || a.id).toLowerCase()
      const bn = (b.fullName || b.email || b.id).toLowerCase()
      return an.localeCompare(bn)
    })
  }, [auth.user, users])

  useEffect(() => {
    if (!isLangOpen) return

    const onPointerDown = (e: PointerEvent) => {
      const el = langRef.current
      if (!el) return
      if (e.target instanceof Node && !el.contains(e.target)) {
        setIsLangOpen(false)
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsLangOpen(false)
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isLangOpen])

  useEffect(() => {
    if (!isNotifOpen) return

    const onPointerDown = (e: PointerEvent) => {
      const el = notifRef.current
      if (!el) return
      if (e.target instanceof Node && !el.contains(e.target)) {
        setIsNotifOpen(false)
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsNotifOpen(false)
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isNotifOpen])

  // (api health check removed: it wasn't rendered anywhere)

  const langSwitcher = (
    <div className="lang" ref={langRef}>
      <button
        type="button"
        className="lang__btn"
        aria-label="Language"
        aria-haspopup="menu"
        aria-expanded={isLangOpen}
        onClick={() => setIsLangOpen((v) => !v)}
      >
        {flag}
      </button>

      {isLangOpen ? (
        <div className="lang__menu" role="menu">
          <button
            type="button"
            className="lang__item"
            role="menuitem"
            onClick={() => {
              setLocale('en')
              setIsLangOpen(false)
            }}
          >
            <span className="lang__flag" aria-hidden="true">
              🇺🇸
            </span>
            <span className="lang__label">English</span>
            {locale === 'en' ? <span className="lang__current">✓</span> : null}
          </button>
          <button
            type="button"
            className="lang__item"
            role="menuitem"
            onClick={() => {
              setLocale('ru')
              setIsLangOpen(false)
            }}
          >
            <span className="lang__flag" aria-hidden="true">
              🇷🇺
            </span>
            <span className="lang__label">Русский</span>
            {locale === 'ru' ? <span className="lang__current">✓</span> : null}
          </button>
        </div>
      ) : null}
    </div>
  )

  const notifBell = (() => {
    const user = auth.user
    if (!user) return null
    const list = notifications
    const unreadList = list.filter((n) => !n.readAt)
    const unread = unreadList.length
    const badgeText = unread > 99 ? '99+' : unread ? String(unread) : null
    const feed = buildNotificationFeedVM({
      list: unreadList,
      actorById: userById,
      taskById,
      locale,
      t,
    })
    const preview = feed.slice(0, 6)

    return (
      <div className="notif" ref={notifRef}>
        <button
          type="button"
          className="notif__btn"
          aria-label={locale === 'ru' ? 'Уведомления' : 'Notifications'}
          aria-haspopup="menu"
          aria-expanded={isNotifOpen}
          onClick={() => setIsNotifOpen((v) => !v)}
        >
          <span aria-hidden="true">🔔</span>
          {badgeText ? <span className="notif__badge">{badgeText}</span> : null}
        </button>

        {isNotifOpen ? (
          <div className="notif__menu" role="menu" aria-label={locale === 'ru' ? 'Уведомления' : 'Notifications'}>
            <div className="notif__header">
              <div className="notif__titleRow">
                <div className="notif__title">{t('notifications.title')}</div>
                {unread ? <div className="notif__count">{unread}</div> : null}
              </div>
              <div className="notif__actions">
                <button
                  type="button"
                  className="notif__smallBtn"
                  disabled={!unread}
                  onClick={() => {
                    if (USE_API) {
                      markAllNotificationsReadOptimistic()
                      void api.post('/notifications/read-all', {}).then(() => refreshNotifications())
                    } else {
                      notificationRepo.markAllRead(user.id)
                    }
                  }}
                >
                  {locale === 'ru' ? 'Прочитать всё' : 'Mark all read'}
                </button>
              </div>
            </div>

            {preview.length === 0 ? (
              <div className="notif__empty">{locale === 'ru' ? 'Пока нет уведомлений.' : 'No notifications yet.'}</div>
            ) : (
              <div className="notif__items">
                {preview.map((vm) => {
                  const to = vm.href ?? paths.notifications
                  return (
                    <Link
                      key={vm.id}
                      className={`notif__item${vm.unread ? ' notif__item--unread' : ''}`}
                      to={to}
                      role="menuitem"
                      onClick={() => {
                        if (USE_API) {
                          const ids = vm.sourceNotificationIds?.length ? vm.sourceNotificationIds : [vm.id]
                          if (vm.sourceNotificationIds?.length) markNotificationsReadOptimistic(ids)
                          else markNotificationReadOptimistic(vm.id)
                          void Promise.allSettled(ids.map((id) => api.post(`/notifications/${id}/read`, {}))).then(() => refreshNotifications())
                        } else {
                          const ids = vm.sourceNotificationIds?.length ? vm.sourceNotificationIds : [vm.id]
                          for (const id of ids) notificationRepo.markRead(id)
                        }
                        setIsNotifOpen(false)
                      }}
                    >
                      <span className="notifItem__icon" aria-hidden="true">
                        {vm.icon}
                      </span>
                      <span className="notifItem__body">
                        <span className="notifItem__title">{vm.title}</span>
                        <span className="notifItem__subtitle">{vm.subtitle}</span>
                      </span>
                      <span className="notifItem__time">{vm.timeLabel}</span>
                    </Link>
                  )
                })}
              </div>
            )}

            <div className="notif__footer">
              <Link
                className="notif__viewAll"
                to={paths.notifications}
                onClick={() => setIsNotifOpen(false)}
              >
                {locale === 'ru' ? 'Все уведомления' : 'View all'}
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    )
  })()

  return (
    <header className="header">
      <div className="header__inner">
        <div className="header__right">
          <button
            type="button"
            className={`devToggle${devMode.enabled ? ' devToggle--on' : ''}`}
            onClick={() => devMode.setEnabled(!devMode.enabled)}
            aria-pressed={devMode.enabled}
            title={t('dev.mode')}
          >
            <span className="devToggle__label">{t('dev.mode')}</span>
            <span className="devToggle__state">{devMode.enabled ? t('dev.on') : t('dev.off')}</span>
          </button>

          {USE_API && devMode.enabled ? (
            <span style={{ fontSize: 12, opacity: 0.8, marginLeft: 10 }}>
              {locale === 'ru' ? 'Dev mode ограничен в API‑режиме' : 'Dev mode is limited in API mode'}
            </span>
          ) : null}

          {canJumpToArbiter ? (
            <button
              type="button"
              className="arbiterJumpBtn"
              disabled={!arbiterExists}
              aria-label={locale === 'ru' ? 'Перейти в аккаунт арбитра' : 'Switch to arbiter'}
              title={locale === 'ru' ? 'Перейти в аккаунт арбитра (dev)' : 'Switch to arbiter (dev)'}
              onClick={() => {
                if (!arbiterExists) return
                auth.switchUser(DEV_ARBITER_USER_ID)
                navigate(paths.disputes)
              }}
            >
              <span aria-hidden="true">⚖️</span>
            </button>
          ) : null}

          {isArbiter && auth.user ? (
            <div className="profileSwitch" aria-label={locale === 'ru' ? 'Переключение профиля' : 'Switch profile'}>
              <span className="profileSwitch__label">{locale === 'ru' ? 'Профиль' : 'Profile'}</span>
              <select
                className="profileSwitch__select"
                value={auth.user.id}
                onChange={(e) => {
                  const nextUserId = e.target.value
                  const nextUser = userById.get(nextUserId) ?? null
                  auth.switchUser(nextUserId)
                  // Move to a safe landing page for the switched role.
                  if (!nextUser) {
                    navigate(paths.profile)
                    return
                  }
                  if (nextUser.role === 'customer') navigate(paths.customerTasks)
                  else if (nextUser.role === 'executor') navigate(paths.tasks)
                  else if (nextUser.role === 'arbiter') navigate(paths.disputes)
                  else navigate(paths.profile)
                }}
                title={locale === 'ru' ? 'Переключить активный аккаунт (dev)' : 'Switch active account (dev)'}
              >
                {switchableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName || u.email || u.id} · {roleLabel(u.role)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <button
            type="button"
            className="theme__btn"
            aria-label={locale === 'ru' ? 'Тема' : 'Theme'}
            aria-pressed={theme === 'dark'}
            title={theme === 'dark' ? (locale === 'ru' ? 'Тёмная тема' : 'Dark theme') : (locale === 'ru' ? 'Светлая тема' : 'Light theme')}
            onClick={() => {
              const next = theme === 'dark' ? 'light' : 'dark'
              setTheme(next)
              setThemeState(next)
            }}
          >
            <span aria-hidden="true">{theme === 'dark' ? '🌙' : '☀️'}</span>
          </button>

          {auth.user ? (
            <>
              {notifBell}
              {langSwitcher}

              {auth.user.role !== 'arbiter' ? (
                <Link className="headerAvatar" to={paths.profile} aria-label={avatarLabel} title={avatarLabel}>
                  {avatarUrl ? <img className="headerAvatar__img" src={avatarUrl} alt="" /> : <span className="headerAvatar__txt">{avatarInitials}</span>}
                </Link>
              ) : (
                <div className="headerAvatar" aria-label={avatarLabel} title={avatarLabel}>
                  {avatarUrl ? <img className="headerAvatar__img" src={avatarUrl} alt="" /> : <span className="headerAvatar__txt">{avatarInitials}</span>}
                </div>
              )}
            </>
          ) : location.pathname !== paths.register ? (
            <>
              {langSwitcher}

              <Link className="header__button" to={paths.login}>
                {t('auth.authorization')}
              </Link>
            </>
          ) : (
            <>
              {langSwitcher}

              <Link className="header__button" to={paths.login}>
                {t('auth.authorization')}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

