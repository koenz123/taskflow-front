import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { paths } from '@/app/router/paths'
import { useI18n } from '@/shared/i18n/I18nContext'
import { useAuth } from '@/shared/auth/AuthContext'
import { useUsers } from '@/entities/user/lib/useUsers'
import './header.css'
import { getActiveTheme, setTheme } from '@/shared/theme/theme'
import { Icon } from '@/shared/ui/icon/Icon'
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
import { useVisibleDisputeIds } from '@/entities/dispute/lib/useVisibleDisputeIds'
import { api } from '@/shared/api/api'

const USE_API = import.meta.env.VITE_DATA_SOURCE === 'api'

function FlagIcon(props: { code: 'ru' | 'us' }) {
  if (props.code === 'ru') {
    return (
      <span className="langFlagIcon" aria-hidden="true">
        <svg viewBox="0 0 18 12" width="18" height="12" focusable="false" aria-hidden="true">
          <rect x="0" y="0" width="18" height="4" fill="#ffffff" />
          <rect x="0" y="4" width="18" height="4" fill="#1d4ed8" />
          <rect x="0" y="8" width="18" height="4" fill="#ef4444" />
        </svg>
      </span>
    )
  }
  // US
  return (
    <span className="langFlagIcon" aria-hidden="true">
      <svg viewBox="0 0 18 12" width="18" height="12" focusable="false" aria-hidden="true">
        <rect x="0" y="0" width="18" height="12" fill="#ffffff" />
        {/* stripes */}
        <rect x="0" y="0" width="18" height="1" fill="#ef4444" />
        <rect x="0" y="2" width="18" height="1" fill="#ef4444" />
        <rect x="0" y="4" width="18" height="1" fill="#ef4444" />
        <rect x="0" y="6" width="18" height="1" fill="#ef4444" />
        <rect x="0" y="8" width="18" height="1" fill="#ef4444" />
        <rect x="0" y="10" width="18" height="1" fill="#ef4444" />
        {/* canton */}
        <rect x="0" y="0" width="8" height="7" fill="#1e3a8a" />
        {/* simple stars */}
        <circle cx="1.5" cy="1.5" r="0.35" fill="#ffffff" />
        <circle cx="3.2" cy="1.5" r="0.35" fill="#ffffff" />
        <circle cx="4.9" cy="1.5" r="0.35" fill="#ffffff" />
        <circle cx="6.6" cy="1.5" r="0.35" fill="#ffffff" />
        <circle cx="2.35" cy="2.8" r="0.35" fill="#ffffff" />
        <circle cx="4.05" cy="2.8" r="0.35" fill="#ffffff" />
        <circle cx="5.75" cy="2.8" r="0.35" fill="#ffffff" />
        <circle cx="1.5" cy="4.1" r="0.35" fill="#ffffff" />
        <circle cx="3.2" cy="4.1" r="0.35" fill="#ffffff" />
        <circle cx="4.9" cy="4.1" r="0.35" fill="#ffffff" />
        <circle cx="6.6" cy="4.1" r="0.35" fill="#ffffff" />
        <circle cx="2.35" cy="5.4" r="0.35" fill="#ffffff" />
        <circle cx="4.05" cy="5.4" r="0.35" fill="#ffffff" />
        <circle cx="5.75" cy="5.4" r="0.35" fill="#ffffff" />
      </svg>
    </span>
  )
}

export function Header() {
  const { locale, setLocale, t } = useI18n()
  const auth = useAuth()
  const users = useUsers()
  const tasks = useTasks()
  const notifications = useNotifications(auth.user?.id)
  const location = useLocation()
  const [theme, setThemeState] = useState(() => getActiveTheme())
  const [isLangOpen, setIsLangOpen] = useState(false)
  const langRef = useRef<HTMLDivElement | null>(null)
  const [isNotifOpen, setIsNotifOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement | null>(null)

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
        <FlagIcon code={locale === 'ru' ? 'ru' : 'us'} />
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
            <FlagIcon code="us" />
            <span className="lang__label">English</span>
            {locale === 'en' ? (
              <span className="lang__current" aria-hidden="true">
                <Icon name="check" size={16} />
              </span>
            ) : null}
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
            <FlagIcon code="ru" />
            <span className="lang__label">Русский</span>
            {locale === 'ru' ? (
              <span className="lang__current" aria-hidden="true">
                <Icon name="check" size={16} />
              </span>
            ) : null}
          </button>
        </div>
      ) : null}
    </div>
  )

  const visibleDisputeIds = useVisibleDisputeIds()

  const notifBell = (() => {
    const user = auth.user
    if (!user) return null
    const list = notifications
    const unreadList = list.filter((n) => {
      if (n.readAt) return false
      if (n.type === 'dispute_opened' || n.type === 'dispute_message')
        return typeof n.disputeId === 'string' && visibleDisputeIds.has(n.disputeId)
      return true
    })
    const unread = unreadList.length
    const badgeText = unread > 99 ? '99+' : unread ? String(unread) : null
    const feed = buildNotificationFeedVM({
      list: unreadList,
      actorById: userById,
      taskById,
      locale,
      t,
      visibleDisputeIds,
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
          <Icon name="bell" size={18} />
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
                        <Icon name={vm.icon} size={18} />
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
            <Icon name={theme === 'dark' ? 'moon' : 'sun'} size={18} />
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

