import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { paths, taskDetailsPath, userProfilePath } from '@/app/router/paths'
import { applicationRepo } from '@/entities/task/lib/applicationRepo'
import { useApplications } from '@/entities/task/lib/useApplications'
import { taskRepo, archiveExpiredTasks, archiveStaleTasks } from '@/entities/task/lib/taskRepo'
import { useTasks } from '@/entities/task/lib/useTasks'
import { useUsers } from '@/entities/user/lib/useUsers'
import { balanceRepo } from '@/entities/user/lib/balanceRepo'
import { balanceFreezeRepo } from '@/entities/user/lib/balanceFreezeRepo'
import { notificationRepo } from '@/entities/notification/lib/notificationRepo'
import { pickText } from '@/entities/task/lib/taskText'
import { OPEN_APPLICATIONS_EVENT } from '@/entities/task/lib/applicationEvents'
import { useContracts } from '@/entities/contract/lib/useContracts'
import { contractRepo } from '@/entities/contract/lib/contractRepo'
import { useAuth } from '@/shared/auth/AuthContext'
import { useI18n } from '@/shared/i18n/I18nContext'
import type { TranslationKey } from '@/shared/i18n/translations'
import { timeAgo } from '@/shared/lib/timeAgo'
import { CustomSelect } from '@/shared/ui/custom-select/CustomSelect'
import { taskAssignmentRepo } from '@/entities/taskAssignment/lib/taskAssignmentRepo'
import { noStartViolationCountLast90d } from '@/entities/executorSanction/lib/noStartSanctions'
import { NoStartAssignModal } from '@/features/sanctions/NoStartAssignModal'
import { useTaskAssignments } from '@/entities/taskAssignment/lib/useTaskAssignments'
import { useDevMode } from '@/shared/dev/devMode'
import './profile.css'
import { previewMetaList } from '@/shared/lib/metaList'
import { StatusPill } from '@/shared/ui/status-pill/StatusPill'
import { Pagination } from '@/shared/ui/pagination/Pagination'

type StatusFilter = 'all' | 'draft' | 'open' | 'in_progress' | 'review' | 'dispute' | 'closed' | 'waiting'

const STATUS_OPTIONS: Array<{ value: StatusFilter; key: TranslationKey }> = [
  { value: 'all', key: 'customerTasks.status.all' },
  { value: 'draft', key: 'task.status.draft' },
  { value: 'open', key: 'task.status.open' },
  { value: 'waiting', key: 'task.status.waiting' },
  { value: 'in_progress', key: 'task.status.inProgress' },
  { value: 'review', key: 'task.status.review' },
  { value: 'dispute', key: 'task.status.dispute' },
  { value: 'closed', key: 'task.status.closed' },
]

function capitalizeFirst(s: string) {
  const trimmed = s.trim()
  if (!trimmed) return s
  return trimmed[0].toUpperCase() + trimmed.slice(1)
}

export function CustomerTasksPage() {
  const { t, locale } = useI18n()
  const auth = useAuth()
  const devMode = useDevMode()
  const navigate = useNavigate()
  const tasks = useTasks()
  const users = useUsers()
  const applications = useApplications()
  const contracts = useContracts()
  const assignments = useTaskAssignments()
  const [insufficientAlertTaskId, setInsufficientAlertTaskId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [applicationsOverlayTaskId, setApplicationsOverlayTaskId] = useState<string | null>(null)
  const [noStartPrompt, setNoStartPrompt] = useState<null | { applicationId: string; count: number }>(null)
  const [sortMode, setSortMode] = useState<'new' | 'old'>('new')
  const [tasksPage, setTasksPage] = useState(1)
  const PAGE_SIZE = 20
  const tasksListRef = useRef<HTMLUListElement | null>(null)
  const prevTasksPageRef = useRef<number | null>(null)

  const posted = useMemo(() => {
    if (!auth.user) return []
    return tasks.filter((task) => task.createdByUserId === auth.user?.id)
  }, [auth.user, tasks])
  const hasAnyPublished = useMemo(() => posted.some((t) => t.status !== 'draft'), [posted])

  const tokens = useMemo(
    () =>
      search
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean),
    [search],
  )

  const overdueTaskIds = useMemo(() => {
    const set = new Set<string>()
    for (const a of assignments) {
      if (a.status === 'overdue') set.add(a.taskId)
    }
    return set
  }, [assignments])

  const applicationsByTask = useMemo(() => {
    const map = new Map<string, typeof applications[number][]>()
    const pendingCount = new Map<string, number>()
    for (const app of applications) {
      const list = map.get(app.taskId)
      if (list) list.push(app)
      else map.set(app.taskId, [app])
      if (app.status === 'pending') {
        pendingCount.set(app.taskId, (pendingCount.get(app.taskId) ?? 0) + 1)
      }
    }
    return { all: map, pendingCount }
  }, [applications])

  const filteredTasks = useMemo(() => {
    const isWaitingTask = (task: (typeof posted)[number]) => overdueTaskIds.has(task.id) && task.status === 'in_progress'
    return posted
      .filter((task) => task.status !== 'archived')
      .filter((task) => {
        if (statusFilter === 'all') return true
        if (statusFilter === 'draft') return task.status === 'draft'
        if (statusFilter === 'waiting') return isWaitingTask(task)
        if (statusFilter === 'in_progress') return task.status === 'in_progress' && !isWaitingTask(task)
        return task.status === statusFilter
      })
      .filter((task) => {
        if (!tokens.length) return true
        const hay = [
          pickText(task.title, locale),
          pickText(task.shortDescription, locale),
          task.requirements ? pickText(task.requirements, locale) : '',
          pickText(task.description, locale),
          task.category ?? '',
          task.location ?? '',
        ]
          .join(' ')
          .toLowerCase()
        return tokens.every((tok) => hay.includes(tok))
      })
      .sort((a, b) => {
        // Priority: tasks that require customer action first.
        // 1) Pending applications (responses) requiring a decision.
        const aPending = applicationsByTask.pendingCount.get(a.id) ?? 0
        const bPending = applicationsByTask.pendingCount.get(b.id) ?? 0
        const aNeedsAction = aPending > 0
        const bNeedsAction = bPending > 0
        if (aNeedsAction !== bNeedsAction) return aNeedsAction ? -1 : 1

        // 2) Submitted work in review / dispute is also an actionable state.
        const aReviewLike = a.status === 'review' || a.status === 'dispute'
        const bReviewLike = b.status === 'review' || b.status === 'dispute'
        if (aReviewLike !== bReviewLike) return aReviewLike ? -1 : 1

        // 3) Completed tasks should always be below active/actionable tasks.
        const aClosed = a.status === 'closed'
        const bClosed = b.status === 'closed'
        if (aClosed !== bClosed) return aClosed ? 1 : -1

        if (sortMode === 'new') {
          return b.createdAt.localeCompare(a.createdAt)
        }
        return a.createdAt.localeCompare(b.createdAt)
      })
  }, [posted, statusFilter, tokens, locale, sortMode, overdueTaskIds, applicationsByTask])

  const tasksPageCount = useMemo(() => Math.max(1, Math.ceil(filteredTasks.length / PAGE_SIZE)), [filteredTasks.length])
  const pagedTasks = useMemo(() => {
    const start = (tasksPage - 1) * PAGE_SIZE
    return filteredTasks.slice(start, start + PAGE_SIZE)
  }, [filteredTasks, tasksPage])

  useEffect(() => {
    setTasksPage(1)
  }, [statusFilter, search, sortMode])

  useEffect(() => {
    setTasksPage((p) => Math.min(Math.max(1, p), tasksPageCount))
  }, [tasksPageCount])

  useEffect(() => {
    if (prevTasksPageRef.current === null) {
      prevTasksPageRef.current = tasksPage
      return
    }
    if (prevTasksPageRef.current === tasksPage) return
    prevTasksPageRef.current = tasksPage

    window.requestAnimationFrame(() => {
      tasksListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [tasksPage])

  const reviewCount = useMemo(() => {
    if (!auth.user) return 0
    return contracts.filter((c) => c.clientId === auth.user!.id && c.status === 'submitted').length
  }, [auth.user, contracts])

  const pauseRequestsCount = useMemo(() => {
    if (!auth.user || auth.user.role !== 'customer') return 0
    const myTaskIds = new Set(posted.map((t) => t.id))
    return assignments.filter((a) => a.status === 'pause_requested' && myTaskIds.has(a.taskId)).length
  }, [assignments, auth.user, posted])



  const pauseByTaskId = useMemo(() => {
    const map = new Map<string, 'paused' | 'pause_requested'>()
    for (const a of assignments) {
      if (a.status !== 'paused' && a.status !== 'pause_requested') continue
      const prev = map.get(a.taskId)
      if (prev === 'paused') continue
      map.set(a.taskId, a.status)
    }
    return map
  }, [assignments])

  const activeTaskApplications = applicationsOverlayTaskId
    ? (applicationsByTask.all.get(applicationsOverlayTaskId) ?? [])
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : []
  const activeTask = applicationsOverlayTaskId ? taskRepo.getById(applicationsOverlayTaskId) ?? null : null
  const activeAssignedCount = activeTask?.assignedExecutorIds.length ?? 0
  const activeMaxExecutors = activeTask?.maxExecutors ?? 1
  const activeSlotsAvailable = activeAssignedCount < activeMaxExecutors
  const [searchHelpOpen, setSearchHelpOpen] = useState(false)
  const searchHelpButtonRef = useRef<HTMLButtonElement | null>(null)
  const searchHelpTooltipRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!searchHelpOpen) return

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target
      if (!(target instanceof Node)) return
      if (searchHelpButtonRef.current?.contains(target)) return
      if (searchHelpTooltipRef.current?.contains(target)) return
      // Click anywhere outside the tooltip closes it (including clicks on the search input).
      setSearchHelpOpen(false)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSearchHelpOpen(false)
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [searchHelpOpen])

  const handleAssignApplication = (
    app: typeof activeTaskApplications[number],
    opts?: { bypassNoStartConfirm?: boolean },
  ) => {
    if (!activeTask || !auth.user) return
    setInsufficientAlertTaskId(null)
    const customerId = activeTask.createdByUserId
    const existingContract = contractRepo.getForTaskExecutor(activeTask.id, app.executorUserId)
    const amount = activeTask.budgetAmount ?? 0

    const prevNoStart = noStartViolationCountLast90d(app.executorUserId)
    if (prevNoStart >= 2 && !opts?.bypassNoStartConfirm) {
      setNoStartPrompt({ applicationId: app.id, count: prevNoStart })
      return
    }

    if (!existingContract && amount > 0 && !balanceRepo.withdraw(customerId, amount)) {
      setInsufficientAlertTaskId(activeTask.id)
      return
    }
    const updated = taskRepo.addExecutor(activeTask.id, app.executorUserId)
    if (!updated) {
      if (!existingContract && amount > 0 && customerId) balanceRepo.deposit(customerId, amount)
      setInsufficientAlertTaskId(activeTask.id)
      return
    }
    const contract =
      existingContract ??
      contractRepo.createActive({
        taskId: activeTask.id,
        clientId: customerId ?? auth.user.id,
        executorId: app.executorUserId,
        escrowAmount: amount,
        revisionIncluded: 2,
      })
    if (!existingContract && amount > 0 && customerId) {
      balanceFreezeRepo.freeze(customerId, activeTask.id, app.executorUserId, amount)
    }
    const selected = applicationRepo.select(app.id, { contractId: contract.id })?.selected ?? null
    taskAssignmentRepo.createPendingStart({ taskId: activeTask.id, executorId: app.executorUserId })
    if (selected && activeTask.createdByUserId) {
      notificationRepo.addTaskTaken({
        recipientUserId: activeTask.createdByUserId,
        actorUserId: selected.executorUserId,
        taskId: activeTask.id,
      })
    }
    notificationRepo.addTaskAssigned({
      recipientUserId: app.executorUserId,
      actorUserId: auth.user.id,
      taskId: activeTask.id,
    })
    const updatedTask = taskRepo.getById(activeTask.id)
    const maxExecutors = updatedTask?.maxExecutors ?? 1
    const assignedCount = updatedTask?.assignedExecutorIds.length ?? 0
    if (updatedTask && assignedCount >= maxExecutors) {
      const pendingApplications = (applicationsByTask.all.get(updatedTask.id) ?? []).filter(
        (pending) => pending.status === 'pending' && pending.id !== app.id,
      )
      for (const pending of pendingApplications) {
        applicationRepo.reject(pending.id)
        notificationRepo.addTaskAssignedElse({
          recipientUserId: pending.executorUserId,
          actorUserId: auth.user.id,
          taskId: updatedTask.id,
        })
      }
    }
  }

  const handleRejectApplication = (applicationId: string) => {
    applicationRepo.reject(applicationId)
  }

  useEffect(() => {
    const run = () => {
      const archivedIds = archiveStaleTasks(applications)
      for (const taskId of archivedIds) {
        const task = taskRepo.getById(taskId)
        const customerId = task?.createdByUserId ?? null
        if (customerId) {
          notificationRepo.addTaskUnclaimed({
            recipientUserId: customerId,
            actorUserId: customerId,
            taskId,
          })
        }
      }
      const expiredIds = archiveExpiredTasks(Date.now())
      for (const taskId of expiredIds) {
        const task = taskRepo.getById(taskId)
        const customerId = task?.createdByUserId ?? null
        if (customerId) {
          notificationRepo.addTaskUnclaimed({
            recipientUserId: customerId,
            actorUserId: customerId,
            taskId,
          })
        }
        const apps = applications.filter((a) => a.taskId === taskId && a.status !== 'rejected')
        for (const app of apps) {
          applicationRepo.reject(app.id)
          if (customerId) {
            notificationRepo.addTaskApplicationCancelled({
              recipientUserId: app.executorUserId,
              actorUserId: customerId,
              taskId,
            })
          }
        }
      }
    }

    run()
    const interval = window.setInterval(run, 60_000)
    return () => window.clearInterval(interval)
  }, [applications])

  useEffect(() => {
    if (!applicationsOverlayTaskId) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setApplicationsOverlayTaskId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [applicationsOverlayTaskId])

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ taskId: string }>).detail
      if (!detail?.taskId) return
      setApplicationsOverlayTaskId(detail.taskId)
    }
    window.addEventListener(OPEN_APPLICATIONS_EVENT, handler)
    return () => window.removeEventListener(OPEN_APPLICATIONS_EVENT, handler)
  }, [])

  return (
    <main className="customerTasksPage">
      <div className="customerTasksContainer">
        <div className="customerTasksHeader">
          <div className="customerTasksHeaderTop">
            <h1 className="customerTasksTitle">{t('customerTasks.title')}</h1>
            <p className="customerTasksSubtitle">{t('customerTasks.titleHint')}</p>
          </div>

          <div className="customerTasksControls">
            <div className="customerTasksFilters">
              <CustomSelect
                label={t('customerTasks.filterStatusLabel')}
                value={statusFilter}
                onChange={(value) => setStatusFilter(value)}
                options={STATUS_OPTIONS.map((opt) => ({
                  value: opt.value,
                  label: capitalizeFirst(t(opt.key)),
                }))}
              />

              <CustomSelect
                label={t('customerTasks.sortLabel')}
                value={sortMode}
                onChange={(value) => setSortMode(value)}
                options={[
                  { value: 'new' as const, label: capitalizeFirst(t('customerTasks.sort.new')) },
                  { value: 'old' as const, label: capitalizeFirst(t('customerTasks.sort.old')) },
                ]}
              />
            </div>

            <div className="customerTasksSearchWrapper">
              <div className="customerTasksSearchContainer">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('customerTasks.search.placeholder')}
                  className="customerTasksSearchInput"
                />
                <button
                  type="button"
                  className={`customerTasksHelpButton${searchHelpOpen ? ' customerTasksHelpButton--active' : ''}`}
                  onClick={() => setSearchHelpOpen((v) => !v)}
                  aria-label={t('customerTasks.search.hint')}
                  ref={searchHelpButtonRef}
                >
                  ?
                </button>
              </div>
              {searchHelpOpen ? (
                <div className="customerTasksHelpTooltip" ref={searchHelpTooltipRef}>
                  {t('customerTasks.search.hint')}
                </div>
              ) : null}
            </div>

            {devMode.enabled ? (
              <Link className="customerTasksArchiveBtn" to={paths.customerArchive}>
                📦 {t('customerTasks.archive.open')}
              </Link>
            ) : null}
            <Link className="customerTasksArchiveBtn" to={paths.customerReview}>
              ✅ {t('customerReview.title')}
              {reviewCount ? ` (${reviewCount})` : ''}
            </Link>
            <Link className="customerTasksArchiveBtn" to={paths.customerRequests}>
              ⏸️ {t('customerRequests.title')}
              {pauseRequestsCount ? ` (${pauseRequestsCount})` : ''}
            </Link>

            {devMode.enabled && auth.user?.role === 'customer' ? (
              <button
                type="button"
                className="customerTasksArchiveBtn"
                onClick={() => {
                  if (!auth.user) return
                  const demo = taskRepo.create({
                    title: { ru: 'Тестовое задание (dev)', en: 'Demo task (dev)' },
                    shortDescription: {
                      ru: 'Создано одной кнопкой для ускорения тестов.',
                      en: 'Created by one button to speed up testing.',
                    },
                    requirements: {
                      ru: '- Ссылка на видео\n- Короткое сообщение\n',
                      en: '- Video link\n- Short message\n',
                    },
                    description: {
                      ru: 'Это тестовое задание. Быстро проверяйте таймеры/паузы/споры.',
                      en: 'This is a demo task to quickly test timers/pauses/disputes.',
                    },
                    createdByUserId: auth.user.id,
                    category: 'Dev',
                    location: 'Auto',
                    budgetAmount: 0,
                    budgetCurrency: locale === 'ru' ? 'RUB' : 'USD',
                    maxExecutors: 1,
                    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                  })
                  taskRepo.update(demo.id, (prev) => ({
                    ...prev,
                    status: 'open',
                  }))
                  navigate(taskDetailsPath(demo.id))
                }}
                title={locale === 'ru' ? 'Dev: создать и опубликовать тестовое задание' : 'Dev: create and publish demo task'}
              >
                {locale === 'ru' ? '🧪 Тест: создать' : '🧪 Dev: create'}
              </button>
            ) : null}
          </div>
        </div>

        <div className="customerTasksContent">
          {filteredTasks.length === 0 ? (
            <div className="customerTasksEmpty">
              {!hasAnyPublished ? (
                <>
                  <div style={{ marginBottom: 14 }}>{t('customerTasks.empty.noPublished')}</div>
                  <Link className="customerTasksArchiveBtn" to={paths.taskCreate}>
                    ➕ {t('nav.postTask')}
                  </Link>
                </>
              ) : (
                t('profile.noneYet')
              )}
            </div>
          ) : (
            <>
              <ul className="customerTasksList" ref={tasksListRef}>
                {pagedTasks.map((task) => {
                const pauseKind = pauseByTaskId.get(task.id) ?? null
                const isOverdue = overdueTaskIds.has(task.id) && task.status === 'in_progress'
                const statusKey =
                  pauseKind
                    ? ('executor.status.paused' as const)
                    : task.status === 'draft'
                      ? ('task.status.draft' as const)
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
                return (
                  <li
                    key={task.id}
                    className="customerTasksItem"
                    role="link"
                    tabIndex={0}
                    onClick={(e) => {
                      const target = e.target
                      if (!(target instanceof HTMLElement)) {
                        navigate(taskDetailsPath(task.id), { state: { backTo: paths.customerTasks } })
                        return
                      }
                      if (target.closest('a,button,input,textarea,select,[role="button"]')) return
                      navigate(taskDetailsPath(task.id), { state: { backTo: paths.customerTasks } })
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        navigate(taskDetailsPath(task.id), { state: { backTo: paths.customerTasks } })
                      }
                    }}
                  >
                    <div className="customerTasksItemContent">
                      <div className="customerTasksItemHeader">
                        <Link className="customerTasksItemTitle" to={taskDetailsPath(task.id)} state={{ backTo: paths.customerTasks }}>
                          {pickText(task.title, locale)}
                        </Link>
                      </div>

                      <div className="customerTasksItemBadges">
                        <span className="customerTasksItemBadge">
                          🗓️ {t('tasks.published')}: {timeAgo(task.createdAt, locale)}
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
                      <div className="customerTasksItemActions">
                        {task.status !== 'draft' && (applicationsByTask.all.get(task.id)?.length ?? 0) > 0 ? (
                          <button
                            type="button"
                            className="customerTasksApplicationsBtn"
                            onClick={() => setApplicationsOverlayTaskId(task.id)}
                          >
                            {t('profile.taskApplications.button')}
                            {(applicationsByTask.pendingCount.get(task.id) ?? 0) > 0 ? (
                              <span className="customerTasksApplicationsBtn__count">{applicationsByTask.pendingCount.get(task.id) ?? 0}</span>
                            ) : null}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                )
              })}
              </ul>
              <Pagination page={tasksPage} pageCount={tasksPageCount} onChange={setTasksPage} />
            </>
          )}
        </div>
      </div>

      {applicationsOverlayTaskId ? (
        <div
          className="profileModalOverlay"
          role="dialog"
          aria-modal="true"
          aria-label={activeTask ? pickText(activeTask.title, locale) : t('profile.taskApplications.title')}
          onClick={() => setApplicationsOverlayTaskId(null)}
        >
          <div className="profileModal profileApplicationsModal" onClick={(e) => e.stopPropagation()}>
            <div className="profileModalHeader">
              <h2 className="profileModalTitle">{activeTask ? pickText(activeTask.title, locale) : t('profile.taskApplications.title')}</h2>
              <button
                type="button"
                className="profileModalClose"
                onClick={() => setApplicationsOverlayTaskId(null)}
                aria-label={t('common.cancel')}
              >
                ×
              </button>
            </div>
            {activeTaskApplications.length > 0 ? (
              <div className="profileApplicationsSubtitle">
                {t('profile.taskApplications.subtitle', { count: activeTaskApplications.length })}
              </div>
            ) : null}

            {activeTaskApplications.length === 0 ? (
              <div className="profileEmpty">{t('profile.taskApplications.empty')}</div>
            ) : (
              <ul className="profileApplicationsList">
                {activeTaskApplications.map((app) => {
                  const executor = users.find((u) => u.id === app.executorUserId) ?? null
                  const contract = activeTask ? contractRepo.getForTaskExecutor(activeTask.id, app.executorUserId) : null
                  const assignment =
                    activeTask ? assignments.find((a) => a.taskId === activeTask.id && a.executorId === app.executorUserId) ?? null : null
                  const isCompletedContract = Boolean(contract && (contract.status === 'approved' || contract.status === 'resolved'))
                  const statusKey: TranslationKey =
                    assignment?.status === 'removed_auto'
                      ? ('executor.status.removed' as const)
                      : app.status === 'selected'
                        ? isCompletedContract
                          ? 'task.status.closed'
                          : contract?.status === 'disputed'
                            ? 'task.status.dispute'
                            : contract?.status === 'submitted'
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
                  const isPending = app.status === 'pending'
                  const isOverdue = statusKey === ('executor.status.overdue' as const)
                  return (
                    <li
                      key={app.id}
                      className={`profileApplicationsListItem${app.status === 'selected' ? ' profileApplicationsListItem--selected' : ''}${isOverdue ? ' profileApplicationsListItem--overdue' : ''}`}
                    >
                      <div className="profileApplicationsListItem__header">
                        {executor ? (
                          <Link
                            className="profileApplicationsListItem__nameLink"
                            to={userProfilePath(executor.id)}
                            state={activeTask ? { backTo: taskDetailsPath(activeTask.id) } : undefined}
                            onClick={() => setApplicationsOverlayTaskId(null)}
                          >
                            <span className="profileApplicationsListItem__headerLeft">
                              <span className="profileApplicationsListItem__avatar" aria-hidden="true">
                                {executor.avatarDataUrl ? (
                                  <img src={executor.avatarDataUrl} alt="" />
                                ) : (
                                  <span className="profileApplicationsListItem__avatarFallback">
                                    {(executor.fullName ?? executor.email ?? '?').trim().slice(0, 1).toUpperCase()}
                                  </span>
                                )}
                              </span>
                              <strong>{executor.fullName ?? executor.email ?? t('notifications.someone')}</strong>
                            </span>
                          </Link>
                        ) : (
                          <span className="profileApplicationsListItem__headerLeft">
                            <span className="profileApplicationsListItem__avatar" aria-hidden="true">
                              <span className="profileApplicationsListItem__avatarFallback">?</span>
                            </span>
                            <strong>{t('notifications.someone')}</strong>
                          </span>
                        )}
                        <span className={`pill${isOverdue ? ' pill--danger' : ''}`}>{t(statusKey)}</span>
                      </div>
                      <p className="profileApplicationsListItem__message">{app.message ? app.message : ''}</p>
                      {isPending ? (
                        <div className="profileApplicationsListItem__actions">
                          <button
                            type="button"
                            className="profileApplicationsListItem__actionButton profileApplicationsListItem__actionButton--primary"
                            disabled={!activeSlotsAvailable}
                            onClick={() => handleAssignApplication(app)}
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
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      <NoStartAssignModal
        open={Boolean(noStartPrompt)}
        count={noStartPrompt?.count ?? 0}
        onClose={() => setNoStartPrompt(null)}
        onConfirm={() => {
          if (!noStartPrompt) return
          const app = activeTaskApplications.find((x) => x.id === noStartPrompt.applicationId) ?? null
          if (!app) return
          handleAssignApplication(app, { bypassNoStartConfirm: true })
        }}
      />

      {insufficientAlertTaskId ? (
        <div
          className="profileModalOverlay"
          role="alertdialog"
          aria-modal="true"
          aria-label={t('profile.balance.insufficient')}
          onClick={() => setInsufficientAlertTaskId(null)}
        >
          <div className="profileModal" onClick={(e) => e.stopPropagation()}>
            <div className="profileModalHeader">
              <h2 className="profileModalTitle">{t('profile.balance.insufficient')}</h2>
              <button type="button" className="profileModalClose" onClick={() => setInsufficientAlertTaskId(null)} aria-label={t('common.cancel')}>
                ×
              </button>
            </div>
            <div className="profileBalanceMessage" style={{ marginTop: 10 }}>
              {t('profile.balance.insufficient')}
            </div>
            <div className="profileConfirmActions" style={{ marginTop: 14 }}>
              <Link className="profileBtn profileBtn--success" to={`${paths.profile}?tab=balance`} onClick={() => setInsufficientAlertTaskId(null)}>
                {t('profile.balance.add')}
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
