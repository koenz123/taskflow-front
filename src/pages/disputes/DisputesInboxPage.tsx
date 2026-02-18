import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { disputeThreadPath, paths } from '@/app/router/paths'
import { useAuth } from '@/shared/auth/AuthContext'
import { useI18n } from '@/shared/i18n/I18nContext'
import { useDisputes } from '@/entities/dispute/lib/useDisputes'
import { useContracts } from '@/entities/contract/lib/useContracts'
import { useTasks } from '@/entities/task/lib/useTasks'
import { useUsers } from '@/entities/user/lib/useUsers'
import { pickText } from '@/entities/task/lib/taskText'
import { useAllDisputeMessages } from '@/entities/disputeMessage/lib/useAllDisputeMessages'
import { CustomSelect } from '@/shared/ui/custom-select/CustomSelect'
import './disputes-inbox.css'

type StatusFilter = 'all' | 'open' | 'in_review'
type Sort = 'oldest' | 'highest_amount'

const SLA_NEARING_MS = 6 * 60 * 60 * 1000
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

function fmtMoney(amount: number) {
  const a = Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0
  return a.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function fmtRemaining(ms: number) {
  if (!Number.isFinite(ms)) return '—'
  const sign = ms < 0 ? '-' : ''
  const abs = Math.abs(ms)
  const totalMin = Math.floor(abs / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h <= 0) return `${sign}${m}m`
  return `${sign}${h}h ${m}m`
}

export function DisputesInboxPage() {
  const auth = useAuth()
  const { locale } = useI18n()
  const user = auth.user!
  const disputes = useDisputes()
  const contracts = useContracts()
  const tasks = useTasks()
  const users = useUsers()
  const allMsgs = useAllDisputeMessages()
  const navigate = useNavigate()

  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const allowed = user.role === 'arbiter' && user.id === DEV_ARBITER_USER_ID

  const [status, setStatus] = useState<StatusFilter>('all')
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [nearingSla, setNearingSla] = useState(false)
  const [sort, setSort] = useState<Sort>('oldest')

  const statusOptions = useMemo<Array<{ value: StatusFilter; label: string }>>(
    () => [
      { value: 'all', label: locale === 'ru' ? 'Все' : 'All' },
      { value: 'open', label: statusLabel('open', locale) },
      { value: 'in_review', label: statusLabel('in_review', locale) },
    ],
    [locale],
  )

  const sortOptions = useMemo<Array<{ value: Sort; label: string }>>(
    () => [
      { value: 'oldest', label: locale === 'ru' ? 'Сначала старые' : 'Oldest first' },
      { value: 'highest_amount', label: locale === 'ru' ? 'Самая высокая сумма' : 'Highest amount' },
    ],
    [locale],
  )

  const contractById = useMemo(() => new Map(contracts.map((c) => [c.id, c])), [contracts])
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])

  const msgStatsByDisputeId = useMemo(() => {
    // unanswered = count of party public messages after last arbiter/system message
    const byDispute = new Map<string, { lastAdminAt: string | null; unanswered: number }>()
    for (const m of allMsgs) {
      const disputeId = (m as any)?.disputeId
      if (typeof disputeId !== 'string' || !disputeId) continue
      const kind = (m as any)?.kind
      const authorId = (m as any)?.authorUserId
      const createdAt = (m as any)?.createdAt
      if (typeof createdAt !== 'string') continue
      const isAdmin = authorId === DEV_ARBITER_USER_ID || kind === 'system'
      const rec = byDispute.get(disputeId) ?? { lastAdminAt: null, unanswered: 0 }
      if (isAdmin) {
        if (!rec.lastAdminAt || createdAt > rec.lastAdminAt) {
          rec.lastAdminAt = createdAt
          rec.unanswered = 0
        }
      } else {
        if (!rec.lastAdminAt || createdAt > rec.lastAdminAt) {
          if (kind !== 'internal') rec.unanswered += 1
        }
      }
      byDispute.set(disputeId, rec)
    }
    return byDispute
  }, [allMsgs])

  const repeatDisputeCountByUserId = useMemo(() => {
    const sinceMs = nowMs - 30 * 24 * 60 * 60 * 1000
    const map = new Map<string, number>()
    for (const d of disputes) {
      const c = contractById.get(d.contractId)
      if (!c) continue
      const openedMs = Date.parse(d.createdAt)
      if (!Number.isFinite(openedMs) || openedMs < sinceMs) continue
      map.set(c.clientId, (map.get(c.clientId) ?? 0) + 1)
      map.set(c.executorId, (map.get(c.executorId) ?? 0) + 1)
    }
    return map
  }, [contractById, disputes, nowMs])

  const list = useMemo(() => {
    const min = minAmount.trim() ? Number(minAmount) : NaN
    const max = maxAmount.trim() ? Number(maxAmount) : NaN
    const fromMs = dateFrom ? Date.parse(dateFrom) : NaN
    const toMs = dateTo ? Date.parse(dateTo) : NaN

    const filtered = disputes.filter((d) => {
      if (status !== 'all') {
        if (status === 'open') {
          if (d.status !== 'open') return false
        } else if (status === 'in_review') {
          // Treat `need_more_info` as "in work" in the inbox UI.
          if (d.status !== 'in_review' && d.status !== 'need_more_info') return false
        }
      }

      const c = contractById.get(d.contractId) ?? null
      const amount = c?.escrowAmount ?? 0
      if (Number.isFinite(min) && amount < min) return false
      if (Number.isFinite(max) && amount > max) return false

      const openedMs = Date.parse(d.createdAt)
      if (Number.isFinite(fromMs) && (!Number.isFinite(openedMs) || openedMs < fromMs)) return false
      if (Number.isFinite(toMs) && (!Number.isFinite(openedMs) || openedMs > toMs + 24 * 60 * 60 * 1000 - 1)) return false

      if (nearingSla) {
        const dueMs = d.slaDueAt ? Date.parse(d.slaDueAt) : NaN
        if (!Number.isFinite(dueMs)) return false
        const left = dueMs - nowMs
        if (left <= 0) return false
        if (left >= SLA_NEARING_MS) return false
      }
      return true
    })

    const sorted = filtered.slice().sort((a, b) => {
      if (sort === 'highest_amount') {
        const ac = contractById.get(a.contractId)?.escrowAmount ?? 0
        const bc = contractById.get(b.contractId)?.escrowAmount ?? 0
        if (bc !== ac) return bc - ac
      }
      // default oldest
      return a.createdAt.localeCompare(b.createdAt)
    })
    return sorted
  }, [contractById, dateFrom, dateTo, disputes, maxAmount, minAmount, nearingSla, nowMs, sort, status])

  if (!allowed) {
    return (
      <main className="disputesInboxPage">
        <div className="disputesInboxContainer">
          <h1 className="disputesInboxTitle">{locale === 'ru' ? 'Очередь споров' : 'Disputes inbox'}</h1>
          <div style={{ opacity: 0.85 }}>
            {locale === 'ru' ? 'Доступно только арбитру в dev mode.' : 'Available to the arbiter in dev mode only.'}
          </div>
          <div style={{ marginTop: 10 }}>
            <Link to={paths.profile}>{locale === 'ru' ? 'В профиль' : 'Go to profile'}</Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="disputesInboxPage">
      <div className="disputesInboxContainer">
        <div className="disputesInboxHeader">
          <div>
            <h1 className="disputesInboxTitle">{locale === 'ru' ? 'Очередь споров' : 'Disputes inbox'}</h1>
            <div className="disputesInboxSubtitle">
              {locale === 'ru' ? `Показано: ${list.length} / ${disputes.length}` : `Showing: ${list.length} / ${disputes.length}`}
            </div>
          </div>
        </div>

        <div className="disputesInboxFilters">
          <div className="disputesInboxField">
            <CustomSelect
              value={status}
              onChange={setStatus}
              options={statusOptions}
              label={<span className="disputesInboxField__label">{locale === 'ru' ? 'Статус' : 'Status'}</span>}
            />
          </div>

          <label className="disputesInboxField">
            <span className="disputesInboxField__label">{locale === 'ru' ? 'Сумма от' : 'Amount min'}</span>
            <input className="disputesInboxInput" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} inputMode="decimal" placeholder="0" />
          </label>

          <label className="disputesInboxField">
            <span className="disputesInboxField__label">{locale === 'ru' ? 'Сумма до' : 'Amount max'}</span>
            <input className="disputesInboxInput" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} inputMode="decimal" placeholder="∞" />
          </label>

          <label className="disputesInboxField">
            <span className="disputesInboxField__label">{locale === 'ru' ? 'Открыт с' : 'Opened from'}</span>
            <input className="disputesInboxInput" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>

          <label className="disputesInboxField">
            <span className="disputesInboxField__label">{locale === 'ru' ? 'Открыт по' : 'Opened to'}</span>
            <input className="disputesInboxInput" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>

          <label className="disputesInboxCheck">
            <input type="checkbox" checked={nearingSla} onChange={(e) => setNearingSla(e.target.checked)} />
            <span>{locale === 'ru' ? 'Nearing SLA (<6ч)' : 'Nearing SLA (<6h)'}</span>
          </label>

          <div className="disputesInboxField">
            <CustomSelect
              value={sort}
              onChange={setSort}
              options={sortOptions}
              label={<span className="disputesInboxField__label">{locale === 'ru' ? 'Сортировка' : 'Sort'}</span>}
            />
          </div>

          <button
            type="button"
            className="disputesInboxReset"
            onClick={() => {
              setStatus('all')
              setMinAmount('')
              setMaxAmount('')
              setDateFrom('')
              setDateTo('')
              setNearingSla(false)
              setSort('oldest')
            }}
          >
            {locale === 'ru' ? 'Сбросить' : 'Reset'}
          </button>
        </div>

        <div className="disputesInboxTableWrap" role="table" aria-label={locale === 'ru' ? 'Споры' : 'Disputes'}>
          <div className="disputesInboxRow disputesInboxRow--head" role="row">
            <div className="disputesInboxCell" role="columnheader">
              {locale === 'ru' ? 'Заказ' : 'Order'}
            </div>
            <div className="disputesInboxCell" role="columnheader">
              {locale === 'ru' ? 'Сумма' : 'Amount'}
            </div>
            <div className="disputesInboxCell" role="columnheader">
              {locale === 'ru' ? 'Стороны' : 'Parties'}
            </div>
            <div className="disputesInboxCell" role="columnheader">
              {locale === 'ru' ? 'Статус' : 'Status'}
            </div>
            <div className="disputesInboxCell" role="columnheader">
              {locale === 'ru' ? 'Открыт' : 'Opened'}
            </div>
            <div className="disputesInboxCell" role="columnheader">
              SLA
            </div>
            <div className="disputesInboxCell" role="columnheader">
              {locale === 'ru' ? 'Без ответа' : 'Unanswered'}
            </div>
            <div className="disputesInboxCell" role="columnheader">
              {locale === 'ru' ? 'Повтор' : 'Repeat'}
            </div>
          </div>

          {list.length === 0 ? (
            <div className="disputesInboxEmpty">{locale === 'ru' ? 'Нет споров по фильтрам.' : 'No disputes match filters.'}</div>
          ) : (
            list.map((d) => {
              const c = contractById.get(d.contractId) ?? null
              const t = c ? (taskById.get(c.taskId) ?? null) : null
              const customer = c ? (userById.get(c.clientId) ?? null) : null
              const executor = c ? (userById.get(c.executorId) ?? null) : null
              const amount = c?.escrowAmount ?? 0
              const opened = new Date(d.createdAt).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US')
              const dueMs = d.slaDueAt ? Date.parse(d.slaDueAt) : NaN
              const leftMs = Number.isFinite(dueMs) ? dueMs - nowMs : NaN
              const near = Number.isFinite(leftMs) && leftMs > 0 && leftMs < SLA_NEARING_MS
              const overdue = Number.isFinite(leftMs) && leftMs <= 0
              const unanswered = msgStatsByDisputeId.get(d.id)?.unanswered ?? 0
              const repeatCustomer = customer ? (repeatDisputeCountByUserId.get(customer.id) ?? 0) : 0
              const repeatExecutor = executor ? (repeatDisputeCountByUserId.get(executor.id) ?? 0) : 0
              const orderId = t?.id ?? c?.taskId ?? d.contractId
              const orderTitle = t ? pickText(t.title, locale) : orderId
              const viewStatus = d.status === 'need_more_info' ? 'in_review' : d.status

              return (
                <div
                  key={d.id}
                  className="disputesInboxRow disputesInboxRow--body"
                  role="row"
                  tabIndex={0}
                  onClick={(e) => {
                    const target = e.target
                    if (target instanceof HTMLElement) {
                      if (target.closest('a,button,input,textarea,select,[role=\"button\"]')) return
                    }
                    navigate(disputeThreadPath(d.id))
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      navigate(disputeThreadPath(d.id))
                    }
                  }}
                >
                  <div className="disputesInboxCell">
                    <div className="disputesInboxOrder">
                      <div className="disputesInboxOrder__id">{orderId}</div>
                      <div className="disputesInboxOrder__title" title={orderTitle}>
                        {orderTitle}
                      </div>
                    </div>
                  </div>
                  <div className="disputesInboxCell">
                    <div className="disputesInboxAmount">{fmtMoney(amount)}</div>
                  </div>
                  <div className="disputesInboxCell">
                    <div className="disputesInboxParties">
                      <div className="disputesInboxParty">
                        <span className="disputesInboxParty__role">{locale === 'ru' ? 'Заказчик' : 'Customer'}</span>
                        <span className="disputesInboxParty__name" title={customer?.email}>
                          {customer?.fullName ?? c?.clientId ?? '—'}
                        </span>
                      </div>
                      <div className="disputesInboxParty">
                        <span className="disputesInboxParty__role">{locale === 'ru' ? 'Исп.' : 'Exec.'}</span>
                        <span className="disputesInboxParty__name" title={executor?.email}>
                          {executor?.fullName ?? c?.executorId ?? '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="disputesInboxCell">
                    <span className={`disputesInboxPill ${viewStatus === 'open' ? 'isOpen' : viewStatus === 'in_review' ? 'isReview' : 'isNeedInfo'}`}>
                      {statusLabel(viewStatus, locale)}
                    </span>
                  </div>
                  <div className="disputesInboxCell">
                    <div className="disputesInboxMeta">{opened}</div>
                  </div>
                  <div className="disputesInboxCell">
                    <div className={`disputesInboxSla ${overdue ? 'isOverdue' : near ? 'isNear' : ''}`}>
                      {Number.isFinite(leftMs) ? fmtRemaining(leftMs) : '—'}
                    </div>
                  </div>
                  <div className="disputesInboxCell">
                    <div className={`disputesInboxUnanswered ${unanswered ? 'isHot' : ''}`}>{unanswered || '—'}</div>
                  </div>
                  <div className="disputesInboxCell">
                    <div className="disputesInboxRepeat" title={locale === 'ru' ? 'Количество споров за 30 дней' : 'Disputes in last 30 days'}>
                      {repeatCustomer > 1 || repeatExecutor > 1 ? `${repeatCustomer}/${repeatExecutor}` : '—'}
                    </div>
                  </div>
                  <div className="disputesInboxCell disputesInboxCell--actions">
                    <Link className="linkBtn" to={disputeThreadPath(d.id)} onClick={(e) => e.stopPropagation()}>
                      {locale === 'ru' ? 'Открыть' : 'Open'}
                    </Link>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </main>
  )
}

