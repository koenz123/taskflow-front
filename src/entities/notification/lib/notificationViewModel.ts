import type { Notification } from '../model/notification'
import type { Task } from '@/entities/task/model/task'
import { pickText } from '@/entities/task/lib/taskText'
import { disputeThreadPath, paths, taskDetailsPath, userProfilePath } from '@/app/router/paths'
import type { TranslationKey } from '@/shared/i18n/translations'
import { timeAgo } from '@/shared/lib/timeAgo'

export type NotificationVM = {
  id: string
  unread: boolean
  icon: string
  title: string
  subtitle: string
  timeLabel: string
  href: string | null
  actorHref: string | null
  completionHref: string | null
}

function iconFor(type: Notification['type']): string {
  switch (type) {
    case 'task_application':
      return '💬'
    case 'task_application_cancelled':
      return '🚫'
    case 'task_taken':
      return '👤'
    case 'task_assigned':
      return '✅'
    case 'task_assigned_else':
      return '🙅'
    case 'task_submitted':
      return '📤'
    case 'task_approved':
      return '🎉'
    case 'task_revision':
      return '✏️'
    case 'task_pause_requested':
      return '⏸️'
    case 'task_pause_accepted':
      return '⏯️'
    case 'task_pause_rejected':
      return '⏭️'
    case 'task_completed':
      return '🏁'
    case 'task_unclaimed':
      return '⏳'
    case 'task_executor_no_start':
      return '⚠️'
    case 'task_executor_overdue':
      return '⏰'
    case 'executor_violation_warning':
      return '⚠️'
    case 'executor_violation_rating_penalty':
      return '📉'
    case 'executor_violation_respond_block':
      return '⛔'
    case 'executor_violation_ban':
      return '🛑'
    case 'dispute_opened':
      return '⚖️'
    case 'dispute_message':
      return '💬'
    case 'dispute_status':
      return '🔄'
    case 'dispute_sla_threshold':
      return '⏰'
    case 'rate_customer':
      return '⭐'
    default:
      return '🔔'
  }
}

function prefixKey(type: Notification['type']): TranslationKey {
  switch (type) {
    case 'task_completed':
      return 'notifications.taskCompletedPrefix'
    case 'task_application':
      return 'notifications.taskApplicationPrefix'
    case 'task_application_cancelled':
      return 'notifications.taskApplicationCancelledPrefix'
    case 'task_assigned':
      return 'notifications.taskAssignedPrefix'
    case 'task_assigned_else':
      return 'notifications.taskAssignedElsePrefix'
    case 'task_submitted':
      return 'notifications.taskSubmittedPrefix'
    case 'task_approved':
      return 'notifications.taskApprovedPrefix'
    case 'task_revision':
      return 'notifications.taskRevisionPrefix'
    case 'task_pause_requested':
      return 'notifications.taskPauseRequestedPrefix'
    case 'task_pause_accepted':
      return 'notifications.taskPauseAcceptedPrefix'
    case 'task_pause_rejected':
      return 'notifications.taskPauseRejectedPrefix'
    case 'task_unclaimed':
      return 'notifications.taskUnclaimedPrefix'
    case 'task_executor_no_start':
      return 'notifications.taskExecutorNoStartPrefix'
    case 'task_executor_overdue':
      return 'notifications.taskExecutorOverduePrefix'
    case 'executor_violation_warning':
      return 'notifications.executorViolationWarningPrefix'
    case 'executor_violation_rating_penalty':
      return 'notifications.executorViolationRatingPenaltyPrefix'
    case 'executor_violation_respond_block':
      return 'notifications.executorViolationRespondBlockPrefix'
    case 'executor_violation_ban':
      return 'notifications.executorViolationBanPrefix'
    case 'task_taken':
    default:
      return 'notifications.taskTakenPrefix'
  }
}

function actorRoleLabelForRu(type: Notification['type']): string | null {
  // We intentionally avoid personal names; use generic actor labels.
  // Executor-driven events:
  if (
    type === 'task_application' ||
    type === 'task_assigned' ||
    type === 'task_taken' ||
    type === 'task_completed' ||
    type === 'task_submitted' ||
    type === 'task_pause_requested' ||
    type === 'task_executor_no_start' ||
    type === 'task_executor_overdue'
  ) {
    return 'исполнитель'
  }
  if (
    type === 'executor_violation_warning' ||
    type === 'executor_violation_rating_penalty' ||
    type === 'executor_violation_respond_block' ||
    type === 'executor_violation_ban'
  ) {
    return null
  }
  // Customer-driven events:
  if (
    type === 'task_application_cancelled' ||
    type === 'task_assigned_else' ||
    type === 'task_approved' ||
    type === 'task_revision' ||
    type === 'task_pause_accepted' ||
    type === 'task_pause_rejected'
  ) {
    return 'заказчик'
  }
  return null
}

function capitalizeRu(word: string): string {
  const trimmed = word.trim()
  if (!trimmed) return trimmed
  return trimmed[0].toUpperCase() + trimmed.slice(1)
}

function lowerFirst(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return trimmed
  return trimmed[0].toLowerCase() + trimmed.slice(1)
}

export function buildNotificationVM(params: {
  n: Notification
  actorId: string | null
  task: Task | null
  locale: 'ru' | 'en'
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
  nowMs?: number
}): NotificationVM {
  const { n, actorId, task, locale, t } = params
  const nowMs = params.nowMs ?? Date.now()

  const taskTitle = task ? pickText(task.title, locale) : n.taskId

  if (n.type === 'dispute_opened' || n.type === 'dispute_message' || n.type === 'dispute_status' || n.type === 'dispute_sla_threshold') {
    const subtitle =
      locale === 'ru'
        ? n.type === 'dispute_opened'
          ? 'Открыт спор по заданию'
          : n.type === 'dispute_message'
            ? n.message?.trim()
              ? `Сообщение в споре: ${n.message.trim()}`
              : 'Новое сообщение в споре'
            : n.type === 'dispute_status'
              ? n.disputeStatus
                ? `Статус спора: ${n.disputeStatus}${n.message?.trim() ? ` · ${n.message.trim()}` : ''}`
                : 'Статус спора изменён'
              : (() => {
                  const h = typeof n.slaHoursLeft === 'number' ? n.slaHoursLeft : 0
                  const hh = h > 0 ? `${h}ч` : 'скоро'
                  return `SLA по спору: осталось ${hh}`
                })()
        : n.type === 'dispute_opened'
          ? 'A dispute has been opened for this task'
          : n.type === 'dispute_message'
            ? n.message?.trim()
              ? `New dispute message: ${n.message.trim()}`
              : 'New dispute message'
            : n.type === 'dispute_status'
              ? n.disputeStatus
                ? `Dispute status: ${n.disputeStatus}${n.message?.trim() ? ` · ${n.message.trim()}` : ''}`
                : 'Dispute status changed'
              : (() => {
                  const h = typeof n.slaHoursLeft === 'number' ? n.slaHoursLeft : 0
                  const hh = h > 0 ? `${h}h` : 'soon'
                  return `Dispute SLA: ${hh} left`
                })()

    return {
      id: n.id,
      unread: !n.readAt,
      icon: iconFor(n.type),
      title: taskTitle,
      subtitle,
      timeLabel: timeAgo(n.createdAt, locale, nowMs),
      href: n.disputeId ? disputeThreadPath(n.disputeId) : (n.taskId ? taskDetailsPath(n.taskId) : null),
      actorHref: actorId ? userProfilePath(actorId) : null,
      completionHref: null,
    }
  }

  if (n.type === 'rate_customer') {
    return {
      id: n.id,
      unread: !n.readAt,
      icon: iconFor(n.type),
      title: taskTitle,
      subtitle: locale === 'ru' ? 'Оцените заказчика' : 'Rate the customer',
      timeLabel: timeAgo(n.createdAt, locale, nowMs),
      href: `${paths.profile}?tab=executor_completed`,
      actorHref: actorId ? userProfilePath(actorId) : null,
      completionHref: null,
    }
  }
  const prefix = (() => {
    if (
      n.type === 'executor_violation_warning' ||
      n.type === 'executor_violation_rating_penalty' ||
      n.type === 'executor_violation_respond_block' ||
      n.type === 'executor_violation_ban'
    ) {
      const violationKey =
        n.violationType === 'no_submit_24h'
          ? ('notifications.violation.noSubmit24h' as const)
          : ('notifications.violation.noStart12h' as const)
      const violation = t(violationKey)

      const sanctionText = (() => {
        if (n.type === 'executor_violation_warning') return t('notifications.sanction.warning')
        if (n.type === 'executor_violation_ban') return t('notifications.sanction.ban')
        if (n.type === 'executor_violation_rating_penalty') {
          const delta = typeof n.sanctionDeltaPercent === 'number' ? n.sanctionDeltaPercent : -5
          return t('notifications.sanction.ratingPenalty', { delta })
        }
        // respond block
        const hours = typeof n.sanctionDurationHours === 'number' ? n.sanctionDurationHours : 24
        const untilIso = typeof n.sanctionUntil === 'string' ? n.sanctionUntil : ''
        const parsed = Date.parse(untilIso)
        const until =
          untilIso && Number.isFinite(parsed)
            ? new Date(parsed).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US')
            : untilIso
        return t('notifications.sanction.respondBlock', { hours, until })
      })()

      return `${t('notifications.violationPrefix')}: ${violation}. ${t('notifications.sanctionPrefix')}: ${sanctionText}`
    }
    return t(prefixKey(n.type))
  })()
  const subtitle = (() => {
    if (n.type === 'task_unclaimed') return prefix
    // RU: keep action + generic actor label (masculine verbs in i18n).
    if (locale === 'ru') {
      const actor = actorRoleLabelForRu(n.type)
      return actor ? `${capitalizeRu(actor)} ${lowerFirst(prefix)}`.trim() : prefix
    }
    // EN: keep prefixes as complete sentences (no names).
    return prefix
  })()

  return {
    id: n.id,
    unread: !n.readAt,
    icon: iconFor(n.type),
    title: taskTitle,
    subtitle,
    timeLabel: timeAgo(n.createdAt, locale, nowMs),
    href: n.taskId ? taskDetailsPath(n.taskId) : null,
    actorHref: actorId ? userProfilePath(actorId) : null,
    completionHref: n.completionVideoUrl?.trim() ? n.completionVideoUrl.trim() : null,
  }
}

