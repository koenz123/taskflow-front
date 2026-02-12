import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { paths } from '@/app/router/paths'
import { useAuth } from '@/shared/auth/AuthContext'
import { useI18n } from '@/shared/i18n/I18nContext'
import { disputeRepo } from '@/entities/dispute/lib/disputeRepo'
import { useDisputes } from '@/entities/dispute/lib/useDisputes'
import { useContracts } from '@/entities/contract/lib/useContracts'
import { useTasks } from '@/entities/task/lib/useTasks'
import { pickText } from '@/entities/task/lib/taskText'
import { useUsers } from '@/entities/user/lib/useUsers'
import { disputeMessageRepo } from '@/entities/disputeMessage/lib/disputeMessageRepo'
import { useDisputeMessages } from '@/entities/disputeMessage/lib/useDisputeMessages'
import { notificationRepo } from '@/entities/notification/lib/notificationRepo'
import { auditLogRepo } from '@/entities/auditLog/lib/auditLogRepo'
import './dispute-thread.css'
import { DisputeWorkspacePage } from './DisputeWorkspacePage'

const DEV_ARBITER_USER_ID = 'user_dev_arbiter'

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
  // subscribe so page updates if dispute/messages change
  useDisputes()
  const contracts = useContracts()
  const tasks = useTasks()
  const users = useUsers()

  const dispute = disputeId ? disputeRepo.getById(disputeId) : null
  const contract = useMemo(() => (dispute ? contracts.find((c) => c.id === dispute.contractId) ?? null : null), [contracts, dispute])
  const task = useMemo(() => (contract ? tasks.find((t) => t.id === contract.taskId) ?? null : null), [contract, tasks])

  const participants = useMemo(() => {
    if (!contract) return { customerId: null as string | null, executorId: null as string | null, arbiterId: DEV_ARBITER_USER_ID }
    return { customerId: contract.clientId, executorId: contract.executorId, arbiterId: DEV_ARBITER_USER_ID }
  }, [contract])

  const allowed = useMemo(() => {
    if (!auth.user || !dispute || !contract) return false
    if (auth.user.id === participants.customerId) return true
    if (auth.user.id === participants.executorId) return true
    if (auth.user.role === 'arbiter' && auth.user.id === participants.arbiterId) return true
    return false
  }, [auth.user, contract, dispute, participants.arbiterId, participants.customerId, participants.executorId])

  // Arbiter gets full workspace instead of party chat.
  if (auth.user?.role === 'arbiter' && auth.user.id === participants.arbiterId) {
    return <DisputeWorkspacePage />
  }

  const messages = useDisputeMessages(dispute?.id ?? null)
  const visibleMessages = useMemo(() => {
    if (!auth.user) return []
    const isArbiter = auth.user.role === 'arbiter' && auth.user.id === participants.arbiterId
    return isArbiter ? messages : messages.filter((m) => m.kind !== 'internal')
  }, [auth.user, messages, participants.arbiterId])
  const [text, setText] = useState('')
  const [internal, setInternal] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)

  const taskTitle = task ? pickText(task.title, locale) : contract?.taskId ?? dispute?.contractId ?? ''

  const customer = participants.customerId ? users.find((u) => u.id === participants.customerId) ?? null : null
  const executor = participants.executorId ? users.find((u) => u.id === participants.executorId) ?? null : null
  const arbiter = users.find((u) => u.id === participants.arbiterId) ?? null

  useEffect(() => {
    if (!auth.user || !dispute) return
    notificationRepo.markReadForDispute(auth.user.id, dispute.id)
  }, [auth.user, dispute])

  useEffect(() => {
    // scroll to bottom on new messages
    if (!listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [visibleMessages.length])

  if (!auth.user) {
    return (
      <main className="disputeThreadPage">
        <div className="disputeThreadContainer">
          <h1 className="disputeThreadTitle">{locale === 'ru' ? 'Спор' : 'Dispute'}</h1>
          <p style={{ opacity: 0.85 }}>
            <Link to={paths.login}>{locale === 'ru' ? 'Войти' : 'Sign in'}</Link>
          </p>
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

          {auth.user.role === 'arbiter' && auth.user.id === participants.arbiterId ? (
            <div style={{ padding: '0 12px 10px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="linkBtn"
                onClick={() => {
                  if (!dispute) return
                  const txt = locale === 'ru' ? 'Укажите таймкод несоответствия.' : 'Please provide the exact timestamp of the mismatch.'
                  const msg = disputeMessageRepo.addSystem({ disputeId: dispute.id, text: txt })
                  auditLogRepo.add({
                    disputeId: dispute.id,
                    actionType: 'system_message',
                    actorUserId: auth.user!.id,
                    summary: locale === 'ru' ? 'Запрос: таймкод несоответствия' : 'Request: mismatch timestamp',
                    payload: { messageId: msg.id },
                  })
                }}
              >
                {locale === 'ru' ? 'Запросить таймкод' : 'Request timestamp'}
              </button>
              <button
                type="button"
                className="linkBtn"
                onClick={() => {
                  if (!dispute) return
                  const txt = locale === 'ru' ? 'Пришлите исходники (если есть).' : 'Please provide source files (if available).'
                  const msg = disputeMessageRepo.addSystem({ disputeId: dispute.id, text: txt })
                  auditLogRepo.add({
                    disputeId: dispute.id,
                    actionType: 'system_message',
                    actorUserId: auth.user!.id,
                    summary: locale === 'ru' ? 'Запрос: исходники' : 'Request: source files',
                    payload: { messageId: msg.id },
                  })
                }}
              >
                {locale === 'ru' ? 'Запросить исходники' : 'Request sources'}
              </button>
              <button
                type="button"
                className="linkBtn"
                onClick={() => {
                  if (!dispute) return
                  const txt = locale === 'ru' ? 'Уточните пункт ТЗ, на который вы ссылаетесь.' : 'Please clarify which requirement item you refer to.'
                  const msg = disputeMessageRepo.addSystem({ disputeId: dispute.id, text: txt })
                  auditLogRepo.add({
                    disputeId: dispute.id,
                    actionType: 'system_message',
                    actorUserId: auth.user!.id,
                    summary: locale === 'ru' ? 'Запрос: уточнение пункта ТЗ' : 'Request: requirement item clarification',
                    payload: { messageId: msg.id },
                  })
                }}
              >
                {locale === 'ru' ? 'Уточнить пункт ТЗ' : 'Clarify requirement'}
              </button>
            </div>
          ) : null}

          <form
            className="disputeChatComposer"
            onSubmit={(e) => {
              e.preventDefault()
              const trimmed = text.trim()
              if (!trimmed) return
              if (!dispute) return
              const isArbiter = auth.user?.role === 'arbiter' && auth.user.id === participants.arbiterId
              const kind = isArbiter && internal ? 'internal' : 'public'
              const msg = disputeMessageRepo.add({ disputeId: dispute.id, authorUserId: auth.user!.id, kind, text: trimmed })
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
                // Internal notes are not sent to parties.
                if (kind === 'internal' && uid !== participants.arbiterId) continue
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
                actionType: kind === 'internal' ? 'internal_comment' : 'public_message',
                actorUserId: auth.user!.id,
                summary:
                  kind === 'internal'
                    ? locale === 'ru'
                      ? 'Внутренний комментарий'
                      : 'Internal comment'
                    : locale === 'ru'
                      ? 'Сообщение в споре'
                      : 'Dispute message',
                payload: { messageId: msg.id },
              })
            }}
          >
            {auth.user.role === 'arbiter' && auth.user.id === participants.arbiterId ? (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, opacity: 0.9 }}>
                <input
                  type="checkbox"
                  checked={internal}
                  onChange={(e) => setInternal(e.target.checked)}
                />
                {locale === 'ru' ? 'Внутреннее (не видно сторонам)' : 'Internal (hidden from parties)'}
              </label>
            ) : null}
            <textarea
              className="disputeChatInput"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder={locale === 'ru' ? 'Напишите сообщение…' : 'Write a message…'}
            />
            <button className="disputeChatSend" type="submit" disabled={!text.trim()}>
              {locale === 'ru' ? 'Отправить' : 'Send'}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}

