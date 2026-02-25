import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { paths } from '@/app/router/paths'
import { useAuth } from '@/shared/auth/AuthContext'
import { useI18n } from '@/shared/i18n/I18nContext'
import { useDisputes } from '@/entities/dispute/lib/useDisputes'
import { useContracts } from '@/entities/contract/lib/useContracts'
import { useTasks } from '@/entities/task/lib/useTasks'
import { pickText } from '@/entities/task/lib/taskText'
import { useUsers } from '@/entities/user/lib/useUsers'
import { postDisputeMessage, useDisputeMessages } from '@/entities/disputeMessage/lib/useDisputeMessages'
import { disputeMessageRepo } from '@/entities/disputeMessage/lib/disputeMessageRepo'
import { markReadForDisputeOptimistic } from '@/entities/notification/lib/useNotifications'
import { notificationRepo } from '@/entities/notification/lib/notificationRepo'
import { auditLogRepo } from '@/entities/auditLog/lib/auditLogRepo'
import './dispute-thread.css'
import { DisputeWorkspacePage } from './DisputeWorkspacePage'
import { refreshNotifications } from '@/entities/notification/lib/useNotifications'
import { userIdMatches } from '@/shared/auth/userIdAliases'

const DEV_ARBITER_USER_ID = 'user_dev_arbiter'
const USE_API = import.meta.env.VITE_DATA_SOURCE === 'api'

function statusLabel(status: string, locale: 'ru' | 'en') {
  if (locale === 'ru') {
    if (status === 'open') return 'Открыт'
    if (status === 'in_review') return 'В работе'
    if (status === 'need_more_info') return 'Нужна инфо'
    if (status === 'decided') return 'Решение принято'
    if (status === 'closed') return 'Закрыт'
  } else {
    if (status === 'open') return 'Open'
    if (status === 'in_review') return 'In review'
    if (status === 'need_more_info') return 'Need info'
    if (status === 'decided') return 'Decided'
    if (status === 'closed') return 'Closed'
  }
  return status
}

export function DisputeThreadPage() {
  const { disputeId } = useParams()
  const auth = useAuth()
  const { locale } = useI18n()
  const navigate = useNavigate()
  const disputes = useDisputes()
  const contracts = useContracts()
  const tasks = useTasks()
  const users = useUsers()

  const user = auth.user
  const dispute = disputeId ? disputes.find((d) => d.id === disputeId) ?? null : null
  const contract = useMemo(() => (dispute ? contracts.find((c) => c.id === dispute.contractId) ?? null : null), [contracts, dispute])
  const task = useMemo(() => (contract ? tasks.find((t) => t.id === contract.taskId) ?? null : null), [contract, tasks])

  const participants = useMemo(() => {
    const d = dispute as any
    const customerId =
      (typeof d?.customerId === 'string' && d.customerId.trim() ? d.customerId.trim() : null) ??
      (contract?.clientId ? String(contract.clientId) : null)
    const executorId =
      (typeof d?.executorId === 'string' && d.executorId.trim() ? d.executorId.trim() : null) ??
      (contract?.executorId ? String(contract.executorId) : null)
    const arbiterId =
      typeof d?.assignedArbiterId === 'string' && d.assignedArbiterId.trim() ? d.assignedArbiterId.trim() : DEV_ARBITER_USER_ID
    return { customerId, executorId, arbiterId }
  }, [contract, dispute])

  const allowed = useMemo(() => {
    if (!dispute || !contract) return false
    if (!user) return false
    if (participants.customerId && userIdMatches(user, participants.customerId)) return true
    if (participants.executorId && userIdMatches(user, participants.executorId)) return true
    if (user.role === 'arbiter') return true
    return false
  }, [contract, dispute, participants.customerId, participants.executorId, user])

  const messages = useDisputeMessages(dispute?.id ?? null)
  const visibleMessages = useMemo(() => messages.filter((m) => m.kind !== 'internal'), [messages])
  const [text, setText] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)

  const taskTitle = task ? pickText(task.title, locale) : contract?.taskId ?? dispute?.contractId ?? ''

  const customer = participants.customerId ? users.find((u) => userIdMatches(u, participants.customerId)) ?? null : null
  const executor = participants.executorId ? users.find((u) => userIdMatches(u, participants.executorId)) ?? null : null
  const arbiter = users.find((u) => u.id === participants.arbiterId) ?? null

  useEffect(() => {
    if (!disputeId?.trim() || !user?.id) return
    if (USE_API) markReadForDisputeOptimistic(disputeId)
    else notificationRepo.markReadForDispute(user.id, disputeId)
  }, [disputeId, user?.id])

  useEffect(() => {
    if (!listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [visibleMessages.length])

  if (!user) {
    return (
      <main className="disputeThreadPage">
        <div className="disputeThreadContainer">
          <h1 className="disputeThreadTitle">{locale === 'ru' ? 'Загрузка…' : 'Loading…'}</h1>
        </div>
      </main>
    )
  }

  if (user.role === 'arbiter') {
    return <DisputeWorkspacePage />
  }

  // Avoid showing "not found" before the first API fetch completes.
  if (USE_API && disputeId && disputes.length === 0) {
    return (
      <main className="disputeThreadPage">
        <div className="disputeThreadContainer">
          <h1 className="disputeThreadTitle">{locale === 'ru' ? 'Загрузка спора…' : 'Loading dispute…'}</h1>
          <div style={{ opacity: 0.85, marginTop: 8 }}>
            <Link to={paths.profile}>{locale === 'ru' ? 'В профиль' : 'Go to profile'}</Link>
          </div>
        </div>
      </main>
    )
  }

  if (!dispute || !contract) {
    return (
      <main className="disputeThreadPage">
        <div className="disputeThreadContainer">
          <h1 className="disputeThreadTitle">{locale === 'ru' ? 'Спор не найден' : 'Dispute not found'}</h1>
          <div style={{ opacity: 0.85, marginTop: 8 }}>
            <Link to={paths.profile}>{locale === 'ru' ? 'В профиль' : 'Go to profile'}</Link>
          </div>
        </div>
      </main>
    )
  }

  if (!allowed) {
    return (
      <main className="disputeThreadPage">
        <div className="disputeThreadContainer">
          <h1 className="disputeThreadTitle">{locale === 'ru' ? 'Нет доступа' : 'Access denied'}</h1>
          <div className="disputeThreadHint">
            {locale === 'ru' ? 'Этот спор доступен только его участникам.' : 'This dispute is available to its participants only.'}
          </div>
          <div style={{ marginTop: 10 }}>
            <Link to={paths.profile}>{locale === 'ru' ? 'В профиль' : 'Go to profile'}</Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="disputeThreadPage">
      <div className="disputeThreadContainer">
        <div className="disputeThreadHeader">
          <button
            type="button"
            className="disputeThreadBack"
            onClick={() => {
              if (window.history.length > 1) navigate(-1)
              else navigate(paths.profile)
            }}
            aria-label={locale === 'ru' ? 'Назад' : 'Back'}
            title={locale === 'ru' ? 'Назад' : 'Back'}
          >
            ←
          </button>
          <div className="disputeThreadHeader__main">
            <div className="disputeThreadKicker">
              {locale === 'ru' ? 'Спор' : 'Dispute'} · {statusLabel(dispute.status, locale)}
            </div>
            <h1 className="disputeThreadTitle" title={taskTitle}>
              {taskTitle}
            </h1>
            <div className="disputeThreadParticipants">
              <span className="disputeThreadParticipant">
                {locale === 'ru' ? 'Заказчик' : 'Customer'}: {customer?.fullName ?? participants.customerId}
              </span>
              <span className="disputeThreadDot" aria-hidden="true">
                ·
              </span>
              <span className="disputeThreadParticipant">
                {locale === 'ru' ? 'Исполнитель' : 'Executor'}: {executor?.fullName ?? participants.executorId}
              </span>
              <span className="disputeThreadDot" aria-hidden="true">
                ·
              </span>
              <span className="disputeThreadParticipant">
                {locale === 'ru' ? 'Арбитр' : 'Arbiter'}: {arbiter?.fullName ?? participants.arbiterId}
              </span>
            </div>
          </div>
        </div>

        <div className="disputeChat">
          <div className="disputeChatList" ref={listRef} aria-label={locale === 'ru' ? 'Сообщения' : 'Messages'}>
            {visibleMessages.length === 0 ? (
              <div className="disputeChatEmpty">
                {locale === 'ru' ? 'Пока нет сообщений. Опишите ситуацию и приложите аргументы.' : 'No messages yet. Describe the situation and share your arguments.'}
              </div>
            ) : (
              visibleMessages.map((m) => {
                const mine = m.authorUserId === auth.user!.id
                const author = users.find((u) => u.id === m.authorUserId) ?? null
                const time = new Date(m.createdAt).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US')
                return (
                  <div key={m.id} className={`disputeMsg${mine ? ' disputeMsg--mine' : ''}`}>
                    <div className="disputeMsg__meta">
                      <span className="disputeMsg__author">{author?.fullName ?? m.authorUserId}</span>
                      <span className="disputeMsg__time">{time}</span>
                    </div>
                    <div className="disputeMsg__bubble">
                      {m.kind === 'internal' ? (
                        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
                          {locale === 'ru' ? 'Внутренняя заметка' : 'Internal note'}
                        </div>
                      ) : m.kind === 'system' ? (
                        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
                          {locale === 'ru' ? 'System' : 'System'}
                        </div>
                      ) : null}
                      {m.text}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Arbiter-only quick actions live in DisputeWorkspacePage; this branch is customer/executor only */}

          {dispute.status === 'closed' ? (
            <div className="disputeChatClosed" role="status">
              {locale === 'ru'
                ? 'Спор закрыт. Новые сообщения отправлять нельзя.'
                : 'Dispute is closed. You cannot send new messages.'}
            </div>
          ) : (
            <form
              className="disputeChatComposer"
              onSubmit={(e) => {
                e.preventDefault()
                const trimmed = text.trim()
                if (!trimmed) return
                if (!dispute) return
                if (USE_API) {
                  void postDisputeMessage({ disputeId: dispute.id, text: trimmed, kind: 'public' })
                    .then(() => {
                      setText('')
                      return refreshNotifications()
                    })
                    .catch(() => {})
                  return
                }
                const msg = disputeMessageRepo.add({ disputeId: dispute.id, authorUserId: auth.user!.id, kind: 'public', text: trimmed })
                setText('')

                const taskId = contract.taskId
                const notifyArbiter = Boolean(dispute.assignedArbiterId && dispute.assignedArbiterId === participants.arbiterId)
                const targets = [
                  participants.customerId,
                  participants.executorId,
                  ...(notifyArbiter ? [participants.arbiterId] : []),
                ].filter(Boolean) as string[]
                for (const uid of targets) {
                  if (uid === auth.user!.id) continue
                  notificationRepo.addDisputeMessage({
                    recipientUserId: uid,
                    actorUserId: auth.user!.id,
                    taskId,
                    disputeId: dispute.id,
                    message: msg.text,
                  })
                }

                auditLogRepo.add({
                  disputeId: dispute.id,
                  actionType: 'public_message',
                  actorUserId: auth.user!.id,
                  summary: locale === 'ru' ? 'Сообщение в споре' : 'Dispute message',
                  payload: { messageId: msg.id },
                })
              }}
            >
              <textarea
                className="disputeChatInput"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                placeholder={locale === 'ru' ? 'Напишите сообщение…' : 'Write a message…'}
                autoComplete="off"
              />
              <button className="disputeChatSend" type="submit" disabled={!text.trim()}>
                {locale === 'ru' ? 'Отправить' : 'Send'}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}

