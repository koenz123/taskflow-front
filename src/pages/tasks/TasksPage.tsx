import { Link } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { paths, taskDetailsPath } from '@/app/router/paths'
import { useTasks } from '@/entities/task/lib/useTasks'
import { pickText } from '@/entities/task/lib/taskText'
import { autoTranslateIfNeeded } from '@/entities/task/lib/autoTranslateTask'
import { useI18n } from '@/shared/i18n/I18nContext'
import type { TranslationKey } from '@/shared/i18n/translations'
import { formatTimeLeft, timeLeftMs } from '@/entities/task/lib/taskDeadline'
import { useAuth } from '@/shared/auth/AuthContext'
import './tasks.css'

function formatBudget(amount?: number, currency?: string) {
  if (!amount) return null
  return `${amount} ${currency ?? ''}`.trim()
}

function statusLabel(status: string, t: (key: TranslationKey) => string) {
  if (status === 'open') return t('task.status.open')
  if (status === 'in_progress') return t('task.status.inProgress')
  if (status === 'closed') return t('task.status.closed')
  return status.replace('_', ' ')
}

export function TasksPage() {
  const { t, locale } = useI18n()
  const auth = useAuth()
  const allTasks = useTasks()
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [q, setQ] = useState('')

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const tokens = useMemo(() => q.trim().toLowerCase().split(/\s+/).filter(Boolean), [q])

  const tasks = useMemo(() => {
    // Only available (not taken), sorted by remaining time ascending.
    return allTasks
      .filter((x) => x.status === 'open' && !x.assignedToUserId)
      .filter((task) => {
        if (tokens.length === 0) return true
        const hay = [
          task.title.en,
          task.title.ru,
          task.shortDescription.en,
          task.shortDescription.ru,
          task.description.en,
          task.description.ru,
          task.category ?? '',
          task.location ?? '',
        ]
          .join(' ')
          .toLowerCase()
        return tokens.every((tok) => hay.includes(tok))
      })
      .slice()
      .sort((a, b) => {
        const da = timeLeftMs(a.expiresAt, nowMs)
        const db = timeLeftMs(b.expiresAt, nowMs)
        if (da !== db) return da - db
        return b.createdAt.localeCompare(a.createdAt)
      })
  }, [allTasks, nowMs, tokens])

  useEffect(() => {
    // Best-effort: translate legacy tasks (EN==RU) in the background.
    // Limit to a few items to avoid spamming public endpoints.
    const top = tasks.slice(0, 3)
    void (async () => {
      for (const task of top) {
        await autoTranslateIfNeeded(task.id, {
          title: task.title,
          shortDescription: task.shortDescription,
        })
      }
    })()
  }, [tasks, locale])

  return (
    <main>
      <div className="tasksHeader">
        <div>
          <h1 className="tasksTitle">{t('tasks.title')}</h1>
          <p className="tasksSubtitle">{t('tasks.subtitle')}</p>
        </div>
        {auth.user?.role === 'customer' ? (
          <Link className="primaryLink" to={paths.taskCreate}>
            {t('nav.postTask')}
          </Link>
        ) : null}
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('tasks.search.placeholder')}
        style={{
          width: 'min(560px, 100%)',
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(0,0,0,0.12)',
          color: 'inherit',
          padding: '10px 12px',
          outline: 'none',
          marginBottom: 14,
        }}
      />

      {tasks.length === 0 ? (
        <div className="emptyState">
          {tokens.length ? (
            t('tasks.search.empty')
          ) : (
            <>
              {t('tasks.empty')}{' '}
              {auth.user?.role === 'customer' ? (
                <>
                  <Link to={paths.taskCreate}>{t('tasks.postFirst')}</Link>.
                </>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <div className="taskGrid">
          {tasks.map((task) => (
            <article key={task.id} className="taskCard">
              <h2 className="taskCard__title">
                <Link className="taskLink" to={taskDetailsPath(task.id)}>
                  {pickText(task.title, locale)}
                </Link>
              </h2>
              <p className="taskCard__desc">{pickText(task.shortDescription, locale)}</p>

              <div className="taskMeta">
                {task.category ? <span className="chip">{task.category}</span> : null}
                {task.location ? <span className="chip">{task.location}</span> : null}
                {formatBudget(task.budgetAmount, task.budgetCurrency) ? (
                  <span className="chip">{formatBudget(task.budgetAmount, task.budgetCurrency)}</span>
                ) : null}
                {task.dueDate ? (
                  <span className="chip">
                    {t('tasks.due')}: {task.dueDate}
                  </span>
                ) : null}
                <span className="chip">
                  {t('tasks.timeLeft')}: {timeLeftMs(task.expiresAt, nowMs) === 0 ? t('tasks.expired') : formatTimeLeft(timeLeftMs(task.expiresAt, nowMs), locale)}
                </span>
                <span className="chip">{statusLabel(task.status, t)}</span>
              </div>

              <div className="taskCard__footer">
                <span className="chip">
                  {t('tasks.created')}: {new Date(task.createdAt).toLocaleDateString()}
                </span>
                <Link className="taskLink" to={taskDetailsPath(task.id)}>
                  {t('tasks.viewDetails')}
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  )
}

