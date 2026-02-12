import { taskAssignmentRepo } from './taskAssignmentRepo'
import { taskRepo } from '@/entities/task/lib/taskRepo'
import { contractRepo } from '@/entities/contract/lib/contractRepo'
import { disputeRepo } from '@/entities/dispute/lib/disputeRepo'
import { balanceFreezeRepo } from '@/entities/user/lib/balanceFreezeRepo'
import { balanceRepo } from '@/entities/user/lib/balanceRepo'
import { applicationRepo } from '@/entities/task/lib/applicationRepo'
import { notificationRepo } from '@/entities/notification/lib/notificationRepo'
import { disputeArbitrationService } from '@/shared/services/disputeArbitrationService'
import { applyNoStart12hSanctions } from '@/entities/executorSanction/lib/noStartSanctions'
import { applyNoSubmit24hSanctions } from '@/entities/executorSanction/lib/noSubmitSanctions'
import { systemEventRepo } from '@/entities/systemEvent/lib/systemEventRepo'
import { submissionRepo } from '@/entities/submission/lib/submissionRepo'

function ms(iso: string) {
  const v = Date.parse(iso)
  return Number.isFinite(v) ? v : NaN
}

const CUSTOMER_SILENCE_AUTO_ACCEPT_MS = 24 * 60 * 60 * 1000 // X=1 day
const DISPUTE_DURATION_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const ARBITER_SLA_THRESHOLDS_H = [12, 6, 3, 2, 1] as const
// Dev-only: single arbiter account in this app.
const DEV_ARBITER_USER_ID = 'user_dev_arbiter'

function recomputeTaskStatus(taskId: string) {
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

function hasContractActivity(contractId: string) {
  const list = submissionRepo.listForContract(contractId)
  return list.some((s) => {
    if (s.status !== 'submitted') return false
    if (s.files && s.files.length > 0) return true
    if (s.message && s.message.trim()) return true
    return false
  })
}

/**
 * Best-effort background jobs for assignment lifecycle:
 * - remove executor if not started within 12h (pending_start -> removed_auto)
 * - mark overdue if not submitted within 24h after start (in_progress -> overdue)
 * - auto-open dispute 1 day after overdue if customer does nothing
 *
 * Idempotent by status checks + dispute/contract upsert logic.
 */
export function runTaskAssignmentJobs(nowMs: number = Date.now()) {
  // A) Apply finished force majeure events (shift deadlines, idempotent).
  const finishedForceMajeures = systemEventRepo
    .listAll()
    .filter((e) => e.type === 'force_majeure' && typeof e.endAt === 'string' && e.endAt.trim())
  if (finishedForceMajeures.length) {
    const assignments0 = taskAssignmentRepo.listAll()
    for (const e of finishedForceMajeures) {
      const startMs = ms(e.startAt)
      const endMs = e.endAt ? ms(e.endAt) : NaN
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue
      const dur = endMs - startMs
      for (const a of assignments0) {
        if (e.affectedTaskIds && e.affectedTaskIds.length > 0 && !e.affectedTaskIds.includes(a.taskId)) continue
        taskAssignmentRepo.applyForceMajeureShift({
          taskId: a.taskId,
          executorId: a.executorId,
          eventId: e.id,
          durationMs: dur,
        })
      }
    }
  }

  // 0) Best-effort migration: ensure assignment records exist for current task assignments.
  const tasks = taskRepo.list()
  const contracts = contractRepo.listAll()
  for (const task of tasks) {
    for (const executorId of task.assignedExecutorIds ?? []) {
      const existing = taskAssignmentRepo.getForTaskExecutor(task.id, executorId)
      if (existing) continue
      const contract = contracts.find((c) => c.taskId === task.id && c.executorId === executorId) ?? null
      taskAssignmentRepo.createPendingStart({
        taskId: task.id,
        executorId,
        assignedAt: task.takenAt ?? contract?.createdAt ?? task.createdAt,
      })
    }
  }

  // 1) Sync assignment statuses from contract status (best-effort, for idempotency).
  for (const c of contracts) {
    if (c.status === 'submitted') {
      taskAssignmentRepo.markSubmitted(c.taskId, c.executorId, c.updatedAt)
    } else if (c.status === 'revision_requested') {
      taskAssignmentRepo.resumeAfterRevisionRequest(c.taskId, c.executorId, c.updatedAt)
    } else if (c.status === 'approved' || c.status === 'resolved') {
      taskAssignmentRepo.markAccepted(c.taskId, c.executorId, c.updatedAt)
    } else if (c.status === 'disputed') {
      taskAssignmentRepo.openDispute(c.taskId, c.executorId)
    }
  }

  // Refresh after potential migration/sync.
  const assignments = taskAssignmentRepo.listAll()

  // B) Auto-accept submitted work if customer is silent > X days.
  for (const c of contracts) {
    if (c.status !== 'submitted') continue
    if (systemEventRepo.activeForceMajeureForTask(c.taskId, nowMs)) continue
    const latest = submissionRepo.latestForContract(c.id)
    const submittedAtMs = latest ? ms(latest.createdAt) : ms(c.updatedAt ?? c.createdAt)
    if (!Number.isFinite(submittedAtMs)) continue
    if (nowMs - submittedAtMs < CUSTOMER_SILENCE_AUTO_ACCEPT_MS) continue
    // Do not auto-approve if dispute exists/opened.
    const disp = disputeRepo.getForContract(c.id)
    if (disp && disp.status !== 'closed') continue

    contractRepo.setStatus(c.id, 'approved')
    taskAssignmentRepo.markAccepted(c.taskId, c.executorId)

    const claimed = balanceFreezeRepo.claimFor(c.taskId, c.executorId)
    if (claimed) {
      balanceRepo.deposit(claimed.executorId, claimed.amount)
    }
    // Notify executor even when escrow amount is 0.
    notificationRepo.addTaskApproved({
      recipientUserId: c.executorId,
      actorUserId: c.clientId,
      taskId: c.taskId,
    })
    recomputeTaskStatus(c.taskId)
  }

  // 1.5) Pause auto-accept + resume when ended.
  for (const a of assignments) {
    if (a.status === 'pause_requested' && a.pauseAutoAcceptAt) {
      const autoMs = ms(a.pauseAutoAcceptAt)
      if (Number.isFinite(autoMs) && nowMs >= autoMs) {
        taskAssignmentRepo.acceptPause(a.taskId, a.executorId, new Date(nowMs).toISOString())
      }
    }
    if (a.status === 'paused' && a.pausedUntil) {
      const untilMs = ms(a.pausedUntil)
      if (Number.isFinite(untilMs) && nowMs >= untilMs) {
        taskAssignmentRepo.resumeIfPauseEnded(a.taskId, a.executorId, nowMs)
      }
    }
  }

  // 2) Auto-remove if executor didn't start within 12 hours after assignment.
  for (const a of assignments) {
    if (a.status !== 'pending_start') continue
    if (systemEventRepo.activeForceMajeureForTask(a.taskId, nowMs)) continue
    const startDlMs = ms(a.startDeadlineAt)
    if (!Number.isFinite(startDlMs)) continue
    if (nowMs < startDlMs) continue

    // Transition first (idempotent safety).
    const updated = taskAssignmentRepo.removedAuto(a.taskId, a.executorId)
    if (!updated || updated.status !== 'removed_auto') continue

    // Record violation + apply sanctions (idempotent by assignmentId/violationId).
    const { violationId, sanction } = applyNoStart12hSanctions({
      executorId: a.executorId,
      taskId: a.taskId,
      assignmentId: a.id,
      occurredAt: new Date(nowMs).toISOString(),
    })
    if (sanction.kind === 'warning') {
      notificationRepo.addExecutorViolationWarning({
        recipientUserId: a.executorId,
        taskId: a.taskId,
        violationId,
        violationType: 'no_start_12h',
      })
    } else if (sanction.kind === 'rating_penalty') {
      notificationRepo.addExecutorViolationRatingPenalty({
        recipientUserId: a.executorId,
        taskId: a.taskId,
        violationId,
        violationType: 'no_start_12h',
        deltaPercent: sanction.deltaPercent,
      })
    } else if (sanction.kind === 'respond_block') {
      notificationRepo.addExecutorViolationRespondBlock({
        recipientUserId: a.executorId,
        taskId: a.taskId,
        violationId,
        violationType: 'no_start_12h',
        until: sanction.until,
        durationHours: sanction.durationHours,
      })
    } else if (sanction.kind === 'ban') {
      notificationRepo.addExecutorViolationBan({
        recipientUserId: a.executorId,
        taskId: a.taskId,
        violationId,
        violationType: 'no_start_12h',
      })
    }

    const task = taskRepo.getById(a.taskId)
    const customerId = task?.createdByUserId ?? null

    if (customerId) {
      notificationRepo.addTaskExecutorNoStart({
        recipientUserId: customerId,
        executorUserId: a.executorId,
        taskId: a.taskId,
        violationId,
      })
    }

    // Remove executor from task.
    taskRepo.removeExecutor(a.taskId, a.executorId)

    // Cancel contract if exists and return escrow.
    const contract = contractRepo.getForTaskExecutor(a.taskId, a.executorId)
    if (contract) contractRepo.setStatus(contract.id, 'cancelled')
    const released = balanceFreezeRepo.release(a.taskId, a.executorId)
    if (released > 0 && customerId) balanceRepo.deposit(customerId, released)

    // Mark the selected application as rejected (best-effort).
    const apps = applicationRepo.listForTask(a.taskId)
    const app = apps.find((x) => x.executorUserId === a.executorId) ?? null
    if (app && app.status !== 'rejected') applicationRepo.reject(app.id)

    // IMPORTANT: do not notify with "application_cancelled" here.
    // The executor already receives a violation/sanction notification explaining the reason.
  }

  // 3) Mark overdue when execution deadline passes (started + 24h) and nothing submitted.
  for (const a of taskAssignmentRepo.listAll()) {
    if (a.status !== 'in_progress') continue
    if (systemEventRepo.activeForceMajeureForTask(a.taskId, nowMs)) continue
    if (!a.executionDeadlineAt) continue
    const dlMs = ms(a.executionDeadlineAt)
    if (!Number.isFinite(dlMs)) continue
    if (nowMs < dlMs) continue
    const updated = taskAssignmentRepo.markOverdue(a.taskId, a.executorId, new Date(nowMs).toISOString())
    if (!updated || updated.status !== 'overdue') continue

    const { violationId, sanction } = applyNoSubmit24hSanctions({
      executorId: a.executorId,
      taskId: a.taskId,
      assignmentId: updated.id,
      occurredAt: new Date(nowMs).toISOString(),
    })

    if (sanction.kind === 'warning') {
      notificationRepo.addExecutorViolationWarning({
        recipientUserId: a.executorId,
        taskId: a.taskId,
        violationId,
        violationType: 'no_submit_24h',
      })
    } else if (sanction.kind === 'rating_penalty') {
      notificationRepo.addExecutorViolationRatingPenalty({
        recipientUserId: a.executorId,
        taskId: a.taskId,
        violationId,
        violationType: 'no_submit_24h',
        deltaPercent: sanction.deltaPercent,
      })
    } else if (sanction.kind === 'respond_block') {
      notificationRepo.addExecutorViolationRespondBlock({
        recipientUserId: a.executorId,
        taskId: a.taskId,
        violationId,
        violationType: 'no_submit_24h',
        until: sanction.until,
        durationHours: sanction.durationHours,
      })
    } else if (sanction.kind === 'ban') {
      notificationRepo.addExecutorViolationBan({
        recipientUserId: a.executorId,
        taskId: a.taskId,
        violationId,
        violationType: 'no_submit_24h',
      })
    }

    const task = taskRepo.getById(a.taskId)
    const customerId = task?.createdByUserId ?? null
    if (customerId) {
      notificationRepo.addTaskExecutorOverdue({
        recipientUserId: customerId,
        executorUserId: a.executorId,
        taskId: a.taskId,
        violationId,
      })
    }
  }

  // 4) Auto-open dispute 1 day after overdue (if customer did nothing).
  const refreshed = taskAssignmentRepo.listAll()
  for (const a of refreshed) {
    if (a.status !== 'overdue') continue
    if (systemEventRepo.activeForceMajeureForTask(a.taskId, nowMs)) continue
    if (!a.autoDisputeAt) continue
    const autoMs = ms(a.autoDisputeAt)
    if (!Number.isFinite(autoMs)) continue
    if (nowMs < autoMs) continue

    const task = taskRepo.getById(a.taskId)
    const customerId = task?.createdByUserId ?? null
    const contract = contractRepo.getForTaskExecutor(a.taskId, a.executorId)
    if (!contract || !customerId) continue

    // Dispute is allowed only with activity (submitted files/message) + overdue.
    if (!hasContractActivity(contract.id)) continue

    // Upsert dispute + contract state.
    const dispute = disputeRepo.open({
      contractId: contract.id,
      openedByUserId: customerId,
      reason: { categoryId: 'quality', reasonId: 'miss_deadline' },
    })
    notificationRepo.addDisputeOpened({
      recipientUserId: a.executorId,
      actorUserId: customerId,
      taskId: a.taskId,
      disputeId: dispute.id,
    })
    contractRepo.setStatus(contract.id, 'disputed')
    taskAssignmentRepo.openDispute(a.taskId, a.executorId)
  }

  // 5) Limited dispute: if open for 1 day with no actions -> auto-decision.
  const disputes = disputeRepo.listAll().filter((d) => d.status === 'open')
  for (const d of disputes) {
    const createdAtMs = ms(d.createdAt)
    if (!Number.isFinite(createdAtMs)) continue
    if (nowMs - createdAtMs < DISPUTE_DURATION_MS) continue

    const contract = contractRepo.getById(d.contractId)
    if (!contract) continue
    const hasActivity = hasContractActivity(contract.id)

    // Route money movement through the safe arbitration service.
    // First transition dispute into "in_review" so it can be decided.
    const before = d.version ?? 1
    const inWork = disputeRepo.takeInWork({ disputeId: d.id, arbiterId: 'system', expectedVersion: before })
    if (!inWork) continue

    try {
      if (!hasActivity) {
        disputeArbitrationService.decideAndExecute({
          disputeId: d.id,
          actorUserId: 'system',
          expectedVersion: inWork.version ?? before + 1,
          decisionKind: 'refund_to_customer',
          comment: 'auto: no activity after 24h',
          checklist: { requirementsChecked: true, videoReviewed: true, chatReviewed: true },
          closeAfter: true,
        })
      } else {
        const frozen =
          balanceFreezeRepo.listForTask(contract.taskId).find((e) => e.executorId === contract.executorId)?.amount ?? 0
        const half = Math.round((frozen / 2) * 100) / 100
        disputeArbitrationService.decideAndExecute({
          disputeId: d.id,
          actorUserId: 'system',
          expectedVersion: inWork.version ?? before + 1,
          decisionKind: 'partial_refund',
          partial: { executorAmount: half, customerAmount: frozen - half },
          comment: 'auto: activity exists, split 50/50 after 24h',
          checklist: { requirementsChecked: true, videoReviewed: true, chatReviewed: true },
          closeAfter: true,
        })
      }
    } catch {
      // ignore auto decision failures
      continue
    }
  }

  // 6) Dispute SLA threshold notifications for arbiter (12/6/3/2/1h left).
  // Best-effort: if tab was sleeping, several thresholds can be created at once.
  for (const d of disputeRepo.listAll()) {
    if (d.status === 'closed') continue
    if (!d.slaDueAt) continue
    const dueMs = ms(d.slaDueAt)
    if (!Number.isFinite(dueMs)) continue
    const leftMs = dueMs - nowMs
    if (leftMs <= 0) continue

    const contract = contractRepo.getById(d.contractId)
    if (!contract) continue

    const recipientUserId = d.assignedArbiterId ?? DEV_ARBITER_USER_ID
    for (const h of ARBITER_SLA_THRESHOLDS_H) {
      const thresholdMs = h * HOUR_MS
      if (leftMs <= thresholdMs) {
        notificationRepo.addDisputeSlaThreshold({
          recipientUserId,
          actorUserId: 'system',
          taskId: contract.taskId,
          disputeId: d.id,
          hoursLeft: h,
        })
      }
    }
  }
}

