import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/shared/auth/AuthContext'
import { useI18n } from '@/shared/i18n/I18nContext'
import { paths } from '@/app/router/paths'
import { useNotifications } from '@/entities/notification/lib/useNotifications'
import { notificationRepo } from '@/entities/notification/lib/notificationRepo'
import { useUsers } from '@/entities/user/lib/useUsers'
import { useTasks } from '@/entities/task/lib/useTasks'
import { buildNotificationFeedVM } from '@/entities/notification/lib/notificationViewModel'
import { useVisibleDisputeIds } from '@/entities/dispute/lib/useVisibleDisputeIds'
import { api } from '@/shared/api/api'
import {
  markAllNotificationsReadOptimistic,
  markNotificationReadOptimistic,
  markNotificationsReadOptimistic,
  refreshNotifications,
} from '@/entities/notification/lib/useNotifications'
import './notifications.css'
import { Icon } from '@/shared/ui/icon/Icon'

type Filter = 'all' | 'unread'
const USE_API = import.meta.env.VITE_DATA_SOURCE === 'api'

export function NotificationsPage() {
  const auth = useAuth()
  const { t, locale } = useI18n()
  const userId = auth.user!.id
  const notifications = useNotifications(userId)
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

  const visibleDisputeIds = useVisibleDisputeIds()

  const list = useMemo(() => {
    if (filter === 'unread') return notifications.filter((n) => !n.readAt)
    return notifications
  }, [filter, notifications])

  const feed = useMemo(
    () =>
      buildNotificationFeedVM({
        list,
        actorById: userById,
        taskById,
        locale,
        t,
        visibleDisputeIds,
      }),
    [list, locale, t, taskById, userById, visibleDisputeIds],
  )

  const unreadCount = useMemo(
    () =>
      notifications.filter((n) => {
        if (n.readAt) return false
        if (n.type === 'dispute_opened' || n.type === 'dispute_message')
          return typeof n.disputeId === 'string' && visibleDisputeIds.has(n.disputeId)
        return true
      }).length,
    [notifications, visibleDisputeIds],
  )

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
              onClick={() => {
                if (USE_API) {
                  markAllNotificationsReadOptimistic()
                  void api.post('/notifications/read-all', {}).then(() => refreshNotifications()).catch(() => {})
                }
                else notificationRepo.markAllRead(userId)
              }}
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

        {feed.length === 0 ? (
          <div className="notificationsEmpty">{t('notifications.empty')}</div>
        ) : (
          <div className="notificationsList">
            {feed.map((vm) => {
              return (
                <div key={vm.id} className={`notificationsItem${vm.unread ? ' notificationsItem--unread' : ''}`}>
                  <Link
                    to={vm.href ?? paths.profile}
                    className="notificationsItemMain"
                    onClick={() => {
                      const ids = vm.sourceNotificationIds?.length ? vm.sourceNotificationIds : [vm.id]
                      if (USE_API) {
                        if (vm.sourceNotificationIds?.length) markNotificationsReadOptimistic(ids)
                        else markNotificationReadOptimistic(vm.id)
                        void Promise.allSettled(ids.map((id) => api.post(`/notifications/${id}/read`, {})))
                          .then(() => refreshNotifications())
                          .catch(() => {})
                      }
                      else {
                        for (const id of ids) notificationRepo.markRead(id)
                      }
                    }}
                  >
                    <span className="notificationsItemIcon" aria-hidden="true">
                      <Icon name={vm.icon} size={18} />
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

