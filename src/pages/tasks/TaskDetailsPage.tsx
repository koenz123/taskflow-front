import { Link, useNavigate, useParams } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { paths, taskEditPath, userProfilePath } from '@/app/router/paths'
import { applicationRepo } from '@/entities/task/lib/applicationRepo'
import { useApplications } from '@/entities/task/lib/useApplications'
import { taskRepo } from '@/entities/task/lib/taskRepo'
import { useTasks } from '@/entities/task/lib/useTasks'
import { pickText } from '@/entities/task/lib/taskText'
import { autoTranslateIfNeeded } from '@/entities/task/lib/autoTranslateTask'
import { useI18n } from '@/shared/i18n/I18nContext'
import type { TranslationKey } from '@/shared/i18n/translations'
import './task-details.css'
import { useAuth } from '@/shared/auth/AuthContext'
import { useDevMode } from '@/shared/dev/devMode'
import { notificationRepo } from '@/entities/notification/lib/notificationRepo'
import { formatTimeLeft, timeLeftMs } from '@/entities/task/lib/taskDeadline'
import { useUsers } from '@/entities/user/lib/useUsers'

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

export function TaskDetailsPage() {
  const { t, locale } = useI18n()
  const auth = useAuth()
  const devMode = useDevMode()
  const navigate = useNavigate()
  const { taskId } = useParams()
  const users = useUsers()
  const tasks = useTasks()
  const task = taskId ? tasks.find((x) => x.id === taskId) ?? null : null
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [applicationMessage, setApplicationMessage] = useState('')
  const [applying, setApplying] = useState(false)
  const applications = useApplications()
  const currentUser = auth.user
  const taskApplications = useMemo(
    () => (task ? applications.filter((app) => app.taskId === task.id) : []),
    [applications, task?.id],
  )
  const userApplication = useMemo(
    () =>
      currentUser && task
        ? applications.find((app) => app.taskId === task.id && app.executorUserId === currentUser.id) ?? null
        : null,
    [applications, currentUser, task?.id],
  )

  useEffect(() => {
    if (!taskId || !task) return
    // Best-effort: translate full content in details view.
    void autoTranslateIfNeeded(taskId, {
      title: task.title,
      shortDescription: task.shortDescription,
      description: task.description,
    })
  }, [taskId, locale, task])

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  if (!task) {
    return (
      <main className="taskDetails">
        <div className="taskDetailsCard">
          <h1 className="taskDetailsTitle">{t('task.details.notFound')}</h1>
          <div className="detailsActions">
            <Link className="linkBtn" to={paths.tasks}>
              {t('task.details.backToTasks')}
            </Link>
          </div>
        </div>
      </main>
    )
  }

  const id = taskId as string

  const isExpired = timeLeftMs(task.expiresAt, nowMs) === 0
  const hasPendingApplication = userApplication?.status === 'pending'
  const canApply =
    auth.user?.role === 'executor' &&
    task.status === 'open' &&
    !task.assignedToUserId &&
    !isExpired &&
    !hasPendingApplication
  const canComplete =
    auth.user?.role === 'executor' && task.status === 'in_progress' && task.assignedToUserId === auth.user.id && !isExpired
  const canRefuse = auth.user?.role === 'executor' && task.status === 'in_progress' && task.assignedToUserId === auth.user.id
  const isPostedByMe = auth.user?.role === 'customer' && task.createdByUserId === auth.user.id
  const isTakenByMe = auth.user?.role === 'executor' && task.assignedToUserId === auth.user.id
  const canDeleteAny = devMode.enabled
  const canDelete =
    (isPostedByMe || canDeleteAny) &&
    task.status === 'open' &&
    !task.assignedToUserId
  const author = task.createdByUserId ? users.find((u) => u.id === task.createdByUserId) ?? null : null

  return (
    <main className="taskDetails">
      <div className="taskDetailsCard">
        <h1 className="taskDetailsTitle">{pickText(task.title, locale)}</h1>

        <div className="taskDetailsMeta">
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
            {t('tasks.timeLeft')}:{' '}
            {isExpired ? t('tasks.expired') : formatTimeLeft(timeLeftMs(task.expiresAt, nowMs), locale)}
          </span>
          <span className="chip">{statusLabel(task.status, t)}</span>
          <span className="chip">
            {t('tasks.created')}: {new Date(task.createdAt).toLocaleString()}
          </span>
          {!isPostedByMe && author ? (
            <span className="chip">
              {t('task.meta.postedBy')}{' '}
              <Link to={userProfilePath(author.id)} style={{ opacity: 0.95 }}>
                {author.fullName}
              </Link>
            </span>
          ) : null}
          {isPostedByMe ? <span className="chip">{t('task.meta.postedByYou')}</span> : null}
          {isTakenByMe ? <span className="chip">{t('task.meta.takenByYou')}</span> : null}
        </div>

        <p className="taskDetailsBody">{pickText(task.description, locale)}</p>

        {canApply ? (
          <div className="applicationForm">
            <textarea
              value={applicationMessage}
              onChange={(e) => setApplicationMessage(e.target.value)}
              placeholder={t('task.application.placeholder')}
              rows={3}
            />
            <button
              type="button"
              className="primaryLink"
              disabled={applying}
              onClick={() => {
                if (!task.createdByUserId || !auth.user) return
                const msg = applicationMessage.trim()
                setApplying(true)
                applicationRepo.create({
                  taskId: id,
                  executorUserId: auth.user.id,
                  message: msg || undefined,
                })
                notificationRepo.addTaskApplication({
                  recipientUserId: task.createdByUserId,
                  actorUserId: auth.user.id,
                  taskId: id,
                })
                setApplicationMessage('')
                setApplying(false)
              }}
            >
              {t('task.actions.apply')}
            </button>
          </div>
        ) : null}

        {taskApplications.length > 0 && isPostedByMe ? (
          <div className="applicationList">
            <h3>{t('task.applications.title')}</h3>
            {taskApplications.map((app) => {
              const executor = users.find((u) => u.id === app.executorUserId)
              const statusKey =
                app.status === 'selected' ? 'task.status.inProgress' : app.status === 'rejected' ? 'task.status.closed' : 'task.status.open'
              return (
                <div key={app.id} className="applicationItem">
                  <div className="applicationItemTop">
                    <div>
                      <strong>{executor?.fullName ?? executor?.email ?? t('notifications.someone')}</strong>
                      <span className="pill">{t(statusKey)}</span>
                    </div>
                    <div className="applicationItemActions">
                      <Link className="taskLink" to={userProfilePath(app.executorUserId)}>
                        {t('notifications.viewProfile')}
                      </Link>
                      {app.status === 'pending' ? (
                        <>
                          <button
                            type="button"
                            className="linkBtn"
                            onClick={() => {
                              taskRepo.update(id, (prev) => ({
                                ...prev,
                                status: 'in_progress',
                                assignedToUserId: app.executorUserId,
                                takenAt: new Date().toISOString(),
                              }))
                              applicationRepo.select(app.id)
                              if (auth.user) {
                                notificationRepo.addTaskAssigned({
                                  recipientUserId: app.executorUserId,
                                  actorUserId: auth.user.id,
                                  taskId: id,
                                })
                              }
                            }}
                          >
                            {t('task.actions.assign')}
                          </button>
                          <button
                            type="button"
                            className="linkBtn"
                            onClick={() => applicationRepo.reject(app.id)}
                          >
                            {t('task.actions.reject')}
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <p className="applicationItemMessage">{app.message ?? t('task.application.placeholder')}</p>
                </div>
              )
            })}
          </div>
        ) : null}

        <div className="detailsActions">
          {canDelete ? (
            <button
              type="button"
              className="linkBtn"
              onClick={() => {
                if (!confirm(t('task.actions.deleteConfirm'))) return
                taskRepo.delete(id)
                navigate(paths.tasks)
              }}
            >
              {t('task.actions.delete')}
            </button>
          ) : null}

          {canComplete ? (
            <button
              type="button"
              className="primaryLink"
              onClick={() => {
                const recipientUserId = task.createdByUserId
                taskRepo.update(id, (prev) => ({
                  ...prev,
                  status: 'closed',
                  completedAt: new Date().toISOString(),
                }))
                if (recipientUserId && auth.user) {
                  notificationRepo.addTaskCompleted({
                    recipientUserId,
                    actorUserId: auth.user.id,
                    taskId: id,
                  })
                }
              }}
            >
              {t('task.actions.complete')}
            </button>
          ) : null}

          {canRefuse ? (
            <button
              type="button"
              className="linkBtn"
              onClick={() => {
                if (!confirm(t('task.actions.refuseConfirm'))) return
                if (userApplication) applicationRepo.reject(userApplication.id)
                taskRepo.update(id, (prev) => ({
                  ...prev,
                  status: 'open',
                  assignedToUserId: undefined,
                  takenAt: undefined,
                  completedAt: undefined,
                }))
              }}
            >
              {t('task.actions.refuse')}
            </button>
          ) : null}

          {devMode.enabled ? (
            <Link className="linkBtn" to={taskEditPath(id)}>
              {t('task.details.edit')}
            </Link>
          ) : null}
        </div>

        <div className="taskDetailsFooter">
          <Link className="linkBtn" to={paths.tasks}>
            {t('task.details.backToTasks')}
          </Link>
        </div>
      </div>
    </main>
  )
}

