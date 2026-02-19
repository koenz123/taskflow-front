import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { paths, taskDetailsPath, userProfilePath } from '@/app/router/paths'
import { useAuth } from '@/shared/auth/AuthContext'
import { useI18n } from '@/shared/i18n/I18nContext'
import { useTasks } from '@/entities/task/lib/useTasks'
import { pickText } from '@/entities/task/lib/taskText'
import { SocialLinks } from '@/shared/social/SocialLinks'
import { useUsers } from '@/entities/user/lib/useUsers'
import { balanceRepo } from '@/entities/user/lib/balanceRepo'
import { useCustomerBalance } from '@/entities/user/lib/useCustomerBalance'
import { formatTimeLeft, timeLeftMs } from '@/entities/task/lib/taskDeadline'
import { applicationRepo } from '@/entities/task/lib/applicationRepo'
import { taskRepo } from '@/entities/task/lib/taskRepo'
import { balanceFreezeRepo } from '@/entities/user/lib/balanceFreezeRepo'
import { notificationRepo } from '@/entities/notification/lib/notificationRepo'
import { useNotifications } from '@/entities/notification/lib/useNotifications'
import { contractRepo } from '@/entities/contract/lib/contractRepo'
import { useContracts } from '@/entities/contract/lib/useContracts'
import { fileToAvatarDataUrl } from '@/shared/lib/image'
import { useApplications } from '@/entities/task/lib/useApplications'
import { getUsdRubRateCachedOrFallback, refreshUsdRubRate } from '@/shared/lib/usdRubRate'
import { timeAgo } from '@/shared/lib/timeAgo'
import { useRatings } from '@/entities/rating/lib/useRatings'
import { ratingRepo } from '@/entities/rating/lib/ratingRepo'
import { RatingModal } from '@/features/rating/RatingModal'
import { getEffectiveRatingSummaryForUser } from '@/shared/lib/ratingSummary'
import { taskAssignmentRepo } from '@/entities/taskAssignment/lib/taskAssignmentRepo'
import { useTaskAssignments } from '@/entities/taskAssignment/lib/useTaskAssignments'
import { useRatingAdjustments } from '@/entities/ratingAdjustment/lib/useRatingAdjustments'
import { noStartViolationCountLast90d } from '@/entities/executorSanction/lib/noStartSanctions'
import { NoStartAssignModal } from '@/features/sanctions/NoStartAssignModal'
import { useToast } from '@/shared/ui/toast/ToastProvider'
import { Pagination } from '@/shared/ui/pagination/Pagination'
import './profile.css'
import { previewMetaList } from '@/shared/lib/metaList'
import { StatusPill, type StatusTone } from '@/shared/ui/status-pill/StatusPill'
import { useDevMode } from '@/shared/dev/devMode'
import { useExecutorViolations } from '@/entities/executorSanction/lib/useExecutorViolations'
import { useDisputes } from '@/entities/dispute/lib/useDisputes'
import { disputeRepo } from '@/entities/dispute/lib/disputeRepo'
import { disputeThreadPath } from '@/app/router/paths'
import { HelpTip } from '@/shared/ui/help-tip/HelpTip'
import { notifyToTelegramAndUi } from '@/shared/notify/notify'
import { api } from '@/shared/api/api'

const USE_API = import.meta.env.VITE_DATA_SOURCE === 'api'

type ProfileTab =
  | 'my_tasks'
  | 'applications'
  | 'disputes'
  | 'balance'
  | 'executor_active'
  | 'executor_completed'
  | 'executor_uncompleted'
  | 'violations'
  | 'settings'

export function ProfilePage() {
  const { t, locale } = useI18n()
  const auth = useAuth()
  const toast = useToast()
  const telegramUserId = auth.user?.telegramUserId ?? null
  const toastUi = (msg: string, tone?: 'success' | 'info' | 'error') => toast.showToast({ message: msg, tone })
  const devMode = useDevMode()
  const [searchParams] = useSearchParams()
  const tasks = useTasks()
  const users = useUsers()
  const contracts = useContracts()
  const MAX_PREVIEW = 6
  const MY_TASKS_PAGE_SIZE = 20
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [isSwitchOpen, setIsSwitchOpen] = useState(false)
  const switchRef = useRef<HTMLDivElement | null>(null)
  const applications = useApplications()
  const disputes = useDisputes()
  const notifications = useNotifications(auth.user?.id ?? null)
  const [openList, setOpenList] = useState<null | 'customerMy' | 'executorActive'>(null)
  const navigate = useNavigate()
  const [applicationsPage, setApplicationsPage] = useState(1)
  const [myTasksPage, setMyTasksPage] = useState(1)
  const myTasksListRef = useRef<HTMLUListElement | null>(null)
  const prevMyTasksPageRef = useRef<number | null>(null)
  const balance = useCustomerBalance(auth.user?.id ?? null)
  const [usdRubRate, setUsdRubRate] = useState(() => getUsdRubRateCachedOrFallback())
  const [depositAmount, setDepositAmount] = useState('')
  const [balanceMessage, setBalanceMessage] = useState<string | null>(null)
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawMessage, setWithdrawMessage] = useState<string | null>(null)
  const [noStartPrompt, setNoStartPrompt] = useState<null | { applicationId: string; count: number }>(null)
  const [violationsHelpOpen, setViolationsHelpOpen] = useState(false)
  const balanceFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-US', {
        style: 'currency',
        currency: locale === 'ru' ? 'RUB' : 'USD',
        minimumFractionDigits: 2,
      }),
    [locale],
  )

  useEffect(() => {
    let cancelled = false
    void refreshUsdRubRate().then((rate) => {
      if (!cancelled) setUsdRubRate(rate)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const balanceInUiCurrency = useMemo(() => {
    return locale === 'ru' ? balance * usdRubRate : balance
  }, [balance, locale, usdRubRate])

  const handleRejectApplication = (applicationId: string) => {
    applicationRepo.reject(applicationId)
    void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, text: t('toast.applicationRejected'), tone: 'info' })
  }

  const handleAssignApplication = (applicationId: string, opts?: { bypassNoStartConfirm?: boolean }) => {
    if (!user || user.role !== 'customer') return

    const app = applications.find((x) => x.id === applicationId) ?? null
    if (!app || app.status !== 'pending') return

    const task = taskRepo.getById(app.taskId)
    if (!task) return
    if (timeLeftMs(task.expiresAt, Date.now()) <= 0) return
    if (!task.createdByUserId || task.createdByUserId !== user.id) return

    const assignedCount = task.assignedExecutorIds.length ?? 0
    const maxExecutors = task.maxExecutors ?? 1
    const hasSlot = assignedCount < maxExecutors
    if (!hasSlot) return
    if (task.assignedExecutorIds.includes(app.executorUserId)) return

    const prevNoStart = noStartViolationCountLast90d(app.executorUserId)
    if (prevNoStart >= 2 && !opts?.bypassNoStartConfirm) {
      setNoStartPrompt({ applicationId, count: prevNoStart })
      return
    }

    const existingContract = contractRepo.getForTaskExecutor(task.id, app.executorUserId)
    const amount = task.budgetAmount ?? 0
    if (!existingContract && amount > 0 && !balanceRepo.withdraw(task.createdByUserId, amount)) {
      return
    }

    const updated = taskRepo.addExecutor(task.id, app.executorUserId)
    const updatedTask = updated ? taskRepo.getById(task.id) : null
    const nowAssigned = Boolean(updatedTask?.assignedExecutorIds.includes(app.executorUserId))
    if (!nowAssigned) {
      if (!existingContract && amount > 0) balanceRepo.deposit(task.createdByUserId, amount)
      return
    }

    const contract =
      existingContract ??
      contractRepo.createActive({
        taskId: task.id,
        clientId: task.createdByUserId,
        executorId: app.executorUserId,
        escrowAmount: amount,
        revisionIncluded: 2,
      })

    applicationRepo.select(app.id, { contractId: contract.id })
    taskAssignmentRepo.createPendingStart({ taskId: task.id, executorId: app.executorUserId })
    if (!existingContract && amount > 0) {
      balanceFreezeRepo.freeze(task.createdByUserId, task.id, app.executorUserId, amount)
    }

    notificationRepo.addTaskAssigned({
      recipientUserId: app.executorUserId,
      actorUserId: user.id,
      taskId: task.id,
    })

    const finalTask = taskRepo.getById(task.id)
    if (finalTask && finalTask.createdByUserId) {
      notificationRepo.addTaskTaken({
        recipientUserId: finalTask.createdByUserId,
        actorUserId: app.executorUserId,
        taskId: finalTask.id,
      })
    }

    // If task is full now — reject remaining pending apps.
    const finalAssigned = finalTask?.assignedExecutorIds.length ?? 0
    const finalMax = finalTask?.maxExecutors ?? 1
    if (finalTask && finalAssigned >= finalMax) {
      const pending = applicationRepo
        .listForTask(finalTask.id)
        .filter((x) => x.status === 'pending' && x.id !== app.id)
      for (const p of pending) {
        applicationRepo.reject(p.id)
        notificationRepo.addTaskAssignedElse({
          recipientUserId: p.executorUserId,
          actorUserId: user.id,
          taskId: finalTask.id,
        })
      }
    }

    void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, text: t('toast.executorAssigned'), tone: 'success' })
  }

  const handleWithdraw = () => {
    if (!user) return
    const amountUi = Number(withdrawAmount)
    if (!Number.isFinite(amountUi) || amountUi <= 0) {
      setWithdrawMessage(t('profile.balance.withdrawError'))
      return
    }
    const amountUsd = locale === 'ru' ? amountUi / usdRubRate : amountUi
    if (!balanceRepo.withdraw(user.id, amountUsd)) {
      setWithdrawMessage(t('profile.balance.insufficient'))
      return
    }
    setWithdrawAmount('')
    setWithdrawMessage(t('profile.balance.withdrawSuccess'))
  }

  const currentUserLabel = useMemo(() => {
    const u = users.find((x) => x.id === auth.user?.id) ?? auth.user
    if (!u) return ''
    return `${u.email} (${u.role})`
  }, [users, auth.user])

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!isSwitchOpen) return

    const onPointerDown = (e: PointerEvent) => {
      const el = switchRef.current
      if (!el) return
      if (e.target instanceof Node && !el.contains(e.target)) setIsSwitchOpen(false)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsSwitchOpen(false)
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isSwitchOpen])

  useEffect(() => {
    if (!openList) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenList(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openList])

  const user = auth.user
  const ratings = useRatings()
  const adjustments = useRatingAdjustments()
  const taskAssignments = useTaskAssignments()
  const pauseByTaskId = useMemo(() => {
    const map = new Map<string, 'paused' | 'pause_requested'>()
    for (const a of taskAssignments) {
      if (a.status !== 'paused' && a.status !== 'pause_requested') continue
      const prev = map.get(a.taskId)
      if (prev === 'paused') continue
      map.set(a.taskId, a.status)
    }
    return map
  }, [taskAssignments])

  const overdueByTaskId = useMemo(() => {
    const set = new Set<string>()
    for (const a of taskAssignments) {
      if (a.status === 'overdue') set.add(a.taskId)
    }
    return set
  }, [taskAssignments])
  const posted = user ? tasks.filter((x) => x.createdByUserId === user.id && x.status !== 'archived') : []
  const assignedTasks = user ? tasks.filter((x) => x.assignedExecutorIds.includes(user.id)) : []

  const myAssignmentByTaskId = useMemo(() => {
    const map = new Map<string, (typeof taskAssignments)[number]>()
    if (!user || user.role !== 'executor') return map
    for (const a of taskAssignments) {
      if (a.executorId !== user.id) continue
      const prev = map.get(a.taskId)
      if (!prev || a.assignedAt.localeCompare(prev.assignedAt) > 0) map.set(a.taskId, a)
    }
    return map
  }, [taskAssignments, user])

  const isUncompletedAssignmentStatus = (status: string | undefined | null) => {
    return status === 'overdue' || status === 'removed_auto' || status === 'cancelled_by_customer' || status === 'dispute_opened'
  }

  const taken =
    user && user.role === 'executor'
      ? assignedTasks.filter((task) => {
          if (task.status === 'closed') return false
          const a = myAssignmentByTaskId.get(task.id) ?? null
          // Remove overdue/removed/cancelled/disputed from "Active".
          if (isUncompletedAssignmentStatus(a?.status ?? null)) return false
          return true
        })
      : assignedTasks.filter((x) => x.status !== 'closed')

  const completed = assignedTasks
    .filter((x) => x.status === 'closed')
    .filter((x) => typeof x.completedAt === 'string' && x.completedAt && x.completedAt <= x.expiresAt)

  const uncompleted = useMemo(() => {
    if (!user || user.role !== 'executor') return [] as typeof tasks
    const list = taskAssignments
      .filter((a) => a.executorId === user.id && isUncompletedAssignmentStatus(a.status))
      .slice()
      .sort((a, b) => b.assignedAt.localeCompare(a.assignedAt))
    const seen = new Set<string>()
    const out: typeof tasks = []
    for (const a of list) {
      if (seen.has(a.taskId)) continue
      seen.add(a.taskId)
      const task = tasks.find((t) => t.id === a.taskId) ?? null
      if (task) out.push(task)
    }
    return out
  }, [taskAssignments, tasks, user])

  const postedMy = posted.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const myActive = taken.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const myCompleted = completed.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const myUncompleted = uncompleted.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const myTasksPageCount = useMemo(
    () => Math.max(1, Math.ceil(postedMy.length / MY_TASKS_PAGE_SIZE)),
    [MY_TASKS_PAGE_SIZE, postedMy.length],
  )
  const pagedPostedMy = useMemo(() => {
    const start = (myTasksPage - 1) * MY_TASKS_PAGE_SIZE
    return postedMy.slice(start, start + MY_TASKS_PAGE_SIZE)
  }, [MY_TASKS_PAGE_SIZE, myTasksPage, postedMy])

  const executorActiveBadgeCount = useMemo(() => {
    if (!user || user.role !== 'executor') return 0
    // Badge for executor "Active": show tasks that need action:
    // - waiting to be started (pending_start)
    // - revision requested by customer (contract.status === 'revision_requested')
    // It must change after clicking "Start work" and after revision requests.
    return myActive.filter((task) => {
      const a = taskAssignments.find((ta) => ta.taskId === task.id && ta.executorId === user.id) ?? null
      if (a?.status === 'pending_start') return true
      const c = contracts.find((x) => x.taskId === task.id && x.executorId === user.id) ?? null
      return c?.status === 'revision_requested'
    }).length
  }, [contracts, myActive, taskAssignments, user])

  const disputeUnreadCount = useMemo(() => {
    if (!user) return 0
    return notifications.filter(
      (n) => !n.readAt && (n.type === 'dispute_opened' || n.type === 'dispute_message'),
    ).length
  }, [notifications, user])

  const unreadDisputeCountById = useMemo(() => {
    const map = new Map<string, number>()
    for (const n of notifications) {
      if (n.readAt) continue
      if (n.type !== 'dispute_opened' && n.type !== 'dispute_message') continue
      const id = typeof n.disputeId === 'string' ? n.disputeId : ''
      if (!id) continue
      map.set(id, (map.get(id) ?? 0) + 1)
    }
    return map
  }, [notifications])

  const disputesForProfile = useMemo(() => {
    if (!user) return []
    if (user.role !== 'customer' && user.role !== 'executor') return []
    const contractById = new Map(contracts.map((c) => [c.id, c]))
    return disputes
      .filter((d) => {
        const c = contractById.get(d.contractId) ?? null
        if (!c) return false
        return user.role === 'customer' ? c.clientId === user.id : c.executorId === user.id
      })
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }, [contracts, disputes, user])

  // (avg time left UI removed)

  const modalTitle = openList
    ? openList === 'customerMy'
      ? t('profile.myTasks')
      : t('profile.postedActive')
    : ''

  const customerTaskIds = posted.filter((task) => timeLeftMs(task.expiresAt, nowMs) > 0).map((x) => x.id)
  const customerApplications = applications
    .filter((app) => customerTaskIds.includes(app.taskId))
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const customerPendingApplicationsCount = customerApplications.filter((a) => a.status === 'pending').length
  const PAGE_SIZE = 20
  const applicationsPageCount = useMemo(
    () => Math.max(1, Math.ceil(customerApplications.length / PAGE_SIZE)),
    [customerApplications.length],
  )
  const pagedCustomerApplications = useMemo(() => {
    const start = (applicationsPage - 1) * PAGE_SIZE
    return customerApplications.slice(start, start + PAGE_SIZE)
  }, [customerApplications, applicationsPage])

  useEffect(() => {
    setApplicationsPage((p) => Math.min(Math.max(1, p), applicationsPageCount))
  }, [applicationsPageCount])

  const modalItems = openList
    ? openList === 'customerMy'
      ? postedMy
      : myActive
    : []

  if (!user) {
    return (
      <main className="profilePage">
        <div className="profileHero">
          <h1 className="profileTitle">{t('auth.profile')}</h1>
          <div className="profileEmpty">
            <Link to={paths.login}>{t('auth.signIn')}</Link>
          </div>
        </div>
      </main>
    )
  }

  const defaultTab: ProfileTab = user.role === 'customer' ? 'my_tasks' : 'executor_active'
  const tabFromQuery = searchParams.get('tab')
  const initialTab: ProfileTab =
    tabFromQuery === 'balance' ||
    tabFromQuery === 'my_tasks' ||
    tabFromQuery === 'applications' ||
    tabFromQuery === 'disputes' ||
    tabFromQuery === 'executor_active' ||
    tabFromQuery === 'executor_completed' ||
    tabFromQuery === 'executor_uncompleted' ||
    tabFromQuery === 'violations' ||
    tabFromQuery === 'settings'
      ? tabFromQuery
      : defaultTab
  const [tab, setTab] = useState<ProfileTab>(initialTab)
  const [rateContractId, setRateContractId] = useState<string | null>(null)
  const [rateExecutorContractId, setRateExecutorContractId] = useState<string | null>(null)

  useEffect(() => {
    if (tab === 'applications') setApplicationsPage(1)
    if (tab === 'my_tasks') setMyTasksPage(1)
  }, [tab])

  useEffect(() => {
    setMyTasksPage((p) => Math.min(Math.max(1, p), myTasksPageCount))
  }, [myTasksPageCount])

  useEffect(() => {
    if (tab !== 'my_tasks') return
    if (prevMyTasksPageRef.current === null) {
      prevMyTasksPageRef.current = myTasksPage
      return
    }
    if (prevMyTasksPageRef.current === myTasksPage) return
    prevMyTasksPageRef.current = myTasksPage
    window.requestAnimationFrame(() => {
      myTasksListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [myTasksPage, tab])

  const ratingSummary = useMemo(
    () => getEffectiveRatingSummaryForUser(ratings, adjustments, user?.id),
    [ratings, adjustments, user?.id],
  )

  const WINDOW_DAYS = 90
  const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000

  const violations = useExecutorViolations(user?.role === 'executor' ? user.id : null)
  const violationsInWindow = useMemo(() => {
    if (!user || user.role !== 'executor') return []
    const sinceMs = nowMs - WINDOW_MS
    return violations
      .filter((v) => {
        const ts = Date.parse(v.createdAt)
        return Number.isFinite(ts) && ts >= sinceMs
      })
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }, [nowMs, user, violations, WINDOW_MS])

  const indexByViolationId = useMemo(() => {
    const byType = new Map<string, typeof violationsInWindow>()
    for (const v of violationsInWindow) {
      const list = byType.get(v.type) ?? []
      list.push(v)
      byType.set(v.type, list)
    }
    const map = new Map<string, number>()
    for (const [_type, list] of byType) {
      const sorted = list.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      for (let i = 0; i < sorted.length; i++) {
        map.set(sorted[i].id, i + 1)
      }
    }
    return map
  }, [violationsInWindow])

  function sanctionKeyByIndex(n: number) {
    if (n <= 1) return 'violations.sanction.warning' as const
    if (n === 2) return 'violations.sanction.ratingPenalty5' as const
    if (n === 3) return 'violations.sanction.block24h' as const
    if (n === 4) return 'violations.sanction.block72h' as const
    return 'violations.sanction.ban' as const
  }

  function sanctionIsDanger(n: number) {
    return n >= 3
  }

  function disputeStatusLabel(status: string) {
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

  return (
    <main className="profilePage">
      <div className="profileLayout">
        <aside className="profileNav" aria-label="Profile navigation">
          <div className="profileNav__group">
            <button
              type="button"
              className={`profileNav__item${tab === (user.role === 'customer' ? 'my_tasks' : 'executor_active') ? ' profileNav__item--active' : ''}`}
              onClick={() => setTab(user.role === 'customer' ? 'my_tasks' : 'executor_active')}
            >
              <span className="profileNav__label">
                {user.role === 'customer' ? t('profile.myTasks') : t('profile.postedActive')}
              </span>
              {user.role === 'executor' && executorActiveBadgeCount > 0 ? (
                <span
                  className="profileNav__badge"
                  aria-label={`${t('profile.postedActive')}: ${executorActiveBadgeCount}`}
                  title={locale === 'ru' ? 'Требуют действия' : 'Needs action'}
                >
                  {executorActiveBadgeCount > 99 ? '99+' : executorActiveBadgeCount}
                </span>
              ) : null}
            </button>

            {user.role === 'executor' ? (
              <button
                type="button"
                className={`profileNav__item${tab === 'executor_completed' ? ' profileNav__item--active' : ''}`}
                onClick={() => setTab('executor_completed')}
              >
                <span className="profileNav__label">
                  {t('profile.stats.completed')}
                </span>
              </button>
            ) : null}

            {user.role === 'executor' ? (
              <button
                type="button"
                className={`profileNav__item${tab === 'executor_uncompleted' ? ' profileNav__item--active' : ''}`}
                onClick={() => setTab('executor_uncompleted')}
              >
                <span className="profileNav__label">
                  {t('profile.stats.uncompleted')}
                </span>
              </button>
            ) : null}

            {user.role === 'executor' ? (
              <button
                type="button"
                className={`profileNav__item${tab === 'violations' ? ' profileNav__item--active' : ''}`}
                onClick={() => setTab('violations')}
              >
                <span className="profileNav__label">{t('profile.myViolations')}</span>
              </button>
            ) : null}

            {user.role === 'customer' ? (
              <button
                type="button"
                className={`profileNav__item${tab === 'applications' ? ' profileNav__item--active' : ''}`}
                onClick={() => setTab('applications')}
              >
                <span className="profileNav__label">{t('profile.applications')}</span>
                {customerPendingApplicationsCount > 0 ? (
                  <span className="profileNav__badge" aria-label={`${t('profile.applications')}: ${customerPendingApplicationsCount}`}>
                    {customerPendingApplicationsCount > 99 ? '99+' : customerPendingApplicationsCount}
                  </span>
                ) : null}
              </button>
            ) : null}

            {user.role === 'customer' || user.role === 'executor' ? (
              <button
                type="button"
                className={`profileNav__item${tab === 'disputes' ? ' profileNav__item--active' : ''}`}
                onClick={() => setTab('disputes')}
              >
                <span className="profileNav__label">{locale === 'ru' ? 'Споры' : 'Disputes'}</span>
                {disputeUnreadCount > 0 ? (
                  <span className="profileNav__badge" aria-label={`${locale === 'ru' ? 'Споры' : 'Disputes'}: ${disputeUnreadCount}`}>
                    {disputeUnreadCount > 99 ? '99+' : disputeUnreadCount}
                  </span>
                ) : null}
              </button>
            ) : null}

            <button
              type="button"
              className={`profileNav__item${tab === 'balance' ? ' profileNav__item--active' : ''}`}
              onClick={() => setTab('balance')}
            >
              {t('profile.balance.title')}
            </button>
          </div>

          <div className="profileNav__footer">
            <button
              type="button"
              className="profileNav__danger"
              onClick={() => {
                auth.signOut()
                navigate(paths.login)
              }}
            >
              {t('auth.signOut')}
            </button>
          </div>
        </aside>

        <section className="profileMain">
          <header className="profileTopbar">
            <div className="profileTopbar__left">
              {devMode.enabled && !USE_API ? (
                <div className="profileSelectWrap" ref={switchRef}>
                  <button
                    type="button"
                    className="profileSelectBtn"
                    aria-haspopup="menu"
                    aria-expanded={isSwitchOpen}
                    onClick={() => setIsSwitchOpen((v) => !v)}
                    title={t('account.switch')}
                  >
                    <span className="profileSelectValue">{currentUserLabel}</span>
                    <span className="profileSelectChevron" aria-hidden="true">
                      ▾
                    </span>
                  </button>

                  {isSwitchOpen ? (
                    <div className="profileSelectMenu" role="menu" aria-label={t('account.switch')}>
                      {users.map((u) => {
                        const active = u.id === auth.user?.id
                        return (
                          <button
                            key={u.id}
                            type="button"
                            role="menuitem"
                            className={`profileSelectItem${active ? ' profileSelectItem--active' : ''}`}
                            onClick={() => {
                              auth.switchUser(u.id)
                              setIsSwitchOpen(false)
                            }}
                          >
                            <span className="profileSelectItemText">
                              {u.email} ({u.role})
                            </span>
                            {active ? <span className="profileSelectItemMark">✓</span> : null}
                          </button>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="profileTopbar__right">
              <div className="profileTopbar__actions">
                {devMode.enabled && !USE_API ? (
                  <Link className="profileBtn" to={paths.register}>
                    {t('account.add')}
                  </Link>
                ) : null}
                <Link className="profileBtn" to={paths.profileEdit}>
                  {t('profile.edit')}
                </Link>
              </div>

              <div className="profileTopbar__me">
                <div className="profileTopbar__meta">
                  <div className="profileTopbar__name">{user.fullName}</div>
                  <div className="profileTopbar__sub">
                    {user.role === 'customer'
                      ? t('profile.roleCustomer')
                      : user.role === 'executor'
                        ? t('profile.roleExecutor')
                        : locale === 'ru'
                          ? 'Арбитр'
                          : 'Arbiter'}
                  </div>
                {ratingSummary ? (
                  <Link
                    className="profileTopbar__sub profileRatingLink"
                    style={{ opacity: 0.9 }}
                    to={paths.reviews}
                    state={{ backTo: paths.profile }}
                  >
                    {locale === 'ru'
                      ? `★ ${ratingSummary.avg.toFixed(1)} (${ratingSummary.count})`
                      : `★ ${ratingSummary.avg.toFixed(1)} (${ratingSummary.count})`}
                  </Link>
                ) : null}
                {devMode.enabled && user.role === 'executor' ? (
                  <div className="profileTopbar__sub" style={{ opacity: 0.85 }}>
                    {t('profile.executorIdLabel')}: {user.id}
                  </div>
                ) : null}
                </div>
            <label className="profileAvatar profileAvatarUpload" title={t('profile.avatar.hint')}>
              <input
                className="profileAvatarInput"
                type="file"
                accept="image/*"
                disabled={avatarBusy}
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0]
                  if (!file) return
                  void (async () => {
                    setAvatarBusy(true)
                    try {
                      const avatarDataUrl = await fileToAvatarDataUrl(file, 160)
                      auth.updateProfile({
                        fullName: user.fullName,
                        phone: user.phone,
                        email: user.email,
                        company: user.company,
                        socials: user.socials,
                        avatarDataUrl,
                      })
                    } finally {
                      setAvatarBusy(false)
                      e.currentTarget.value = ''
                    }
                  })()
                }}
              />
              {user.avatarDataUrl ? (
                <img className="profileAvatarImg" src={user.avatarDataUrl} alt={t('profile.avatar.change')} />
              ) : (
                <div className="profileAvatarMark" aria-hidden="true">
                  UI
                </div>
              )}
              <div className="profileAvatarOverlay" aria-label={t('profile.avatar.upload')}>
                {avatarBusy ? (
                  <span className="profileAvatarOverlayIcon" aria-hidden="true">
                    ⏳
                  </span>
                ) : (
                  <svg
                    className="profileAvatarOverlayIcon"
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M9 7L10.2 5.4C10.5 5 11 4.8 11.5 4.8H12.5C13 4.8 13.5 5 13.8 5.4L15 7"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M20 7H4C2.9 7 2 7.9 2 9V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V9C22 7.9 21.1 7 20 7Z"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M12 17C13.7 17 15 15.7 15 14C15 12.3 13.7 11 12 11C10.3 11 9 12.3 9 14C9 15.7 10.3 17 12 17Z"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
            </label>
              </div>
            </div>
          </header>

          <div className="profileContent">
            {tab === 'my_tasks' && user.role === 'customer' ? (
              <div className="profilePanel">
                <div className="profilePanel__header">
                  <h2 className="profilePanel__title">
                    {t('profile.myTasks')}{' '}
                    <span className="profilePanel__countInline">({postedMy.length})</span>
                  </h2>
                </div>
                {postedMy.length === 0 ? (
                  <div className="profileEmpty">
                    {t('tasks.empty')}{' '}
                    <Link to={paths.taskCreate}>{t('nav.postTask')}</Link>
                  </div>
                ) : (
                  <>
                    <ul className="customerTasksList" ref={myTasksListRef}>
                      {pagedPostedMy.map((task) => {
                      const pauseKind = pauseByTaskId.get(task.id) ?? null
                      const isOverdue = overdueByTaskId.has(task.id) && task.status === 'in_progress'
                      const statusKey =
                        pauseKind
                          ? ('executor.status.paused' as const)
                          : task.status === 'closed'
                          ? 'task.status.closed'
                          : isOverdue
                            ? 'task.status.waiting'
                            : task.status === 'in_progress'
                              ? 'task.status.inProgress'
                            : task.status === 'dispute'
                              ? 'task.status.dispute'
                            : task.status === 'review'
                              ? 'task.status.review'
                              : 'task.status.open'

                      const rateExecutorTargets =
                        task.status !== 'closed'
                          ? []
                          : contracts
                              .filter(
                                (c) =>
                                  c.taskId === task.id &&
                                  c.clientId === user.id &&
                                  (c.status === 'approved' || c.status === 'resolved') &&
                                  !ratingRepo.getForContractPair(c.id, user.id),
                              )
                              .map((c) => {
                                const u = users.find((x) => x.id === c.executorId) ?? null
                                const name = (u?.fullName ?? u?.email ?? c.executorId).trim() || c.executorId
                                return { contractId: c.id, executorName: name }
                              })

                      return (
                        <li
                          key={task.id}
                          className="customerTasksItem"
                          role="link"
                          tabIndex={0}
                          onClick={(e) => {
                            const target = e.target
                            if (!(target instanceof HTMLElement)) {
                              navigate(taskDetailsPath(task.id))
                              return
                            }
                            // Don't hijack clicks on interactive elements.
                            if (target.closest('a,button,input,textarea,select,[role="button"]')) return
                            navigate(taskDetailsPath(task.id))
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              navigate(taskDetailsPath(task.id))
                            }
                          }}
                        >
                          <div className="customerTasksItemContent">
                            <div className="customerTasksItemHeader">
                              <Link className="customerTasksItemTitle" to={taskDetailsPath(task.id)}>
                                {pickText(task.title, locale)}
                              </Link>
                            </div>

                            <div className="customerTasksItemBadges">
                              <span className="customerTasksItemBadge">
                                🗓️ {t('tasks.published')}: {timeAgo(task.createdAt, locale, nowMs)}
                              </span>
                              {task.status !== 'closed' && task.dueDate ? (
                                <span className="customerTasksItemBadge">
                                  📅 {t('tasks.due')}: {task.dueDate}
                                </span>
                              ) : null}
                              {previewMetaList(task.category, 3) ? (
                                <span className="customerTasksItemBadge" style={{ whiteSpace: 'normal' }}>
                                  📱 {t('task.create.category')}: {previewMetaList(task.category, 3)}
                                </span>
                              ) : null}
                              {previewMetaList(task.location, 3) ? (
                                <span className="customerTasksItemBadge" style={{ whiteSpace: 'normal' }}>
                                  🎞️ {t('task.create.location')}: {previewMetaList(task.location, 3)}
                                </span>
                              ) : null}
                              <span className="customerTasksItemBadge">
                                👥 {t('task.meta.assigned')}: {task.assignedExecutorIds.length}/{task.maxExecutors ?? 1}
                              </span>
                              {task.completionVideoUrl ? (
                                <span className="customerTasksItemBadge customerTasksItemBadge--link">
                                  <a href={task.completionVideoUrl} target="_blank" rel="noreferrer">
                                    🎬 {t('task.completionLink')}
                                  </a>
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <div className="customerTasksItemRight">
                            <StatusPill tone={pauseKind ? 'paused' : isOverdue ? 'pending' : task.status} label={t(statusKey)} />
                            {rateExecutorTargets.length ? (
                              <div className="customerTasksItemActions">
                                {(() => {
                                  const many = rateExecutorTargets.length > 1
                                  return rateExecutorTargets.map((x) => (
                                    <button
                                      key={x.contractId}
                                      type="button"
                                      className="customerTasksApplicationsBtn"
                                      onClick={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        setRateExecutorContractId(x.contractId)
                                      }}
                                      title={x.executorName}
                                    >
                                      {many
                                        ? locale === 'ru'
                                          ? `Оценить: ${x.executorName}`
                                          : `Rate: ${x.executorName}`
                                        : locale === 'ru'
                                          ? 'Оценить исполнителя'
                                          : 'Rate executor'}
                                    </button>
                                  ))
                                })()}
                              </div>
                            ) : null}
                          </div>
                        </li>
                      )
                    })}
                    </ul>
                    <Pagination page={myTasksPage} pageCount={myTasksPageCount} onChange={setMyTasksPage} />
                  </>
                )}
              </div>
            ) : null}

            {tab === 'applications' && user.role === 'customer' ? (
              <div className="profilePanel">
                <div className="profilePanel__header">
                  <h2 className="profilePanel__title">
                    {t('profile.applications')}{' '}
                    <span className="profilePanel__countInline">({customerApplications.length})</span>
                  </h2>
                </div>

                {postedMy.length === 0 && customerApplications.length === 0 ? (
                  <div className="profileEmpty">
                    {t('profile.applications.emptyNoTasks')}{' '}
                    <Link className="profileBtn profileBtn--ghost" to={paths.taskCreate}>
                      {t('nav.postTask')}
                    </Link>
                  </div>
                ) : customerApplications.length === 0 ? (
                  <div className="profileEmpty">{t('profile.taskApplications.empty')}</div>
                ) : (
                  <>
                    <ul className="profileApplicationsList">
                      {pagedCustomerApplications.map((app) => {
                        const executor = users.find((u) => u.id === app.executorUserId) ?? null
                        const taskItem = tasks.find((t) => t.id === app.taskId) ?? null
                        const contract = taskItem ? contractRepo.getForTaskExecutor(taskItem.id, app.executorUserId) : null
                        const assignment =
                          taskItem
                            ? taskAssignments.find((a) => a.taskId === taskItem.id && a.executorId === app.executorUserId) ?? null
                            : null
                        const isCompletedContract = Boolean(
                          contract && (contract.status === 'approved' || contract.status === 'resolved'),
                        )
                        const statusKey =
                          assignment?.status === 'removed_auto'
                            ? ('executor.status.removed' as const)
                            : app.status === 'selected'
                              ? isCompletedContract
                                ? 'task.status.closed'
                                : contract?.status === 'submitted' || contract?.status === 'disputed'
                                  ? 'task.status.review'
                                  : assignment?.status === 'overdue'
                                    ? 'executor.status.overdue'
                                  : assignment?.status === 'paused'
                                    ? 'executor.status.paused'
                                    : assignment?.startedAt
                                      ? 'executor.status.inWork'
                                      : 'executor.status.approved'
                              : app.status === 'rejected'
                                ? 'task.status.closed'
                                : 'task.status.open'
                        const statusTone: StatusTone =
                          statusKey === ('executor.status.overdue' as const)
                            ? 'overdue'
                            : statusKey === ('executor.status.paused' as const)
                              ? 'paused'
                              : statusKey === ('task.status.review' as const)
                                ? 'review'
                                : statusKey === ('executor.status.inWork' as const)
                                  ? 'in_progress'
                                  : statusKey === ('executor.status.approved' as const) || statusKey === ('task.status.open' as const)
                                    ? 'open'
                                    : statusKey === ('task.status.closed' as const)
                                      ? 'closed'
                                      : 'neutral'

                        return (
                          <li
                            key={app.id}
                            className={`profileApplicationsListItem${app.status === 'selected' ? ' profileApplicationsListItem--selected' : ''}`}
                            role={taskItem ? 'link' : undefined}
                            tabIndex={taskItem ? 0 : undefined}
                            aria-label={taskItem ? t('notifications.viewTask') : undefined}
                            onClick={(e) => {
                              if (!taskItem) return
                              const target = e.target
                              if (target instanceof HTMLElement) {
                                // Don't hijack clicks on interactive elements.
                                if (target.closest('a,button,input,textarea,select,[role="button"]')) return
                              }
                              navigate(taskDetailsPath(taskItem.id), { state: { backTo: `${paths.profile}?tab=applications` } })
                            }}
                            onKeyDown={(e) => {
                              if (!taskItem) return
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                navigate(taskDetailsPath(taskItem.id), { state: { backTo: `${paths.profile}?tab=applications` } })
                              }
                            }}
                          >
                            <div className="profileApplicationsListItem__header">
                              <div className="profileApplicationsListItem__headerLeft">
                                <span className="profileApplicationsListItem__avatar" aria-hidden="true">
                                  {executor?.avatarDataUrl ? (
                                    <img src={executor.avatarDataUrl} alt="" />
                                  ) : (
                                    <span className="profileApplicationsListItem__avatarFallback">
                                      {(executor?.fullName ?? executor?.email ?? '?').trim().slice(0, 1).toUpperCase()}
                                    </span>
                                  )}
                                </span>
                                <strong>{executor?.fullName ?? executor?.email ?? t('notifications.someone')}</strong>
                              </div>
                              <div className="profileApplicationsListItem__headerRight">
                                {app.status === 'pending' ? (
                                  <div className="profileApplicationsListItem__actionsRight">
                                    <button
                                      type="button"
                                      className="profileApplicationsListItem__actionButton profileApplicationsListItem__actionButton--primary"
                                      onClick={() => handleAssignApplication(app.id)}
                                      disabled={(() => {
                                        const task = tasks.find((t) => t.id === app.taskId) ?? null
                                        if (!task) return true
                                        if (timeLeftMs(task.expiresAt, nowMs) <= 0) return true
                                        const max = task.maxExecutors ?? 1
                                        const assigned = task.assignedExecutorIds.length ?? 0
                                        if (assigned >= max) return true
                                        if (task.assignedExecutorIds.includes(app.executorUserId)) return true
                                        return false
                                      })()}
                                    >
                                      {t('profile.taskApplications.assign')}
                                    </button>
                                    <button
                                      type="button"
                                      className="profileApplicationsListItem__actionButton profileApplicationsListItem__actionButton--danger"
                                      onClick={() => handleRejectApplication(app.id)}
                                    >
                                      {t('profile.taskApplications.reject')}
                                    </button>
                                  </div>
                                ) : null}
                                <StatusPill tone={statusTone} label={t(statusKey)} className="profileApplicationsListItem__statusPill" />
                              </div>
                            </div>

                            <div className="profileApplicationsListItem__meta">
                              {executor ? (
                                <Link
                                  className="linkBtn profileApplicationsListItem__profileLink"
                                  to={userProfilePath(executor.id)}
                                  state={{ backTo: `${paths.profile}?tab=applications` }}
                                >
                                  {t('notifications.viewProfile')}
                                </Link>
                              ) : null}
                              {taskItem ? (
                                <Link
                                  className="linkBtn"
                                  to={taskDetailsPath(taskItem.id)}
                                  state={{ backTo: `${paths.profile}?tab=applications` }}
                                >
                                  {t('notifications.viewTask')}
                                </Link>
                              ) : null}
                              <span className="pill">{new Date(app.createdAt).toLocaleString()}</span>
                            </div>

                            <p className="profileApplicationsListItem__message">{app.message ? app.message : ''}</p>
                          </li>
                        )
                      })}
                    </ul>
                    <Pagination page={applicationsPage} pageCount={applicationsPageCount} onChange={setApplicationsPage} />
                  </>
                )}
              </div>
            ) : null}

            {tab === 'disputes' && (user.role === 'customer' || user.role === 'executor') ? (
              <div className="profilePanel">
                <div className="profilePanel__header">
                  <h2 className="profilePanel__title">
                    {locale === 'ru' ? 'Споры' : 'Disputes'}{' '}
                    <span className="profilePanel__countInline">({disputesForProfile.length})</span>
                  </h2>
                </div>

                {disputesForProfile.length === 0 ? (
                  <div className="profileEmpty">
                    {locale === 'ru' ? 'Пока нет споров.' : 'No disputes yet.'}
                  </div>
                ) : (
                  <ul className="customerTasksList" aria-label={locale === 'ru' ? 'Споры' : 'Disputes'}>
                    {disputesForProfile.map((d) => {
                      const c = contractRepo.getById(d.contractId)
                      const taskItem = c ? taskRepo.getById(c.taskId) : null
                      const title = taskItem ? pickText(taskItem.title, locale) : (c?.taskId ?? d.contractId)
                      const openedBy = users.find((u) => u.id === d.openedByUserId) ?? null
                      const unread = unreadDisputeCountById.get(d.id) ?? 0
                      const updated = new Date(d.updatedAt).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US')

                      return (
                        <li
                          key={d.id}
                          className="customerTasksItem"
                          role="link"
                          tabIndex={0}
                          onClick={(e) => {
                            const target = e.target
                            if (target instanceof HTMLElement) {
                              if (target.closest('a,button,input,textarea,select,[role="button"]')) return
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
                          <div className="customerTasksItemContent">
                            <div className="customerTasksItemHeader">
                              <Link className="customerTasksItemTitle" to={disputeThreadPath(d.id)}>
                                {title}
                              </Link>
                            </div>

                            <div className="customerTasksItemBadges">
                              <span className="customerTasksItemBadge">
                                ⚖️ {locale === 'ru' ? 'Статус' : 'Status'}: {disputeStatusLabel(d.status)}
                              </span>
                              <span className="customerTasksItemBadge">
                                🕓 {locale === 'ru' ? 'Обновлено' : 'Updated'}: {updated}
                              </span>
                              <span className="customerTasksItemBadge">
                                {locale === 'ru' ? 'Открыл' : 'Opened by'}: {openedBy?.fullName ?? d.openedByUserId}
                              </span>
                              {unread ? (
                                <span className="customerTasksItemBadge">
                                  🔔 {locale === 'ru' ? 'Новых' : 'Unread'}: {unread > 99 ? '99+' : unread}
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <div className="customerTasksItemRight">
                            <Link className="linkBtn" to={disputeThreadPath(d.id)}>
                              {locale === 'ru' ? 'Открыть чат' : 'Open chat'}
                            </Link>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            ) : null}

            {tab === 'executor_active' && user.role === 'executor' ? (
              <div className="profilePanel">
                <div className="profilePanel__header">
                  <h2 className="profilePanel__title">
                    {t('profile.postedActive')} <span className="profilePanel__countInline">({myActive.length})</span>
                  </h2>
                </div>
                {myActive.length === 0 ? (
                  <div className="profileEmpty">
                    {t('profile.noneYet')} <Link to={paths.tasks}>{t('profile.takeTask')}</Link>
                  </div>
                ) : (
                  <ul className="customerTasksList">
                    {myActive.slice(0, MAX_PREVIEW).map((task) => {
                      const a =
                        taskAssignments.find((ta) => ta.taskId === task.id && ta.executorId === user.id) ?? null
                      const startLeft = a ? timeLeftMs(a.startDeadlineAt, nowMs) : null
                      const execLeft = a?.executionDeadlineAt ? timeLeftMs(a.executionDeadlineAt, nowMs) : null

                      const statusText =
                        a?.status === 'pending_start'
                          ? locale === 'ru'
                            ? 'Нужно начать'
                            : 'Start required'
                          : a?.status === 'paused' || a?.status === 'pause_requested'
                            ? t('executor.status.paused')
                            : a?.status === 'overdue'
                              ? locale === 'ru'
                                ? 'Просрочено'
                                : 'Overdue'
                              : task.status === 'dispute'
                                ? t('task.status.dispute')
                                : task.status === 'review'
                                  ? t('task.status.review')
                                  : t('task.status.inProgress')
                      const tone: StatusTone =
                        a?.status === 'pending_start'
                          ? 'pending'
                          : a?.status === 'paused' || a?.status === 'pause_requested'
                            ? 'paused'
                            : a?.status === 'overdue'
                              ? 'overdue'
                              : task.status === 'dispute'
                                ? 'dispute'
                                : task.status === 'review'
                                  ? 'review'
                                  : 'in_progress'

                      return (
                        <li
                          key={task.id}
                          className="customerTasksItem"
                          role="link"
                          tabIndex={0}
                          onClick={(e) => {
                            const target = e.target
                            if (!(target instanceof HTMLElement)) {
                              navigate(taskDetailsPath(task.id))
                              return
                            }
                            if (target.closest('a,button,input,textarea,select,[role="button"]')) return
                            navigate(taskDetailsPath(task.id))
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              navigate(taskDetailsPath(task.id))
                            }
                          }}
                        >
                          <div className="customerTasksItemContent">
                            <div className="customerTasksItemHeader">
                              <Link className="customerTasksItemTitle" to={taskDetailsPath(task.id)}>
                                {pickText(task.title, locale)}
                              </Link>
                            </div>

                            <div className="customerTasksItemBadges">
                              <span className="customerTasksItemBadge">
                                🗓️ {t('tasks.published')}: {timeAgo(task.createdAt, locale, nowMs)}
                              </span>
                              {task.status !== 'closed' && task.dueDate ? (
                                <span className="customerTasksItemBadge">
                                  📅 {t('tasks.due')}: {task.dueDate}
                                </span>
                              ) : null}
                              {a?.status === 'pending_start' && startLeft !== null ? (
                                <span className="customerTasksItemBadge" style={{ opacity: 0.9 }}>
                                  {locale === 'ru' ? 'Начать в течение' : 'Start within'}: {formatTimeLeft(startLeft, locale)}
                                </span>
                              ) : null}
                              {(a?.status === 'in_progress' || a?.status === 'overdue') && execLeft !== null ? (
                                <span className="customerTasksItemBadge" style={a?.status === 'overdue' ? { color: 'rgba(239,68,68,0.95)' } : undefined}>
                                  {a?.status === 'overdue'
                                    ? locale === 'ru'
                                      ? 'Просрочено'
                                      : 'Overdue'
                                    : locale === 'ru'
                                      ? 'Осталось'
                                      : 'Time left'}
                                  : {formatTimeLeft(execLeft, locale)}
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <div className="customerTasksItemRight">
                            <StatusPill tone={tone} label={statusText} />
                            <div className="customerTasksItemActions">
                              {a?.status === 'pending_start' ? (
                                <button
                                  type="button"
                                  className="customerTasksApplicationsBtn"
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    if (USE_API) {
                                      void api.post(`/assignments/${task.id}/start`, {}).catch(() => {})
                                    } else {
                                      taskAssignmentRepo.startWork(task.id, user.id)
                                    }
                                    void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, text: t('toast.workStarted'), tone: 'success' })
                                  }}
                                  title={locale === 'ru' ? 'Начать работу' : 'Start work'}
                                >
                                  {locale === 'ru' ? 'Начать' : 'Start'}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            ) : null}

            {tab === 'executor_completed' && user.role === 'executor' ? (
              <div className="profilePanel">
                <div className="profilePanel__header">
                  <h2 className="profilePanel__title">
                    {t('profile.stats.completed')} <span className="profilePanel__countInline">({myCompleted.length})</span>
                  </h2>
                </div>
                {myCompleted.length === 0 ? (
                  <div className="profileEmpty">{t('profile.noneYet')}</div>
                ) : (
                  <ul className="customerTasksList">
                    {myCompleted.slice(0, MAX_PREVIEW).map((task) => {
                      const backToCompleted = `${paths.profile}?tab=executor_completed`
                      const contract = contractRepo.getForTaskExecutor(task.id, user.id)
                      const clientId = contract?.clientId ?? task.createdByUserId ?? null
                      const alreadyRated = contract ? Boolean(ratingRepo.getForContractPair(contract.id, user.id)) : false
                      const dispute = contract ? disputeRepo.getForContract(contract.id) : null
                      const canSuggestRate =
                        Boolean(
                          contract &&
                            (contract.status === 'approved' ||
                              contract.status === 'resolved' ||
                              (contract.status === 'disputed' && (dispute?.status === 'decided' || dispute?.status === 'closed'))),
                        )

                      return (
                        <li
                          key={task.id}
                          className="customerTasksItem"
                          role="link"
                          tabIndex={0}
                          onClick={(e) => {
                            const target = e.target
                            if (!(target instanceof HTMLElement)) {
                              navigate(taskDetailsPath(task.id), { state: { backTo: backToCompleted } })
                              return
                            }
                            if (target.closest('a,button,input,textarea,select,[role="button"]')) return
                            navigate(taskDetailsPath(task.id), { state: { backTo: backToCompleted } })
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              navigate(taskDetailsPath(task.id), { state: { backTo: backToCompleted } })
                            }
                          }}
                        >
                          <div className="customerTasksItemContent">
                            <div className="customerTasksItemHeader">
                              <Link className="customerTasksItemTitle" to={taskDetailsPath(task.id)} state={{ backTo: backToCompleted }}>
                                {pickText(task.title, locale)}
                              </Link>
                            </div>

                            <div className="customerTasksItemBadges">
                              {/* For completed tasks we hide "due" and "time left" */}
                            </div>
                          </div>

                          <div className="customerTasksItemRight">
                            <StatusPill tone="closed" label={t('task.status.closed')} />
                            <div className="customerTasksItemActions">
                              {contract && clientId && !alreadyRated && canSuggestRate ? (
                                <button
                                  type="button"
                                  className="customerTasksApplicationsBtn"
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    setRateContractId(contract.id)
                                  }}
                                >
                                  {locale === 'ru' ? 'Оценить заказчика' : 'Rate client'}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            ) : null}

            {tab === 'executor_uncompleted' && user.role === 'executor' ? (
              <div className="profilePanel">
                <div className="profilePanel__header">
                  <h2 className="profilePanel__title">
                    {t('profile.stats.uncompleted')} <span className="profilePanel__countInline">({myUncompleted.length})</span>
                  </h2>
                </div>
                {myUncompleted.length === 0 ? (
                  <div className="profileEmpty">{t('profile.noneYet')}</div>
                ) : (
                  <ul className="customerTasksList">
                    {myUncompleted.slice(0, MAX_PREVIEW).map((task) => {
                      const backToUncompleted = `${paths.profile}?tab=executor_uncompleted`
                      const a = myAssignmentByTaskId.get(task.id) ?? null
                      const statusKey =
                        a?.status === 'removed_auto'
                          ? ('executor.status.removed' as const)
                          : a?.status === 'cancelled_by_customer'
                            ? ('executor.status.cancelledByCustomer' as const)
                            : a?.status === 'dispute_opened'
                              ? ('executor.status.disputeOpened' as const)
                              : ('executor.status.overdue' as const)
                      const tone: StatusTone =
                        a?.status === 'overdue' ? 'overdue' : a?.status === 'dispute_opened' ? 'review' : 'neutral'

                      return (
                        <li
                          key={task.id}
                          className="customerTasksItem"
                          role="link"
                          tabIndex={0}
                          onClick={(e) => {
                            const target = e.target
                            if (!(target instanceof HTMLElement)) {
                              navigate(taskDetailsPath(task.id), { state: { backTo: backToUncompleted } })
                              return
                            }
                            if (target.closest('a,button,input,textarea,select,[role="button"]')) return
                            navigate(taskDetailsPath(task.id), { state: { backTo: backToUncompleted } })
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              navigate(taskDetailsPath(task.id), { state: { backTo: backToUncompleted } })
                            }
                          }}
                        >
                          <div className="customerTasksItemContent">
                            <div className="customerTasksItemHeader">
                              <Link
                                className="customerTasksItemTitle"
                                to={taskDetailsPath(task.id)}
                                state={{ backTo: backToUncompleted }}
                              >
                                {pickText(task.title, locale)}
                              </Link>
                            </div>
                            <div className="customerTasksItemBadges" />
                          </div>
                          <div className="customerTasksItemRight">
                            <StatusPill tone={tone} label={t(statusKey)} />
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            ) : null}

            {tab === 'violations' && user.role === 'executor' ? (
              <div className="profilePanel">
                <div className="profilePanel__header">
                  <h2 className="profilePanel__title">
                    {t('violations.title')}{' '}
                    <span className="profilePanel__countInline">({violationsInWindow.length})</span>{' '}
                    <HelpTip
                      open={violationsHelpOpen}
                      onToggle={() => setViolationsHelpOpen((v) => !v)}
                      onClose={() => setViolationsHelpOpen(false)}
                      ariaLabel={t('violations.help.buttonLabel')}
                      title={t('violations.help.title')}
                      content={[
                        t('violations.help.p1'),
                        '',
                        locale === 'ru' ? 'Нарушения:' : 'Violations:',
                        `• ${t('violations.help.violation.noStart12h')}`,
                        `• ${t('violations.help.violation.noSubmit24h')}`,
                        '',
                        t('violations.help.sanctionsTitle'),
                        `• ${t('violations.help.sanctions.warning')}`,
                        `• ${t('violations.help.sanctions.ratingPenalty')}`,
                        `• ${t('violations.help.sanctions.block24')}`,
                        `• ${t('violations.help.sanctions.block72')}`,
                        `• ${t('violations.help.sanctions.ban')}`,
                      ].join('\n')}
                    />
                  </h2>
                </div>
                <div className="profileSubtitle" style={{ marginTop: 6 }}>
                  {t('violations.subtitle')}
                </div>

                {violationsInWindow.length === 0 ? (
                  <div className="profileEmpty">{t('violations.empty')}</div>
                ) : (
                  <ul className="profileList" aria-label={t('violations.title')} style={{ marginTop: 10 }}>
                    {violationsInWindow.map((v) => {
                      const task = tasks.find((x) => x.id === v.taskId) ?? null
                      const taskTitle = task ? pickText(task.title, locale) : v.taskId
                      const n = indexByViolationId.get(v.id) ?? 1
                      const created = new Date(v.createdAt).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US')
                      const reasonKey =
                        v.type === 'no_submit_24h'
                          ? ('violations.reason.noSubmit24h' as const)
                          : ('violations.reason.noStart12h' as const)

                      return (
                        <li
                          key={v.id}
                          className="profileItem profileItem--card"
                          role="link"
                          tabIndex={0}
                          onClick={(e) => {
                            const target = e.target
                            if (target instanceof HTMLElement) {
                              if (target.closest('a,button,input,textarea,select,[role="button"]')) return
                            }
                            navigate(taskDetailsPath(v.taskId), { state: { backTo: `${paths.profile}?tab=violations` } })
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              navigate(taskDetailsPath(v.taskId), { state: { backTo: `${paths.profile}?tab=violations` } })
                            }
                          }}
                        >
                          <div className="profileItemTitleRow">
                            <Link
                              className="profileItemTitle"
                              to={taskDetailsPath(v.taskId)}
                              state={{ backTo: `${paths.profile}?tab=violations` }}
                            >
                              {taskTitle}
                            </Link>
                            <span className={`pill${sanctionIsDanger(n) ? ' pill--danger' : ''}`}>
                              {t(sanctionKeyByIndex(n))}
                            </span>
                          </div>

                          <div className="profileItemMeta">
                            <span className="pill" title={t('violations.col.date')}>
                              {created}
                            </span>
                            <span className="pill" title={`#${n}`}>
                              #{n}
                            </span>
                          </div>

                          <div style={{ opacity: 0.85, fontSize: 13, lineHeight: 1.45 }}>
                            <strong style={{ opacity: 0.9 }}>{t('violations.col.reason')}:</strong> {t(reasonKey)}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            ) : null}

            {tab === 'balance' ? (
              <div className="profilePanel">
                <div className="profilePanel__header">
                  <h2 className="profilePanel__title">
                    {t('profile.balance.title')}{' '}
                    <span className="profilePanel__countInline">({balanceFormatter.format(balanceInUiCurrency)})</span>
                  </h2>
          </div>

                {user.role === 'customer' ? (
                  <>
                    <div className="profileBalanceForm">
                      <input
                        type="number"
                        min="0"
                        placeholder={t('profile.balance.placeholder')}
                        value={depositAmount}
                        onChange={(e) => {
                          setDepositAmount(e.target.value)
                          setBalanceMessage(null)
                        }}
                      />
              <button
                type="button"
                        className="profileBalanceButton"
                        disabled={Number(depositAmount) <= 0}
                        onClick={() => {
                          const amountUi = Number(depositAmount)
                          if (!Number.isFinite(amountUi) || amountUi <= 0) {
                            setBalanceMessage(t('profile.balance.error'))
                            return
                          }
                          const amountUsd = locale === 'ru' ? amountUi / usdRubRate : amountUi
                          balanceRepo.deposit(user.id, amountUsd)
                          setDepositAmount('')
                          setBalanceMessage(t('profile.balance.success'))
                        }}
                      >
                        {t('profile.balance.add')}
              </button>
                      <button
                        type="button"
                        className="profileBalanceButton profileBalanceButton--ghost"
                        onClick={() => {
                          balanceRepo.reset(user.id)
                          setDepositAmount('')
                          setBalanceMessage(t('profile.balance.resetSuccess'))
                        }}
                      >
                        {t('profile.balance.reset')}
                      </button>
                    </div>
                    {balanceMessage ? <div className="profileBalanceMessage">{balanceMessage}</div> : null}
                  </>
                ) : (
                  <>
                    <div className="profileBalanceForm">
                      <input
                        type="number"
                        min="0"
                        placeholder={t('profile.balance.placeholder')}
                        value={withdrawAmount}
                        onChange={(e) => {
                          setWithdrawAmount(e.target.value)
                          setWithdrawMessage(null)
                        }}
                      />
                      <button
                        type="button"
                        className="profileBalanceButton"
                        disabled={Number(withdrawAmount) <= 0}
                        onClick={handleWithdraw}
                      >
                        {t('profile.balance.withdraw')}
                      </button>
                    </div>
                    {withdrawMessage ? <div className="profileBalanceMessage">{withdrawMessage}</div> : null}
                  </>
                )}
              </div>
            ) : null}

            {tab === 'settings' ? (
              <div className="profilePanel">
                <div className="profileSettings">
                  <div className="profileSettings__row">
                    <div className="profileSettings__label">{t('profile.socials')}</div>
                    <div className="profileSettings__value">
                      <SocialLinks socials={user.socials} />
                    </div>
                  </div>
                  <div className="profileSettings__row">
                    <div className="profileSettings__label">{t('register.email')}</div>
                    <div className="profileSettings__value">{user.email}</div>
                  </div>
                  <div className="profileSettings__row">
                    <div className="profileSettings__label">{t('register.phone')}</div>
                    <div className="profileSettings__value">{user.phone}</div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>
        </div>

      {/* Старые секции ниже вынесены в новый dashboard layout (profileLayout) */}

      {openList ? (
        <div className="profileModalOverlay" role="dialog" aria-modal="true" aria-label={modalTitle} onClick={() => setOpenList(null)}>
          <div className="profileModal" onClick={(e) => e.stopPropagation()}>
            <div className="profileModalHeader">
              <h2 className="profileModalTitle">{modalTitle}</h2>
              <button type="button" className="profileModalClose" onClick={() => setOpenList(null)}>
                {t('common.cancel')}
              </button>
            </div>

            {modalItems.length === 0 ? (
              <div className="profileEmpty">{t('profile.noneYet')}</div>
            ) : (
              <ul className="profileList">
                {modalItems.map((x) => {
                  const assignedId = x.assignedExecutorIds[0] ?? null
                  const assigned = assignedId ? users.find((u) => u.id === assignedId) ?? null : null
                  const statusKey =
                    x.status === 'closed'
                      ? 'task.status.closed'
                      : x.status === 'in_progress'
                        ? 'task.status.inProgress'
                        : x.status === 'dispute'
                          ? 'task.status.dispute'
                        : x.status === 'review'
                          ? 'task.status.review'
                          : 'task.status.open'

                  return (
                    <li key={x.id} className="profileItem">
                      <div className="profileItemTitleRow">
                        <Link className="profileItemTitle" to={taskDetailsPath(x.id)} onClick={() => setOpenList(null)}>
                          {pickText(x.title, locale)}
                        </Link>
                        <span className="pill">{t(statusKey)}</span>
                      </div>

                      {openList === 'customerMy' && (x.status !== 'closed' || assigned) ? (
                        <div className="profileItemMeta">
                          <span className="pill">
                            {t('tasks.published')}: {timeAgo(x.createdAt, locale, nowMs)}
                          </span>
                          {assigned ? (
                            null
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      <RatingModal
        open={Boolean(rateContractId)}
        subjectName={(() => {
          const c = rateContractId ? contractRepo.getById(rateContractId) : null
          const u = c ? users.find((x) => x.id === c.clientId) ?? null : null
          return u?.fullName
        })()}
        onClose={() => setRateContractId(null)}
        onSubmit={({ rating, comment }) => {
          if (!rateContractId || !user) return
          const c = contractRepo.getById(rateContractId)
          if (!c) return
          ratingRepo.upsert({
            contractId: c.id,
            fromUserId: user.id,
            toUserId: c.clientId,
            rating,
            comment,
          })
          setRateContractId(null)
        }}
      />

      <RatingModal
        open={Boolean(rateExecutorContractId)}
        title={locale === 'ru' ? 'Оценка исполнителя' : 'Rate executor'}
        subjectName={(() => {
          const c = rateExecutorContractId ? contractRepo.getById(rateExecutorContractId) : null
          const u = c ? users.find((x) => x.id === c.executorId) ?? null : null
          return u?.fullName
        })()}
        onClose={() => setRateExecutorContractId(null)}
        onSubmit={({ rating, comment }) => {
          if (!rateExecutorContractId || !user || user.role !== 'customer') return
          const c = contractRepo.getById(rateExecutorContractId)
          if (!c) return
          ratingRepo.upsert({
            contractId: c.id,
            fromUserId: user.id,
            toUserId: c.executorId,
            rating,
            comment,
          })
          setRateExecutorContractId(null)
        }}
      />

      <NoStartAssignModal
        open={Boolean(noStartPrompt)}
        count={noStartPrompt?.count ?? 0}
        onClose={() => setNoStartPrompt(null)}
        onConfirm={() => {
          if (!noStartPrompt) return
          handleAssignApplication(noStartPrompt.applicationId, { bypassNoStartConfirm: true })
        }}
      />

    </main>
  )
}

