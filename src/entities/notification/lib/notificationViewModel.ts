import type { Notification } from '../model/notification'
import type { Task } from '@/entities/task/model/task'
import { pickText } from '@/entities/task/lib/taskText'
import { disputeThreadPath, paths, taskDetailsPath, supportThreadPath, userProfilePath } from '@/app/router/paths'
import type { TranslationKey } from '@/shared/i18n/translations'
import { timeAgo } from '@/shared/lib/timeAgo'
import type { IconName } from '@/shared/ui/icon/Icon'

export type NotificationVM = {
  id: string
  unread: boolean
  /**
   * Thematic event icon.
   */
  icon: IconName
  title: string // primary line (action)
  subtitle: string // secondary line (task title / context)
  timeLabel: string
  href: string | null
  actorHref: string | null
  completionHref: string | null
  /**
   * When VM represents an aggregation (e.g. unread dispute messages),
   * these are the source notification IDs to mark as read.
   */
  sourceNotificationIds?: string[]
}

function iconFor(type: Notification['type']): IconName {
  switch (type) {
    case 'task_application':
      return 'note'
    case 'task_application_cancelled':
      return 'ban'
    case 'task_taken':
      return 'user'
    case 'task_assigned':
      return 'check'
    case 'task_assigned_else':
      return 'x'
    case 'task_submitted':
      return 'upload'
    case 'task_resubmitted':
      return 'repeat'
    case 'task_approved':
      return 'party'
    case 'task_revision':
      return 'pencil'
    case 'task_pause_requested':
      return 'pause'
    case 'task_pause_accepted':
      return 'playPause'
    case 'task_pause_rejected':
      return 'ban'
    case 'task_completed':
      return 'finish'
    case 'task_unclaimed':
      return 'hourglass'
    case 'task_executor_no_start':
      return 'hourglass'
    case 'task_executor_overdue':
      return 'timer'
    case 'executor_violation_warning':
      return 'warning'
    case 'executor_violation_rating_penalty':
      return 'chartDown'
    case 'executor_violation_respond_block':
      return 'ban'
    case 'executor_violation_ban':
      return 'ban'
    case 'dispute_opened':
      return 'gavel'
    case 'dispute_message':
      return 'chat'
    case 'support_message':
      return 'chat'
    case 'dispute_status':
      return 'refresh'
    case 'dispute_sla_threshold':
      return 'timer'
    case 'rate_customer':
      return 'star'
    case 'rate_executor':
      return 'star'
    default:
      return 'bell'
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

type ActorLike = {
  id: string
  role?: string
  fullName?: string
  email?: string
  avatarDataUrl?: string
}

function roleLabel(role: string, locale: 'ru' | 'en') {
  if (locale === 'ru') {
    if (role === 'customer') return 'Заказчик'
    if (role === 'executor') return 'Исполнитель'
    if (role === 'arbiter') return 'Арбитр'
  }
  if (role === 'customer') return 'Customer'
  if (role === 'executor') return 'Executor'
  if (role === 'arbiter') return 'Arbiter'
  return role
}

function inferredActorRole(type: Notification['type']): ActorLike['role'] | null {
  switch (type) {
    case 'task_application':
    case 'task_application_cancelled':
    case 'task_taken':
    case 'task_submitted':
    case 'task_resubmitted':
    case 'task_completed':
    case 'task_executor_no_start':
    case 'task_executor_overdue':
      return 'executor'
    case 'task_assigned':
    case 'task_assigned_else':
    case 'task_revision':
    case 'task_pause_accepted':
    case 'task_pause_rejected':
    case 'task_approved':
      return 'customer'
    case 'task_pause_requested':
      return 'executor'
    case 'rate_customer':
      return 'executor'
    case 'rate_executor':
      return 'customer'
    default:
      return null
  }
}

function actorDisplayLabel(input: {
  n: Notification
  actor: ActorLike | null
  locale: 'ru' | 'en'
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
}): string | null {
  const { actor, n, locale, t } = input
  if (!actor) return null
  const id = String(actor.id || '').trim()
  if (!id || id === 'system') return null

  const role = String(actor.role || '').trim() || inferredActorRole(n.type)
  if (role) return roleLabel(role, locale)

  return t('notifications.someone')
}

function taskTitleOrFallback(task: Task | null, locale: 'ru' | 'en') {
  const title = task ? pickText(task.title, locale) : ''
  if (title.trim()) return title
  return locale === 'ru' ? 'Задание' : 'Task'
}

function compactActionTitle(input: {
  n: Notification
  actorLabel: string | null
  locale: 'ru' | 'en'
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
}) {
  const { n, actorLabel, locale, t } = input
  const actor = actorLabel?.trim() ? actorLabel.trim() : null

  if (locale === 'ru') {
    switch (n.type) {
      case 'task_application':
        return actor ? `${actor} откликнулся` : 'Новый отклик'
      case 'task_pause_requested':
        return actor ? `${actor} запросил паузу` : 'Запрос паузы'
      case 'task_pause_accepted':
        return `Пауза одобрена`
      case 'task_taken':
        return actor ? `${actor} взял задание` : 'Задание взято'
      case 'task_submitted':
        return actor ? `${actor} сдал работу` : 'Работа сдана'
      case 'task_resubmitted':
        return actor ? `${actor} пересдал работу` : 'Работа пересдана'
      case 'task_revision':
        return actor ? `Доработка: запрос от ${actor}` : 'Запрос доработки'
      case 'task_assigned':
        return actor ? `${actor} назначил вас` : 'Вас назначили'
      case 'task_pause_rejected':
        return `Пауза отклонена`
      case 'task_assigned_else':
        return actor ? `${actor} снял вас с задания` : 'Вас сняли с задания'
      case 'dispute_opened':
        return actor ? `${actor}: открыт спор` : 'Открыт спор'
      case 'dispute_status':
        return `Статус спора изменён`
      case 'task_executor_no_start':
        return actor ? `${actor} не начал за 12ч` : 'Исполнитель не начал за 12ч'
      case 'task_executor_overdue':
        return actor ? `${actor} просрочил дедлайн` : 'Просрочен дедлайн'
      case 'task_approved':
        return actor ? `${actor} принял работу` : 'Работа принята'
      case 'rate_customer':
        return actor ? `${actor} оценил вас` : 'Вас оценили'
      case 'rate_executor':
        return actor ? `${actor} оценил вас` : 'Вас оценили'
      default:
        return t(prefixKey(n.type))
    }
  }

  // en
  switch (n.type) {
    case 'task_application':
      return actor ? `${actor} applied` : 'New application'
    case 'task_pause_requested':
      return actor ? `${actor} requested a pause` : 'Pause requested'
    case 'task_pause_accepted':
      return `Pause approved`
    case 'task_taken':
      return actor ? `${actor} took the task` : 'Task was taken'
    case 'task_submitted':
      return actor ? `${actor} submitted work` : 'Work submitted'
    case 'task_resubmitted':
      return actor ? `${actor} resubmitted work` : 'Work resubmitted'
    case 'task_revision':
      return actor ? `Revision requested by ${actor}` : 'Revision requested'
    case 'task_assigned':
      return actor ? `${actor} assigned you` : 'You were assigned'
    case 'task_pause_rejected':
      return `Pause rejected`
    case 'task_assigned_else':
      return actor ? `${actor} removed you` : 'You were removed'
    case 'dispute_opened':
      return actor ? `${actor}: dispute opened` : 'Dispute opened'
    case 'dispute_status':
      return `Dispute status changed`
    case 'task_executor_no_start':
      return actor ? `${actor} did not start in time` : 'Executor did not start in time'
    case 'task_executor_overdue':
      return actor ? `${actor} missed the deadline` : 'Deadline missed'
    case 'task_approved':
      return actor ? `${actor} approved the work` : 'Work approved'
    case 'rate_customer':
      return actor ? `${actor} left a rating` : 'You received a rating'
    case 'rate_executor':
      return actor ? `${actor} left a rating` : 'You received a rating'
    default:
      return t(prefixKey(n.type))
  }
}

export function buildNotificationVM(params: {
  n: Notification
  actor: ActorLike | null
  task: Task | null
  locale: 'ru' | 'en'
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
  nowMs?: number
}): NotificationVM {
  const { n, actor, task, locale, t } = params
  const nowMs = params.nowMs ?? Date.now()

  const aLabel = actorDisplayLabel({ n, actor, locale, t })
  const actorHref = actor?.id && String(actor.id) !== 'system' ? userProfilePath(String(actor.id)) : null
  const taskTitle = taskTitleOrFallback(task, locale)
  const safeTaskId = n.taskId && n.taskId !== 'unknown_task' ? n.taskId : null

  if (n.type === 'support_message') {
    return {
      id: n.id,
      unread: !n.readAt,
      icon: iconFor(n.type),
      title: locale === 'ru' ? 'Обращение в поддержку' : 'Support request',
      subtitle: n.message?.trim() || (locale === 'ru' ? 'Новое сообщение' : 'New message'),
      timeLabel: timeAgo(n.createdAt, locale, nowMs),
      href: n.supportThreadId ? supportThreadPath(n.supportThreadId) : paths.supportInbox,
      actorHref: actor?.id ? userProfilePath(actor.id) : null,
      completionHref: null,
    }
  }

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
      title:
        n.type === 'dispute_message'
          ? locale === 'ru'
            ? 'Сообщение в споре'
            : 'Dispute message'
          : n.type === 'dispute_opened'
            ? locale === 'ru'
              ? 'Открыт спор'
              : 'Dispute opened'
            : n.type === 'dispute_status'
              ? locale === 'ru'
                ? 'Статус спора'
                : 'Dispute status'
              : locale === 'ru'
                ? 'SLA спора'
                : 'Dispute SLA',
      subtitle: subtitle,
      timeLabel: timeAgo(n.createdAt, locale, nowMs),
      href: n.disputeId ? disputeThreadPath(n.disputeId) : (safeTaskId ? taskDetailsPath(safeTaskId) : null),
      actorHref,
      completionHref: null,
    }
  }

  if (n.type === 'rate_customer' || n.type === 'rate_executor') {
    return {
      id: n.id,
      unread: !n.readAt,
      icon: iconFor(n.type),
      title: compactActionTitle({ n, actorLabel: aLabel, locale, t }),
      subtitle: taskTitle,
      timeLabel: timeAgo(n.createdAt, locale, nowMs),
      href: paths.reviews,
      actorHref,
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
          : n.violationType === 'force_majeure_abuse'
            ? ('notifications.violation.forceMajeureAbuse' as const)
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
  const title =
    n.type === 'executor_violation_warning' ||
    n.type === 'executor_violation_rating_penalty' ||
    n.type === 'executor_violation_respond_block' ||
    n.type === 'executor_violation_ban'
      ? prefix
      : compactActionTitle({ n, actorLabel: aLabel, locale, t })

  return {
    id: n.id,
    unread: !n.readAt,
    icon: iconFor(n.type),
    title,
    subtitle: taskTitle,
    timeLabel: timeAgo(n.createdAt, locale, nowMs),
    href: safeTaskId ? taskDetailsPath(safeTaskId) : null,
    actorHref,
    completionHref: n.completionVideoUrl?.trim() ? n.completionVideoUrl.trim() : null,
  }
}

export function buildNotificationFeedVM(params: {
  list: Notification[]
  actorById: Map<string, ActorLike>
  taskById: Map<string, Task>
  locale: 'ru' | 'en'
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
  /** When set, only dispute notifications for these dispute IDs are shown (hides orphan/deleted disputes). */
  visibleDisputeIds?: Set<string>
}): NotificationVM[] {
  const { list, actorById, taskById, locale, t, visibleDisputeIds } = params

  const listToUse =
    visibleDisputeIds != null
      ? list.filter((n) => {
          if (n.type !== 'dispute_opened' && n.type !== 'dispute_message') return true
          return typeof n.disputeId === 'string' && visibleDisputeIds.has(n.disputeId)
        })
      : list

  const unreadDisputeMsgs = listToUse.filter((n) => n.type === 'dispute_message' && !n.readAt && n.disputeId)
  const grouped = new Map<string, Notification[]>()
  for (const n of unreadDisputeMsgs) {
    const key = String(n.disputeId)
    const arr = grouped.get(key)
    if (arr) arr.push(n)
    else grouped.set(key, [n])
  }

  const aggregatedWithTime: Array<{ createdAt: string; vm: NotificationVM }> = []
  for (const [disputeId, items] of grouped.entries()) {
    const sorted = items.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const latest = sorted[0]
    const task = latest?.taskId ? taskById.get(latest.taskId) ?? null : null
    const taskTitle = taskTitleOrFallback(task, locale)
    const count = sorted.length
    aggregatedWithTime.push({
      createdAt: latest.createdAt,
      vm: {
      id: `disp_unread_${disputeId}`,
      unread: true,
      icon: 'chat',
      title: locale === 'ru' ? `Непрочитанные сообщения в споре (${count})` : `Unread dispute messages (${count})`,
      subtitle: taskTitle,
      timeLabel: timeAgo(latest.createdAt, locale, Date.now()),
      href: disputeThreadPath(disputeId),
      actorHref: null,
      completionHref: null,
      sourceNotificationIds: sorted.map((x) => x.id),
      },
    })
  }

  // remove aggregated source notifications from list
  const hiddenIds = new Set<string>(unreadDisputeMsgs.map((n) => n.id))
  const rest = listToUse.filter((n) => !hiddenIds.has(n.id)).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const singles = rest.map((n) => {
    const actor = actorById.get(n.actorUserId) ?? null
    const task = taskById.get(n.taskId) ?? null
    return buildNotificationVM({ n, actor, task, locale, t })
  })

  aggregatedWithTime.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return [...aggregatedWithTime.map((x) => x.vm), ...singles]
}
