import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { paths } from '@/app/router/paths'
import { useI18n } from '@/shared/i18n/I18nContext'
import { useAuth } from '@/shared/auth/AuthContext'
import { useTasks } from '@/entities/task/lib/useTasks'
import { useApplications } from '@/entities/task/lib/useApplications'
import { useContracts } from '@/entities/contract/lib/useContracts'
import { useTaskAssignments } from '@/entities/taskAssignment/lib/useTaskAssignments'
import { useNotifications } from '@/entities/notification/lib/useNotifications'
import './sidebar.css'
import { Icon, type IconName } from '@/shared/ui/icon/Icon'

export function Sidebar() {
  const { t, locale } = useI18n()
  const auth = useAuth()
  const location = useLocation()
  const tasks = useTasks()
  const applications = useApplications()
  const contracts = useContracts()
  const assignments = useTaskAssignments()
  useNotifications(auth.user?.id ?? null)
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  // Закрываем мобильное меню при смене маршрута
  useEffect(() => {
    setIsMobileOpen(false)
  }, [location.pathname, location.search])

  // Закрываем мобильное меню при клике вне его
  useEffect(() => {
    if (!isMobileOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      const sidebar = document.querySelector('.sidebar')
      const hamburger = document.querySelector('.sidebar__hamburger')
      if (
        sidebar &&
        hamburger &&
        !sidebar.contains(e.target as Node) &&
        !hamburger.contains(e.target as Node)
      ) {
        setIsMobileOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isMobileOpen])

  const myTasksPendingApplicationsCount = useMemo(() => {
    if (!auth.user || auth.user.role !== 'customer') return 0
    const myTaskIds = new Set(tasks.filter((task) => task.createdByUserId === auth.user!.id).map((t) => t.id))
    if (myTaskIds.size === 0) return 0
    return applications.filter((app) => app.status === 'pending' && myTaskIds.has(app.taskId)).length
  }, [applications, auth.user, tasks])

  const myTasksReviewCount = useMemo(() => {
    if (!auth.user || auth.user.role !== 'customer') return 0
    return contracts.filter((c) => c.clientId === auth.user!.id && c.status === 'submitted').length
  }, [auth.user, contracts])

  const myTasksPauseRequestsCount = useMemo(() => {
    if (!auth.user || auth.user.role !== 'customer') return 0
    const myTaskIds = new Set(tasks.filter((task) => task.createdByUserId === auth.user!.id).map((t) => t.id))
    if (myTaskIds.size === 0) return 0
    return assignments.filter((a) => a.status === 'pause_requested' && myTaskIds.has(a.taskId)).length
  }, [assignments, auth.user, tasks])

  const myTasksBadgeCount = myTasksPendingApplicationsCount + myTasksReviewCount + myTasksPauseRequestsCount
  const myTasksBadgeText = myTasksBadgeCount > 99 ? '99+' : String(myTasksBadgeCount)

  type NavItem = {
    path: string
    icon: IconName
    label: string
    show: boolean
    badgeCount?: number
  }

  const navItems: NavItem[] = [
    {
      path: paths.disputes,
      icon: 'gavel',
      label: locale === 'ru' ? 'Споры' : 'Disputes',
      show: auth.user?.role === 'arbiter',
    },
    {
      path: paths.tasks,
      icon: 'clipboard',
      label: t('nav.tasks'),
      // For customers we hide the generic "Tasks" list in the sidebar
      show: auth.user?.role !== 'customer' && auth.user?.role !== 'arbiter',
    },
    {
      path: paths.taskCreate,
      icon: 'plus',
      label: t('nav.postTask'),
      show: auth.user?.role === 'customer',
    },
    {
      path: paths.customerTasks,
      icon: 'note',
      label: t('nav.myTasks'),
      show: auth.user?.role === 'customer',
      badgeCount: myTasksBadgeCount,
    },
    {
      path: paths.profile,
      icon: 'user',
      label: t('nav.profile'),
      show: !!auth.user && auth.user.role !== 'arbiter',
    },
    {
      path: auth.user ? `/works/${auth.user.id}` : paths.home,
      icon: 'palette',
      label: t('nav.portfolio'),
      show: !!auth.user && auth.user.role !== 'arbiter',
    },
  ]

  const visibleItems = navItems.filter((item) => item.show)
  const logoPath =
    auth.user?.role === 'customer'
      ? paths.customerTasks
      : auth.user?.role === 'executor'
        ? paths.tasks
        : auth.user?.role === 'arbiter'
          ? paths.disputes
        : paths.home

  return (
    <>
      {/* Гамбургер для мобильных */}
      <button
        type="button"
        className="sidebar__hamburger"
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        aria-label="Toggle menu"
      >
        <span className="sidebar__hamburger__line" />
        <span className="sidebar__hamburger__line" />
        <span className="sidebar__hamburger__line" />
      </button>

      {/* Оверлей для мобильных */}
      {isMobileOpen && <div className="sidebar__overlay" onClick={() => setIsMobileOpen(false)} />}

      {/* Сайдбар */}
      <aside className={`sidebar ${isMobileOpen ? 'sidebar--mobile-open' : ''}`}>
        <div className="sidebar__inner">
          {/* Логотип */}
          <Link to={logoPath} className="sidebar__logo">
            <span className="sidebar__logo__icon" aria-hidden="true">TF</span>
            <span className="sidebar__logo__text">TaskFlow</span>
          </Link>

          {/* Навигация */}
          <nav className="sidebar__nav">
            {visibleItems.map((item) => {
              const [itemPathname, itemSearch = ''] = item.path.split('?')
              const isSearchMatch = itemSearch ? location.search.includes(itemSearch) : true
              const isActive =
                (location.pathname === itemPathname && isSearchMatch) ||
                (itemPathname !== paths.tasks && itemPathname !== paths.home && location.pathname.startsWith(itemPathname))
              
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`sidebar__nav__item ${isActive ? 'sidebar__nav__item--active' : ''}`}
                  title={item.label}
                >
                  <span className="sidebar__nav__icon" aria-hidden="true">
                    <Icon name={item.icon} size={18} />
                  </span>
                  <span className="sidebar__nav__label">{item.label}</span>
                  {item.badgeCount ? (
                    <span
                      className="sidebar__nav__badge"
                      title={`${item.label}: ${item.badgeCount}`}
                      aria-label={`${item.label}: ${item.badgeCount}`}
                    >
                      {item.path === paths.customerTasks ? myTasksBadgeText : item.badgeCount}
                    </span>
                  ) : null}
                </Link>
              )
            })}
          </nav>
        </div>
      </aside>
    </>
  )
}
