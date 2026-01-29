import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { paths, taskDetailsPath, userProfilePath } from '@/app/router/paths'
import { useI18n } from '@/shared/i18n/I18nContext'
import { useAuth } from '@/shared/auth/AuthContext'
import { useUsers } from '@/entities/user/lib/useUsers'
import { useNotifications } from '@/entities/notification/lib/useNotifications'
import { notificationRepo } from '@/entities/notification/lib/notificationRepo'
import { useTasks } from '@/entities/task/lib/useTasks'
import { pickText } from '@/entities/task/lib/taskText'
import './header.css'

export function Header() {
  const { locale, setLocale, t } = useI18n()
  const auth = useAuth()
  const users = useUsers()
  const location = useLocation()
  const [isLangOpen, setIsLangOpen] = useState(false)
  const [isNotifOpen, setIsNotifOpen] = useState(false)
  const [isNotifExpanded, setIsNotifExpanded] = useState(false)
  const langRef = useRef<HTMLDivElement | null>(null)
  const notifRef = useRef<HTMLDivElement | null>(null)

  const flag = useMemo(() => (locale === 'ru' ? '🇷🇺' : '🇺🇸'), [locale])
  const notifications = useNotifications(auth.user?.id)
  const unreadCount = useMemo(() => notifications.filter((n) => !n.readAt).length, [notifications])
  const tasks = useTasks()

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

  return (
    <header className="header">
      <div className="header__inner">
        <Link to={paths.home} className="header__brand" aria-label="UI Create Works">
          UI Create Works
        </Link>

        <div className="header__right">
          {auth.user ? (
            <>
              {langSwitcher}

              <div className="notif" ref={notifRef}>
                <button
                  type="button"
                  className="notif__btn"
                  aria-label={t('notifications.title')}
                  aria-haspopup="menu"
                  aria-expanded={isNotifOpen}
                  onClick={() => {
                    setIsNotifOpen((v) => {
                      const next = !v
                      if (next) setIsNotifExpanded(false)
                      return next
                    })
                  }}
                >
                  <span aria-hidden="true">🔔</span>
                  {unreadCount ? <span className="notif__badge">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
                </button>

                {isNotifOpen ? (
                  <div className="notif__menu" role="menu">
                    <div className="notif__header">
                      <div style={{ display: 'grid', gap: 6 }}>
                        <div className="notif__title">{t('notifications.title')}</div>
                        {notifications.length > 4 ? (
                          <button
                            type="button"
                            className="notif__toggle"
                            onClick={() => setIsNotifExpanded((v) => !v)}
                          >
                            {isNotifExpanded ? t('notifications.showLess') : t('notifications.showAll')}
                          </button>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="notif__smallBtn"
                        onClick={() => {
                          if (!auth.user) return
                          notificationRepo.markAllRead(auth.user.id)
                        }}
                      >
                        {t('notifications.markAllRead')}
                      </button>
                    </div>

                    {notifications.length === 0 ? (
                      <div className="notif__empty">{t('notifications.empty')}</div>
                    ) : (
                      <div
                        className="notif__items"
                        style={
                          isNotifExpanded && notifications.length > 8
                            ? { maxHeight: 420, overflowY: 'auto', paddingRight: 4 }
                            : undefined
                        }
                      >
                        {(isNotifExpanded ? notifications : notifications.slice(0, 4)).map((n) => {
                          const actor = userById.get(n.actorUserId)
                          const task = taskById.get(n.taskId)
                          const actorName = actor?.fullName ?? t('notifications.someone')
                          const taskTitle = task ? pickText(task.title, locale) : n.taskId
                          const prefix =
                            n.type === 'task_completed'
                              ? t('notifications.taskCompletedPrefix')
                              : n.type === 'task_application'
                                ? t('notifications.taskApplicationPrefix')
                                : n.type === 'task_assigned'
                                  ? t('notifications.taskAssignedPrefix')
                                  : t('notifications.taskTakenPrefix')

                          return (
                            <div
                              key={n.id}
                              className={`notif__item${n.readAt ? '' : ' notif__item--unread'}`}
                              role="menuitem"
                            >
                              <div className="notif__text">
                                {prefix}{' '}
                                <Link
                                  className="notif__link"
                                  to={actor ? userProfilePath(actor.id) : paths.profile}
                                  onClick={() => {
                                    notificationRepo.markRead(n.id)
                                    setIsNotifExpanded(false)
                                    setIsNotifOpen(false)
                                  }}
                                >
                                  {actorName}
                                </Link>
                                {task ? (
                                  <>
                                    {' '}
                                    —{' '}
                                    <Link
                                      className="notif__link"
                                      to={taskDetailsPath(task.id)}
                                      onClick={() => {
                                        notificationRepo.markRead(n.id)
                                        setIsNotifExpanded(false)
                                        setIsNotifOpen(false)
                                      }}
                                    >
                                      {taskTitle}
                                    </Link>
                                  </>
                                ) : null}
                              </div>

                              <div className="notif__meta">
                                <span>{new Date(n.createdAt).toLocaleString()}</span>
                                {actor ? (
                                  <Link
                                    className="notif__link"
                                    to={userProfilePath(actor.id)}
                                    onClick={() => {
                                      notificationRepo.markRead(n.id)
                                      setIsNotifExpanded(false)
                                      setIsNotifOpen(false)
                                    }}
                                  >
                                    {t('notifications.viewProfile')}
                                  </Link>
                                ) : null}
                                <Link
                                  className="notif__link"
                                  to={taskDetailsPath(n.taskId)}
                                  onClick={() => {
                                    notificationRepo.markRead(n.id)
                                    setIsNotifExpanded(false)
                                    setIsNotifOpen(false)
                                  }}
                                >
                                  {t('notifications.viewTask')}
                                </Link>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

              <Link className="header__button" to={paths.profile}>
                {t('auth.profile')}
              </Link>
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

