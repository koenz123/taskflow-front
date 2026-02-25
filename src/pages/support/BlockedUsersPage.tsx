import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/shared/auth/AuthContext'
import { useI18n } from '@/shared/i18n/I18nContext'
import { executorRestrictionRepo } from '@/entities/executorSanction/lib/executorRestrictionRepo'
import { useUsers } from '@/entities/user/lib/useUsers'
import { fetchUserById } from '@/entities/user/lib/useUsers'
import './blocked-users.css'

export function BlockedUsersPage() {
  const auth = useAuth()
  const { locale } = useI18n()
  const users = useUsers()
  const [search, setSearch] = useState('')
  const [, setTick] = useState(0)

  useEffect(() => {
    return executorRestrictionRepo.subscribe(() => setTick((t) => t + 1))
  }, [])

  const bannedIds = executorRestrictionRepo.listBanned()

  useEffect(() => {
    bannedIds.forEach((id) => {
      if (!users.find((u) => u.id === id)) void fetchUserById(id)
    })
  }, [bannedIds.join(','), users.length])

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return bannedIds
    return bannedIds.filter((id) => {
      const u = userById.get(id)
      const name = (u?.fullName ?? '').toLowerCase()
      const email = (u?.email ?? '').toLowerCase()
      const phone = (u?.phone ?? '').toLowerCase()
      const idLower = id.toLowerCase()
      return name.includes(q) || email.includes(q) || phone.includes(q) || idLower.includes(q)
    })
  }, [bannedIds, search, userById])

  function handleUnblock(executorId: string) {
    if (!auth.user || auth.user.role !== 'arbiter') return
    if (!confirm(locale === 'ru' ? 'Разблокировать этого пользователя?' : 'Unblock this user?')) return
    executorRestrictionRepo.unblock(executorId)
  }

  if (!auth.user || auth.user.role !== 'arbiter') {
    return null
  }

  return (
    <main className="blockedUsersPage">
      <header className="blockedUsersHeader">
        <h1 className="blockedUsersTitle">
          {locale === 'ru' ? 'Заблокированные пользователи' : 'Blocked users'}
        </h1>
        <p className="blockedUsersIntro">
          {locale === 'ru'
            ? 'Исполнители, заблокированные за 5 нарушений. Можно разблокировать.'
            : 'Executors banned for 5 violations. You can unblock them.'}
        </p>
      </header>

      <div className="blockedUsersSearchWrap">
        <input
          type="search"
          className="blockedUsersSearch"
          autoComplete="off"
          placeholder={
            locale === 'ru'
              ? 'Поиск по ФИО, почте или номеру телефона...'
              : 'Search by name, email or phone...'
          }
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={locale === 'ru' ? 'Поиск' : 'Search'}
        />
      </div>

      <ul className="blockedUsersList">
        {filtered.length === 0 ? (
          <li className="blockedUsersEmpty">
            {locale === 'ru' ? 'Нет заблокированных' : 'No blocked users'}
          </li>
        ) : (
          filtered.map((executorId) => {
            const user = userById.get(executorId)
            const name = user?.fullName?.trim() || '—'
            const email = user?.email?.trim() || '—'
            const phone = user?.phone?.trim() || '—'
            return (
              <li key={executorId} className="blockedUsersItem">
                <div className="blockedUsersItem__info">
                  <span className="blockedUsersItem__name">{name}</span>
                  <span className="blockedUsersItem__email">{email}</span>
                  <span className="blockedUsersItem__phone">{phone}</span>
                  {!user ? <span className="blockedUsersItem__id">ID: {executorId}</span> : null}
                </div>
                <button
                  type="button"
                  className="blockedUsersItem__unblock"
                  onClick={() => handleUnblock(executorId)}
                >
                  {locale === 'ru' ? 'Разблокировать' : 'Unblock'}
                </button>
              </li>
            )
          })
        )}
      </ul>
    </main>
  )
}
