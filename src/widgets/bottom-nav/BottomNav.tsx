import { Link, useLocation } from 'react-router-dom'
import { useMemo } from 'react'
import { paths } from '@/app/router/paths'
import { useAuth } from '@/shared/auth/AuthContext'
import { useI18n } from '@/shared/i18n/I18nContext'
import { useNotifications } from '@/entities/notification/lib/useNotifications'
import { useTasks } from '@/entities/task/lib/useTasks'
import { useApplications } from '@/entities/task/lib/useApplications'
import { useContracts } from '@/entities/contract/lib/useContracts'
import { useTaskAssignments } from '@/entities/taskAssignment/lib/useTaskAssignments'
import './bottom-nav.css'

type Item = {
  key: string
  path: string
  icon: string
  label: string
  show: boolean
  badgeCount?: number
}

export function BottomNav() {
  const { t, locale } = useI18n()
  const auth = useAuth()
  const location = useLocation()

  const notifications = useNotifications(auth.user?.id ?? null)
  const unreadNotifCount = useMemo(() => notifications.filter((n) => !n.readAt).length, [notifications])

  const tasks = useTasks()
  const applications = useApplications()
  const contracts = useContracts()
  const assignments = useTaskAssignments()

  const myTasksBadgeCount = useMemo(() => {
    if (!auth.user || auth.user.role !== 'customer') return 0
    const myTaskIds = new Set(tasks.filter((task) => task.createdByUserId === auth.user!.id).map((t) => t.id))
    if (myTaskIds.size === 0) return 0
    const pendingApps = applications.filter((app) => app.status === 'pending' && myTaskIds.has(app.taskId)).length
    const review = contracts.filter((c) => c.clientId === auth.user!.id && c.status === 'submitted').length
    const pause = assignments.filter((a) => a.status === 'pause_requested' && myTaskIds.has(a.taskId)).length
    return pendingApps + review + pause
  }, [applications, assignments, auth.user, contracts, tasks])

  const items: Item[] = [
    {
      key: 'disputes',
      path: paths.disputes,
      icon: '⚖️',
      label: locale === 'ru' ? 'Споры' : 'Disputes',
      show: auth.user?.role === 'arbiter',
    },
    {
      key: 'tasks-exec',
      path: paths.tasks,
      icon: '📋',
      label: t('nav.tasks'),
      show: auth.user?.role === 'executor',
    },
    {
      key: 'my-tasks',
      path: paths.customerTasks,
      icon: '📝',
      label: t('nav.myTasks'),
      show: auth.user?.role === 'customer',
      badgeCount: myTasksBadgeCount,
    },
    {
      key: 'post-task',
      path: paths.taskCreate,
      icon: '➕',
      label: t('nav.postTask'),
      show: auth.user?.role === 'customer',
    },
    {
      key: 'notifications',
      path: paths.notifications,
      icon: '🔔',
      label: t('notifications.title'),
      show: Boolean(auth.user),
      badgeCount: unreadNotifCount,
    },
    {
      key: 'profile',
      path: paths.profile,
      icon: '👤',
      label: t('nav.profile'),
      show: Boolean(auth.user) && auth.user?.role !== 'arbiter',
    },
  ]

  const visible = items.filter((x) => x.show).slice(0, 5)

  const isActive = (path: string) => {
    if (path === paths.profile) {
      return location.pathname === paths.profile
    }
    return location.pathname === path || location.pathname.startsWith(path + '/')
  }

  if (!auth.user) return null

  return (
    <nav className="bottomNav" aria-label={locale === 'ru' ? 'Навигация' : 'Navigation'}>
      <div className="bottomNav__inner">
        {visible.map((item) => {
          const active = isActive(item.path)
          const badgeText = item.badgeCount && item.badgeCount > 99 ? '99+' : item.badgeCount ? String(item.badgeCount) : null
          return (
            <Link key={item.key} to={item.path} className={`bottomNav__item${active ? ' bottomNav__item--active' : ''}`}>
              <span className="bottomNav__icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="bottomNav__label">{item.label}</span>
              {badgeText ? (
                <span className="bottomNav__badge" aria-label={`${item.label}: ${badgeText}`}>
                  {badgeText}
                </span>
              ) : null}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

