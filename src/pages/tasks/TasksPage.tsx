import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { paths, taskDetailsPath } from '@/app/router/paths'
import { useTasks } from '@/entities/task/lib/useTasks'
import { pickText } from '@/entities/task/lib/taskText'
import { autoTranslateIfNeeded } from '@/entities/task/lib/autoTranslateTask'
import { useI18n } from '@/shared/i18n/I18nContext'
import type { TranslationKey } from '@/shared/i18n/translations'
import { timeLeftMs } from '@/entities/task/lib/taskDeadline'
import { useAuth } from '@/shared/auth/AuthContext'
import { CustomSelect } from '@/shared/ui/custom-select/CustomSelect'
import { useApplications } from '@/entities/task/lib/useApplications'
import { applicationRepo } from '@/entities/task/lib/applicationRepo'
import { archiveStaleTasks, taskRepo } from '@/entities/task/lib/taskRepo'
import { notificationRepo } from '@/entities/notification/lib/notificationRepo'
import { useTaskAssignments } from '@/entities/taskAssignment/lib/useTaskAssignments'
import { executorRestrictionRepo } from '@/entities/executorSanction/lib/executorRestrictionRepo'
import { TASK_FORMAT_OPTIONS, TASK_PLATFORM_OPTIONS } from '@/entities/task/lib/taskMetaCatalog'
import './tasks.css'
import { StatusPill } from '@/shared/ui/status-pill/StatusPill'
import { Pagination } from '@/shared/ui/pagination/Pagination'
import { timeAgo } from '@/shared/lib/timeAgo'

function formatBudget(amount?: number, currency?: string) {
  if (!amount) return null
  return `${amount} ${currency ?? ''}`.trim()
}

function statusLabel(status: string, t: (key: TranslationKey) => string) {
  if (status === 'open') return t('task.status.open')
  if (status === 'in_progress') return t('task.status.inProgress')
  if (status === 'review') return t('task.status.review')
  if (status === 'dispute') return t('task.status.dispute')
  if (status === 'closed') return t('task.status.closed')
  return status.replace('_', ' ')
}

function splitMetaList(value: string | undefined | null): string[] {
  const raw = (value ?? '').trim()
  if (!raw) return []

  // Prefer comma-separated (new data), fallback to legacy "A / B / C" and "A • B".
  const byComma = raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

  const base =
    byComma.length > 1
      ? byComma
      : raw.includes(' / ')
        ? raw
            .split(' / ')
            .map((x) => x.trim())
            .filter(Boolean)
        : raw.includes('•')
          ? raw
              .split('•')
              .map((x) => x.trim())
              .filter(Boolean)
          : byComma

  const uniq: string[] = []
  const seen = new Set<string>()
  for (const x of base) {
    const key = x.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    uniq.push(x)
  }
  return uniq
}

function metaLine(value: string | undefined | null): string | null {
  const items = splitMetaList(value)
  if (!items.length) return null
  return items.join(', ')
}

function hasMetaValue(value: string | undefined | null, wanted: string): boolean {
  const w = wanted.trim().toLowerCase()
  if (!w) return false
  return splitMetaList(value).some((x) => x.toLowerCase() === w)
}

type TasksSortMode = 'created' | 'budget_asc' | 'budget_desc'

export function TasksPage() {
  const { t, locale } = useI18n()
  const auth = useAuth()
  const navigate = useNavigate()
  const isCustomer = auth.user?.role === 'customer'
  const isExecutor = auth.user?.role === 'executor'
  const allTasks = useTasks()
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [q, setQ] = useState('')
  const tokens = useMemo(() => q.trim().toLowerCase().split(/\s+/).filter(Boolean), [q])
  const [filterCategory, setFilterCategory] = useState<string | null>(null)
  const [filterLocation, setFilterLocation] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<TasksSortMode>('created')
  const [myActivePage, setMyActivePage] = useState(1)
  const [marketPage, setMarketPage] = useState(1)
  const PAGE_SIZE = 20
  const [filtersOpen, setFiltersOpen] = useState(false)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const filtersButtonRef = useRef<HTMLButtonElement | null>(null)
  const myActiveListRef = useRef<HTMLDivElement | null>(null)
  const marketListRef = useRef<HTMLDivElement | null>(null)
  const prevMyActivePageRef = useRef<number | null>(null)
  const prevMarketPageRef = useRef<number | null>(null)
  const applications = useApplications()
  const assignments = useTaskAssignments()
  const appliedTaskIds = useMemo(() => {
    if (auth.user?.role !== 'executor' || !auth.user?.id) return new Set<string>()
    return new Set(
      applications
        .filter((app) => app.executorUserId === auth.user?.id && app.status === 'pending')
        .map((app) => app.taskId),
    )
  }, [applications, auth.user?.id, auth.user?.role])

  const removedAutoTaskIds = useMemo(() => {
    if (auth.user?.role !== 'executor' || !auth.user?.id) return new Set<string>()
    return new Set(
      assignments
        .filter((a) => a.executorId === auth.user!.id && a.status === 'removed_auto')
        .map((a) => a.taskId),
    )
  }, [assignments, auth.user?.id, auth.user?.role])

  const myActiveAssignments = useMemo(() => {
    if (auth.user?.role !== 'executor' || !auth.user?.id) return []
    const id = auth.user.id
    const allowed = new Set(['pending_start', 'in_progress', 'pause_requested', 'paused', 'submitted', 'overdue'])
    return assignments.filter((a) => a.executorId === id && allowed.has(a.status))
  }, [assignments, auth.user?.id, auth.user?.role])

  const myActiveTaskIds = useMemo(() => new Set(myActiveAssignments.map((a) => a.taskId)), [myActiveAssignments])

  const myActiveTasks = useMemo(() => {
    if (!myActiveAssignments.length) return []
    const byId = new Map(allTasks.map((t) => [t.id, t]))

    const filtered = myActiveAssignments
      .map((a) => {
        const task = byId.get(a.taskId) ?? null
        return task ? { task, assignment: a } : null
      })
      .filter(Boolean) as Array<{ task: (typeof allTasks)[number]; assignment: (typeof myActiveAssignments)[number] }>

    const matchesText = (task: (typeof allTasks)[number]) => {
      if (tokens.length === 0) return true
      const hay = [
        task.title.en,
        task.title.ru,
        task.shortDescription.en,
        task.shortDescription.ru,
        task.requirements?.en ?? '',
        task.requirements?.ru ?? '',
        task.description.en,
        task.description.ru,
        task.category ?? '',
        task.location ?? '',
      ]
        .join(' ')
        .toLowerCase()
      return tokens.every((tok) => hay.includes(tok))
    }

    const out = filtered
      .filter(({ task }) => matchesText(task))
      .filter(({ task }) => (filterCategory ? hasMetaValue(task.category, filterCategory) : true))
      .filter(({ task }) => (filterLocation ? hasMetaValue(task.location, filterLocation) : true))
      .slice()
      .sort((a, b) => {
        const weight = (s: string) =>
          s === 'pending_start'
            ? 0
            : s === 'in_progress'
              ? 1
              : s === 'pause_requested'
                ? 2
                : s === 'paused'
                  ? 3
                  : s === 'submitted'
                    ? 4
                    : s === 'overdue'
                      ? 5
                      : 9
        const wa = weight(a.assignment.status)
        const wb = weight(b.assignment.status)
        if (wa !== wb) return wa - wb

        const left = (x: (typeof myActiveAssignments)[number]) => {
          if (x.status === 'pending_start') return timeLeftMs(x.startDeadlineAt, nowMs)
          if (x.executionDeadlineAt) return timeLeftMs(x.executionDeadlineAt, nowMs)
          return Number.POSITIVE_INFINITY
        }
        return left(a.assignment) - left(b.assignment)
      })

    return out
  }, [allTasks, myActiveAssignments, tokens, filterCategory, filterLocation, nowMs])

  const isBanned = useMemo(() => {
    if (!isExecutor || !auth.user?.id) return false
    return executorRestrictionRepo.get(auth.user.id).accountStatus === 'banned'
  }, [auth.user?.id, isExecutor])

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const platformOptions = TASK_PLATFORM_OPTIONS
  const formatOptions = TASK_FORMAT_OPTIONS

  const sortOptions = useMemo<Array<{ value: TasksSortMode; label: string }>>(
    () => [
      { value: 'created', label: t('tasks.created') },
      { value: 'budget_asc', label: t('tasks.sort.cheapest') },
      { value: 'budget_desc', label: t('tasks.sort.expensive') },
    ],
    [t],
  )

  if (isCustomer) {
    return (
      <main className="tasksCustomerLanding">
        <div className="tasksCustomerLanding__card">
          <h1 className="tasksCustomerLanding__title">{t('tasks.customerLanding.title')}</h1>
          <p className="tasksCustomerLanding__subtitle">{t('tasks.customerLanding.subtitle')}</p>
          <div className="tasksCustomerLanding__actions">
            <Link className="tasksCreateBtn" to={paths.taskCreate}>
              {t('tasks.customerLanding.create')} <span aria-hidden="true">→</span>
            </Link>
            <Link className="tasksCustomerLanding__secondary" to={paths.customerTasks}>
              {t('tasks.customerLanding.manage')}
            </Link>
          </div>
        </div>
      </main>
    )
  }

  if (isBanned) {
    return (
      <main>
        <div className="tasksHeader">
          <div>
            <h1 className="tasksTitle">{t('tasks.banned.title')}</h1>
            <p className="tasksSubtitle">{t('tasks.banned.text')}</p>
          </div>
        </div>
      </main>
    )
  }

  const tasks = useMemo(() => {
    const filtered = allTasks.filter((task) => {
      // AI tasks are not shown in the executor marketplace (for now).
      if (task.executorMode === 'ai') return false
      const assignedCount = task.assignedExecutorIds?.length ?? 0
      const maxExecutors = task.maxExecutors ?? 1
      const hasSlot = assignedCount < maxExecutors
      // If the task still has free slots, keep it visible to executors even if
      // one of the contracts is already submitted/reviewed.
      const statusAllowed =
        task.status === 'open' ||
        task.status === 'in_progress' ||
        ((task.status === 'review' || task.status === 'dispute') && hasSlot)
      // Drafts are not visible to executors; only published tasks appear here.
      return statusAllowed && hasSlot
    })
      .filter((task) => !appliedTaskIds.has(task.id))
      // If the executor was removed automatically for missing the start window,
      // hide this task from their list.
      .filter((task) => !removedAutoTaskIds.has(task.id))
      // If the task is already assigned to this executor, show it in "My active tasks" instead.
      .filter((task) => !myActiveTaskIds.has(task.id))
    return filtered
      .filter((task) => {
        if (tokens.length && !tokens.every((tok) => {
          const hay = [
            task.title.en,
            task.title.ru,
            task.shortDescription.en,
            task.shortDescription.ru,
            task.requirements?.en ?? '',
            task.requirements?.ru ?? '',
            task.description.en,
            task.description.ru,
            task.category ?? '',
            task.location ?? '',
          ]
            .join(' ')
            .toLowerCase()
          return hay.includes(tok)
        })) {
          return false
        }
        if (filterCategory && !hasMetaValue(task.category, filterCategory)) return false
        if (filterLocation && !hasMetaValue(task.location, filterLocation)) return false
        return true
      })
      .slice()
      .sort((a, b) => {
        const budgetValue = (x: (typeof allTasks)[number]) => {
          const v = typeof x.budgetAmount === 'number' ? x.budgetAmount : null
          if (v === null) return null
          if (!Number.isFinite(v)) return null
          return v
        }

        if (sortMode === 'created') {
          if (a.createdAt !== b.createdAt) return b.createdAt.localeCompare(a.createdAt)
        } else if (sortMode === 'budget_asc') {
          const ba = budgetValue(a)
          const bb = budgetValue(b)
          if (ba === null && bb !== null) return 1
          if (ba !== null && bb === null) return -1
          if (ba !== null && bb !== null && ba !== bb) return ba - bb
        } else if (sortMode === 'budget_desc') {
          const ba = budgetValue(a)
          const bb = budgetValue(b)
          if (ba === null && bb !== null) return 1
          if (ba !== null && bb === null) return -1
          if (ba !== null && bb !== null && ba !== bb) return bb - ba
        }
        return b.createdAt.localeCompare(a.createdAt)
      })
  }, [allTasks, nowMs, tokens, filterCategory, filterLocation, sortMode, appliedTaskIds, removedAutoTaskIds, myActiveTaskIds])

  const myActivePageCount = useMemo(() => Math.max(1, Math.ceil(myActiveTasks.length / PAGE_SIZE)), [myActiveTasks.length])
  const pagedMyActiveTasks = useMemo(() => {
    const start = (myActivePage - 1) * PAGE_SIZE
    return myActiveTasks.slice(start, start + PAGE_SIZE)
  }, [myActiveTasks, myActivePage])

  const marketPageCount = useMemo(() => Math.max(1, Math.ceil(tasks.length / PAGE_SIZE)), [tasks.length])
  const pagedTasks = useMemo(() => {
    const start = (marketPage - 1) * PAGE_SIZE
    return tasks.slice(start, start + PAGE_SIZE)
  }, [tasks, marketPage])

  useEffect(() => {
    setMyActivePage(1)
    setMarketPage(1)
  }, [q, filterCategory, filterLocation, sortMode])

  useEffect(() => setMyActivePage((p) => Math.min(Math.max(1, p), myActivePageCount)), [myActivePageCount])
  useEffect(() => setMarketPage((p) => Math.min(Math.max(1, p), marketPageCount)), [marketPageCount])

  useEffect(() => {
    if (prevMyActivePageRef.current === null) {
      prevMyActivePageRef.current = myActivePage
      return
    }
    if (prevMyActivePageRef.current === myActivePage) return
    prevMyActivePageRef.current = myActivePage
    window.requestAnimationFrame(() => {
      myActiveListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [myActivePage])

  useEffect(() => {
    if (prevMarketPageRef.current === null) {
      prevMarketPageRef.current = marketPage
      return
    }
    if (prevMarketPageRef.current === marketPage) return
    prevMarketPageRef.current = marketPage
    window.requestAnimationFrame(() => {
      marketListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [marketPage])

  useEffect(() => {
    if (!filtersOpen) return
    const onDown = (e: PointerEvent) => {
      const overlay = overlayRef.current
      const button = filtersButtonRef.current
      const target = e.target
      if (
        overlay &&
        target instanceof Node &&
        !overlay.contains(target) &&
        !(button && button.contains(target))
      ) {
        setFiltersOpen(false)
      }
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [filtersOpen])

  useEffect(() => {
    const archivedIds = archiveStaleTasks()
    if (!archivedIds.length) return
    for (const id of archivedIds) {
      const archived = taskRepo.getById(id)
      if (!archived?.createdByUserId) continue
      applicationRepo.deleteForTask(id)
      notificationRepo.addTaskUnclaimed({
        recipientUserId: archived.createdByUserId,
        actorUserId: archived.createdByUserId,
        taskId: id,
      })
    }
  }, [applications])

  useEffect(() => {
    // Best-effort: translate legacy tasks (EN==RU) in the background.
    // Limit to a few items to avoid spamming public endpoints.
    const top = tasks.slice(0, 3)
    void (async () => {
      for (const task of top) {
        await autoTranslateIfNeeded(task.id, {
          title: task.title,
          shortDescription: task.shortDescription,
        })
      }
    })()
  }, [tasks, locale])

  const highlightText = (value: string) => {
    if (tokens.length === 0) return { __html: value }
    const escaped = tokens.map((tok) => tok.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')).filter(Boolean)
    if (!escaped.length) return { __html: value }
    const regex = new RegExp(`(${escaped.join('|')})`, 'gi')
    return { __html: value.replace(regex, '<mark>$1</mark>') }
  }

  const myStatusPill = (status: string) => {
    if (status === 'pending_start') return { tone: 'pending' as const, label: t('executor.status.pendingStart') }
    if (status === 'pause_requested') return { tone: 'paused' as const, label: t('executor.status.pauseRequested') }
    if (status === 'paused') return { tone: 'paused' as const, label: t('executor.status.paused') }
    if (status === 'submitted') return { tone: 'review' as const, label: t('task.status.review') }
    if (status === 'overdue') return { tone: 'overdue' as const, label: t('executor.status.overdue') }
    return { tone: 'in_progress' as const, label: t('task.status.inProgress') }
  }

  return (
    <main>
      <div className="tasksHeader">
        <div>
          <h1 className="tasksTitle">{t('tasks.title')}</h1>
          <p className="tasksSubtitle">{t('tasks.subtitle')}</p>
        </div>
        {auth.user?.role === 'customer' ? (
          <Link className="tasksCreateBtn" to={paths.taskCreate}>
            {t('nav.postTask')} <span aria-hidden="true">→</span>
          </Link>
        ) : null}
      </div>

      <section className="tasksControls">
        <div className="tasksSearchWrap">
          <div className="tasksSearchRow">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('tasks.search.placeholder')}
              className="tasksSearch"
            />
            <button
              type="button"
              className={`tasksFiltersButton${filtersOpen ? ' tasksFiltersButton--open' : ''}`}
              ref={filtersButtonRef}
              onClick={() => setFiltersOpen((v) => !v)}
              aria-label="Open filters"
            >
              <span className="tasksFiltersButton__label">{t('customerTasks.filterTasks')}</span>
              <span className="tasksFiltersButton__chevron" aria-hidden="true">
                ▾
              </span>
            </button>
          </div>

          {filtersOpen ? (
            <div className="tasksInlineFilters" ref={overlayRef}>
              <div className="tasksFilters">
                <div className="tasksFilterGroup">
                  <span className="tasksFilterLabel">{t('task.create.category')}</span>
                  <div className="tasksFilterChips">
                    <button
                      type="button"
                      className={`tasksFilterChip${filterCategory === null ? ' tasksFilterChip--active' : ''}`}
                      onClick={() => {
                        setFilterCategory(null)
                      }}
                    >
                      {t('tasks.filters.anyCategory')}
                    </button>
                    {platformOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`tasksFilterChip${filterCategory === opt.value ? ' tasksFilterChip--active' : ''}`}
                        onClick={() => {
                          setFilterCategory(opt.value)
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="tasksFilterGroup">
                  <span className="tasksFilterLabel">{t('task.create.location')}</span>
                  <div className="tasksFilterChips">
                    <button
                      type="button"
                      className={`tasksFilterChip${filterLocation === null ? ' tasksFilterChip--active' : ''}`}
                      onClick={() => {
                        setFilterLocation(null)
                      }}
                    >
                      {t('tasks.filters.anyFormat')}
                    </button>
                    {formatOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`tasksFilterChip${filterLocation === opt.value ? ' tasksFilterChip--active' : ''}`}
                        onClick={() => {
                          setFilterLocation(opt.value)
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="tasksSort">
                  <CustomSelect<TasksSortMode>
                    label={t('tasks.sortLabel')}
                    value={sortMode}
                    options={sortOptions}
                    onChange={(value) => setSortMode(value)}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>

      </section>

      {myActiveTasks.length > 0 ? (
        <section className="tasksMyActive">
          <h2 className="tasksMyActive__title">
            {t('tasks.myActive.title')} <span className="tasksSectionCount">({myActiveTasks.length})</span>
          </h2>
          <div className="taskGrid" ref={myActiveListRef}>
            {pagedMyActiveTasks.map(({ task, assignment }) => {
              const pill = myStatusPill(assignment.status)
              return (
                <article
                  key={task.id}
                  className="taskCard taskCard--clickable"
                  role="link"
                  tabIndex={0}
                  onClick={() => navigate(taskDetailsPath(task.id))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      navigate(taskDetailsPath(task.id))
                    }
                  }}
                >
                  <div className="taskCard__accent" />
                  <div className="taskCard__content">
                    <div className="taskCard__left">
                      <div className="taskCard__header">
                        <h2 className="taskCard__title">
                          <Link className="taskLink" to={taskDetailsPath(task.id)}>
                            {pickText(task.title, locale)}
                          </Link>
                        </h2>
                      </div>

                      <p
                        className="taskCard__desc"
                        dangerouslySetInnerHTML={highlightText(pickText(task.shortDescription, locale))}
                      />

                      <div className="taskCard__badges">
                        <StatusPill tone={pill.tone} label={pill.label} />
                        {task.dueDate ? (
                          <span className="chip">
                            {t('tasks.due')}: {task.dueDate}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="taskCard__right">
                      {(() => {
                        const payout = formatBudget(task.budgetAmount, task.budgetCurrency)
                        const published = timeAgo(task.createdAt, locale, nowMs)
                        const platform = metaLine(task.category)
                        const format = metaLine(task.location)
                        const isSinglePlatform = !platform || !platform.includes(',')
                        const isSingleFormat = !format || !format.includes(',')
                        const compactPayout = Boolean(payout) && isSinglePlatform && isSingleFormat
                        return (
                    <div className={`taskCard__topRow${compactPayout ? ' taskCard__topRow--compactPayout' : ''}`}>
                    <div className="taskCard__metaInline">
                      <span className="metaChip metaChip--published" title={`${t('tasks.published')}: ${published}`} aria-label={`${t('tasks.published')}: ${published}`}>
                        <span className="metaChip__icon" aria-hidden="true">🗓</span>
                        <span className="metaChip__value">{published}</span>
                      </span>
                      <span className="taskCard__metaRest" aria-hidden={false}>
                        {platform ? (
                          <span
                            className="metaChip metaChip--truncate"
                            title={`${t('task.create.category')}: ${platform}`}
                          >
                            <span className="metaChip__icon" aria-hidden="true">📱</span>
                            <span className="metaChip__value">{platform}</span>
                          </span>
                        ) : null}
                        {format ? (
                          <span
                            className="metaChip metaChip--truncate"
                            title={`${t('task.create.location')}: ${format}`}
                          >
                            <span className="metaChip__icon" aria-hidden="true">🎞️</span>
                            <span className="metaChip__value">{format}</span>
                          </span>
                        ) : null}
                      </span>
                    </div>
                            {payout ? (
                              <div className="taskCard__payout" aria-label={`${t('tasks.payout')}: ${payout}`}>
                                <span className="payoutPill">
                                  <span className="payoutPill__label">{t('tasks.payout')}</span>
                                  <span className="payoutPill__amount">{payout}</span>
                                </span>
                              </div>
                            ) : null}
                          </div>
                        )
                      })()}

                      <div className="taskCard__footer">
                        <Link
                          className="taskCard__actionBtn"
                          to={taskDetailsPath(task.id)}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="taskCard__actionText">{t('tasks.viewDetails')}</span>
                          <span className="taskCard__actionArrow" aria-hidden="true">
                            →
                          </span>
                        </Link>
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
          <Pagination page={myActivePage} pageCount={myActivePageCount} onChange={setMyActivePage} />
        </section>
      ) : null}

      <section className="tasksMarket">
        <h2 className="tasksMarket__title">{t('tasks.market.title')}</h2>
        {tasks.length === 0 ? (
          <div className="emptyState">
            {tokens.length ? (
              t('tasks.search.empty')
            ) : (
              <>
                {t('tasks.empty')}{' '}
                {auth.user?.role === 'customer' ? (
                  <>
                    <Link to={paths.taskCreate}>{t('tasks.postFirst')}</Link>.
                  </>
                ) : null}
              </>
            )}
          </div>
        ) : (
          <div className="taskGrid" ref={marketListRef}>
            {pagedTasks.map((task) => {
              return (
                <article
                  key={task.id}
                  className="taskCard taskCard--clickable"
                  role="link"
                  tabIndex={0}
                  onClick={() => navigate(taskDetailsPath(task.id))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      navigate(taskDetailsPath(task.id))
                    }
                  }}
                >
                  <div className="taskCard__accent" />
                  <div className="taskCard__content">
                    <div className="taskCard__left">
                      <div className="taskCard__header">
                        <h2 className="taskCard__title">
                          <Link className="taskLink" to={taskDetailsPath(task.id)}>
                            {pickText(task.title, locale)}
                          </Link>
                        </h2>
                      </div>

                      <p
                        className="taskCard__desc"
                        dangerouslySetInnerHTML={highlightText(pickText(task.shortDescription, locale))}
                      />

                      <div className="taskCard__badges">
                        <StatusPill tone={task.status} label={statusLabel(task.status, t)} />
                        {task.dueDate ? (
                          <span className="chip">
                            {t('tasks.due')}: {task.dueDate}
                          </span>
                        ) : null}
                        <span className="chip">
                          {t('task.meta.assigned')}: {task.assignedExecutorIds.length}/{task.maxExecutors ?? 1}
                        </span>
                      </div>
                    </div>

                    <div className="taskCard__right">
                      {(() => {
                        const payout = formatBudget(task.budgetAmount, task.budgetCurrency)
                        const published = timeAgo(task.createdAt, locale, nowMs)
                        const platform = metaLine(task.category)
                        const format = metaLine(task.location)
                        const isSinglePlatform = !platform || !platform.includes(',')
                        const isSingleFormat = !format || !format.includes(',')
                        const compactPayout = Boolean(payout) && isSinglePlatform && isSingleFormat
                        return (
                    <div className={`taskCard__topRow${compactPayout ? ' taskCard__topRow--compactPayout' : ''}`}>
                    <div className="taskCard__metaInline">
                      <span className="metaChip metaChip--published" title={`${t('tasks.published')}: ${published}`} aria-label={`${t('tasks.published')}: ${published}`}>
                        <span className="metaChip__icon" aria-hidden="true">🗓</span>
                        <span className="metaChip__value">{published}</span>
                      </span>
                      <span className="taskCard__metaRest" aria-hidden={false}>
                        {platform ? (
                          <span
                            className="metaChip metaChip--truncate"
                            title={`${t('task.create.category')}: ${platform}`}
                          >
                            <span className="metaChip__icon" aria-hidden="true">📱</span>
                            <span className="metaChip__value">{platform}</span>
                          </span>
                        ) : null}
                        {format ? (
                          <span
                            className="metaChip metaChip--truncate"
                            title={`${t('task.create.location')}: ${format}`}
                          >
                            <span className="metaChip__icon" aria-hidden="true">🎞️</span>
                            <span className="metaChip__value">{format}</span>
                          </span>
                        ) : null}
                      </span>
                    </div>
                            {payout ? (
                              <div className="taskCard__payout" aria-label={`${t('tasks.payout')}: ${payout}`}>
                                <span className="payoutPill">
                                  <span className="payoutPill__label">{t('tasks.payout')}</span>
                                  <span className="payoutPill__amount">{payout}</span>
                                </span>
                              </div>
                            ) : null}
                          </div>
                        )
                      })()}

                      <div className="taskCard__footer">
                        <Link
                          className="taskCard__actionBtn"
                          to={taskDetailsPath(task.id)}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="taskCard__actionText">{t('tasks.viewDetails')}</span>
                          <span className="taskCard__actionArrow" aria-hidden="true">→</span>
                        </Link>
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
        <Pagination page={marketPage} pageCount={marketPageCount} onChange={setMarketPage} />
      </section>
    </main>
  )
}

