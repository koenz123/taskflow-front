import { Link, useNavigate } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { paths, taskDetailsPath, taskEditPath } from '@/app/router/paths'
import { useI18n } from '@/shared/i18n/I18nContext'
import { useAuth } from '@/shared/auth/AuthContext'
import { useTasks } from '@/entities/task/lib/useTasks'
import { pickText } from '@/entities/task/lib/taskText'
import { taskRepo } from '@/entities/task/lib/taskRepo'
import { contractRepo } from '@/entities/contract/lib/contractRepo'
import { balanceFreezeRepo } from '@/entities/user/lib/balanceFreezeRepo'
import { taskAssignmentRepo } from '@/entities/taskAssignment/lib/taskAssignmentRepo'
import './profile.css'
import { StatusPill } from '@/shared/ui/status-pill/StatusPill'
import { Icon } from '@/shared/ui/icon/Icon'

export function ArchivesPage() {
  const { t, locale } = useI18n()
  const auth = useAuth()
  const user0 = auth.user!
  const navigate = useNavigate()
  const tasks = useTasks()
  const [confirmRepostTaskId, setConfirmRepostTaskId] = useState<string | null>(null)
  const [confirmDeleteTaskId, setConfirmDeleteTaskId] = useState<string | null>(null)

  const user = user0.role === 'customer' ? user0 : null

  const archivedTasks = useMemo(() => {
    if (!user) return []
    return tasks.filter((task) => task.createdByUserId === user.id && task.status === 'archived')
  }, [tasks, user])

  const confirmTask = useMemo(
    () => (confirmRepostTaskId ? archivedTasks.find((x) => x.id === confirmRepostTaskId) ?? null : null),
    [confirmRepostTaskId, archivedTasks],
  )
  const deleteTask = useMemo(
    () => (confirmDeleteTaskId ? archivedTasks.find((x) => x.id === confirmDeleteTaskId) ?? null : null),
    [confirmDeleteTaskId, archivedTasks],
  )

  if (user0.role !== 'customer') {
    return (
      <main className="customerTasksPage">
        <div className="customerTasksContainer">
          <h1 className="customerTasksTitle">{t('customerTasks.archive.title')}</h1>
          <p style={{ opacity: 0.8 }}>{t('customerRequests.onlyCustomer')}</p>
        </div>
      </main>
    )
  }

  const handleRepost = (taskId: string) => {
    taskRepo.repost(taskId)
  }

  const canDeleteTask = (taskId: string) => {
    const hasContracts = contractRepo.listForTask(taskId).length > 0
    const hasAssignments = taskAssignmentRepo.listForTask(taskId).length > 0
    const hasFrozen = balanceFreezeRepo.listForTask(taskId).length > 0
    return !hasContracts && !hasAssignments && !hasFrozen
  }

  return (
    <main className="customerTasksPage">
      <div className="customerTasksContainer">
        <div className="customerTasksHeader">
          <div className="customerTasksHeaderTop">
            <h1 className="customerTasksTitle">{t('customerTasks.archive.title')}</h1>
          </div>
          <div className="customerTasksControls">
            <Link className="customerTasksArchiveBtn" to={paths.customerTasks}>
              ← {t('customerTasks.archive.backToTasks')}
            </Link>
          </div>
        </div>

        <div className="customerTasksContent">
          {archivedTasks.length === 0 ? (
            <div className="customerTasksEmpty">{t('customerTasks.archive.empty')}</div>
          ) : (
            <ul className="customerTasksList">
              {archivedTasks.map((task) => (
                <li
                  key={task.id}
                  className="customerTasksItem"
                  role="link"
                  tabIndex={0}
                  onClick={(e) => {
                    const target = e.target
                    if (target instanceof HTMLElement) {
                      if (target.closest('a,button,input,textarea,select,[role="button"]')) return
                    }
                    navigate(taskDetailsPath(task.id), { state: { backTo: paths.customerArchive } })
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      navigate(taskDetailsPath(task.id), { state: { backTo: paths.customerArchive } })
                    }
                  }}
                >
                  <div className="customerTasksItemContent">
                    <div className="customerTasksItemHeader">
                      <Link className="customerTasksItemTitle" to={taskDetailsPath(task.id)} state={{ backTo: paths.customerArchive }}>
                        {pickText(task.title, locale)}
                      </Link>
                      <StatusPill tone="archived" label={t('task.status.archived')} />
                    </div>

                    {task.dueDate ? (
                      <div className="customerTasksItemBadges">
                        <span className="customerTasksItemBadge">
                          <Icon name="calendar" size={16} className="iconInline" />
                          {t('tasks.due')}: {task.dueDate}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <div className="customerTasksItemActions" style={{ gap: 10 }}>
                    <button
                      type="button"
                      className="customerTasksApplicationsBtn"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setConfirmRepostTaskId(task.id)
                      }}
                    >
                      {t('customerTasks.archive.restore')}
                    </button>
                    <Link
                      className="customerTasksApplicationsBtn"
                      style={{ opacity: 0.9 }}
                      to={taskEditPath(task.id)}
                      state={{ backTo: paths.customerArchive }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {t('task.details.edit')}
                    </Link>
                    <button
                      type="button"
                      className="customerTasksApplicationsBtn"
                      style={{ opacity: 0.9 }}
                      disabled={!canDeleteTask(task.id)}
                      title={
                        !canDeleteTask(task.id)
                          ? (locale === 'ru'
                              ? 'Нельзя удалить: есть связанные назначения/контракты или замороженные средства.'
                              : 'Cannot delete: task has assignments/contracts or frozen funds.')
                          : undefined
                      }
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        if (!canDeleteTask(task.id)) return
                        setConfirmDeleteTaskId(task.id)
                      }}
                    >
                      {t('task.actions.delete')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {confirmTask ? (
        <div
          className="profileModalOverlay"
          role="dialog"
          aria-modal="true"
          aria-label={t('profile.repostConfirm.title')}
          onClick={() => setConfirmRepostTaskId(null)}
        >
          <div className="profileModal" onClick={(e) => e.stopPropagation()}>
            <div className="profileModalHeader">
              <h2 className="profileModalTitle">{t('profile.repostConfirm.title')}</h2>
              <button
                type="button"
                className="profileModalClose"
                onClick={() => setConfirmRepostTaskId(null)}
                aria-label={t('common.cancel')}
              >
                ×
              </button>
            </div>

            <p style={{ margin: '6px 0 14px', opacity: 0.9 }}>{t('profile.repostConfirm.text')}</p>

            <div className="profileConfirmActions">
              <button
                type="button"
                className="profileBtn profileBtn--success"
                onClick={() => {
                  handleRepost(confirmTask.id)
                  setConfirmRepostTaskId(null)
                }}
              >
                {t('common.yes')}
              </button>
              <button
                type="button"
                className="profileBtn profileBtn--danger"
                onClick={() => setConfirmRepostTaskId(null)}
              >
                {t('common.no')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTask ? (
        <div
          className="profileModalOverlay"
          role="dialog"
          aria-modal="true"
          aria-label={t('task.actions.delete')}
          onClick={() => setConfirmDeleteTaskId(null)}
        >
          <div className="profileModal" onClick={(e) => e.stopPropagation()}>
            <div className="profileModalHeader">
              <h2 className="profileModalTitle">{t('task.actions.delete')}</h2>
              <button
                type="button"
                className="profileModalClose"
                onClick={() => setConfirmDeleteTaskId(null)}
                aria-label={t('common.cancel')}
              >
                ×
              </button>
            </div>

            <p style={{ margin: '6px 0 14px', opacity: 0.9 }}>{t('task.actions.deleteConfirm')}</p>

            <div className="profileConfirmActions">
              <button
                type="button"
                className="profileBtn profileBtn--danger"
                onClick={() => {
                  taskRepo.delete(deleteTask.id)
                  setConfirmDeleteTaskId(null)
                }}
              >
                {t('task.actions.delete')}
              </button>
              <button type="button" className="profileBtn" onClick={() => setConfirmDeleteTaskId(null)}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
