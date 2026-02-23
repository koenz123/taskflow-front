import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { paths, taskDetailsPath, userProfilePath } from '@/app/router/paths'
import { useAuth } from '@/shared/auth/AuthContext'
import { useI18n } from '@/shared/i18n/I18nContext'
import { disputeRepo } from '@/entities/dispute/lib/disputeRepo'
import { refreshDisputes, useDisputes } from '@/entities/dispute/lib/useDisputes'
import { useContracts } from '@/entities/contract/lib/useContracts'
import { useTasks } from '@/entities/task/lib/useTasks'
import { pickText } from '@/entities/task/lib/taskText'
import { useUsers } from '@/entities/user/lib/useUsers'
import { useSubmissions } from '@/entities/submission/lib/useSubmissions'
import { VideoEmbed } from '@/shared/ui/VideoEmbed'
import { balanceFreezeRepo } from '@/entities/user/lib/balanceFreezeRepo'
import { postDisputeMessage, refreshDisputeMessages, useDisputeMessages } from '@/entities/disputeMessage/lib/useDisputeMessages'
import { disputeMessageRepo } from '@/entities/disputeMessage/lib/disputeMessageRepo'
import { useAuditLog } from '@/entities/auditLog/lib/useAuditLog'
import { auditLogRepo } from '@/entities/auditLog/lib/auditLogRepo'
import { notificationRepo } from '@/entities/notification/lib/notificationRepo'
import { disputeArbitrationService } from '@/shared/services/disputeArbitrationService'
import { CustomSelect } from '@/shared/ui/custom-select/CustomSelect'
import { getBlob } from '@/shared/lib/blobStore'
import './dispute-workspace.css'
import { ApiError, api } from '@/shared/api/api'
import { refreshNotifications } from '@/entities/notification/lib/useNotifications'
import { refreshContracts } from '@/entities/contract/lib/useContracts'
import { refreshAssignments } from '@/entities/taskAssignment/lib/useTaskAssignments'
import { refreshTasks } from '@/entities/task/lib/useTasks'
import { serverBalanceRepo } from '@/entities/user/lib/serverBalanceRepo'
import { userIdMatches } from '@/shared/auth/userIdAliases'

const DEV_ARBITER_USER_ID = 'user_dev_arbiter'
const USE_API = import.meta.env.VITE_DATA_SOURCE === 'api'

type DecisionKind = 'release_to_executor' | 'refund_to_customer' | 'partial_refund'

function decisionLabel(kind: DecisionKind, locale: 'ru' | 'en') {
  if (locale === 'ru') {
    if (kind === 'release_to_executor') return 'Выплата исполнителю'
    if (kind === 'refund_to_customer') return 'Возврат заказчику'
    if (kind === 'partial_refund') return 'Частичный возврат'
  } else {
    if (kind === 'release_to_executor') return 'Release to executor'
    if (kind === 'refund_to_customer') return 'Refund to customer'
    if (kind === 'partial_refund') return 'Partial refund'
  }
  return kind
}

function arbiterActionErrorText(message: string, locale: 'ru' | 'en') {
  if (locale !== 'ru') return message
  // Messages come from disputeArbitrationService assertions (english).
  const map: Record<string, string> = {
    'disputeId is required': 'Не найден ID спора.',
    'actorUserId is required': 'Не найден ID пользователя арбитра.',
    'expectedVersion is required': 'Данные устарели. Обновите страницу и попробуйте ещё раз.',
    'Comment is required': 'Нужен комментарий.',
    'Checklist is incomplete': 'Чек‑лист не заполнен.',
    'Dispute not found': 'Спор не найден.',
    'Decision is already locked': 'Решение уже зафиксировано. Изменения невозможны.',
    'Dispute must be in_review to decide': 'Чтобы вынести решение, спор должен быть в статусе «В работе».',
    'Stale data (version mismatch)': 'Данные устарели (конфликт обновления). Обновите страницу и попробуйте ещё раз.',
    'Dispute is assigned to another arbiter': 'Спор уже взят в работу другим арбитром.',
    'Contract not found': 'Контракт не найден.',
    'Escrow is not frozen (cannot release)': 'Escrow не заморожен — нельзя выполнить выплату.',
    'Escrow is not frozen (cannot refund)': 'Escrow не заморожен — нельзя выполнить возврат.',
    'executorAmount is invalid': 'Сумма «Исполнителю» указана неверно.',
    'customerAmount is invalid': 'Сумма «Заказчику» указана неверно.',
    'Escrow is not frozen (cannot split)': 'Escrow не заморожен — нельзя распределить частично.',
    'Partial amounts must sum to escrow amount': 'Суммы частичного решения должны в сумме равняться escrow.',
    'Failed to lock decision (possibly stale)': 'Не удалось зафиксировать решение (возможно, данные устарели). Обновите страницу и попробуйте ещё раз.',
    version_mismatch: 'Данные устарели (конфликт обновления). Обновите страницу и попробуйте ещё раз.',
    request_failed_409: 'Данные устарели (конфликт обновления). Обновите страницу и попробуйте ещё раз.',
  }
  return map[message] ?? message
}

function statusLabel(status: string, locale: 'ru' | 'en') {
  if (locale === 'ru') {
    if (status === 'open') return 'Открыт'
    if (status === 'in_review') return 'В работе'
    if (status === 'need_more_info') return 'Нужна информация'
    if (status === 'decided') return 'Решение принято'
    if (status === 'closed') return 'Закрыт'
  } else {
    if (status === 'open') return 'Open'
    if (status === 'in_review') return 'In review'
    if (status === 'need_more_info') return 'Need more info'
    if (status === 'decided') return 'Decided'
    if (status === 'closed') return 'Closed'
  }
  return status
}

function fmtRemaining(ms: number) {
  const sign = ms < 0 ? '-' : ''
  const abs = Math.abs(ms)
  const totalMin = Math.floor(abs / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h <= 0) return `${sign}${m}m`
  return `${sign}${h}h ${m}m`
}

function downloadBlob(name: string, blob: Blob) {
  const safeName = (name || 'file').trim() || 'file'
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = safeName
  a.rel = 'noreferrer'
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function DisputeWorkspacePage() {
  const { disputeId } = useParams()
  const auth = useAuth()
  const { locale } = useI18n()
  const navigate = useNavigate()
  const chatListRef = useRef<HTMLDivElement | null>(null)
  const didInitialChatScrollRef = useRef(false)

  const disputes = useDisputes()
  const contracts = useContracts()
  const tasks = useTasks()
  const users = useUsers()
  const submissions = useSubmissions()

  // Keep page resilient even if auth/user is temporarily null.
  const user = auth.user
  if (!user) {
    return (
      <main className="disputeWsPage">
        <div className="disputeWsContainer">
          <h1 className="disputeWsTitle">{locale === 'ru' ? 'Загрузка…' : 'Loading…'}</h1>
        </div>
      </main>
    )
  }

  const dispute = disputeId ? disputes.find((d) => d.id === disputeId) ?? null : null
  const contract = useMemo(
    () => (dispute ? contracts.find((c) => c.id === dispute.contractId) ?? null : null),
    [contracts, dispute],
  )
  const task = useMemo(
    () => (contract ? tasks.find((t) => t.id === contract.taskId) ?? null : null),
    [contract, tasks],
  )

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

  const isArbiter = Boolean(user.role === 'arbiter' && user.id === participants.arbiterId)
  const allowed = Boolean(dispute && contract && isArbiter)

  const customer = participants.customerId ? users.find((u) => userIdMatches(u, participants.customerId)) ?? null : null
  const executor = participants.executorId ? users.find((u) => userIdMatches(u, participants.executorId)) ?? null : null

  const audit = useAuditLog(dispute?.id ?? null)
  const messages = useDisputeMessages(dispute?.id ?? null)

  const takeInWorkApi = async (expectedVersion?: number) => {
    if (!dispute) return
    await api.post(`/disputes/${encodeURIComponent(dispute.id)}/take-in-work`, {
      ...(typeof expectedVersion === 'number' ? { expectedVersion } : null),
    })
    await Promise.all([refreshDisputes(), refreshNotifications()])
  }

  const requestMoreInfoApi = async (expectedVersion?: number) => {
    if (!dispute) return
    await api.post(`/disputes/${encodeURIComponent(dispute.id)}/request-more-info`, {
      ...(typeof expectedVersion === 'number' ? { expectedVersion } : null),
    })
    await Promise.all([refreshDisputes(), refreshNotifications()])
  }

  const closeDisputeApi = async () => {
    if (!dispute) return
    await api.post(`/disputes/${encodeURIComponent(dispute.id)}/close`, {})
    await Promise.all([refreshDisputes(), refreshNotifications()])
  }

  const actionErrorText = (e: unknown) => {
    if (e instanceof ApiError) {
      if (e.status === 409) {
        return locale === 'ru'
          ? 'Данные устарели (конфликт обновления). Обновите страницу и попробуйте ещё раз.'
          : 'Stale data (version mismatch). Refresh the page and try again.'
      }
      if (e.status === 401) {
        return locale === 'ru' ? 'Сессия истекла. Войдите заново.' : 'Session expired. Please sign in again.'
      }
      if (e.status === 403) {
        return locale === 'ru' ? 'Нет прав на это действие.' : 'You are not allowed to perform this action.'
      }
      return `${e.status ?? 'ERR'} ${e.message}`
    }
    return e instanceof Error ? e.message : locale === 'ru' ? 'Неизвестная ошибка.' : 'Unknown error.'
  }

  const decideApi = async (input: { expectedVersion?: number; decision: any }) => {
    if (!dispute) return
    const body = {
      ...(typeof input.expectedVersion === 'number' ? { expectedVersion: input.expectedVersion } : null),
      decision: input.decision,
    }
    try {
      await api.post(`/disputes/${encodeURIComponent(dispute.id)}/decision`, body)
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        // Back-compat: older route name.
        await api.post(`/disputes/${encodeURIComponent(dispute.id)}/decide`, body)
      } else {
        throw e
      }
    }
    await Promise.all([
      refreshDisputes(),
      refreshContracts(),
      refreshAssignments(),
      refreshTasks(),
      refreshNotifications(),
      serverBalanceRepo.refresh().catch(() => {}),
    ])
  }

  useEffect(() => {
    // New dispute opened -> allow initial scroll again.
    didInitialChatScrollRef.current = false
    setActionError(null)
  }, [dispute?.id])

  useEffect(() => {
    // Default behavior: on initial open/refresh, jump to the latest messages.
    // Do not force-scroll after user starts browsing history.
    if (didInitialChatScrollRef.current) return
    if (messages.length === 0) return
    const el = chatListRef.current
    if (!el) return
    const raf = window.requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
      didInitialChatScrollRef.current = true
    })
    return () => window.cancelAnimationFrame(raf)
  }, [messages.length])

  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!dispute) return
    notificationRepo.markReadForDispute(user.id, dispute.id)
  }, [dispute, user.id])

  // Decision draft (autosave later; for now local state)
  const [decisionKind, setDecisionKind] = useState<DecisionKind>('release_to_executor')
  const [partialExecutorAmount, setPartialExecutorAmount] = useState('')
  const [partialCustomerAmount, setPartialCustomerAmount] = useState('')
  const [comment, setComment] = useState('')
  const [checkedReq, setCheckedReq] = useState(false)
  const [checkedVideo, setCheckedVideo] = useState(false)
  const [checkedChat, setCheckedChat] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmVersion, setConfirmVersion] = useState<number | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [arbiterDraft, setArbiterDraft] = useState('')

  // Avoid showing "not found" before the first API fetch completes.
  if (USE_API && disputeId && disputes.length === 0) {
    return (
      <main className="disputeWsPage">
        <div className="disputeWsContainer">
          <h1 className="disputeWsTitle">{locale === 'ru' ? 'Загрузка спора…' : 'Loading dispute…'}</h1>
          <div style={{ opacity: 0.85, marginTop: 8 }}>
            <Link to={paths.disputes}>{locale === 'ru' ? 'К очереди' : 'Back to inbox'}</Link>
          </div>
        </div>
      </main>
    )
  }

  if (!dispute || !contract) {
    return (
      <main className="disputeWsPage">
        <div className="disputeWsContainer">
          <h1 className="disputeWsTitle">{locale === 'ru' ? 'Спор не найден' : 'Dispute not found'}</h1>
          <div style={{ opacity: 0.85, marginTop: 8 }}>
            <Link to={paths.disputes}>{locale === 'ru' ? 'К очереди' : 'Back to inbox'}</Link>
          </div>
        </div>
      </main>
    )
  }

  if (!allowed) {
    return (
      <main className="disputeWsPage">
        <div className="disputeWsContainer">
          <h1 className="disputeWsTitle">{locale === 'ru' ? 'Нет доступа' : 'Access denied'}</h1>
          <div style={{ opacity: 0.85, marginTop: 8 }}>
            <Link to={paths.profile}>{locale === 'ru' ? 'В профиль' : 'Go to profile'}</Link>
          </div>
        </div>
      </main>
    )
  }

  const taskTitle = task ? pickText(task.title, locale) : contract.taskId
  const dueMs = dispute.slaDueAt ? Date.parse(dispute.slaDueAt) : NaN
  const leftMs = Number.isFinite(dueMs) ? dueMs - nowMs : NaN
  const escrowAmount = contract.escrowAmount ?? 0
  const escrowFrozen = balanceFreezeRepo
    .listForTask(contract.taskId)
    .find((e) => e.executorId === contract.executorId)?.amount ?? 0

  const allVersions = submissions
    .filter((s) => s.contractId === contract.id)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const canDecide = dispute.status !== 'closed' && !dispute.lockedDecisionAt
  const canClose = dispute.status !== 'closed'
  const isTakenByMe = dispute.assignedArbiterId === auth.user!.id
  const canChatActions = canClose && isTakenByMe
  const notifyPartiesStatus = (status: string, note?: string) => {
    const targets = [participants.customerId, participants.executorId].filter(Boolean) as string[]
    for (const uid of targets) {
      if (uid === auth.user!.id) continue
      notificationRepo.addDisputeStatus({
        recipientUserId: uid,
        actorUserId: auth.user!.id,
        taskId: contract.taskId,
        disputeId: dispute.id,
        status,
        note,
      })
    }
  }

  const confirmDisabled =
    !comment.trim() || !checkedReq || !checkedVideo || !checkedChat || !canDecide

  const decisionOptions = useMemo<Array<{ value: DecisionKind; label: string }>>(
    () => [
      { value: 'release_to_executor', label: decisionLabel('release_to_executor', locale) },
      { value: 'refund_to_customer', label: decisionLabel('refund_to_customer', locale) },
      { value: 'partial_refund', label: decisionLabel('partial_refund', locale) },
    ],
    [locale],
  )

  return (
    <main className="disputeWsPage">
      <div className="disputeWsContainer">
        <header className="disputeWsHeader">
          <div className="disputeWsHeader__left">
            <button
              type="button"
              className="disputeWsBack"
              onClick={() => {
                if (window.history.length > 1) navigate(-1)
                else navigate(paths.disputes)
              }}
            >
              ←
            </button>
            <div className="disputeWsHeader__meta">
              <div className="disputeWsKicker">
                {locale === 'ru' ? 'Спор' : 'Dispute'} · {statusLabel(dispute.status, locale)} · SLA:{' '}
                {Number.isFinite(leftMs) ? fmtRemaining(leftMs) : '—'}
              </div>
              <h1 className="disputeWsTitle" title={taskTitle}>
                {taskTitle}
              </h1>
              <div className="disputeWsSub">
                <span>
                  {locale === 'ru' ? 'Контракт' : 'Contract'}: <span className="disputeWsMono">{contract.id}</span>
                </span>
                <span className="disputeWsDot">·</span>
                <span>
                  {locale === 'ru' ? 'Задание' : 'Task'}:{' '}
                  <Link to={taskDetailsPath(contract.taskId)}>{contract.taskId}</Link>
                </span>
              </div>
            </div>
          </div>
          <div className="disputeWsHeader__right">
            <span className="disputeWsMeta">{locale === 'ru' ? 'Режим арбитра' : 'Arbiter mode'}</span>
          </div>
        </header>

        <div className="disputeWsGrid">
          {/* Left: context */}
          <section className="disputeWsCol">
            <div className="disputeWsPanel">
              <div className="disputeWsPanel__title">{locale === 'ru' ? 'Контекст заказа' : 'Order context'}</div>
              <div className="disputeWsBlock">
                <div className="disputeWsLabel">{locale === 'ru' ? 'Заказчик' : 'Customer'}</div>
                <div className="disputeWsValue">
                  {customer ? <Link to={userProfilePath(customer.id)}>{customer.fullName}</Link> : participants.customerId}
                </div>
              </div>
              <div className="disputeWsBlock">
                <div className="disputeWsLabel">{locale === 'ru' ? 'Исполнитель' : 'Executor'}</div>
                <div className="disputeWsValue">
                  {executor ? <Link to={userProfilePath(executor.id)}>{executor.fullName}</Link> : participants.executorId}
                </div>
              </div>
              <div className="disputeWsBlock">
                <div className="disputeWsLabel">{locale === 'ru' ? 'Сумма (escrow)' : 'Escrow amount'}</div>
                <div className="disputeWsValue">
                  <strong>{escrowAmount}</strong>
                        <span className="disputeWsMeta" style={{ marginLeft: 10 }}>
                          {locale === 'ru' ? 'Заморожено' : 'Frozen'}: {escrowFrozen || 0}
                        </span>
                </div>
              </div>
              {task ? (
                <>
                  <div className="disputeWsDivider" />
                  <div className="disputeWsBlock">
                    <div className="disputeWsLabel">{locale === 'ru' ? 'Описание' : 'Description'}</div>
                    <div className="disputeWsValue" style={{ whiteSpace: 'pre-wrap' }}>
                      {pickText(task.description, locale)}
                    </div>
                  </div>
                  {task.requirements ? (
                    <div className="disputeWsBlock">
                      <div className="disputeWsLabel">{locale === 'ru' ? 'Требования' : 'Requirements'}</div>
                      <div className="disputeWsValue" style={{ whiteSpace: 'pre-wrap' }}>
                        {pickText(task.requirements, locale)}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>

            <div className="disputeWsPanel">
              <div className="disputeWsPanel__title">{locale === 'ru' ? 'Сдачи (версии)' : 'Deliverables (versions)'}</div>
              {allVersions.length === 0 ? (
                <div className="disputeWsEmpty">{locale === 'ru' ? 'Нет сдач.' : 'No submissions yet.'}</div>
              ) : (
                <div className="disputeWsList">
                  {allVersions.map((s) => (
                    <div key={s.id} className="disputeWsItem">
                      <div className="disputeWsItem__top">
                        <span className="disputeWsMono">{s.id}</span>
                        <span className="disputeWsMeta">
                          {new Date(s.createdAt).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US')}
                        </span>
                      {s.id === allVersions[0]?.id ? (
                          <span className="disputeWsPill">{locale === 'ru' ? 'Актуальная' : 'Latest'}</span>
                        ) : null}
                      </div>
                      {s.message ? <div className="disputeWsItem__msg">{s.message}</div> : null}
                      {s.files?.length ? (
                        <div className="disputeWsFiles">
                          {s.files.map((f, idx) => (
                            <div key={`${f.url}-${idx}`} className="disputeWsFile">
                              {f.url.startsWith('idb:') ? (
                                <button
                                  type="button"
                                  className="disputeWsFile__download"
                                  onClick={() => {
                                    const blobId = f.url.slice('idb:'.length)
                                    const name = (f.title ?? '').trim() || (locale === 'ru' ? 'Видео' : 'Video')
                                    void (async () => {
                                      const blob = await getBlob(blobId)
                                      if (!blob) return
                                      downloadBlob(name, blob)
                                    })()
                                  }}
                                >
                                  {locale === 'ru' ? 'Скачать' : 'Download'}: {f.title ?? 'file'}
                                </button>
                              ) : (
                                <>
                                  <a href={f.url} target="_blank" rel="noreferrer">
                                    {f.title ?? f.url}
                                  </a>
                                  {f.mediaType === 'video' ? <VideoEmbed src={f.url} /> : null}
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="disputeWsPanel">
              <div className="disputeWsPanel__title">{locale === 'ru' ? 'История (audit)' : 'Audit log'}</div>
              {audit.length === 0 ? (
                <div className="disputeWsEmpty">{locale === 'ru' ? 'Пока пусто.' : 'No events yet.'}</div>
              ) : (
                <div className="disputeWsList">
                  {audit.map((e) => (
                    <div key={e.id} className="disputeWsAudit">
                      <div className="disputeWsAudit__top">
                        <span className="disputeWsMono">{e.actionType}</span>
                        <span className="disputeWsMeta">
                          {new Date(e.createdAt).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US')}
                        </span>
                      </div>
                      <div className="disputeWsAudit__summary">{e.summary}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Center: communication */}
          <section className="disputeWsCol disputeWsCol--center">
            <div className="disputeWsPanel disputeWsPanel--chat">
              <div className="disputeWsPanel__title">{locale === 'ru' ? 'Коммуникация' : 'Communication'}</div>
              <div className="disputeWsChat">
                {!isTakenByMe ? (
                  <div className="disputeWsWarn" style={{ marginTop: 0 }}>
                    {locale === 'ru'
                      ? 'Арбитр не может отправлять сообщения в чат, пока не возьмёт спор в работу.'
                      : 'Arbiter cannot send chat messages until the dispute is taken in work.'}
                  </div>
                ) : null}
                <div
                  className="disputeWsChatList"
                  ref={chatListRef}
                  aria-label={locale === 'ru' ? 'Сообщения' : 'Messages'}
                >
                  {messages.map((m) => {
                    const author = users.find((u) => u.id === m.authorUserId) ?? null
                    const time = new Date(m.createdAt).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US')
                    return (
                      <div key={m.id} className={`disputeWsMsg ${m.kind === 'internal' ? 'isInternal' : m.kind === 'system' ? 'isSystem' : ''}`}>
                        <div className="disputeWsMsg__meta">
                          <span className="disputeWsMsg__author">{author?.fullName ?? m.authorUserId}</span>
                          <span className="disputeWsMeta">{time}</span>
                          <span className="disputeWsPill">{m.kind}</span>
                        </div>
                        <div className="disputeWsMsg__text">{m.text}</div>
                      </div>
                    )
                  })}
                </div>

                <div className="disputeWsChatComposer">
                  <textarea
                    className="disputeWsTextarea"
                    value={arbiterDraft}
                    onChange={(e) => setArbiterDraft(e.target.value)}
                    placeholder={locale === 'ru' ? 'Сообщение для заказчика и исполнителя…' : 'Message to customer and executor…'}
                    rows={3}
                    disabled={!canChatActions}
                    onKeyDown={(e) => {
                      const isSubmit = (e.ctrlKey || e.metaKey) && e.key === 'Enter'
                      if (!isSubmit) return
                      e.preventDefault()
                      if (!canChatActions) return
                      const text = arbiterDraft.trim()
                      if (!text) return
                      if (USE_API) {
                        void postDisputeMessage({ disputeId: dispute.id, text, kind: 'public' })
                          .then(async () => {
                            setArbiterDraft('')
                            await Promise.all([refreshDisputeMessages(dispute.id), refreshNotifications(), refreshDisputes()])
                          })
                          .catch(() => {})
                        return
                      }
                      const msg = disputeMessageRepo.add({
                        disputeId: dispute.id,
                        authorUserId: auth.user!.id,
                        kind: 'public',
                        text,
                      })
                      for (const uid of [participants.customerId, participants.executorId].filter(Boolean) as string[]) {
                        if (uid === auth.user!.id) continue
                        notificationRepo.addDisputeMessage({
                          recipientUserId: uid,
                          actorUserId: auth.user!.id,
                          taskId: contract.taskId,
                          disputeId: dispute.id,
                          message: msg.text,
                        })
                      }
                      auditLogRepo.add({
                        disputeId: dispute.id,
                        actionType: 'public_message',
                        actorUserId: auth.user!.id,
                        summary: locale === 'ru' ? 'Сообщение арбитра' : 'Arbiter message',
                        payload: { messageId: msg.id },
                      })
                      setArbiterDraft('')
                    }}
                  />
                  <div className="disputeWsChatComposerRow">
                    <button
                      type="button"
                      className="disputeWsBtn disputeWsBtn--primary"
                      disabled={!canChatActions || !arbiterDraft.trim()}
                      onClick={() => {
                        if (!canChatActions) return
                        const text = arbiterDraft.trim()
                        if (!text) return
                        const msg = disputeMessageRepo.add({
                          disputeId: dispute.id,
                          authorUserId: auth.user!.id,
                          kind: 'public',
                          text,
                        })
                        for (const uid of [participants.customerId, participants.executorId].filter(Boolean) as string[]) {
                          if (uid === auth.user!.id) continue
                          notificationRepo.addDisputeMessage({
                            recipientUserId: uid,
                            actorUserId: auth.user!.id,
                            taskId: contract.taskId,
                            disputeId: dispute.id,
                            message: msg.text,
                          })
                        }
                        auditLogRepo.add({
                          disputeId: dispute.id,
                          actionType: 'public_message',
                          actorUserId: auth.user!.id,
                          summary: locale === 'ru' ? 'Сообщение арбитра' : 'Arbiter message',
                          payload: { messageId: msg.id },
                        })
                        setArbiterDraft('')
                      }}
                    >
                      {locale === 'ru' ? 'Отправить' : 'Send'}
                    </button>
                    <span className="disputeWsMeta">{locale === 'ru' ? 'Ctrl+Enter — отправить' : 'Ctrl+Enter — send'}</span>
                  </div>
                </div>

                <div className="disputeWsChatActions">
                  <button
                    type="button"
                    className="linkBtn"
                    disabled={!canChatActions}
                    onClick={() => {
                      if (!canChatActions) return
                      const msg = disputeMessageRepo.addSystem({
                        disputeId: dispute.id,
                        text: locale === 'ru' ? 'Укажите таймкод несоответствия.' : 'Please provide the exact timestamp of the mismatch.',
                      })
                      // Notify parties about new system message in chat
                      for (const uid of [participants.customerId, participants.executorId].filter(Boolean) as string[]) {
                        notificationRepo.addDisputeMessage({
                          recipientUserId: uid,
                          actorUserId: auth.user!.id,
                          taskId: contract.taskId,
                          disputeId: dispute.id,
                          message: msg.text,
                        })
                      }
                      auditLogRepo.add({
                        disputeId: dispute.id,
                        actionType: 'system_message',
                        actorUserId: auth.user!.id,
                        summary: locale === 'ru' ? 'Запрос: таймкод несоответствия' : 'Request: mismatch timestamp',
                        payload: { messageId: msg.id },
                      })
                    }}
                  >
                    {locale === 'ru' ? 'Укажите таймкод' : 'Request timestamp'}
                  </button>
                  <button
                    type="button"
                    className="linkBtn"
                    disabled={!canChatActions}
                    onClick={() => {
                      if (!canChatActions) return
                      const txt = locale === 'ru' ? 'Пришлите исходники (если есть).' : 'Please provide source files (if available).'
                      if (USE_API) {
                        void postDisputeMessage({ disputeId: dispute.id, text: txt, kind: 'system' })
                          .then(async () => {
                            await Promise.all([refreshDisputeMessages(dispute.id), refreshNotifications(), refreshDisputes()])
                          })
                          .catch(() => {})
                        return
                      }
                      const msg = disputeMessageRepo.addSystem({ disputeId: dispute.id, text: txt })
                      for (const uid of [participants.customerId, participants.executorId].filter(Boolean) as string[]) {
                        notificationRepo.addDisputeMessage({
                          recipientUserId: uid,
                          actorUserId: auth.user!.id,
                          taskId: contract.taskId,
                          disputeId: dispute.id,
                          message: msg.text,
                        })
                      }
                      auditLogRepo.add({
                        disputeId: dispute.id,
                        actionType: 'system_message',
                        actorUserId: auth.user!.id,
                        summary: locale === 'ru' ? 'Запрос: исходники' : 'Request: source files',
                        payload: { messageId: msg.id },
                      })
                    }}
                  >
                    {locale === 'ru' ? 'Пришлите исходники' : 'Request sources'}
                  </button>
                  <button
                    type="button"
                    className="linkBtn"
                    disabled={!canChatActions}
                    onClick={() => {
                      if (!canChatActions) return
                      const txt = locale === 'ru' ? 'Уточните пункт ТЗ, на который вы ссылаетесь.' : 'Please clarify which requirement item you refer to.'
                      if (USE_API) {
                        void postDisputeMessage({ disputeId: dispute.id, text: txt, kind: 'system' })
                          .then(async () => {
                            await Promise.all([refreshDisputeMessages(dispute.id), refreshNotifications(), refreshDisputes()])
                          })
                          .catch(() => {})
                        return
                      }
                      const msg = disputeMessageRepo.addSystem({ disputeId: dispute.id, text: txt })
                      for (const uid of [participants.customerId, participants.executorId].filter(Boolean) as string[]) {
                        notificationRepo.addDisputeMessage({
                          recipientUserId: uid,
                          actorUserId: auth.user!.id,
                          taskId: contract.taskId,
                          disputeId: dispute.id,
                          message: msg.text,
                        })
                      }
                      auditLogRepo.add({
                        disputeId: dispute.id,
                        actionType: 'system_message',
                        actorUserId: auth.user!.id,
                        summary: locale === 'ru' ? 'Запрос: уточнение пункта ТЗ' : 'Request: requirement item clarification',
                        payload: { messageId: msg.id },
                      })
                    }}
                  >
                    {locale === 'ru' ? 'Уточните пункт ТЗ' : 'Clarify requirement'}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Right: decision */}
          <section className="disputeWsCol disputeWsCol--right">
            <div className="disputeWsPanel">
              <div className="disputeWsPanel__title">{locale === 'ru' ? 'Решение' : 'Decision'}</div>

              <div className="disputeWsBlock">
                <div className="disputeWsLabel">{locale === 'ru' ? 'Статус спора' : 'Dispute status'}</div>
                <div className="disputeWsValue">
                  <span className="disputeWsPill">{statusLabel(dispute.status, locale)}</span>
                </div>
              </div>

              <div className="disputeWsBlock">
                <div className="disputeWsLabel">{locale === 'ru' ? 'В работе' : 'Assigned'}</div>
                <div className="disputeWsValue">{dispute.assignedArbiterId ?? '—'}</div>
              </div>

              <div className="disputeWsActionsRow">
                {dispute.status === 'need_more_info' ? (
                  <button
                    type="button"
                    className="disputeWsBtn"
                    disabled={!canDecide || (!!dispute.assignedArbiterId && !isTakenByMe)}
                    onClick={() => {
                      const before = dispute.version ?? 1
                      if (USE_API) {
                        void (async () => {
                          try {
                            setActionError(null)
                            await takeInWorkApi(before)
                          } catch (e) {
                            setActionError(actionErrorText(e))
                          }
                        })()
                        return
                      }
                      const next = disputeRepo.takeInWork({ disputeId: dispute.id, arbiterId: auth.user!.id, expectedVersion: before })
                      if (!next) return
                      disputeMessageRepo.addSystem({
                        disputeId: dispute.id,
                        text: locale === 'ru' ? 'Арбитр продолжил рассмотрение.' : 'Arbiter resumed review.',
                      })
                      notifyPartiesStatus('in_review')
                      auditLogRepo.add({
                        disputeId: dispute.id,
                        actionType: 'resume_review',
                        actorUserId: auth.user!.id,
                        summary: locale === 'ru' ? 'Продолжено рассмотрение' : 'Resumed review',
                        versionBefore: before,
                        versionAfter: next.version,
                      })
                    }}
                  >
                    {locale === 'ru' ? 'Продолжить рассмотрение' : 'Resume review'}
                  </button>
                ) : dispute.status === 'open' ? (
                  <button
                    type="button"
                    className="disputeWsBtn"
                    disabled={!canDecide || (!!dispute.assignedArbiterId && !isTakenByMe)}
                    onClick={() => {
                      const before = dispute.version ?? 1
                      if (USE_API) {
                        void (async () => {
                          try {
                            setActionError(null)
                            await takeInWorkApi(before)
                          } catch (e) {
                            setActionError(actionErrorText(e))
                          }
                        })()
                        return
                      }
                      const next = disputeRepo.takeInWork({ disputeId: dispute.id, arbiterId: auth.user!.id, expectedVersion: before })
                      if (!next) return
                      disputeMessageRepo.addSystem({
                        disputeId: dispute.id,
                        text: locale === 'ru' ? 'Арбитр взял спор в работу.' : 'Arbiter took the dispute in work.',
                      })
                      notifyPartiesStatus('in_review')
                      auditLogRepo.add({
                        disputeId: dispute.id,
                        actionType: 'take_in_work',
                        actorUserId: auth.user!.id,
                        summary: locale === 'ru' ? 'Взято в работу' : 'Taken in work',
                        versionBefore: before,
                        versionAfter: next.version,
                      })
                    }}
                  >
                    {locale === 'ru' ? 'Взять в работу' : 'Take in work'}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="disputeWsBtn"
                  disabled={!canDecide || !isTakenByMe}
                  onClick={() => {
                    if (!isTakenByMe) return
                    const before = dispute.version ?? 1
                    if (USE_API) {
                      void (async () => {
                        try {
                          setActionError(null)
                          await requestMoreInfoApi(before)
                        } catch (e) {
                          setActionError(actionErrorText(e))
                        }
                      })()
                      return
                    }
                    const next = disputeRepo.requestMoreInfo({ disputeId: dispute.id, arbiterId: auth.user!.id, expectedVersion: before })
                    if (!next) return
                    disputeMessageRepo.addSystem({ disputeId: dispute.id, text: locale === 'ru' ? 'Арбитр запросил дополнительную информацию.' : 'Arbiter requested more information.' })
                    notifyPartiesStatus('need_more_info')
                    auditLogRepo.add({
                      disputeId: dispute.id,
                      actionType: 'request_more_info',
                      actorUserId: auth.user!.id,
                      summary: locale === 'ru' ? 'Запрошена информация' : 'Requested more info',
                      versionBefore: before,
                      versionAfter: next.version,
                    })
                  }}
                >
                  {locale === 'ru' ? 'Запросить инфо' : 'Request info'}
                </button>
              </div>

              {actionError ? <div className="disputeWsError" style={{ marginTop: 10 }}>{actionError}</div> : null}

              <div className="disputeWsDivider" />

              <div className="disputeWsField">
                <CustomSelect
                  value={decisionKind}
                  onChange={setDecisionKind}
                  options={decisionOptions}
                  disabled={!canDecide}
                  label={<span className="disputeWsLabel">{locale === 'ru' ? 'Тип решения' : 'Decision type'}</span>}
                />
              </div>

              {decisionKind === 'partial_refund' ? (
                <div className="disputeWsGrid2">
                  <label className="disputeWsField">
                    <span className="disputeWsLabel">{locale === 'ru' ? 'Исполнителю' : 'Executor amount'}</span>
                    <input className="disputeWsInput" value={partialExecutorAmount} onChange={(e) => setPartialExecutorAmount(e.target.value)} inputMode="decimal" disabled={!canDecide} />
                  </label>
                  <label className="disputeWsField">
                    <span className="disputeWsLabel">{locale === 'ru' ? 'Заказчику' : 'Customer amount'}</span>
                    <input className="disputeWsInput" value={partialCustomerAmount} onChange={(e) => setPartialCustomerAmount(e.target.value)} inputMode="decimal" disabled={!canDecide} />
                  </label>
                </div>
              ) : null}

              <label className="disputeWsField">
                <span className="disputeWsLabel">{locale === 'ru' ? 'Комментарий (обязателен)' : 'Comment (required)'}</span>
                <textarea className="disputeWsTextarea" value={comment} onChange={(e) => setComment(e.target.value)} rows={4} disabled={!canDecide} />
              </label>

              <div className="disputeWsChecklist">
                <label className="disputeWsCheck">
                  <input type="checkbox" checked={checkedReq} onChange={(e) => setCheckedReq(e.target.checked)} disabled={!canDecide} />
                  {locale === 'ru' ? 'Проверено ТЗ' : 'Requirements checked'}
                </label>
                <label className="disputeWsCheck">
                  <input type="checkbox" checked={checkedVideo} onChange={(e) => setCheckedVideo(e.target.checked)} disabled={!canDecide} />
                  {locale === 'ru' ? 'Просмотрено видео' : 'Video reviewed'}
                </label>
                <label className="disputeWsCheck">
                  <input type="checkbox" checked={checkedChat} onChange={(e) => setCheckedChat(e.target.checked)} disabled={!canDecide} />
                  {locale === 'ru' ? 'Изучена переписка' : 'Chat reviewed'}
                </label>
              </div>

              <div className="disputeWsActionsRow">
                <button
                  type="button"
                  className="disputeWsBtn disputeWsBtn--primary"
                  disabled={confirmDisabled || !isTakenByMe}
                  onClick={() => {
                    if (!isTakenByMe) return
                    setConfirmVersion(dispute.version ?? 1)
                    setConfirmError(null)
                    setConfirmOpen(true)
                  }}
                >
                  {locale === 'ru' ? 'Вынести решение' : 'Confirm decision'}
                </button>
                <button
                  type="button"
                  className="disputeWsBtn"
                  disabled={!canClose || !isTakenByMe}
                  onClick={() => {
                    if (!isTakenByMe) return
                    if (USE_API) {
                      void (async () => {
                        try {
                          setActionError(null)
                          await closeDisputeApi()
                        } catch (e) {
                          setActionError(actionErrorText(e))
                        }
                      })()
                      return
                    }
                    const closed = disputeRepo.close(contract.id)
                    if (!closed) return
                    disputeMessageRepo.addSystem({ disputeId: dispute.id, text: locale === 'ru' ? 'Спор закрыт арбитром.' : 'Dispute closed by arbiter.' })
                    notifyPartiesStatus('closed')
                    auditLogRepo.add({
                      disputeId: dispute.id,
                      actionType: 'dispute_closed',
                      actorUserId: auth.user!.id,
                      summary: locale === 'ru' ? 'Спор закрыт' : 'Dispute closed',
                    })
                  }}
                >
                  {locale === 'ru' ? 'Закрыть спор' : 'Close dispute'}
                </button>
              </div>

              {!canDecide ? (
                <div className="disputeWsWarn">
                  {locale === 'ru' ? 'Решение уже зафиксировано или спор закрыт. Действия недоступны.' : 'Decision is locked or dispute is closed. Actions are disabled.'}
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>

      {confirmOpen ? (
        <div
          className="disputeWsOverlay"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            setConfirmOpen(false)
            setConfirmError(null)
          }}
        >
          <div className="disputeWsModal" onClick={(e) => e.stopPropagation()}>
            <div className="disputeWsModal__top">
              <div className="disputeWsModal__title">{locale === 'ru' ? 'Подтверждение решения' : 'Confirm decision'}</div>
              <button
                type="button"
                className="disputeWsModal__close"
                onClick={() => {
                  setConfirmOpen(false)
                  setConfirmError(null)
                }}
                aria-label={locale === 'ru' ? 'Закрыть' : 'Close'}
              >
                ×
              </button>
            </div>
            <div className="disputeWsModal__body">
              <div className="disputeWsWarn">
                {locale === 'ru'
                  ? 'Финансовые решения будут применены после подтверждения (escrow будет распределён).'
                  : 'Financial decisions will be executed after confirmation (escrow will be distributed).'}
              </div>
              {confirmError ? <div className="disputeWsError">{confirmError}</div> : null}
              <div style={{ marginTop: 10, opacity: 0.9 }}>
                {locale === 'ru' ? 'Тип:' : 'Type:'} <strong>{decisionLabel(decisionKind, locale)}</strong>
              </div>
              {decisionKind === 'partial_refund' ? (
                <div style={{ marginTop: 8, opacity: 0.9 }}>
                  {locale === 'ru' ? 'Суммы:' : 'Amounts:'}{' '}
                  <strong>
                    {locale === 'ru' ? 'исполнителю' : 'executor'}: {partialExecutorAmount || '—'},{' '}
                    {locale === 'ru' ? 'заказчику' : 'customer'}: {partialCustomerAmount || '—'}
                  </strong>
                </div>
              ) : null}
              <div style={{ marginTop: 8, opacity: 0.9 }}>
                {locale === 'ru' ? 'Комментарий:' : 'Comment:'} <div style={{ whiteSpace: 'pre-wrap' }}>{comment.trim()}</div>
              </div>
            </div>
            <div className="disputeWsModal__actions">
              <button
                type="button"
                className="disputeWsBtn"
                onClick={() => {
                  setConfirmOpen(false)
                  setConfirmError(null)
                }}
              >
                {locale === 'ru' ? 'Отмена' : 'Cancel'}
              </button>
              <button
                type="button"
                className="disputeWsBtn disputeWsBtn--primary"
                onClick={() => {
                  try {
                    setConfirmError(null)
                    const expectedVersion = confirmVersion ?? (dispute.version ?? 1)
                    const partial =
                      decisionKind === 'partial_refund'
                        ? { executorAmount: Number(partialExecutorAmount), customerAmount: Number(partialCustomerAmount) }
                        : undefined
                    if (USE_API) {
                      const decision =
                        decisionKind === 'release_to_executor'
                          ? { payout: 'executor' as const }
                          : decisionKind === 'refund_to_customer'
                            ? { payout: 'customer' as const }
                            : {
                                payout: 'partial' as const,
                                executorAmount: Number(partial?.executorAmount ?? 0),
                                customerAmount: Number(partial?.customerAmount ?? 0),
                                note: comment.trim() || undefined,
                              }
                      void decideApi({ expectedVersion, decision })
                        .then(() => {
                          setConfirmOpen(false)
                          setConfirmError(null)
                        })
                        .catch((e) => {
                          const message = e instanceof Error ? e.message : 'decision_failed'
                          setConfirmError(arbiterActionErrorText(message, locale))
                        })
                      return
                    }
                    disputeArbitrationService.decideAndExecute({
                      disputeId: dispute.id,
                      actorUserId: auth.user!.id,
                      expectedVersion,
                      decisionKind,
                      comment: comment.trim(),
                      checklist: {
                        requirementsChecked: checkedReq,
                        videoReviewed: checkedVideo,
                        chatReviewed: checkedChat,
                      },
                      partial,
                      closeAfter: false,
                    })
                    setConfirmOpen(false)
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err)
                    setConfirmError(arbiterActionErrorText(msg, locale))
                  }
                }}
              >
                {locale === 'ru' ? 'Подтвердить' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

