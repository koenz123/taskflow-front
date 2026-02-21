import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { paths, taskDetailsPath, userProfilePath } from '@/app/router/paths'
import { useAuth } from '@/shared/auth/AuthContext'
import { useI18n } from '@/shared/i18n/I18nContext'
import { refreshTasks, useTasks } from '@/entities/task/lib/useTasks'
import { useUsers } from '@/entities/user/lib/useUsers'
import { refreshAssignments, useTaskAssignments } from '@/entities/taskAssignment/lib/useTaskAssignments'
import { taskAssignmentRepo } from '@/entities/taskAssignment/lib/taskAssignmentRepo'
import { notificationRepo } from '@/entities/notification/lib/notificationRepo'
import './profile.css'
import { StatusPill } from '@/shared/ui/status-pill/StatusPill'
import { useToast } from '@/shared/ui/toast/ToastProvider'
import { notifyToTelegramAndUi } from '@/shared/notify/notify'
import { ApiError, api } from '@/shared/api/api'
import { refreshNotifications } from '@/entities/notification/lib/useNotifications'

const USE_API = import.meta.env.VITE_DATA_SOURCE === 'api'

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

  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set())
  const busyRef = useRef<Set<string>>(new Set())
  const [doneIds, setDoneIds] = useState<Set<string>>(() => new Set())

  const isBusy = (assignmentId: string) => busyRef.current.has(assignmentId) || busyIds.has(assignmentId)
  const isDone = (assignmentId: string) => doneIds.has(assignmentId)
  const markBusy = (assignmentId: string, busy: boolean) => {
    if (busy) busyRef.current.add(assignmentId)
    else busyRef.current.delete(assignmentId)
    setBusyIds((prev) => {
      const next = new Set(prev)
      if (busy) next.add(assignmentId)
      else next.delete(assignmentId)
      return next
    })
  }
  const markDone = (assignmentId: string, done: boolean) => {
    setDoneIds((prev) => {
      const next = new Set(prev)
      if (done) next.add(assignmentId)
      else next.delete(assignmentId)
      return next
    })
  }

  async function postWithFallback<T = any>(paths: string[], body: unknown) {
    let lastErr: unknown = null
    for (const p of paths) {
      try {
        return await api.post<T>(p, body)
      } catch (e) {
        lastErr = e
        if (e instanceof ApiError && e.status === 404) continue
        throw e
      }
    }
    throw lastErr ?? new Error('request_failed')
  }

  async function acceptPauseApi(assignmentId: string) {
    const id = encodeURIComponent(assignmentId)
    await postWithFallback([`/assignments/${id}/accept-pause`, `/assignments/${id}/pause/accept`, `/assignments/${id}/accept_pause`], {})
  }

  async function rejectPauseApi(assignmentId: string) {
    const id = encodeURIComponent(assignmentId)
    await postWithFallback([`/assignments/${id}/reject-pause`, `/assignments/${id}/pause/reject`, `/assignments/${id}/reject_pause`], {})
  }

  const pauseRequests = useMemo(() => {
    if (!customerId) return []
    const myTaskIds = new Set(tasks.filter((x) => x.createdByUserId === customerId).map((x) => x.id))
    return assignments
      .filter((a) => a.status === 'pause_requested' && myTaskIds.has(a.taskId) && !doneIds.has(a.id))
      .slice()
      .sort((a, b) => (b.pauseRequestedAt ?? b.assignedAt).localeCompare(a.pauseRequestedAt ?? a.assignedAt))
  }, [assignments, customerId, doneIds, tasks])

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
                        disabled={isBusy(req.id) || isDone(req.id)}
                        onClick={() => {
                          if (isBusy(req.id) || isDone(req.id)) return
                          // Prevent repeat clicks even if backend is idempotent / refresh lags.
                          markDone(req.id, true)
                          markBusy(req.id, true)

                          if (USE_API) {
                            void (async () => {
                              try {
                                await acceptPauseApi(req.id)
                                await Promise.all([refreshAssignments(), refreshNotifications(), refreshTasks()])
                                void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, text: t('toast.pauseAccepted'), tone: 'success' })
                              } catch (e) {
                                markDone(req.id, false)
                                const msg =
                                  e instanceof ApiError
                                    ? `${e.status ?? 'ERR'} ${String(e.message)}`
                                    : locale === 'ru'
                                      ? 'Не удалось принять паузу.'
                                      : 'Failed to accept pause.'
                                void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, text: msg, tone: 'error' })
                              } finally {
                                markBusy(req.id, false)
                              }
                            })()
                            return
                          }

                          taskAssignmentRepo.acceptPause(req.taskId, req.executorId)
                          notificationRepo.addTaskPauseAccepted({
                            recipientUserId: req.executorId,
                            actorUserId: user.id,
                            taskId: req.taskId,
                          })
                          void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, text: t('toast.pauseAccepted'), tone: 'success' })
                          markBusy(req.id, false)
                        }}
                      >
                        {t('customerRequests.accept')}
                      </button>
                      <button
                        type="button"
                        className="customerTasksApplicationsBtn"
                        style={{ opacity: 0.9 }}
                        disabled={isBusy(req.id) || isDone(req.id)}
                        onClick={() => {
                          if (isBusy(req.id) || isDone(req.id)) return
                          // Prevent repeat clicks even if backend is idempotent / refresh lags.
                          markDone(req.id, true)
                          markBusy(req.id, true)

                          if (USE_API) {
                            void (async () => {
                              try {
                                await rejectPauseApi(req.id)
                                await Promise.all([refreshAssignments(), refreshNotifications(), refreshTasks()])
                                void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, text: t('toast.pauseRejected'), tone: 'info' })
                              } catch (e) {
                                markDone(req.id, false)
                                const msg =
                                  e instanceof ApiError
                                    ? `${e.status ?? 'ERR'} ${String(e.message)}`
                                    : locale === 'ru'
                                      ? 'Не удалось отклонить паузу.'
                                      : 'Failed to reject pause.'
                                void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, text: msg, tone: 'error' })
                              } finally {
                                markBusy(req.id, false)
                              }
                            })()
                            return
                          }

                          taskAssignmentRepo.rejectPause(req.taskId, req.executorId)
                          notificationRepo.addTaskPauseRejected({
                            recipientUserId: req.executorId,
                            actorUserId: user.id,
                            taskId: req.taskId,
                          })
                          void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, text: t('toast.pauseRejected'), tone: 'info' })
                          markBusy(req.id, false)
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

