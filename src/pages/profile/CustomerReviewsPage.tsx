import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { disputeThreadPath, paths, taskDetailsPath, userProfilePath } from '@/app/router/paths'
import { useAuth } from '@/shared/auth/AuthContext'
import { useI18n } from '@/shared/i18n/I18nContext'
import { useTasks } from '@/entities/task/lib/useTasks'
import { useUsers } from '@/entities/user/lib/useUsers'
import { taskRepo } from '@/entities/task/lib/taskRepo'
import { pickText } from '@/entities/task/lib/taskText'
import { balanceFreezeRepo } from '@/entities/user/lib/balanceFreezeRepo'
import { balanceRepo } from '@/entities/user/lib/balanceRepo'
import { notificationRepo } from '@/entities/notification/lib/notificationRepo'
import { useContracts } from '@/entities/contract/lib/useContracts'
import { contractRepo } from '@/entities/contract/lib/contractRepo'
import { useSubmissions } from '@/entities/submission/lib/useSubmissions'
import { useDisputes } from '@/entities/dispute/lib/useDisputes'
import { disputeRepo } from '@/entities/dispute/lib/disputeRepo'
import { useDevMode } from '@/shared/dev/devMode'
import { RatingModal } from '@/features/rating/RatingModal'
import { createRatingApi, refreshRatings } from '@/entities/rating/lib/useRatings'
import { ratingRepo } from '@/entities/rating/lib/ratingRepo'
import { RevisionRequestModal } from '@/features/revision/RevisionRequestModal'
import { disputeArbitrationService } from '@/shared/services/disputeArbitrationService'
import './profile.css'
import { taskAssignmentRepo } from '@/entities/taskAssignment/lib/taskAssignmentRepo'
import { useTaskAssignments } from '@/entities/taskAssignment/lib/useTaskAssignments'
import { StatusPill } from '@/shared/ui/status-pill/StatusPill'
import { ApiError, api } from '@/shared/api/api'
import { refreshDisputes } from '@/entities/dispute/lib/useDisputes'
import { refreshContracts } from '@/entities/contract/lib/useContracts'
import { refreshAssignments } from '@/entities/taskAssignment/lib/useTaskAssignments'
import { refreshTasks } from '@/entities/task/lib/useTasks'
import { refreshNotifications } from '@/entities/notification/lib/useNotifications'

const USE_API = import.meta.env.VITE_DATA_SOURCE === 'api'

export function CustomerReviewsPage() {
  const { t, locale } = useI18n()
  const auth = useAuth()
  const user = auth.user!
  const devMode = useDevMode()
  const navigate = useNavigate()
  const tasks = useTasks()
  const users = useUsers()
  const contracts = useContracts()
  const submissions = useSubmissions()
  const disputes = useDisputes()
  const taskAssignments = useTaskAssignments()
  const [ratingContractId, setRatingContractId] = useState<string | null>(null)
  const [revisionModalContractId, setRevisionModalContractId] = useState<string | null>(null)
  const [blockedModal, setBlockedModal] = useState<null | { title: string; message: string }>(null)

  const customerId = user.role === 'customer' ? user.id : null

  const reviewContracts = useMemo(() => {
    if (!customerId) return []
    const bySubmissionTime = (c: (typeof contracts)[number]) => {
      const subId = c.lastSubmissionId
      const sub = subId ? submissions.find((s) => s.id === subId) ?? null : null
      return sub?.createdAt ?? c.updatedAt ?? c.createdAt
    }
    return contracts
      .filter((c) => c.clientId === customerId)
      .filter((c) => c.status === 'submitted' || c.status === 'disputed')
      .slice()
      .sort((a, b) => bySubmissionTime(b).localeCompare(bySubmissionTime(a)))
  }, [contracts, customerId, submissions])

  if (user.role !== 'customer') {
    return (
      <main className="customerTasksPage">
        <div className="customerTasksContainer">
          <h1 className="customerTasksTitle">{t('customerReview.title')}</h1>
          <p style={{ opacity: 0.8 }}>{t('customerReview.onlyCustomer')}</p>
        </div>
      </main>
    )
  }

  const recomputeTaskStatus = (taskId: string) => {
    const task = taskRepo.getById(taskId)
    if (!task) return

    const list = contractRepo.listForTask(taskId)
    const hasDispute = list.some((c) => c.status === 'disputed')
    const hasReviewLike = list.some((c) => c.status === 'submitted')
    const hasActive = list.some((c) => c.status === 'active' || c.status === 'revision_requested')
    const allContractsDone =
      list.length > 0 &&
      list.every((c) => c.status === 'approved' || c.status === 'resolved' || c.status === 'cancelled')

    const assignedCount = task.assignedExecutorIds.length
    const maxExecutors = task.maxExecutors ?? 1
    const hasSlots = assignedCount < maxExecutors

    // Important: if there are still free executor slots, the task must remain visible to other executors.
    // So we only mark the task as closed when slots are full AND all contracts are finished.
    const shouldClose = !hasSlots && allContractsDone

    const nextStatus = shouldClose
      ? 'closed'
      : hasDispute
        ? 'dispute'
        : hasReviewLike
          ? 'review'
        : hasActive || assignedCount > 0
          ? 'in_progress'
          : 'open'

    taskRepo.update(taskId, (prev) => ({
      ...prev,
      status: nextStatus,
      completedAt: shouldClose ? new Date().toISOString() : prev.completedAt,
    }))
  }

  const approve = (contractId: string) => {
    const contract = USE_API ? (contracts.find((c) => c.id === contractId) ?? null) : contractRepo.getById(contractId)
    if (!contract) return

    const assignment = USE_API
      ? taskAssignments.find((a) => a.taskId === contract.taskId && a.executorId === contract.executorId) ?? null
      : taskAssignmentRepo.getForTaskExecutor(contract.taskId, contract.executorId)
    if (!assignment?.startedAt) {
      const msg =
        locale === 'ru'
          ? 'Нельзя принять и оставить отзыв, если исполнитель не нажал «Начать работу».'
          : 'Cannot approve and leave a review unless the executor clicked “Start work”.'
      setBlockedModal({
        title: locale === 'ru' ? 'Нельзя принять работу' : 'Cannot approve',
        message: msg,
      })
      return
    }

    if (USE_API) {
      void (async () => {
        try {
          await api.post(`/contracts/${encodeURIComponent(contract.id)}/approve`, {})
          await Promise.all([refreshContracts(), refreshAssignments(), refreshTasks(), refreshNotifications()])
          setRatingContractId(contract.id)
        } catch (e) {
          const msg =
            e instanceof ApiError
              ? `${e.status ?? 'ERR'} ${String(e.message)}`
              : locale === 'ru'
                ? 'Не удалось принять работу.'
                : 'Failed to approve.'
          setBlockedModal({ title: locale === 'ru' ? 'Ошибка' : 'Error', message: msg })
        }
      })()
      return
    }

    contractRepo.setStatus(contract.id, 'approved')
    taskAssignmentRepo.markAccepted(contract.taskId, contract.executorId)

    const claimed = balanceFreezeRepo.claimFor(contract.taskId, contract.executorId)
    if (claimed) {
      balanceRepo.deposit(claimed.executorId, claimed.amount)
    }

    // Notify executor even when escrow amount is 0.
    notificationRepo.addTaskApproved({
      recipientUserId: contract.executorId,
      actorUserId: auth.user!.id,
      taskId: contract.taskId,
    })
    notificationRepo.addRateCustomer({
      recipientUserId: contract.executorId,
      actorUserId: auth.user!.id,
      taskId: contract.taskId,
    })

    recomputeTaskStatus(contract.taskId)
    setRatingContractId(contract.id)
  }

  const requestRevision = (contractId: string, message: string) => {
    const contract = USE_API ? (contracts.find((c) => c.id === contractId) ?? null) : contractRepo.getById(contractId)
    if (!contract) return
    // Allow only limited revision requests per contract (usually 2).
    const included = contract.revisionIncluded ?? 0
    const used = contract.revisionUsed ?? 0
    if (included <= 0) return
    if (used >= included) return

    if (USE_API) {
      void (async () => {
        try {
          const id = encodeURIComponent(contract.id)
          try {
            await api.post(`/contracts/${id}/request-revision`, { message })
          } catch (e) {
            // Back-compat: older backends used /revision
            if (e instanceof ApiError && e.status === 404) {
              await api.post(`/contracts/${id}/revision`, { message })
            } else {
              throw e
            }
          }
          await Promise.all([refreshContracts(), refreshAssignments(), refreshTasks(), refreshNotifications()])
        } catch (e) {
          const msg =
            e instanceof ApiError
              ? `${e.status ?? 'ERR'} ${String(e.message)}`
              : locale === 'ru'
                ? 'Не удалось отправить на доработку.'
                : 'Failed to request revision.'
          setBlockedModal({ title: locale === 'ru' ? 'Ошибка' : 'Error', message: msg })
        }
      })()
      return
    }

    contractRepo.setStatus(contract.id, 'revision_requested')
    contractRepo.incrementRevisionUsed(contract.id)
    // Executor should be able to continue work immediately (submitted -> in_progress).
    taskAssignmentRepo.resumeAfterRevisionRequest(contract.taskId, contract.executorId)
    contractRepo.update(contract.id, (c) => ({
      ...c,
      lastRevisionMessage: message.trim() || undefined,
      lastRevisionRequestedAt: new Date().toISOString(),
    }))

    notificationRepo.addTaskRevision({
      recipientUserId: contract.executorId,
      actorUserId: auth.user!.id,
      taskId: contract.taskId,
      message,
    })

    recomputeTaskStatus(contract.taskId)
  }

  const openDispute = (contractId: string) => {
    const contract = USE_API ? (contracts.find((c) => c.id === contractId) ?? null) : contractRepo.getById(contractId)
    if (!contract) return
    if (contract.status === 'disputed' || contract.status === 'resolved' || contract.status === 'approved' || contract.status === 'cancelled') {
      return
    }
    const used = contract.revisionUsed ?? 0
    if (used < 2) return

    if (USE_API) {
      void (async () => {
        try {
          const created = await api.post<any>(`/disputes`, {
            contractId: contract.id,
            reason: { categoryId: 'universal', reasonId: 'other' },
          })
          await Promise.all([refreshDisputes(), refreshContracts(), refreshAssignments(), refreshTasks(), refreshNotifications()])
          const id = typeof created?.id === 'string' ? created.id : (disputes.find((d) => d.contractId === contract.id)?.id ?? null)
          if (id) navigate(disputeThreadPath(id))
        } catch (e) {
          const msg =
            e instanceof ApiError ? `${e.status ?? 'ERR'} ${String(e.message)}` : locale === 'ru' ? 'Не удалось открыть спор.' : 'Failed to open dispute.'
          setBlockedModal({ title: locale === 'ru' ? 'Спор' : 'Dispute', message: msg })
        }
      })()
      return
    }

    const dispute = disputeRepo.open({
      contractId: contract.id,
      openedByUserId: user.id,
      reason: { categoryId: 'universal', reasonId: 'other' },
    })
    notificationRepo.addDisputeOpened({
      recipientUserId: contract.executorId,
      actorUserId: user.id,
      taskId: contract.taskId,
      disputeId: dispute.id,
    })
    contractRepo.setStatus(contract.id, 'disputed')
    taskAssignmentRepo.openDispute(contract.taskId, contract.executorId)
    recomputeTaskStatus(contract.taskId)
    navigate(disputeThreadPath(dispute.id))
  }

  const resolveDisputeDev = (contractId: string, decision: 'executor' | 'customer' | 'split') => {
    const contract = contractRepo.getById(contractId)
    if (!contract) return

    const dispute = disputeRepo.getForContract(contract.id)
    if (!dispute) return
    const before = dispute.version ?? 1
    const inWork = disputeRepo.takeInWork({ disputeId: dispute.id, arbiterId: 'system', expectedVersion: before })
    if (!inWork) return

    const frozen = balanceFreezeRepo.listForTask(contract.taskId).find((e) => e.executorId === contract.executorId)?.amount ?? 0
    const half = Math.round((frozen / 2) * 100) / 100

    disputeArbitrationService.decideAndExecute({
      disputeId: dispute.id,
      actorUserId: 'system',
      expectedVersion: inWork.version ?? before + 1,
      decisionKind: decision === 'executor' ? 'release_to_executor' : decision === 'customer' ? 'refund_to_customer' : 'partial_refund',
      partial: decision === 'split' ? { executorAmount: half, customerAmount: frozen - half } : undefined,
      comment: `dev: resolve dispute (${decision})`,
      checklist: { requirementsChecked: true, videoReviewed: true, chatReviewed: true },
      closeAfter: true,
    })

    // Keep notification simple: re-use approval notification as a signal payout happened.
    if (decision === 'executor') {
      notificationRepo.addTaskApproved({
        recipientUserId: contract.executorId,
        actorUserId: auth.user!.id,
        taskId: contract.taskId,
      })
    }

    setRatingContractId(contract.id)
  }

  return (
    <main className="customerTasksPage">
      <div className="customerTasksContainer">
        <div className="customerTasksHeader">
          <div className="customerTasksHeaderTop">
            <h1 className="customerTasksTitle">{t('customerReview.title')}</h1>
            <p className="customerTasksSubtitle">{t('customerReview.subtitle')}</p>
          </div>
          <div className="customerTasksControls">
            <Link className="customerTasksArchiveBtn" to={paths.customerTasks}>
              ← {t('customerReview.backToMyTasks')}
            </Link>
          </div>
        </div>

        <div className="customerTasksContent">
          {reviewContracts.length === 0 ? (
            <div className="customerTasksEmpty">{t('customerReview.empty')}</div>
          ) : (
            <ul className="customerTasksList">
              {reviewContracts.map((contract) => {
                const task = tasks.find((x) => x.id === contract.taskId) ?? null
                const executor = users.find((u) => u.id === contract.executorId) ?? null
                const dispute = disputes.find((d) => d.contractId === contract.id) ?? null
                const started = Boolean(
                  USE_API
                    ? taskAssignments.find((a) => a.taskId === contract.taskId && a.executorId === contract.executorId)?.startedAt
                    : taskAssignmentRepo.getForTaskExecutor(contract.taskId, contract.executorId)?.startedAt,
                )
                const latestForContract = submissions
                  .filter((s) => s.contractId === contract.id && s.status === 'submitted')
                  .slice()
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
                const submission =
                  (contract.lastSubmissionId
                    ? submissions.find((s) => s.id === contract.lastSubmissionId) ?? null
                    : null) ?? latestForContract
                const submittedAt = submission?.createdAt ?? contract.updatedAt ?? contract.createdAt
                const externalFiles =
                  submission?.files.filter((f) => f.kind === 'external_url' || f.kind === 'upload') ?? []
                const isDisputed = contract.status === 'disputed'
                const revisionIncluded = contract.revisionIncluded ?? 0
                const revisionUsed = contract.revisionUsed ?? 0
                const revisionRemaining = Math.max(0, revisionIncluded - revisionUsed)
                const canShowRevisionButton = revisionRemaining > 0
                return (
                  <li
                    key={contract.id}
                    className="customerTasksItem"
                    role="link"
                    tabIndex={0}
                    onClick={(e) => {
                      if (!task) return
                      const target = e.target
                      if (target instanceof HTMLElement) {
                        if (target.closest('a,button,input,textarea,select,[role="button"]')) return
                      }
                      navigate(taskDetailsPath(task.id), { state: { backTo: paths.customerReview } })
                    }}
                    onKeyDown={(e) => {
                      if (!task) return
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        navigate(taskDetailsPath(task.id), { state: { backTo: paths.customerReview } })
                      }
                    }}
                  >
                    <div className="customerTasksItemContent">
                      <div className="customerTasksItemHeader">
                        {task ? (
                          <Link className="customerTasksItemTitle" to={taskDetailsPath(task.id)} state={{ backTo: paths.customerReview }}>
                            {pickText(task.title, locale)}
                          </Link>
                        ) : (
                          <span className="customerTasksItemTitle" style={{ opacity: 0.85 }}>
                            {t('task.details.notFound')}
                          </span>
                        )}
                        <StatusPill
                          tone={contract.status === 'disputed' ? 'dispute' : 'review'}
                          label={contract.status === 'disputed' ? t('task.status.dispute') : t('task.status.review')}
                        />
                      </div>
                      <div className="customerTasksItemBadges">
                        <span className="customerTasksItemBadge">
                          🕒 {t('customerReview.submitted')}: {new Date(submittedAt).toLocaleString()}
                        </span>
                        {executor ? (
                          <span className="customerTasksItemBadge">
                            {t('profile.takenBy')}{' '}
                            <Link to={userProfilePath(executor.id)}>{executor.fullName}</Link>
                          </span>
                        ) : null}
                        {externalFiles.length
                          ? externalFiles.map((f, idx) => (
                              <span key={`${f.url}-${idx}`} className="customerTasksItemBadge customerTasksItemBadge--link">
                                <a href={f.url} target="_blank" rel="noreferrer">
                                  🎬 {f.title ? `${t('task.completionLink')}: ${f.title}` : t('task.completionLink')}
                                </a>
                              </span>
                            ))
                          : null}
                        {isDisputed ? (
                          <span className="customerTasksItemBadge" style={{ color: 'rgba(239,68,68,0.9)' }}>
                            {locale === 'ru' ? '⚖️ Спор открыт' : '⚖️ Dispute opened'}
                          </span>
                        ) : null}
                        {isDisputed && dispute?.reason?.reasonId ? (
                          <span className="customerTasksItemBadge" style={{ opacity: 0.8 }}>
                            {locale === 'ru' ? 'Причина' : 'Reason'}: {dispute.reason.reasonId}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="customerTasksItemActions" style={{ gap: 10 }}>
                      <button
                        type="button"
                        className="customerTasksApplicationsBtn"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          if (isDisputed) {
                            setBlockedModal({
                              title: locale === 'ru' ? 'Нельзя принять работу' : 'Cannot approve',
                              message:
                                locale === 'ru'
                                  ? 'Пока открыт спор, принять работу нельзя. Перейдите в спор и дождитесь решения арбитра.'
                                  : 'You cannot approve while the dispute is open. Open the dispute and wait for arbitration.',
                            })
                            return
                          }
                          if (!started) {
                            setBlockedModal({
                              title: locale === 'ru' ? 'Нельзя принять работу' : 'Cannot approve',
                              message:
                                locale === 'ru'
                                  ? 'Нельзя принять работу, если исполнитель не нажал «Начать работу».'
                                  : 'Cannot approve unless the executor clicked “Start work”.',
                            })
                            return
                          }
                          approve(contract.id)
                        }}
                        title={
                          isDisputed
                            ? (locale === 'ru' ? 'Недоступно во время спора' : 'Unavailable during dispute')
                            : !started
                              ? locale === 'ru'
                                ? 'Исполнитель не нажал «Начать работу»'
                                : 'Executor did not click “Start work”'
                              : undefined
                        }
                        style={isDisputed || !started ? { opacity: 0.7 } : undefined}
                      >
                        {t('customerReview.approve')}
                      </button>
                      {canShowRevisionButton ? (
                        <button
                          type="button"
                          className="customerTasksApplicationsBtn"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setRevisionModalContractId(contract.id)
                          }}
                          style={{ opacity: 0.9 }}
                          disabled={isDisputed}
                          title={
                            isDisputed
                              ? (locale === 'ru' ? 'Недоступно во время спора' : 'Unavailable during dispute')
                              : undefined
                          }
                        >
                          {t('customerReview.revision')}
                        </button>
                      ) : null}
                      {revisionUsed >= 2 ? (
                        <button
                          type="button"
                          className="customerTasksApplicationsBtn"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            if (isDisputed) {
                              if (dispute) {
                                navigate(disputeThreadPath(dispute.id))
                              } else {
                                setBlockedModal({
                                  title: locale === 'ru' ? 'Спор' : 'Dispute',
                                  message:
                                    locale === 'ru'
                                      ? 'Спор уже открыт, но не удалось найти его в списке.'
                                      : 'The dispute is already open, but it was not found.',
                                })
                              }
                              return
                            }
                            openDispute(contract.id)
                          }}
                          style={{ opacity: 0.9 }}
                        >
                          {isDisputed
                            ? locale === 'ru'
                              ? 'Перейти в спор'
                              : 'Open dispute'
                            : locale === 'ru'
                              ? 'Спор'
                              : 'Dispute'}
                        </button>
                      ) : null}
                      {contract.status === 'disputed' && devMode.enabled ? (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="customerTasksApplicationsBtn"
                            onClick={() => resolveDisputeDev(contract.id, 'executor')}
                          >
                            {locale === 'ru' ? 'Решить: 100% исполнителю' : 'Resolve: 100% executor'}
                          </button>
                          <button
                            type="button"
                            className="customerTasksApplicationsBtn"
                            onClick={() => resolveDisputeDev(contract.id, 'customer')}
                          >
                            {locale === 'ru' ? 'Решить: 100% заказчику' : 'Resolve: 100% customer'}
                          </button>
                          <button
                            type="button"
                            className="customerTasksApplicationsBtn"
                            onClick={() => resolveDisputeDev(contract.id, 'split')}
                          >
                            {locale === 'ru' ? 'Решить: 50/50' : 'Resolve: 50/50'}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      <RatingModal
        open={Boolean(ratingContractId)}
        subjectName={(() => {
          const c = ratingContractId
            ? USE_API
              ? contracts.find((x) => x.id === ratingContractId) ?? null
              : contractRepo.getById(ratingContractId)
            : null
          const u = c ? users.find((x) => x.id === c.executorId) ?? null : null
          return u?.fullName
        })()}
        onClose={() => setRatingContractId(null)}
        onSubmit={({ rating, comment }) => {
          if (!ratingContractId || !auth.user) return
          const c = USE_API ? contracts.find((x) => x.id === ratingContractId) ?? null : contractRepo.getById(ratingContractId)
          if (!c) return
          if (USE_API) {
            void (async () => {
              try {
                await createRatingApi({ contractId: c.id, toUserId: c.executorId, rating, comment })
                await Promise.all([refreshRatings(), refreshNotifications()])
                setRatingContractId(null)
              } catch (e) {
                const msg =
                  e instanceof ApiError
                    ? `${e.status ?? 'ERR'} ${String(e.message)}`
                    : locale === 'ru'
                      ? 'Не удалось отправить оценку.'
                      : 'Failed to submit rating.'
                setBlockedModal({ title: locale === 'ru' ? 'Ошибка' : 'Error', message: msg })
              }
            })()
            return
          }
          ratingRepo.upsert({
            contractId: c.id,
            fromUserId: auth.user.id,
            toUserId: c.executorId,
            rating,
            comment,
          })
          setRatingContractId(null)
        }}
      />

      <RevisionRequestModal
        open={Boolean(revisionModalContractId)}
        executorName={(() => {
          const c = revisionModalContractId
            ? USE_API
              ? contracts.find((x) => x.id === revisionModalContractId) ?? null
              : contractRepo.getById(revisionModalContractId)
            : null
          const u = c ? users.find((x) => x.id === c.executorId) ?? null : null
          return u?.fullName
        })()}
        onClose={() => setRevisionModalContractId(null)}
        onSubmit={(message) => {
          if (!revisionModalContractId) return
          requestRevision(revisionModalContractId, message)
          setRevisionModalContractId(null)
        }}
      />

      {blockedModal ? (
        <div
          className="profileModalOverlay"
          role="dialog"
          aria-modal="true"
          aria-label={blockedModal.title}
          onClick={() => setBlockedModal(null)}
        >
          <div className="profileModal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(560px, 100%)' }}>
            <div className="profileModalHeader">
              <h2 className="profileModalTitle">{blockedModal.title}</h2>
              <button
                type="button"
                className="profileModalClose"
                onClick={() => setBlockedModal(null)}
                aria-label={t('common.cancel')}
              >
                ×
              </button>
            </div>
            <div style={{ opacity: 0.92, lineHeight: 1.5 }}>{blockedModal.message}</div>
            <div className="profileConfirmActions" style={{ marginTop: 14 }}>
              <button type="button" className="profileBtn" onClick={() => setBlockedModal(null)}>
                {locale === 'ru' ? 'Ок' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

