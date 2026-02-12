import { disputeRepo } from '@/entities/dispute/lib/disputeRepo'
import type { DisputeDecision } from '@/entities/dispute/model/dispute'
import { contractRepo } from '@/entities/contract/lib/contractRepo'
import { balanceFreezeRepo } from '@/entities/user/lib/balanceFreezeRepo'
import { balanceRepo } from '@/entities/user/lib/balanceRepo'
import { taskAssignmentRepo } from '@/entities/taskAssignment/lib/taskAssignmentRepo'
import { taskRepo } from '@/entities/task/lib/taskRepo'
import { disputeMessageRepo } from '@/entities/disputeMessage/lib/disputeMessageRepo'
import { auditLogRepo } from '@/entities/auditLog/lib/auditLogRepo'
import { notificationRepo } from '@/entities/notification/lib/notificationRepo'

export type ArbitrationDecisionKind =
  | 'release_to_executor'
  | 'refund_to_customer'
  | 'partial_refund'
  | 'redo_required'
  | 'no_action'

export type ArbitrationChecklist = {
  requirementsChecked: boolean
  videoReviewed: boolean
  chatReviewed: boolean
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message)
}

function recomputeTaskStatus(taskId: string) {
  const task = taskRepo.getById(taskId)
  if (!task) return

  const list = contractRepo.listForTask(taskId)
  const hasDispute = list.some((c) => c.status === 'disputed')
  const hasReviewLike = list.some((c) => c.status === 'submitted')
  const hasActive = list.some((c) => c.status === 'active' || c.status === 'revision_requested')
  const allContractsDone =
    list.length > 0 && list.every((c) => c.status === 'approved' || c.status === 'resolved' || c.status === 'cancelled')

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

function round2(n: number) {
  return Math.round(n * 100) / 100
}

export const disputeArbitrationService = {
  /**
   * Confirms arbiter decision and (optionally) executes financial logic immediately.
   * Single place where escrow can be moved.
   */
  decideAndExecute(input: {
    disputeId: string
    actorUserId: string
    expectedVersion: number
    decisionKind: ArbitrationDecisionKind
    comment: string
    checklist: ArbitrationChecklist
    partial?: { executorAmount: number; customerAmount: number }
    closeAfter?: boolean
  }) {
    assert(input.disputeId, 'disputeId is required')
    assert(input.actorUserId, 'actorUserId is required')
    assert(Number.isFinite(input.expectedVersion) && input.expectedVersion >= 1, 'expectedVersion is required')
    assert(input.comment.trim().length > 0, 'Comment is required')
    assert(input.checklist.requirementsChecked && input.checklist.videoReviewed && input.checklist.chatReviewed, 'Checklist is incomplete')

    const dispute = disputeRepo.getById(input.disputeId)
    assert(dispute, 'Dispute not found')
    assert(!dispute.lockedDecisionAt, 'Decision is already locked')
    assert(dispute.status === 'in_review', 'Dispute must be in_review to decide')
    assert((dispute.version ?? 1) === input.expectedVersion, 'Stale data (version mismatch)')
    assert(!dispute.assignedArbiterId || dispute.assignedArbiterId === input.actorUserId, 'Dispute is assigned to another arbiter')

    const contract = contractRepo.getById(dispute.contractId)
    assert(contract, 'Contract not found')

    let decision: DisputeDecision
    let payouts: { executorAmount: number; customerAmount: number } | null = null

    if (input.decisionKind === 'release_to_executor') {
      decision = { payout: 'executor' }
      const claimed = balanceFreezeRepo.claimFor(contract.taskId, contract.executorId)
      assert(claimed, 'Escrow is not frozen (cannot release)')
      balanceRepo.deposit(claimed.executorId, claimed.amount)
      payouts = { executorAmount: claimed.amount, customerAmount: 0 }
      contractRepo.setStatus(contract.id, 'resolved')
      taskAssignmentRepo.markAccepted(contract.taskId, contract.executorId)
      recomputeTaskStatus(contract.taskId)
    } else if (input.decisionKind === 'refund_to_customer') {
      decision = { payout: 'customer' }
      const claimed = balanceFreezeRepo.claimFor(contract.taskId, contract.executorId)
      assert(claimed, 'Escrow is not frozen (cannot refund)')
      balanceRepo.deposit(claimed.customerId, claimed.amount)
      payouts = { executorAmount: 0, customerAmount: claimed.amount }
      contractRepo.setStatus(contract.id, 'resolved')
      taskAssignmentRepo.markAccepted(contract.taskId, contract.executorId)
      recomputeTaskStatus(contract.taskId)
    } else if (input.decisionKind === 'partial_refund') {
      const ex = input.partial?.executorAmount ?? NaN
      const cu = input.partial?.customerAmount ?? NaN
      assert(Number.isFinite(ex) && ex >= 0, 'executorAmount is invalid')
      assert(Number.isFinite(cu) && cu >= 0, 'customerAmount is invalid')
      decision = { payout: 'partial', executorAmount: round2(ex), customerAmount: round2(cu), note: input.comment.trim() }
      const claimed = balanceFreezeRepo.claimFor(contract.taskId, contract.executorId)
      assert(claimed, 'Escrow is not frozen (cannot split)')
      const total = round2(ex + cu)
      assert(round2(claimed.amount) === total, 'Partial amounts must sum to escrow amount')
      if (ex > 0) balanceRepo.deposit(claimed.executorId, ex)
      if (cu > 0) balanceRepo.deposit(claimed.customerId, cu)
      payouts = { executorAmount: ex, customerAmount: cu }
      contractRepo.setStatus(contract.id, 'resolved')
      taskAssignmentRepo.markAccepted(contract.taskId, contract.executorId)
      recomputeTaskStatus(contract.taskId)
    } else if (input.decisionKind === 'redo_required') {
      // No money move; keep escrow frozen.
      decision = { payout: 'partial', executorAmount: 0, customerAmount: 0, note: `redo_required: ${input.comment.trim()}` }
      payouts = null
    } else {
      // no_action: no money move; keep escrow frozen (explicitly).
      decision = { payout: 'partial', executorAmount: 0, customerAmount: 0, note: `no_action: ${input.comment.trim()}` }
      payouts = null
    }

    const next = disputeRepo.decideLocked({
      disputeId: dispute.id,
      decision,
      expectedVersion: input.expectedVersion,
      arbiterId: input.actorUserId,
    })
    assert(next && next.lockedDecisionAt, 'Failed to lock decision (possibly stale)')

    disputeMessageRepo.addSystem({
      disputeId: dispute.id,
      text:
        input.decisionKind === 'redo_required'
          ? 'Решение арбитра: требуется переделка.'
          : input.decisionKind === 'no_action'
            ? 'Решение арбитра: без действий.'
            : input.decisionKind === 'release_to_executor'
              ? 'Решение арбитра: выплата исполнителю.'
              : input.decisionKind === 'refund_to_customer'
                ? 'Решение арбитра: возврат заказчику.'
                : 'Решение арбитра: частичное распределение.',
    })

    auditLogRepo.add({
      disputeId: dispute.id,
      actionType: 'decision_confirmed',
      actorUserId: input.actorUserId,
      summary: `Решение подтверждено: ${input.decisionKind}`,
      payload: {
        decisionKind: input.decisionKind,
        comment: input.comment.trim(),
        payouts,
        checklist: input.checklist,
      },
      versionBefore: input.expectedVersion,
      versionAfter: next.version,
    })

    if (input.closeAfter) {
      disputeRepo.close(contract.id)
      disputeMessageRepo.addSystem({ disputeId: dispute.id, text: 'Спор закрыт.' })
      auditLogRepo.add({
        disputeId: dispute.id,
        actionType: 'dispute_closed',
        actorUserId: input.actorUserId,
        summary: 'Спор закрыт',
      })
    }

    // Notify parties about status/decision.
    const recipients = [contract.clientId, contract.executorId].filter(Boolean) as string[]
    for (const uid of recipients) {
      if (uid === input.actorUserId) continue
      notificationRepo.addDisputeStatus({
        recipientUserId: uid,
        actorUserId: input.actorUserId,
        taskId: contract.taskId,
        disputeId: dispute.id,
        status: input.closeAfter ? 'closed' : 'decided',
        note: input.decisionKind,
      })
    }

    // Prompt executor to rate customer after dispute decision.
    notificationRepo.addRateCustomer({
      recipientUserId: contract.executorId,
      actorUserId: input.actorUserId,
      taskId: contract.taskId,
    })

    return { dispute: next, payouts }
  },
}

