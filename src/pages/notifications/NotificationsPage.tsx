import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/shared/auth/AuthContext'
import { useI18n } from '@/shared/i18n/I18nContext'
import { paths } from '@/app/router/paths'
import { useNotifications } from '@/entities/notification/lib/useNotifications'
import { notificationRepo } from '@/entities/notification/lib/notificationRepo'
import { useUsers } from '@/entities/user/lib/useUsers'
import { useTasks } from '@/entities/task/lib/useTasks'
import { buildNotificationVM } from '@/entities/notification/lib/notificationViewModel'
import './notifications.css'

type Filter = 'all' | 'unread'

export function NotificationsPage() {
  const auth = useAuth()
  const { t, locale } = useI18n()
  const notifications = useNotifications(auth.user?.id)
  const users = useUsers()
  const tasks = useTasks()
  const [filter, setFilter] = useState<Filter>('all')

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

  const list = useMemo(() => {
    if (filter === 'unread') return notifications.filter((n) => !n.readAt)
    return notifications
  }, [filter, notifications])

  const unreadCount = useMemo(() => notifications.filter((n) => !n.readAt).length, [notifications])

  if (!auth.user) {
    return (
      <main className="notificationsPage">
        <div className="notificationsContainer">
          <h1 className="notificationsTitle">{t('notifications.title')}</h1>
          <p style={{ opacity: 0.85 }}>
            <Link to={paths.login}>{t('auth.signIn')}</Link>
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="notificationsPage">
      <div className="notificationsContainer">
        <div className="notificationsHeader">
          <div>
            <h1 className="notificationsTitle">{t('notifications.title')}</h1>
            <div className="notificationsSubtitle">
              {unreadCount ? t('notifications.unreadCount', { count: unreadCount }) : t('notifications.empty')}
            </div>
          </div>
          <div className="notificationsHeaderActions">
            <button
              type="button"
              className="notificationsBtn"
              disabled={!unreadCount}
              onClick={() => notificationRepo.markAllRead(auth.user!.id)}
            >
              {t('notifications.markAllRead')}
            </button>
          </div>
        </div>

        <div className="notificationsFilters">
          <button
            type="button"
            className={`notificationsFilter${filter === 'all' ? ' notificationsFilter--active' : ''}`}
            onClick={() => setFilter('all')}
          >
            {t('notifications.filter.all')}
          </button>
          <button
            type="button"
            className={`notificationsFilter${filter === 'unread' ? ' notificationsFilter--active' : ''}`}
            onClick={() => setFilter('unread')}
            disabled={!unreadCount}
          >
            {t('notifications.filter.unread')}
          </button>
        </div>

        {list.length === 0 ? (
          <div className="notificationsEmpty">{t('notifications.empty')}</div>
        ) : (
          <div className="notificationsList">
            {list.map((n) => {
              const actor = userById.get(n.actorUserId) ?? null
              const task = taskById.get(n.taskId) ?? null
              const vm = buildNotificationVM({
                n,
                actorId: actor?.id ?? null,
                task,
                locale,
                t,
              })
              return (
                <div key={n.id} className={`notificationsItem${vm.unread ? ' notificationsItem--unread' : ''}`}>
                  <Link
                    to={vm.href ?? paths.profile}
                    className="notificationsItemMain"
                    onClick={() => notificationRepo.markRead(n.id)}
                  >
                    <span className="notificationsItemIcon" aria-hidden="true">
                      {vm.icon}
                    </span>
                    <span className="notificationsItemBody">
                      <span className="notificationsItemTitle">{vm.title}</span>
                      <span className="notificationsItemSubtitle">{vm.subtitle}</span>
                    </span>
                    <span className="notificationsItemTime">{vm.timeLabel}</span>
                  </Link>
                  <div className="notificationsItemActions">
                    {vm.actorHref ? (
                      <Link to={vm.actorHref} className="notificationsLink">
                        {t('notifications.viewProfile')}
                      </Link>
                    ) : null}
                    {vm.href ? (
                      <Link to={vm.href} className="notificationsLink">
                        {t('notifications.viewTask')}
                      </Link>
                    ) : null}
                    {vm.completionHref ? (
                      <a className="notificationsLink" href={vm.completionHref} target="_blank" rel="noreferrer">
                        {t('task.completionLink')}
                      </a>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}

