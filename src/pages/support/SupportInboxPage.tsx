import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { paths, supportThreadPath } from '@/app/router/paths'
import { useAuth } from '@/shared/auth/AuthContext'
import { useI18n } from '@/shared/i18n/I18nContext'
import { supportRepo } from '@/entities/support/lib/supportRepo'
import { useSupportThreadsFromApi } from '@/entities/support/lib/supportApi'
import { notificationRepo } from '@/entities/notification/lib/notificationRepo'
import { useUsers } from '@/entities/user/lib/useUsers'
import { timeAgo } from '@/shared/lib/timeAgo'
import { CustomSelect } from '@/shared/ui/custom-select/CustomSelect'
import { StatusPill } from '@/shared/ui/status-pill/StatusPill'
import './support-inbox.css'

const USE_API = import.meta.env.VITE_DATA_SOURCE === 'api'

type Filter = 'all' | 'unread' | 'open' | 'closed'

export function SupportInboxPage() {
  const auth = useAuth()
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const users = useUsers()
  const apiThreads = useSupportThreadsFromApi()

  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  const threads = USE_API ? apiThreads : supportRepo.listThreads()
  const unreadThreadIds = useMemo(() => {
    if (!auth.user) return new Set<string>()
    const list = notificationRepo.listForUser(auth.user.id).filter(
      (n) => n.type === 'support_message' && !n.readAt && n.supportThreadId,
    )
    return new Set(list.map((n) => n.supportThreadId!))
  }, [auth.user])

  const filteredThreads = useMemo(() => {
    let list = threads
    if (filter === 'unread') list = list.filter((t) => unreadThreadIds.has(t.id))
    else if (filter === 'open') list = list.filter((t) => (t.status ?? 'open') === 'open')
    else if (filter === 'closed') list = list.filter((t) => t.status === 'closed')
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((t) => {
        const u = users.find((x) => x.id === t.userId)
        const name = (u?.fullName ?? '').toLowerCase()
        const email = (u?.email ?? '').toLowerCase()
        const phone = (u?.phone ?? '').toLowerCase()
        return name.includes(q) || email.includes(q) || phone.includes(q)
      })
    }
    return list
  }, [threads, filter, search, unreadThreadIds, users])

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])

  if (!auth.user || auth.user.role !== 'arbiter') {
    navigate(paths.profile, { replace: true })
    return null
  }

  const filterOptions: Array<{ value: Filter; label: string }> = [
    { value: 'all', label: t('support.filterAll') },
    { value: 'unread', label: t('support.filterUnread') },
    { value: 'open', label: t('support.filterOpen') },
    { value: 'closed', label: t('support.filterClosed') },
  ]

  return (
    <main className="supportInboxPage">
      <header className="supportInboxHeader">
        <h1 className="supportInboxTitle">{t('support.inboxTitle')}</h1>
      </header>

      <div className="supportInboxFilters">
        <CustomSelect<Filter>
          label={t('support.filter')}
          value={filter}
          options={filterOptions}
          onChange={setFilter}
        />
        <input
          type="search"
          className="supportInboxSearch"
          autoComplete="off"
          placeholder={t('support.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={t('support.filter')}
        />
      </div>

      <ul className="supportInboxList">
        {filteredThreads.length === 0 ? (
          <li className="supportInboxEmpty">
            {t('support.empty')}
          </li>
        ) : (
          filteredThreads.map((thread) => {
            const user = userById.get(thread.userId)
            const displayName =
              thread.userFullName?.trim() ||
              user?.fullName?.trim() ||
              user?.email?.trim() ||
              thread.userId
            const msgCount = USE_API ? 0 : supportRepo.getMessageCount(thread.id)
            const hasUnread = unreadThreadIds.has(thread.id)
            const isOpen = (thread.status ?? 'open') === 'open'
            return (
              <li key={thread.id}>
                <Link
                  to={supportThreadPath(thread.id)}
                  className={`supportInboxItem ${hasUnread ? 'supportInboxItem--unread' : ''}`}
                >
                  <span className="supportInboxItem__name">{displayName}</span>
                  <span className="supportInboxItem__meta">
                    <StatusPill
                      tone={isOpen ? 'open' : 'closed'}
                      label={isOpen ? t('support.statusOpen') : t('support.statusClosed')}
                    />
                    {timeAgo(thread.updatedAt, locale, Date.now())}
                    {msgCount > 0 ? (
                      <span className="supportInboxItem__count" title={t('support.messagesCount', { count: msgCount })}>
                        {msgCount}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            )
          })
        )}
      </ul>
    </main>
  )
}
