import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { paths, taskDetailsPath, userProfilePath } from '@/app/router/paths'
import { useAuth } from '@/shared/auth/AuthContext'
import { useI18n } from '@/shared/i18n/I18nContext'
import { useTasks } from '@/entities/task/lib/useTasks'
import { useUsers } from '@/entities/user/lib/useUsers'
import { useTaskAssignments } from '@/entities/taskAssignment/lib/useTaskAssignments'
import { taskAssignmentRepo } from '@/entities/taskAssignment/lib/taskAssignmentRepo'
import { notificationRepo } from '@/entities/notification/lib/notificationRepo'
import './profile.css'
import { StatusPill } from '@/shared/ui/status-pill/StatusPill'
import { useToast } from '@/shared/ui/toast/ToastProvider'
import { notifyToTelegramAndUi } from '@/shared/notify/notify'

export function CustomerRequestsPage() {
  const { t, locale } = useI18n()
  const auth = useAuth()
  const toast = useToast()
  const user = auth.user!
  const telegramUserId = user.telegramUserId ?? null
  const toastUi = (msg: string, tone?: 'success' | 'info' | 'error') => toast.showToast({ message: msg, tone })
  const tasks = useTasks()
  const users = useUsers()
  const assignments = useTaskAssignments()

  const customerId = user.role === 'customer' ? user.id : null

  const pauseRequests = useMemo(() => {
    if (!customerId) return []
    const myTaskIds = new Set(tasks.filter((x) => x.createdByUserId === customerId).map((x) => x.id))
    return assignments
      .filter((a) => a.status === 'pause_requested' && myTaskIds.has(a.taskId))
      .slice()
      .sort((a, b) => (b.pauseRequestedAt ?? b.assignedAt).localeCompare(a.pauseRequestedAt ?? a.assignedAt))
  }, [assignments, customerId, tasks])

  if (user.role !== 'customer') {
    return (
      <main className="customerTasksPage">
        <div className="customerTasksContainer">
          <h1 className="customerTasksTitle">{t('customerRequests.title')}</h1>
          <p style={{ opacity: 0.8 }}>{t('customerRequests.onlyCustomer')}</p>
        </div>
      </main>
    )
  }

  return (
    <main className="customerTasksPage">
      <div className="customerTasksContainer">
        <div className="customerTasksHeader">
          <div className="customerTasksHeaderTop">
            <h1 className="customerTasksTitle">{t('customerRequests.title')}</h1>
            <p className="customerTasksSubtitle">{t('customerRequests.subtitle')}</p>
          </div>
          <div className="customerTasksControls">
            <Link className="customerTasksArchiveBtn" to={paths.customerTasks}>
              ← {t('customerRequests.backToMyTasks')}
            </Link>
          </div>
        </div>

        <div className="customerTasksContent">
          {pauseRequests.length === 0 ? (
            <div className="customerTasksEmpty">{t('customerRequests.empty')}</div>
          ) : (
            <ul className="customerTasksList">
              {pauseRequests.map((req) => {
                const task = tasks.find((x) => x.id === req.taskId) ?? null
                const executor = users.find((u) => u.id === req.executorId) ?? null
                const requestedAt = req.pauseRequestedAt ?? req.assignedAt
                const durationMs = req.pauseRequestedDurationMs ?? 0
                const durationHours = durationMs ? Math.round(durationMs / (60 * 60 * 1000)) : null

                return (
                  <li key={req.id} className="customerTasksItem">
                    <div className="customerTasksItemContent">
                      <div className="customerTasksItemHeader">
                        {task ? (
                          <Link className="customerTasksItemTitle" to={taskDetailsPath(task.id)}>
                            {task.title ? (locale === 'ru' ? task.title.ru : task.title.en) : t('task.details.notFound')}
                          </Link>
                        ) : (
                          <span className="customerTasksItemTitle" style={{ opacity: 0.85 }}>
                            {t('task.details.notFound')}
                          </span>
                        )}
                        <StatusPill tone="paused" label={locale === 'ru' ? 'Пауза' : 'Pause'} />
                      </div>

                      <div className="customerTasksItemBadges">
                        <span className="customerTasksItemBadge">
                          ⏸️ {locale === 'ru' ? 'Запрос' : 'Request'}: {new Date(requestedAt).toLocaleString()}
                        </span>
                        {durationHours !== null ? (
                          <span className="customerTasksItemBadge" style={{ opacity: 0.85 }}>
                            {locale === 'ru' ? 'Длительность' : 'Duration'}: {durationHours}h
                          </span>
                        ) : null}
                        {req.pauseReasonId ? (
                          <span className="customerTasksItemBadge" style={{ opacity: 0.85 }}>
                            {locale === 'ru' ? 'Причина' : 'Reason'}: {req.pauseReasonId}
                          </span>
                        ) : null}
                        {executor ? (
                          <span className="customerTasksItemBadge">
                            {locale === 'ru' ? 'Исполнитель' : 'Executor'}:{' '}
                            <Link to={userProfilePath(executor.id)}>{executor.fullName}</Link>
                          </span>
                        ) : null}
                      </div>

                      {req.pauseComment ? (
                        <p className="taskDetailsApplication__message" style={{ marginTop: 8 }}>
                          {req.pauseComment}
                        </p>
                      ) : null}
                    </div>

                    <div className="customerTasksItemActions" style={{ gap: 10 }}>
                      <button
                        type="button"
                        className="customerTasksApplicationsBtn"
                        onClick={() => {
                          taskAssignmentRepo.acceptPause(req.taskId, req.executorId)
                          notificationRepo.addTaskPauseAccepted({
                            recipientUserId: req.executorId,
                            actorUserId: user.id,
                            taskId: req.taskId,
                          })
                          void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, text: t('toast.pauseAccepted'), tone: 'success' })
                        }}
                      >
                        {t('customerRequests.accept')}
                      </button>
                      <button
                        type="button"
                        className="customerTasksApplicationsBtn"
                        style={{ opacity: 0.9 }}
                        onClick={() => {
                          taskAssignmentRepo.rejectPause(req.taskId, req.executorId)
                          notificationRepo.addTaskPauseRejected({
                            recipientUserId: req.executorId,
                            actorUserId: user.id,
                            taskId: req.taskId,
                          })
                          void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, text: t('toast.pauseRejected'), tone: 'info' })
                        }}
                      >
                        {t('customerRequests.reject')}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </main>
  )
}

