import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/shared/auth/AuthContext'
import { useI18n } from '@/shared/i18n/I18nContext'
import { disputeThreadPath, paths, taskDetailsPath } from '@/app/router/paths'
import { useDisputes } from '@/entities/dispute/lib/useDisputes'
import { useContracts } from '@/entities/contract/lib/useContracts'
import { useTasks } from '@/entities/task/lib/useTasks'
import { pickText } from '@/entities/task/lib/taskText'
import { useUsers } from '@/entities/user/lib/useUsers'
import './disputes.css'

type Filter = 'all' | 'open' | 'decided' | 'closed'

function statusLabel(status: string, locale: 'ru' | 'en') {
  if (locale === 'ru') {
    if (status === 'open') return 'Открыт'
    if (status === 'decided') return 'Решение принято'
    if (status === 'closed') return 'Закрыт'
  } else {
    if (status === 'open') return 'Open'
    if (status === 'decided') return 'Decided'
    if (status === 'closed') return 'Closed'
  }
  return status
}

function statusTone(status: string): 'open' | 'neutral' | 'closed' {
  if (status === 'open') return 'open'
  if (status === 'closed') return 'closed'
  return 'neutral'
}

export function DisputesPage() {
  const auth = useAuth()
  const { locale } = useI18n()
  const disputes = useDisputes()
  const contracts = useContracts()
  const tasks = useTasks()
  const users = useUsers()
  const [filter, setFilter] = useState<Filter>('open')

  const contractById = useMemo(() => new Map(contracts.map((c) => [c.id, c])), [contracts])
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])

  const list = useMemo(() => {
    const base = disputes.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    if (filter === 'all') return base
    return base.filter((d) => d.status === filter)
  }, [disputes, filter])

  if (!auth.user) {
    return (
      <main className="disputesPage">
        <div className="disputesContainer">
          <h1 className="disputesTitle">{locale === 'ru' ? 'Споры' : 'Disputes'}</h1>
          <p className="disputesHint">
            <Link to={paths.login}>{locale === 'ru' ? 'Войти' : 'Sign in'}</Link>
          </p>
        </div>
      </main>
    )
  }

  const allowed = auth.user.role === 'arbiter'

  if (!allowed) {
    return (
      <main className="disputesPage">
        <div className="disputesContainer">
          <h1 className="disputesTitle">{locale === 'ru' ? 'Споры' : 'Disputes'}</h1>
          <div className="disputesHint">
            {locale === 'ru'
              ? 'Страница доступна только аккаунту арбитра.'
              : 'This page is available to the arbiter account only.'}
          </div>
          <div style={{ marginTop: 10 }}>
            <Link to={paths.profile}>{locale === 'ru' ? 'В профиль' : 'Go to profile'}</Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="disputesPage">
      <div className="disputesContainer">
        <div className="disputesHeader">
          <div>
            <h1 className="disputesTitle">{locale === 'ru' ? 'Споры' : 'Disputes'}</h1>
            <div className="disputesSubtitle">
              {locale === 'ru'
                ? `Всего: ${disputes.length}`
                : `Total: ${disputes.length}`}
            </div>
          </div>
        </div>

        <div className="disputesFilters" role="tablist" aria-label={locale === 'ru' ? 'Фильтры' : 'Filters'}>
          {(['open', 'decided', 'closed', 'all'] as const).map((x) => (
            <button
              key={x}
              type="button"
              className={`disputesFilter${filter === x ? ' disputesFilter--active' : ''}`}
              onClick={() => setFilter(x)}
            >
              {x === 'all' ? (locale === 'ru' ? 'Все' : 'All') : statusLabel(x, locale)}
            </button>
          ))}
        </div>

        {list.length === 0 ? (
          <div className="disputesEmpty">
            {locale === 'ru' ? 'Пока нет споров.' : 'No disputes yet.'}
          </div>
        ) : (
          <div className="disputesList">
            {list.map((d) => {
              const contract = contractById.get(d.contractId) ?? null
              const task = contract ? (taskById.get(contract.taskId) ?? null) : null
              const opener = userById.get(d.openedByUserId) ?? null
              const created = new Date(d.createdAt).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US')
              const updated = new Date(d.updatedAt).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US')
              const taskTitle = task ? pickText(task.title, locale) : (contract?.taskId ?? d.contractId)
              const tone = statusTone(d.status)

              return (
                <div key={d.id} className="disputesCard">
                  <div className="disputesCard__top">
                    <span
                      className={`disputesPill ${
                        tone === 'open' ? 'disputesPill--open' : tone === 'closed' ? 'disputesPill--closed' : 'disputesPill--neutral'
                      }`}
                      title={locale === 'ru' ? 'Статус' : 'Status'}
                    >
                      {statusLabel(d.status, locale)}
                    </span>
                    <span className="disputesMeta">
                      {locale === 'ru' ? 'Обновлено' : 'Updated'}: {updated}
                    </span>
                  </div>

                  <div className="disputesRow">
                    <div className="disputesLabel">{locale === 'ru' ? 'Задание' : 'Task'}</div>
                    <div className="disputesValue">
                      {contract ? (
                        <Link className="disputesLink" to={taskDetailsPath(contract.taskId)}>
                          {taskTitle}
                        </Link>
                      ) : (
                        <span className="disputesValueMuted">{taskTitle}</span>
                      )}
                    </div>
                  </div>

                  <div className="disputesRow">
                    <div className="disputesLabel">{locale === 'ru' ? 'Контракт' : 'Contract'}</div>
                    <div className="disputesValue">
                      <span className="disputesMono">{d.contractId}</span>
                    </div>
                  </div>

                  <div className="disputesRow">
                    <div className="disputesLabel">{locale === 'ru' ? 'Открыл' : 'Opened by'}</div>
                    <div className="disputesValue">
                      {opener ? (
                        <span title={opener.email}>
                          {opener.fullName} <span className="disputesValueMuted">({opener.role})</span>
                        </span>
                      ) : (
                        <span className="disputesMono">{d.openedByUserId}</span>
                      )}
                    </div>
                  </div>

                  <div className="disputesRow">
                    <div className="disputesLabel">{locale === 'ru' ? 'Причина' : 'Reason'}</div>
                    <div className="disputesValue">
                      <span className="disputesMono">
                        {d.reason.categoryId}/{d.reason.reasonId}
                      </span>
                      {d.reason.detail ? <div className="disputesReasonDetail">{d.reason.detail}</div> : null}
                    </div>
                  </div>

                  <div className="disputesFooter">
                    <span className="disputesMeta">
                      {locale === 'ru' ? 'Создано' : 'Created'}: {created}
                    </span>
                    {contract ? (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <Link className="linkBtn" to={disputeThreadPath(d.id)}>
                          {locale === 'ru' ? 'Открыть спор' : 'Open dispute'}
                        </Link>
                        <Link className="linkBtn" to={taskDetailsPath(contract.taskId)}>
                          {locale === 'ru' ? 'Открыть задание' : 'Open task'}
                        </Link>
                      </div>
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

