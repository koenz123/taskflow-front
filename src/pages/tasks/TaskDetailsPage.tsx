import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { disputeThreadPath, paths, taskDetailsPath, userProfilePath } from '@/app/router/paths'
import { applicationRepo } from '@/entities/task/lib/applicationRepo'
import {
  fetchApplicationsForTask,
  refreshApplications,
  rejectApplicationApi,
  selectApplicationApi,
  upsertApplication,
  useApplications,
} from '@/entities/task/lib/useApplications'
import { taskRepo } from '@/entities/task/lib/taskRepo'
import { refreshTasks, useTasks, useTasksMeta } from '@/entities/task/lib/useTasks'
import { pickText } from '@/entities/task/lib/taskText'
import { autoTranslateIfNeeded } from '@/entities/task/lib/autoTranslateTask'
import { useI18n } from '@/shared/i18n/I18nContext'
import type { TranslationKey } from '@/shared/i18n/translations'
import './task-details.css'
import { useAuth } from '@/shared/auth/AuthContext'
import { notificationRepo } from '@/entities/notification/lib/notificationRepo'
import { formatTimeLeft, timeLeftMs } from '@/entities/task/lib/taskDeadline'
import { timeAgo } from '@/shared/lib/timeAgo'
import { fetchUsersByIds, useUsers } from '@/entities/user/lib/useUsers'
import { balanceFreezeRepo } from '@/entities/user/lib/balanceFreezeRepo'
import { balanceRepo } from '@/entities/user/lib/balanceRepo'
import { refreshContracts, useContracts } from '@/entities/contract/lib/useContracts'
import { contractRepo } from '@/entities/contract/lib/contractRepo'
import { submissionRepo } from '@/entities/submission/lib/submissionRepo'
import { createSubmissionApi, refreshSubmissions, useSubmissions } from '@/entities/submission/lib/useSubmissions'
import { refreshAssignments, useTaskAssignments } from '@/entities/taskAssignment/lib/useTaskAssignments'
import { refreshNotifications } from '@/entities/notification/lib/useNotifications'
import { taskAssignmentRepo } from '@/entities/taskAssignment/lib/taskAssignmentRepo'
import { executorRestrictionRepo } from '@/entities/executorSanction/lib/executorRestrictionRepo'
import { checkAndApplyForceMajeureSanctions } from '@/entities/executorSanction/lib/forceMajeureSanctions'
import { noStartViolationCountLast90d } from '@/entities/executorSanction/lib/noStartSanctions'
import { disputeRepo } from '@/entities/dispute/lib/disputeRepo'
import { refreshDisputes, useDisputes } from '@/entities/dispute/lib/useDisputes'
import { systemEventRepo } from '@/entities/systemEvent/lib/systemEventRepo'
import { PauseRequestModal } from '@/features/pause/PauseRequestModal'
import { RatingModal } from '@/features/rating/RatingModal'
import { createRatingApi, refreshRatings } from '@/entities/rating/lib/useRatings'
import { ratingRepo } from '@/entities/rating/lib/ratingRepo'
import { StatusPill, type StatusTone } from '@/shared/ui/status-pill/StatusPill'
import { NoStartAssignModal } from '@/features/sanctions/NoStartAssignModal'
import { RevisionRequestModal } from '@/features/revision/RevisionRequestModal'
import { useToast } from '@/shared/ui/toast/ToastProvider'
import { getBlob, putBlob } from '@/shared/lib/blobStore'
import { HelpTip } from '@/shared/ui/help-tip/HelpTip'
import type { Task } from '@/entities/task/model/task'
import { createId } from '@/shared/lib/id'
import { notifyToTelegramAndUi } from '@/shared/notify/notify'
import { ApiError, api } from '@/shared/api/api'
import { SplashScreen } from '@/shared/ui/SplashScreen'
import { uploadFileToServer } from '@/shared/api/uploads'
import type { SubmissionFile } from '@/entities/submission/model/submission'
import type { Submission } from '@/entities/submission/model/submission'
import { userIdMatches } from '@/shared/auth/userIdAliases'
import { assignedExecutorsIconName, Icon } from '@/shared/ui/icon/Icon'
import { taskEscrowAmountInRub } from '@/shared/lib/usdRubRate'

const USE_API = import.meta.env.VITE_DATA_SOURCE === 'api'
const MAX_UPLOAD_VIDEO_MB = 60

function formatBudget(amount?: number, currency?: string) {
  if (!amount) return null
  return `${amount} ${currency ?? ''}`.trim()
}

function statusLabel(status: string, t: (key: TranslationKey) => string) {
  if (status === 'draft') return t('task.status.draft')
  if (status === 'open') return t('task.status.open')
  if (status === 'waiting') return t('task.status.waiting')
  if (status === 'in_progress') return t('task.status.inProgress')
  if (status === 'review') return t('task.status.review')
  if (status === 'dispute') return t('task.status.dispute')
  if (status === 'closed') return t('task.status.closed')
  if (status === 'archived') return t('task.status.archived')
  return status.replace('_', ' ')
}

type CompletionLinkInput = {
  platform: string
  url: string
}

function requestedCompletionTargets(task: Task | null): string[] {
  if (!task) return []
  const fromDeliverables = Array.isArray(task.deliverables) ? task.deliverables : null
  if (fromDeliverables && fromDeliverables.length) {
    const out: string[] = []
    for (const d of fromDeliverables) {
      const p = (d?.platform ?? '').trim()
      const qRaw = typeof d?.quantity === 'number' && Number.isFinite(d.quantity) ? Math.floor(d.quantity) : 1
      const q = Math.max(1, Math.min(50, qRaw))
      if (!p) continue
      for (let i = 1; i <= q; i++) {
        out.push(q > 1 ? `${p} #${i}` : p)
      }
    }
    return out.length ? out : splitPlatforms(task.category)
  }
  return splitPlatforms(task.category)
}

function splitPlatforms(value: string | undefined | null): string[] {
  const raw = (value ?? '').trim()
  if (!raw) return []
  const byComma = raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

  // If legacy text uses "A / B / C" instead of commas.
  const base =
    byComma.length > 1
      ? byComma
      : raw.includes(' / ')
        ? raw
            .split(' / ')
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

function downloadTextFile(name: string, text: string) {
  const safeName = (name || 'description.txt').trim() || 'description.txt'
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = safeName
  a.rel = 'noreferrer'
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
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

function initCompletionLinks(params: {
  platforms: string[]
  existingLinks?: Array<{ platform: string; url: string }>
  fallbackUrl?: string
}): CompletionLinkInput[] {
  const targets = params.platforms.length ? params.platforms : ['']
  const map = new Map<string, string>()
  for (const item of params.existingLinks ?? []) {
    if (!item?.platform || !item?.url) continue
    map.set(item.platform.toLowerCase(), item.url)
  }
  const fallback = params.fallbackUrl?.trim() || ''
  return targets.map((platform, idx) => {
    const key = platform.trim().toLowerCase()
    const fromMap = key ? map.get(key) : undefined
    // If only legacy single URL exists, prefill the first platform.
    const url = fromMap ?? (!map.size && idx === 0 ? fallback : platform ? '' : fallback)
    return { platform, url }
  })
}

export function TaskDetailsPage() {
  const { t, locale } = useI18n()
  const auth = useAuth()
  const toast = useToast()
  const user = auth.user!
  const telegramUserId = user.telegramUserId ?? null
  const userEmail = user.email ?? null
  const toastUi = (msg: string, tone?: 'success' | 'info' | 'error') => toast.showToast({ message: msg, tone })
  const navigate = useNavigate()
  const location = useLocation()
  const fromCreateDraft = Boolean((location.state as any)?.fromCreateDraft)
  const backTo =
    (location.state as { backTo?: string } | null | undefined)?.backTo &&
    typeof (location.state as any).backTo === 'string'
      ? ((location.state as any).backTo as string)
      : null
  const fromExecutorCompleted = Boolean(backTo && backTo.includes('tab=executor_completed'))
  const { taskId } = useParams()
  const users = useUsers()
  const tasks = useTasks()
  const tasksMeta = useTasksMeta()
  const task = taskId ? tasks.find((x) => x.id === taskId) ?? null : null
  const authorId = task?.createdByUserId ?? null

  useEffect(() => {
    if (!USE_API) return
    if (!authorId) return
    if (users.some((u) => u.id === authorId)) return
    void fetchUsersByIds([authorId]).catch(() => {})
  }, [authorId, users])
  const [referenceVideoUrl, setReferenceVideoUrl] = useState<string | null>(null)
  const [referencePreviewOpen, setReferencePreviewOpen] = useState(false)
  const [referencePreviewTarget, setReferencePreviewTarget] = useState<null | { blobId: string; name: string }>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [applicationMessage, setApplicationMessage] = useState('')
  const [applying, setApplying] = useState(false)
  const applications = useApplications()
  const contracts = useContracts()
  const submissions = useSubmissions()
  const disputes = useDisputes()
  const assignments = useTaskAssignments()
  const currentUser = user
  const executorIdCandidates = useMemo(() => {
    if (!currentUser || currentUser.role !== 'executor') return [] as string[]
    const out: string[] = []
    const add = (v: unknown) => {
      const s = typeof v === 'string' || typeof v === 'number' ? String(v).trim() : ''
      if (!s) return
      if (out.includes(s)) return
      out.push(s)
    }
    add(currentUser.id)
    // Some backends persist executorId as telegram id for TG users.
    add(currentUser.telegramUserId)
    if (currentUser.telegramUserId) add(`tg_${currentUser.telegramUserId}`)
    return out
  }, [currentUser])
  const executorIdSet = useMemo(() => new Set(executorIdCandidates), [executorIdCandidates])
  const requiresCompletionLinks = (task?.executorMode ?? 'blogger_ad') !== 'customer_post'
  const requiresUploadVideo = (task?.executorMode ?? null) === 'customer_post'
  const platforms = useMemo(() => (requiresCompletionLinks ? requestedCompletionTargets(task) : []), [requiresCompletionLinks, task])
  const uploadTargets = useMemo(() => {
    if (!requiresUploadVideo) return [] as string[]
    const targets = requestedCompletionTargets(task)
    return targets.length ? targets : ['']
  }, [requiresUploadVideo, task])
  const referenceVideos = useMemo(() => {
    const ref = task?.reference
    if (!ref) return []
    if (ref.kind === 'video')
      return [{ blobId: ref.blobId, url: ref.url, name: ref.name, mimeType: ref.mimeType }]
    if (ref.kind === 'videos')
      return (ref.videos ?? []).map((v) => ({ blobId: v.blobId, url: v.url, name: v.name, mimeType: v.mimeType }))
    if (ref.kind === 'items')
      return ref.items
        .filter((i): i is typeof i & { kind: 'video' } => i.kind === 'video')
        .map((v) => ({ blobId: v.blobId, url: v.url, name: v.name, mimeType: v.mimeType }))
    return []
  }, [task?.reference])

  const referenceUrls = useMemo(() => {
    const ref = task?.reference
    if (!ref) return [] as string[]
    if (ref.kind === 'url') return [ref.url]
    if (ref.kind === 'items')
      return ref.items.filter((i): i is typeof i & { kind: 'url' } => i.kind === 'url').map((i) => i.url)
    return []
  }, [task?.reference])
  const referenceBlobId = referencePreviewTarget?.blobId ?? null
  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    setReferenceVideoUrl(null)

    const target = referencePreviewTarget
    if (!target) return

    void (async () => {
      const blob = await getBlob(target.blobId)
      if (cancelled) return
      if (!blob) return
      objectUrl = URL.createObjectURL(blob)
      setReferenceVideoUrl(objectUrl)
    })()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [referenceBlobId])

  useEffect(() => {
    if (!referencePreviewOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setReferencePreviewOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [referencePreviewOpen])

  useEffect(() => {
    // If reference changes/disappears, ensure preview is closed.
    if (!referenceVideos.length) setReferencePreviewOpen(false)
  }, [referenceVideos.length])
  const [completionLinks, setCompletionLinks] = useState<CompletionLinkInput[]>(() =>
    requiresCompletionLinks
      ? initCompletionLinks({
          platforms,
          existingLinks: task?.completionLinks,
          fallbackUrl: task?.completionVideoUrl,
        })
      : [],
  )
  const [completionError, setCompletionError] = useState<string | null>(null)
  type UploadVideoValue = { kind: 'idb'; blobId: string; name: string; mimeType: string } | { kind: 'url'; url: string; name: string; mimeType: string }
  const [uploadVideos, setUploadVideos] = useState<Record<string, UploadVideoValue | null>>({})
  const [uploadBusyByTarget, setUploadBusyByTarget] = useState<Record<string, boolean>>({})
  const uploadVideoInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    if (!requiresUploadVideo) return
    setUploadVideos((prev) => {
      const next: Record<string, UploadVideoValue | null> = {}
      for (const t of uploadTargets) next[t] = prev[t] ?? null
      return next
    })
    setUploadBusyByTarget((prev) => {
      const next: Record<string, boolean> = {}
      for (const t of uploadTargets) next[t] = Boolean(prev[t])
      return next
    })
  }, [requiresUploadVideo, uploadTargets])
  async function postWithFallback<T = any>(paths: string[], body: unknown) {
    let lastErr: unknown = null
    for (const p of paths) {
      try {
        return await api.post<T>(p, body)
      } catch (e) {
        lastErr = e
        if (e instanceof ApiError && e.status === 404) continue
        throw e
      }
    }
    throw lastErr ?? new Error('request_failed')
  }

  async function patchWithFallback<T = any>(paths: string[], body: unknown) {
    let lastErr: unknown = null
    for (const p of paths) {
      try {
        return await api.patch<T>(p, body)
      } catch (e) {
        lastErr = e
        if (e instanceof ApiError && e.status === 404) continue
        throw e
      }
    }
    throw lastErr ?? new Error('request_failed')
  }

  async function requestPauseApi(input: { assignmentId: string; reasonId: string; durationHours: number; comment?: string }) {
    const id = encodeURIComponent(input.assignmentId)
    const body = {
      reasonId: input.reasonId,
      durationHours: input.durationHours,
      durationMs: Math.round(input.durationHours * 60 * 60 * 1000),
      message: input.comment || undefined,
      comment: input.comment || undefined,
    }
    await postWithFallback(
      [
        `/assignments/${id}/request-pause`,
        `/assignments/${id}/pause/request`,
        `/assignments/${id}/request_pause`,
      ],
      body,
    )
  }

  async function acceptPauseApi(assignmentId: string) {
    const id = encodeURIComponent(assignmentId)
    await postWithFallback([`/assignments/${id}/accept-pause`, `/assignments/${id}/pause/accept`, `/assignments/${id}/accept_pause`], {})
  }

  async function endPauseEarlyApi(assignmentId: string) {
    const id = encodeURIComponent(assignmentId)
    // Prefer the real backend endpoint first (PATCH).
    // Keep older naming variants as fallbacks for mixed deployments.
    const paths = [
      `/assignments/${id}/resume_pause`,
      `/assignments/${id}/resume-pause`,
      `/assignments/${id}/pause/resume`,
      `/assignments/${id}/resume`,
      `/assignments/${id}/unpause`,
      `/assignments/${id}/pause/unpause`,
      // Common naming variants (backend may differ)
      `/assignments/${id}/pause/end-early`,
      `/assignments/${id}/pause/end`,
      `/assignments/${id}/pause/end_early`,
      `/assignments/${id}/end-pause-early`,
      `/assignments/${id}/end_pause_early`,
      `/assignments/${id}/pause/stop`,
      `/assignments/${id}/pause/cancel`,
    ]

    try {
      await patchWithFallback(paths, {})
      return
    } catch (e) {
      // Some older backends implemented this action as POST.
      if (e instanceof ApiError && e.status === 404) {
        await postWithFallback(paths, {})
        return
      }
      throw e
    }
  }

  async function switchExecutorApi(assignmentId: string) {
    const id = encodeURIComponent(assignmentId)
    await postWithFallback(
      [
        `/assignments/${id}/remove`,
        `/assignments/${id}/assignment-remove`,
        `/assignments/${id}/unassign`,
        `/assignments/${id}/cancel`,
        `/assignments/${id}/cancel-by-customer`,
      ],
      {},
    )
  }
  const [submissionMessage, setSubmissionMessage] = useState('')
  const [submissionsByContractId, setSubmissionsByContractId] = useState<Record<string, Submission | null>>({})
  const submissionsByContractIdBusyRef = useRef<Set<string>>(new Set())
  const [copyrightWaiverAccepted, setCopyrightWaiverAccepted] = useState(false)
  const [copyrightWaiverTouched, setCopyrightWaiverTouched] = useState(false)
  const [copyrightHelpOpen, setCopyrightHelpOpen] = useState(false)
  const [pauseModalOpen, setPauseModalOpen] = useState(false)
  const [pauseDecisionBusyIds, setPauseDecisionBusyIds] = useState<Set<string>>(() => new Set())
  const pauseDecisionBusyRef = useRef<Set<string>>(new Set())
  const [pauseDecisionDoneIds, setPauseDecisionDoneIds] = useState<Set<string>>(() => new Set())
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false)
  const [submittedModalOpen, setSubmittedModalOpen] = useState(false)
  const [optimisticSubmittedForReview, setOptimisticSubmittedForReview] = useState(false)
  const [rateCustomerOpen, setRateCustomerOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [insufficientBalanceOpen, setInsufficientBalanceOpen] = useState(false)
  const [deleteAfterPath, setDeleteAfterPath] = useState<string | null>(null)
  const [noStartPrompt, setNoStartPrompt] = useState<null | { applicationId: string; count: number }>(null)
  const [chooseOtherPrompt, setChooseOtherPrompt] = useState<null | { executorId: string }>(null)
  const [openDisputePrompt, setOpenDisputePrompt] = useState<null | { executorId: string }>(null)
  const [reviewRevisionModalContractId, setReviewRevisionModalContractId] = useState<string | null>(null)
  const [blockedModal, setBlockedModal] = useState<null | { title: string; message: string }>(null)
  const [submissionDetailsOpen, setSubmissionDetailsOpen] = useState<null | { contractId: string; executorUserId: string }>(null)
  const taskApplications = useMemo(
    () => (task ? applications.filter((app) => app.taskId === task.id) : []),
    [applications, task],
  )
  const assignmentsForTask = useMemo(() => (task ? assignments.filter((a) => a.taskId === task.id) : []), [assignments, task])
  const pauseKindForTask = useMemo(() => {
    // paused > pause_requested
    let kind: null | 'paused' | 'pause_requested' = null
    for (const a of assignmentsForTask) {
      if (a.status === 'paused') return 'paused'
      if (a.status === 'pause_requested') kind = 'pause_requested'
    }
    return kind
  }, [assignmentsForTask])
  const pauseRequestsForTask = useMemo(
    () => assignmentsForTask.filter((a) => a.status === 'pause_requested' && !pauseDecisionDoneIds.has(a.id)),
    [assignmentsForTask, pauseDecisionDoneIds],
  )
  const isPauseDecisionBusy = (assignmentId: string) =>
    pauseDecisionBusyRef.current.has(assignmentId) || pauseDecisionBusyIds.has(assignmentId)
  const isPauseDecisionDone = (assignmentId: string) => pauseDecisionDoneIds.has(assignmentId)
  const markPauseDecisionBusy = (assignmentId: string, busy: boolean) => {
    if (busy) pauseDecisionBusyRef.current.add(assignmentId)
    else pauseDecisionBusyRef.current.delete(assignmentId)
    setPauseDecisionBusyIds((prev) => {
      const next = new Set(prev)
      if (busy) next.add(assignmentId)
      else next.delete(assignmentId)
      return next
    })
  }
  const markPauseDecisionDone = (assignmentId: string, done: boolean) => {
    setPauseDecisionDoneIds((prev) => {
      const next = new Set(prev)
      if (done) next.add(assignmentId)
      else next.delete(assignmentId)
      return next
    })
  }
  const userApplication = useMemo(
    () =>
      currentUser && task
        ? applications.find((app) => app.taskId === task.id && executorIdSet.has(String(app.executorUserId))) ?? null
        : null,
    [applications, currentUser, executorIdSet, task],
  )

  const requestDelete = (afterPath: string) => {
    setDeleteAfterPath(afterPath)
    setDeleteConfirmOpen(true)
  }

  // Reset completion form only when navigating to another task (taskId change), not on every task ref refresh from polling.
  const lastResetTaskIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!taskId || !task || task.id !== taskId) return
    if (lastResetTaskIdRef.current !== taskId) {
      lastResetTaskIdRef.current = null
    }
    if (lastResetTaskIdRef.current === taskId) return
    lastResetTaskIdRef.current = taskId
    setOptimisticSubmittedForReview(false)
    setCompletionLinks(
      requiresCompletionLinks
        ? initCompletionLinks({
            platforms: requestedCompletionTargets(task),
            existingLinks: task.completionLinks,
            fallbackUrl: task.completionVideoUrl,
          })
        : [],
    )
    setCompletionError(null)
    setUploadVideos({})
    setUploadBusyByTarget({})
    setCopyrightWaiverAccepted(false)
    setCopyrightWaiverTouched(false)
    setCopyrightHelpOpen(false)
    setSubmitConfirmOpen(false)
    // Best-effort: translate full content in details view.
    const userId = user.id
    void autoTranslateIfNeeded(taskId, {
      title: task.title,
      shortDescription: task.shortDescription,
      ...(task.requirements ? { requirements: task.requirements } : {}),
      description: task.description,
    }, userId)
  }, [requiresCompletionLinks, taskId, locale, task, user.id])

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!chooseOtherPrompt) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setChooseOtherPrompt(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [chooseOtherPrompt])

  useEffect(() => {
    if (!openDisputePrompt) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenDisputePrompt(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openDisputePrompt])

  useEffect(() => {
    if (!submitConfirmOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSubmitConfirmOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [submitConfirmOpen])

  const handleBack = () => {
    // Final publish step (draft): go back to create form with the draft preserved.
    if (
      fromCreateDraft &&
      task?.status === 'draft' &&
      user.role === 'customer' &&
      user.id === task.createdByUserId
    ) {
      navigate(paths.taskCreate, { state: { draft: task } })
      return
    }
    const backTo =
      (location.state as { backTo?: string } | null | undefined)?.backTo &&
      typeof (location.state as any).backTo === 'string'
        ? ((location.state as any).backTo as string)
        : null
    if (backTo) {
      navigate(backTo)
      return
    }
    const fromProfileBack = Boolean((location.state as { fromProfileBack?: boolean } | null | undefined)?.fromProfileBack)
    if (fromProfileBack) {
      navigate(paths.tasks)
      return
    }
    navigate(-1)
  }

  if (!task) {
    if (USE_API && auth.status === 'authenticated' && !tasksMeta.loaded) {
      return <SplashScreen />
    }
    return (
      <main className="taskDetails">
        <div className="taskDetailsContainer">
          <div className="taskDetailsContentWrap">
            <button
              type="button"
              className="taskDetailsBack taskDetailsBack--outside"
              onClick={handleBack}
              aria-label={t('task.details.backToTasks')}
            >
              <span className="taskDetailsBack__icon">←</span>
              <span className="taskDetailsBack__text">{t('task.details.back')}</span>
            </button>

            <div className="taskDetailsContent">
              <div className="taskDetailsHeader">
                <h1 className="taskDetailsTitle">{t('task.details.notFound')}</h1>
              </div>
            </div>
          </div>
        </div>
      </main>
    )
  }

  const id = taskId as string
  const activeForceMajeure = systemEventRepo.activeForceMajeureForTask(id, nowMs)

  const isExpired = timeLeftMs(task.expiresAt, nowMs) === 0
  const assignedCount = task.assignedExecutorIds.length
  const maxExecutors = task.maxExecutors ?? 1
  const slotsAvailable = assignedCount < maxExecutors
  const isExecutorAssigned =
    currentUser?.role === 'executor' && task.assignedExecutorIds.some((x) => executorIdSet.has(String(x)))
  const hasAnyApplication = Boolean(userApplication)
  const linkProvided = completionLinks.every((x) => x.url.trim().length > 0)
  const myContract = useMemo(() => {
    if (!task || !currentUser || currentUser.role !== 'executor') return null
    return contracts.find((c) => c.taskId === task.id && executorIdSet.has(String(c.executorId))) ?? null
  }, [contracts, currentUser, executorIdSet, task])
  const myAssignment = useMemo(() => {
    if (!task || !currentUser || currentUser.role !== 'executor') return null
    return assignments.find((a) => a.taskId === task.id && executorIdSet.has(String(a.executorId))) ?? null
  }, [assignments, currentUser, executorIdSet, task])
  const myDispute = useMemo(() => {
    if (!myContract) return null
    return USE_API ? disputes.find((d) => d.contractId === myContract.id) ?? null : disputeRepo.getForContract(myContract.id)
  }, [disputes, myContract])
  const canRateCustomerNow = useMemo(() => {
    if (!currentUser || currentUser.role !== 'executor') return false
    if (!myContract) return false
    if (myContract.status === 'approved' || myContract.status === 'resolved') return true
    if (myContract.status === 'disputed' && (myDispute?.status === 'decided' || myDispute?.status === 'closed')) return true
    return false
  }, [currentUser, myContract, myDispute?.status])

  useEffect(() => {
    // Hard guard: executor cannot rate customer until approved or after dispute decision.
    if (!rateCustomerOpen) return
    if (canRateCustomerNow) return
    setRateCustomerOpen(false)
  }, [canRateCustomerNow, rateCustomerOpen])

  // If customer requested a revision, the contract is the source of truth.
  // Some flows may leave assignment status as "submitted" briefly; auto-sync it back to "in_progress".
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'executor') return
    if (!task) return
    if (!isExecutorAssigned) return
    if (myContract?.status !== 'revision_requested') return
    if (myAssignment?.status !== 'submitted') return
    taskAssignmentRepo.resumeAfterRevisionRequest(task.id, currentUser.id)
  }, [currentUser, isExecutorAssigned, myAssignment?.status, myContract?.status, task])

  const effectiveMyAssignmentStatus = useMemo(() => {
    if (myContract?.status === 'revision_requested' && myAssignment?.status === 'submitted') return 'in_progress' as const
    return myAssignment?.status ?? null
  }, [myAssignment?.status, myContract?.status])

  const submittedForReviewByMe =
    currentUser?.role === 'executor' &&
    isExecutorAssigned &&
    // Prefer contract state; fallback to assignment only if contract is missing.
    (optimisticSubmittedForReview || (myContract ? myContract.status === 'submitted' : myAssignment?.status === 'submitted'))
  const overdueAssignments = useMemo(() => {
    if (!task) return []
    return assignments.filter((a) => a.taskId === task.id && a.status === 'overdue')
  }, [assignments, task])

  useEffect(() => {
    if (!task) return
    if (!currentUser || currentUser.role !== 'executor') return
    if (!isExecutorAssigned) return
    if (!task.createdByUserId) return
    if (myContract) return
    // Best-effort migration: if executor is assigned but no contract exists yet, create it.
    contractRepo.createActive({
      taskId: task.id,
      clientId: task.createdByUserId,
      executorId: currentUser.id,
      escrowAmount: taskEscrowAmountInRub(task),
      revisionIncluded: 2,
    })
  }, [currentUser, isExecutorAssigned, myContract, task])

  useEffect(() => {
    if (!task) return
    if (!currentUser || currentUser.role !== 'executor') return
    if (!isExecutorAssigned) return
    if (myAssignment) return
    // Best-effort migration: executor is assigned but no assignment exists yet.
    taskAssignmentRepo.createPendingStart({
      taskId: task.id,
      executorId: currentUser.id,
      assignedAt: task.takenAt ?? myContract?.createdAt,
    })
  }, [currentUser, isExecutorAssigned, myAssignment, myContract?.createdAt, task])

  const canShowCompletionForm =
    auth.user?.role === 'executor' &&
    Boolean(myContract) &&
    (myContract?.status === 'active' || myContract?.status === 'revision_requested') &&
    isExecutorAssigned &&
    Boolean(myAssignment?.startedAt) &&
    (effectiveMyAssignmentStatus === 'in_progress' || effectiveMyAssignmentStatus === 'overdue') &&
    !isExpired &&
    !submittedForReviewByMe

  const canAttemptApplyBase =
    auth.user?.role === 'executor' &&
    slotsAvailable &&
    !isExecutorAssigned &&
    (task.status === 'open' || task.status === 'in_progress' || task.status === 'review' || task.status === 'dispute') &&
    !isExpired &&
    !hasAnyApplication &&
    Boolean(auth.user?.id)
  const respondGuard =
    auth.user?.role === 'executor' && auth.user?.id
      ? executorRestrictionRepo.canRespond(auth.user.id, nowMs)
      : ({ ok: true, reason: null, until: null } as const)
  // `canAttemptApplyBase` controls visibility; `respondGuard` controls ability.
  const hasRequiredDeliverable = requiresUploadVideo
    ? uploadTargets.length > 0 && uploadTargets.every((t) => Boolean(uploadVideos[t]))
    : linkProvided
  const canComplete = canShowCompletionForm && hasRequiredDeliverable && copyrightWaiverAccepted
  const completionButtonDisabled = !canComplete
  const isPostedByMe = auth.user?.role === 'customer' && task.createdByUserId === auth.user.id
  const showCustomerWaitingStatus = isPostedByMe && overdueAssignments.length > 0 && task.status === 'in_progress'
  const hasNonRejectedApplications = taskApplications.some((a) => a.status !== 'rejected')
  const canDelete =
    isPostedByMe && !hasNonRejectedApplications && task.status === 'open' && assignedCount === 0
  const showSingleDeleteCta =
    isPostedByMe &&
    task.status === 'open' &&
    assignedCount === 0 &&
    !hasNonRejectedApplications
  const draftEditBackTo = backTo ?? paths.customerTasks

  const canManageApplications = isPostedByMe && !isExpired

  useEffect(() => {
    if (!USE_API) return
    if (!id) return
    if (!isPostedByMe) return
    void fetchApplicationsForTask(id).catch(() => {})
  }, [id, isPostedByMe])

  useEffect(() => {
    if (!USE_API) return
    if (!isPostedByMe) return
    if (!taskApplications.length) return
    void fetchUsersByIds(taskApplications.map((a) => a.executorUserId))
  }, [isPostedByMe, taskApplications])

  const hasReviewLikeContractsForTask = useMemo(() => {
    if (!auth.user || auth.user.role !== 'customer') return false
    return contracts.some(
      (c) => c.taskId === id && c.clientId === auth.user!.id && (c.status === 'submitted' || c.status === 'disputed'),
    )
  }, [auth.user, contracts, id])

  const reviewLikeContractsForTask = useMemo(() => {
    if (!auth.user || auth.user.role !== 'customer') return []
    return contracts.filter((c) => c.taskId === id && c.clientId === auth.user!.id && (c.status === 'submitted' || c.status === 'disputed'))
  }, [auth.user, contracts, id])

  // Keep submissions fresh for the customer while the task is in review/dispute.
  useEffect(() => {
    if (!USE_API) return
    if (!isPostedByMe) return
    if (!hasReviewLikeContractsForTask) return
    void refreshSubmissions()
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void refreshSubmissions()
    }, 12000)
    return () => window.clearInterval(interval)
  }, [hasReviewLikeContractsForTask, isPostedByMe, id])

  useEffect(() => {
    if (!USE_API) return
    if (!isPostedByMe) return
    if (!reviewLikeContractsForTask.length) return

    let cancelled = false

    const fetchForContract = async (contractId: string) => {
      if (submissionsByContractIdBusyRef.current.has(contractId)) return
      submissionsByContractIdBusyRef.current.add(contractId)
      try {
        const attempts: Array<() => Promise<any>> = [
          () => api.get(`/submissions?contractId=${encodeURIComponent(contractId)}`),
          () => api.get(`/contracts/${encodeURIComponent(contractId)}/submissions`),
          () => api.get(`/contracts/${encodeURIComponent(contractId)}/submission`),
        ]
        let raw: any = null
        let lastErr: unknown = null
        for (const run of attempts) {
          try {
            raw = await run()
            break
          } catch (e) {
            lastErr = e
            if (e instanceof ApiError && e.status === 404) continue
            throw e
          }
        }
        if (!raw) {
          if (lastErr) throw lastErr
          return
        }
        const list = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : Array.isArray(raw?.data) ? raw.data : raw ? [raw] : []
        const normalized = (list as unknown[])
          .map((x) => submissionRepo.normalize(x) ?? submissionRepo.normalize((x as any)?.submission) ?? submissionRepo.normalize((x as any)?.data))
          .filter(Boolean) as Submission[]
        if (!normalized.length) return
        const latest = normalized.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
        if (!latest) return
        if (cancelled) return
        setSubmissionsByContractId((prev) => ({ ...prev, [contractId]: latest }))
      } finally {
        submissionsByContractIdBusyRef.current.delete(contractId)
      }
    }

    for (const c of reviewLikeContractsForTask) void fetchForContract(c.id)
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      for (const c of reviewLikeContractsForTask) void fetchForContract(c.id)
    }, 12000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [isPostedByMe, reviewLikeContractsForTask])

  const recomputeTaskStatus = (taskId: string) => {
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

  const approveReviewContract = (contractId: string) => {
    const contract = contracts.find((c) => c.id === contractId) ?? null
    if (!contract) return
    if (!auth.user || auth.user.role !== 'customer') return

    if (USE_API) {
      void (async () => {
        try {
          await api.post(`/contracts/${contract.id}/approve`, {})
          await Promise.all([refreshContracts(), refreshAssignments(), refreshTasks(), refreshNotifications()])
          void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, email: userEmail, text: t('toast.workApproved'), tone: 'success' })
        } catch (e) {
          const msg =
            e instanceof ApiError
              ? `${e.status ?? 'ERR'} ${String(e.message)}`
              : locale === 'ru'
                ? 'Не удалось принять работу.'
                : 'Failed to approve.'
          void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, email: userEmail, text: msg, tone: 'error' })
        }
      })()
      return
    }

    const assignment = taskAssignmentRepo.getForTaskExecutor(contract.taskId, contract.executorId)
    if (!assignment?.startedAt) {
      const msg =
        locale === 'ru'
          ? 'Нельзя принять работу, если исполнитель не нажал «Начать работу».'
          : 'Cannot approve unless the executor clicked “Start work”.'
      alert(msg)
      return
    }

    contractRepo.setStatus(contract.id, 'approved')
    taskAssignmentRepo.markAccepted(contract.taskId, contract.executorId)

    const claimed = balanceFreezeRepo.claimFor(contract.taskId, contract.executorId)
    if (claimed) balanceRepo.deposit(claimed.executorId, claimed.amount)

    notificationRepo.addTaskApproved({
      recipientUserId: contract.executorId,
      actorUserId: auth.user.id,
      taskId: contract.taskId,
    })
    notificationRepo.addRateCustomer({
      recipientUserId: contract.executorId,
      actorUserId: auth.user.id,
      taskId: contract.taskId,
    })

    recomputeTaskStatus(contract.taskId)
    void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, email: userEmail, text: t('toast.workApproved'), tone: 'success' })
  }

  const requestReviewRevision = async (contractId: string, message: string) => {
    const contract = contracts.find((c) => c.id === contractId) ?? null
    if (!contract) return
    if (!auth.user || auth.user.role !== 'customer') return

    const included = contract.revisionIncluded ?? 0
    const used = contract.revisionUsed ?? 0
    if (included <= 0) return
    if (used >= included) return

    if (USE_API) {
      try {
        const id = encodeURIComponent(contract.id)
        try {
          await api.post(`/contracts/${id}/request-revision`, { message })
        } catch (e) {
          // Back-compat: older backends used /revision
          if (e instanceof ApiError && e.status === 404) {
            await api.post(`/contracts/${id}/revision`, { message })
          } else {
            throw e
          }
        }
        await Promise.all([refreshContracts(), refreshAssignments(), refreshTasks(), refreshNotifications()])
        void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, email: userEmail, text: t('toast.revisionRequested'), tone: 'info' })
      } catch (e) {
        const msg =
          e instanceof ApiError
            ? `${e.status ?? 'ERR'} ${String(e.message)}`
            : locale === 'ru'
              ? 'Не удалось отправить на доработку.'
              : 'Failed to request a revision.'
        void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, email: userEmail, text: msg, tone: 'error' })
      }
      return
    }

    contractRepo.setStatus(contract.id, 'revision_requested')
    contractRepo.incrementRevisionUsed(contract.id)
    taskAssignmentRepo.resumeAfterRevisionRequest(contract.taskId, contract.executorId)
    contractRepo.update(contract.id, (c) => ({
      ...c,
      lastRevisionMessage: message.trim() || undefined,
      lastRevisionRequestedAt: new Date().toISOString(),
    }))

    notificationRepo.addTaskRevision({
      recipientUserId: contract.executorId,
      actorUserId: auth.user.id,
      taskId: contract.taskId,
      message,
    })

    recomputeTaskStatus(contract.taskId)
    void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, email: userEmail, text: t('toast.revisionRequested'), tone: 'info' })
  }

  const handleAssignApplication = async (applicationId: string, opts?: { bypassNoStartConfirm?: boolean }) => {
    if (!canManageApplications) return
    if (!auth.user || auth.user.role !== 'customer') return
    if (!task.createdByUserId || task.createdByUserId !== auth.user.id) return
    if (!slotsAvailable) return

    const app = taskApplications.find((x) => x.id === applicationId) ?? null
    if (!app || app.status !== 'pending') return
    if (task.assignedExecutorIds.includes(app.executorUserId)) return

    if (USE_API) {
      try {
        await selectApplicationApi(applicationId)
        await Promise.all([
          refreshTasks(),
          fetchApplicationsForTask(task.id).catch(() => []),
          refreshContracts(),
          refreshAssignments(),
          refreshNotifications(),
        ])
        void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, email: userEmail, text: t('toast.executorAssigned'), tone: 'success' })
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          void notifyToTelegramAndUi({
            toast: toastUi,
            telegramUserId,
            email: userEmail,
            text: locale === 'ru' ? 'Сессия истекла. Войдите заново.' : 'Session expired. Please sign in again.',
            tone: 'error',
          })
        } else if (e instanceof ApiError && e.status === 409 && e.message === 'insufficient_balance') {
          setInsufficientBalanceOpen(true)
        } else {
          const message = e instanceof ApiError ? `${e.status ?? 'ERR'} ${String(e.message)}` : 'Failed to assign executor'
          void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, email: userEmail, text: message, tone: 'error' })
        }
      }
      return
    }

    const prevNoStart = noStartViolationCountLast90d(app.executorUserId)
    if (prevNoStart >= 2 && !opts?.bypassNoStartConfirm) {
      setNoStartPrompt({ applicationId, count: prevNoStart })
      return
    }

    const existingContract = contractRepo.getForTaskExecutor(task.id, app.executorUserId)
    const amount = taskEscrowAmountInRub(task)
    if (!existingContract && amount > 0 && !balanceRepo.withdraw(task.createdByUserId, amount)) {
      setInsufficientBalanceOpen(true)
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
      actorUserId: auth.user.id,
      taskId: task.id,
    })
    notificationRepo.addTaskTaken({
      recipientUserId: task.createdByUserId,
      actorUserId: app.executorUserId,
      taskId: task.id,
    })

    const finalTask = taskRepo.getById(task.id)
    if (finalTask) {
      const finalAssigned = finalTask.assignedExecutorIds.length ?? 0
      const finalMax = finalTask.maxExecutors ?? 1
      if (finalAssigned >= finalMax) {
        const pending = applicationRepo
          .listForTask(finalTask.id)
          .filter((x) => x.status === 'pending' && x.id !== app.id)
        for (const p of pending) {
          applicationRepo.reject(p.id)
          notificationRepo.addTaskApplicationCancelled({
            recipientUserId: p.executorUserId,
            actorUserId: auth.user.id,
            taskId: finalTask.id,
          })
        }
      }
    }

    void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, email: userEmail, text: t('toast.executorAssigned'), tone: 'success' })
  }

  const handleRejectApplication = async (applicationId: string) => {
    if (!isPostedByMe) return
    if (USE_API) {
      try {
        await rejectApplicationApi(applicationId)
        await Promise.all([fetchApplicationsForTask(task.id).catch(() => []), refreshNotifications()])
        void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, email: userEmail, text: t('toast.applicationRejected'), tone: 'info' })
      } catch (e) {
        const message = e instanceof ApiError ? `${e.status ?? 'ERR'} ${String(e.message)}` : 'Failed to reject application'
        void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, email: userEmail, text: message, tone: 'error' })
      }
      return
    }

    applicationRepo.reject(applicationId)
    void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, email: userEmail, text: t('toast.applicationRejected'), tone: 'info' })
  }

  const handleFinalPublish = async () => {
    if (!isPostedByMe) return
    if (task.status !== 'draft') return
    if (auth.user?.role !== 'customer') {
      void notifyToTelegramAndUi({
        toast: toastUi,
        telegramUserId,
        email: userEmail,
        text:
          locale === 'ru'
            ? auth.user?.role === 'pending'
              ? 'Сначала выберите роль.'
              : 'Опубликовать может только заказчик.'
            : auth.user?.role === 'pending'
              ? 'Choose a role first.'
              : 'Only customers can publish tasks.',
        tone: 'error',
      })
      if (auth.user?.role === 'pending') navigate(paths.chooseRole)
      return
    }
    if (USE_API) {
      try {
        await api.post(`/tasks/${id}/publish`, {})
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          void notifyToTelegramAndUi({
            toast: toastUi,
            telegramUserId,
            email: userEmail,
            text: locale === 'ru' ? 'Сессия истекла. Войдите снова.' : 'Session expired. Please sign in again.',
            tone: 'error',
          })
          navigate(paths.login)
          return
        }
        if (e instanceof ApiError && e.status === 403) {
          void notifyToTelegramAndUi({
            toast: toastUi,
            telegramUserId,
            email: userEmail,
            text: locale === 'ru' ? 'Недостаточно прав для публикации.' : 'Not allowed to publish.',
            tone: 'error',
          })
          return
        }
        void notifyToTelegramAndUi({
          toast: toastUi,
          telegramUserId,
          email: userEmail,
          text: locale === 'ru' ? 'Не удалось опубликовать задание.' : 'Failed to publish task.',
          tone: 'error',
        })
        return
      }
      await refreshTasks()
    } else {
      taskRepo.update(id, (prev) => ({
        ...prev,
        status: 'open',
      }))
    }
    void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, email: userEmail, text: t('toast.taskPublished'), tone: 'success' })
  }
  const isDraftPublishStep = isPostedByMe && task.status === 'draft'
  const hasBottomActions = isDraftPublishStep || showSingleDeleteCta || canDelete

  const author = task.createdByUserId ? users.find((u) => u.id === task.createdByUserId) ?? null : null

  const validateCompletionBeforeSubmit = () => {
    if (myAssignment?.status === 'paused' || myAssignment?.status === 'pause_requested') {
      const msg =
        locale === 'ru'
          ? 'Нельзя отправить работу, пока включена пауза. Снимите паузу и продолжите выполнение.'
          : 'You cannot submit while the task is paused. End the pause and continue.'
      alert(msg)
      return null
    }
    if (!copyrightWaiverAccepted) {
      setCopyrightWaiverTouched(true)
      setCompletionError(
        locale === 'ru'
          ? 'Подтвердите отказ от претензий на авторские права (галочка ниже), чтобы отправить работу.'
          : 'Please confirm the copyright waiver checkbox to submit your work.',
      )
      return null
    }
    if (!myContract) return
    const recipientUserId = task.createdByUserId
    if (requiresUploadVideo) {
      const missing = uploadTargets.filter((t) => !uploadVideos[t]).map((t) => t || (locale === 'ru' ? 'Видео' : 'Video'))
      if (missing.length > 0) {
        setCompletionError(t('task.completionUpload.required'))
        return null
      }
      const files = uploadTargets
        .map((target) => {
          const v = uploadVideos[target]
          if (!v) return null
          const label = (target ?? '').trim()
          const title = label ? `${label} — ${v.name}` : v.name
          return v.kind === 'url'
            ? ({
                kind: 'upload' as const,
                url: v.url,
                title,
                mediaType: 'video' as const,
              } satisfies SubmissionFile)
            : ({
                kind: 'upload' as const,
                url: `idb:${v.blobId}`,
                title,
                mediaType: 'video' as const,
              } satisfies SubmissionFile)
        })
        .filter(Boolean) as SubmissionFile[]
      const firstUrl = files.find((f) => f.kind === 'upload' && typeof f.url === 'string')?.url ?? ''
      return { files, firstUrl, recipientUserId, taskCompletionLinks: undefined }
    }

    if (requiresCompletionLinks) {
      const missing = completionLinks
        .filter((x) => !x.url.trim())
        .map((x) => x.platform)
        .filter(Boolean)
      if (missing.length > 0) {
        setCompletionError(
          locale === 'ru'
            ? `Добавьте ссылку для: ${missing.join(', ')}`
            : `Add link for: ${missing.join(', ')}`,
        )
        return null
      }
      if (completionLinks.length === 1 && !completionLinks[0].url.trim()) {
        setCompletionError(t('task.completionLink.required'))
        return null
      }
      const trimmedLinks = completionLinks
        .map((x) => ({ platform: x.platform.trim(), url: x.url.trim() }))
        .filter((x) => x.url.length > 0)
      const firstUrl = trimmedLinks[0]?.url ?? ''
      const files = trimmedLinks.map((x) => ({
        kind: 'external_url' as const,
        url: x.url,
        title: x.platform || undefined,
        mediaType: 'video' as const,
      }))
      const taskCompletionLinks = trimmedLinks.filter((x) => x.platform).length ? trimmedLinks.filter((x) => x.platform) : undefined
      return { files, firstUrl, recipientUserId, taskCompletionLinks }
    }

    // Fallback: allow submission without links/upload (should not happen in normal flows).
    return { files: [], firstUrl: '', recipientUserId, taskCompletionLinks: undefined }
  }

  const submitCompletion = async () => {
    const validated = validateCompletionBeforeSubmit()
    if (!validated) return
    if (!myContract) return
    let { firstUrl, recipientUserId, taskCompletionLinks } = validated
    let files = validated.files as SubmissionFile[]
    if (USE_API) {
      try {
        // If submission contains local idb: uploads, push them to server first.
        const nextFiles = await Promise.all(
          files.map(async (f) => {
            if (f.kind !== 'upload') return f
            if (!f.url.startsWith('idb:')) return f
            const blobId = f.url.slice('idb:'.length)
            const blob = await getBlob(blobId)
            if (!blob) throw new Error('upload_blob_missing')
            const uploaded = await uploadFileToServer(blob, (f.title ?? '').trim() || 'video.mp4')
            if (!firstUrl) firstUrl = uploaded.url
            return { ...f, url: uploaded.url }
          }),
        )
        files = nextFiles

        await createSubmissionApi({
          contractId: myContract.id,
          message: submissionMessage.trim() || undefined,
          files,
        })
        setOptimisticSubmittedForReview(true)
        setPauseModalOpen(false)
        await Promise.all([refreshSubmissions(), refreshContracts(), refreshAssignments(), refreshTasks(), refreshNotifications()])
      } catch (e) {
        const msg =
          e instanceof ApiError
            ? `${e.status ?? 'ERR'} ${String(e.message)}`
            : locale === 'ru'
              ? 'Не удалось отправить на проверку.'
              : 'Failed to submit for review.'
        void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, email: userEmail, text: msg, tone: 'error' })
        return
      }
    } else {
      const submission = submissionRepo.create({
        contractId: myContract.id,
        message: submissionMessage.trim() || undefined,
        files,
      })
      contractRepo.setStatus(myContract.id, 'submitted')
      contractRepo.setLastSubmission(myContract.id, submission.id)
      if (auth.user) {
        taskAssignmentRepo.markSubmitted(id, auth.user.id)
      }
      taskRepo.update(id, (prev) => ({
        ...prev,
        status: 'review',
        reviewSubmittedAt: new Date().toISOString(),
        completionVideoUrl: firstUrl || undefined,
        completionLinks: taskCompletionLinks,
      }))
      if (recipientUserId && auth.user) {
        notificationRepo.addTaskSubmitted({
          recipientUserId,
          actorUserId: auth.user.id,
          taskId: id,
          completionVideoUrl: firstUrl || undefined,
        })
      }
    }
    setSubmissionMessage('')
    setUploadVideos({})
    setUploadBusyByTarget({})
    setCopyrightWaiverAccepted(false)
    setCopyrightWaiverTouched(false)
    setSubmitConfirmOpen(false)
    void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, email: userEmail, text: t('toast.submitted'), tone: 'success' })
    setSubmittedModalOpen(true)
  }

  const openSubmission = submissionDetailsOpen
  const openSubmissionContract = openSubmission ? contracts.find((c) => c.id === openSubmission.contractId) ?? null : null
  const openSubmissionExecutor = openSubmission
    ? users.find((u) => userIdMatches(u, openSubmission.executorUserId)) ?? null
    : null
  const openSubmissionValue = useMemo(() => {
    if (!openSubmission) return null
    const contractId = openSubmission.contractId
    const override = submissionsByContractId[contractId] ?? null
    if (override) return override
    const latest =
      submissions
        .filter((s) => s.contractId === contractId && s.status === 'submitted')
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
    return latest
  }, [openSubmission, submissions, submissionsByContractId])

  const openSubmissionFiles = useMemo(() => {
    const s = openSubmissionValue
    if (!s) return [] as SubmissionFile[]
    return s.files.filter((f) => f.kind === 'external_url' || f.kind === 'upload')
  }, [openSubmissionValue])

  const parseSubmissionTitle = (title?: string) => {
    const raw = (title ?? '').trim()
    if (!raw) return { platform: '', name: '' }
    const idx = raw.indexOf(' — ')
    if (idx >= 0) return { platform: raw.slice(0, idx).trim(), name: raw.slice(idx + 3).trim() }
    return { platform: '', name: raw }
  }

  const downloadUrlBestEffort = async (url: string, name: string) => {
    try {
      const res = await fetch(url, { credentials: 'include' })
      if (!res.ok) throw new Error(`http_${res.status}`)
      const blob = await res.blob()
      downloadBlob(name, blob)
    } catch {
      window.open(url, '_blank', 'noreferrer')
    }
  }

  const downloadSubmissionFile = async (f: SubmissionFile) => {
    const title = parseSubmissionTitle(f.title)
    const name = (title.name || f.title || 'video').trim() || 'video'
    if (f.kind === 'upload' && f.url.startsWith('idb:')) {
      const blobId = f.url.slice('idb:'.length)
      const blob = await getBlob(blobId)
      if (!blob) {
        void notifyToTelegramAndUi({
          toast: toastUi,
          telegramUserId,
          email: userEmail,
          text:
            locale === 'ru'
              ? 'Этот файл доступен только на устройстве исполнителя (локальная загрузка).'
              : 'This file is only available on the executor device (local upload).',
          tone: 'error',
        })
        return
      }
      downloadBlob(name, blob)
      return
    }
    await downloadUrlBestEffort(f.url, name)
  }

  return (
    <main className="taskDetails">
      <div className="taskDetailsContainer">
        <div className="taskDetailsContentWrap">
          <button
            type="button"
            className="taskDetailsBack taskDetailsBack--outside"
            onClick={handleBack}
            aria-label={t('task.details.backToTasks')}
          >
            <span className="taskDetailsBack__icon">←</span>
            <span className="taskDetailsBack__text">{t('task.details.back')}</span>
          </button>

          <div className="taskDetailsContent">
            <div className="taskDetailsHeader">
              <div className="taskDetailsHeaderMain">
                <h1 className="taskDetailsTitle">{pickText(task.title, locale)}</h1>
                {auth.user?.role === 'executor' && formatBudget(task.budgetAmount, task.budgetCurrency) ? (
                  <div
                    className="taskDetailsPayout"
                    aria-label={`${t('tasks.payout')}: ${formatBudget(task.budgetAmount, task.budgetCurrency)}`}
                  >
                    <span className="taskDetailsPayout__label">{t('tasks.payout')}</span>
                    <span className="taskDetailsPayout__amount">
                      {formatBudget(task.budgetAmount, task.budgetCurrency)}
                    </span>
                  </div>
                ) : null}
                {!isPostedByMe && author ? (
                  <div className="taskDetailsHeaderMeta">
                    <span className="taskDetailsHeaderMeta__label">{t('task.meta.postedBy')}</span>
                    <Link
                      to={userProfilePath(author.id)}
                      state={{ backTo: taskDetailsPath(id) }}
                      className="taskDetailsHeaderMeta__link"
                    >
                      {author.fullName}
                    </Link>
                  </div>
                ) : null}
              </div>
              {(() => {
                const hasSlot = assignedCount < maxExecutors
                const viewerStatus =
                  auth.user?.role === 'executor' &&
                  !isExecutorAssigned &&
                  hasSlot &&
                  (task.status === 'in_progress' || task.status === 'review' || task.status === 'dispute')
                    ? 'open'
                    : task.status
                return (
                  <StatusPill
                    tone={pauseKindForTask ? 'paused' : showCustomerWaitingStatus ? 'pending' : viewerStatus}
                    label={
                      pauseKindForTask
                        ? t(pauseKindForTask === 'paused' ? 'executor.status.paused' : 'executor.status.pauseRequested')
                        : showCustomerWaitingStatus
                          ? t('task.status.waiting')
                          : statusLabel(viewerStatus, t)
                    }
                  />
                )
              })()}
            </div>

            <div className="taskDetailsMeta">
              <div className="taskDetailsMeta__section">
                <span className="taskDetailsMeta__label">{t('tasks.published')}</span>
                <span className="taskDetailsMeta__value">{timeAgo(task.createdAt, locale, nowMs)}</span>
              </div>
              <div className="taskDetailsMeta__section">
                <span className="taskDetailsMeta__label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name={assignedExecutorsIconName(assignedCount)} size={14} />
                  {t('task.meta.assigned')}
                </span>
                <span className="taskDetailsMeta__value">
                  {assignedCount}/{maxExecutors}
                </span>
              </div>
              {task.category ? (
                <div className="taskDetailsMeta__section">
                  <span className="taskDetailsMeta__label">{t('task.create.category')}</span>
                  <span className="taskDetailsMeta__value">{task.category}</span>
                </div>
              ) : null}
              {task.location ? (
                <div className="taskDetailsMeta__section">
                  <span className="taskDetailsMeta__label">{t('task.create.location')}</span>
                  <span className="taskDetailsMeta__value">{task.location}</span>
                </div>
              ) : null}
              {auth.user?.role !== 'executor' && formatBudget(task.budgetAmount, task.budgetCurrency) ? (
                <div className="taskDetailsMeta__section">
                  <span className="taskDetailsMeta__label">{t('tasks.budget')}</span>
                  <span className="taskDetailsMeta__value">{formatBudget(task.budgetAmount, task.budgetCurrency)}</span>
                </div>
              ) : null}
              {task.status !== 'closed' && task.dueDate ? (
                <div className="taskDetailsMeta__section">
                  <span className="taskDetailsMeta__label">{t('tasks.due')}</span>
                  <span className="taskDetailsMeta__value">{task.dueDate}</span>
                </div>
              ) : null}
            </div>

            {activeForceMajeure ? (
              <div className="taskDetailsBody" style={{ marginTop: 6 }}>
                <div className="taskDetailsHint" style={{ whiteSpace: 'pre-line', opacity: 0.95 }}>
                  <strong>{locale === 'ru' ? 'Форс-мажор (системный)' : 'Force majeure (system)'}</strong>
                  {'\n'}
                  {locale === 'ru'
                    ? 'Идёт системное событие. Таймеры остановлены, штрафы не начисляются, дедлайны будут сдвинуты.'
                    : 'A system event is active. Timers are paused, penalties are disabled, deadlines will be shifted.'}
                </div>
              </div>
            ) : null}

            {isExecutorAssigned && auth.user?.role === 'executor' && myAssignment ? (
              <div className="taskDetailsBody" style={{ marginTop: 6 }}>
                {myAssignment.status === 'pending_start' ? (
                  <div className="taskDetailsHint" style={{ whiteSpace: 'pre-line', opacity: 0.95 }}>
                    <strong>{locale === 'ru' ? 'Начало работы' : 'Start work'}</strong>
                    {'\n'}
                    {locale === 'ru'
                      ? 'Если не начать работу в течение 12 часов — задание будет снято.'
                      : 'If you do not start within 12 hours, the assignment will be removed.'}
                    {'\n'}
                    {locale === 'ru' ? 'Осталось начать: ' : 'Time to start: '}
                    {formatTimeLeft(timeLeftMs(myAssignment.startDeadlineAt, nowMs), locale)}
                    <div style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        className="taskDetailsButton taskDetailsButton--primary"
                        onClick={async () => {
                          if (!auth.user) return
                          if (USE_API) {
                            try {
                              await api.post(`/assignments/${myAssignment.id}/start`, {})
                              await Promise.all([refreshAssignments(), refreshNotifications()])
                              void notifyToTelegramAndUi({
                                toast: toastUi,
                                telegramUserId,
                                email: userEmail,
                                text: t('toast.workStarted'),
                                tone: 'success',
                              })
                            } catch (e) {
                              const msg =
                                e instanceof ApiError
                                  ? `${e.status ?? 'ERR'} ${String(e.message)}`
                                  : locale === 'ru'
                                    ? 'Не удалось начать работу.'
                                    : 'Failed to start work.'
                              void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, email: userEmail, text: msg, tone: 'error' })
                            }
                            return
                          }
                          taskAssignmentRepo.startWork(id, user.id)
                          void notifyToTelegramAndUi({
                            toast: toastUi,
                            telegramUserId,
                            email: userEmail,
                            text: t('toast.workStarted'),
                            tone: 'success',
                          })
                        }}
                      >
                        {locale === 'ru' ? 'Начать работу' : 'Start work'}
                      </button>
                    </div>
                  </div>
                ) : myAssignment.status === 'pause_requested' ? (
                  <div className="taskDetailsHint" style={{ whiteSpace: 'pre-line', opacity: 0.95 }}>
                    <strong>{locale === 'ru' ? 'Пауза запрошена' : 'Pause requested'}</strong>
                    {'\n'}
                    {locale === 'ru' ? 'Ожидаем решения заказчика.' : 'Waiting for customer decision.'}
                    {myAssignment.pauseAutoAcceptAt ? (
                      <>
                        {'\n'}
                        {locale === 'ru' ? 'Авто-принятие через: ' : 'Auto-accept in: '}
                        {formatTimeLeft(timeLeftMs(myAssignment.pauseAutoAcceptAt, nowMs), locale)}
                      </>
                    ) : null}
                  </div>
                ) : myAssignment.status === 'paused' ? (
                  <div className="taskDetailsHint" style={{ whiteSpace: 'pre-line', opacity: 0.95 }}>
                    <strong>{locale === 'ru' ? 'Пауза активна' : 'Paused'}</strong>
                    {myAssignment.pausedUntil ? (
                      <>
                        {'\n'}
                        {locale === 'ru' ? 'Возобновится через: ' : 'Resumes in: '}
                        {formatTimeLeft(timeLeftMs(myAssignment.pausedUntil, nowMs), locale)}
                      </>
                    ) : null}
                    <div style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        className="taskDetailsButton"
                        onClick={() => {
                          if (!auth.user) return
                          if (USE_API) {
                            void (async () => {
                              try {
                                await endPauseEarlyApi(myAssignment.id)
                                await Promise.all([refreshAssignments(), refreshNotifications(), refreshTasks()])
                                void notifyToTelegramAndUi({
                                  toast: toastUi,
                                  telegramUserId,
                                  email: userEmail,
                                  text: t('toast.pauseEnded'),
                                  tone: 'success',
                                })
                              } catch (e) {
                                const msg =
                                  e instanceof ApiError && e.status === 404
                                    ? locale === 'ru'
                                      ? 'Не удалось снять паузу: на сервере не найден нужный endpoint. (404)'
                                      : 'Failed to end pause: server endpoint not found. (404)'
                                    : e instanceof ApiError
                                      ? `${e.status ?? 'ERR'} ${String(e.message)}`
                                      : locale === 'ru'
                                        ? 'Не удалось снять паузу.'
                                        : 'Failed to end pause.'
                                void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, email: userEmail, text: msg, tone: 'error' })
                              }
                            })()
                            return
                          }
                          // Use assignment executorId (TG/email-safe) to update local state.
                          taskAssignmentRepo.endPauseEarly(id, myAssignment.executorId)
                        }}
                      >
                        {locale === 'ru' ? 'Снять паузу' : 'End pause'}
                      </button>
                    </div>
                  </div>
                ) : myAssignment.executionDeadlineAt && !fromExecutorCompleted && !submittedForReviewByMe ? (
                  <div className="taskDetailsHint" style={{ whiteSpace: 'pre-line', opacity: 0.95 }}>
                    <strong>{locale === 'ru' ? 'Таймер выполнения' : 'Execution timer'}</strong>
                    {'\n'}
                    {myAssignment.status === 'overdue'
                      ? locale === 'ru'
                        ? 'Статус: просрочено.'
                        : 'Status: overdue.'
                      : null}
                    {locale === 'ru' ? '\nОсталось: ' : '\nTime left: '}
                    {formatTimeLeft(timeLeftMs(myAssignment.executionDeadlineAt, nowMs), locale)}
                  </div>
                ) : null}
              </div>
            ) : null}

            {isExecutorAssigned &&
            auth.user?.role === 'executor' &&
            myAssignment?.status === 'in_progress' &&
            !submittedForReviewByMe &&
            !myAssignment.pauseUsed &&
            myAssignment.executionDeadlineAt &&
            timeLeftMs(myAssignment.executionDeadlineAt, nowMs) > 0 ? (
              <div className="taskDetailsBody" style={{ marginTop: 6 }}>
                <div className="taskDetailsHint" style={{ whiteSpace: 'pre-line', opacity: 0.95 }}>
                  <strong>{locale === 'ru' ? 'Форс-мажор' : 'Force majeure'}</strong>
                  {'\n'}
                  {locale === 'ru'
                    ? 'Можно запросить одну паузу до дедлайна. Заказчик примет/отклонит, если не ответит за 12 часов — пауза будет принята автоматически.'
                    : 'You can request one pause before the deadline. Customer can accept/reject; if they do not respond within 12 hours, it will be auto-accepted.'}
                  <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="taskDetailsButton"
                      onClick={() => {
                        setPauseModalOpen(true)
                      }}
                    >
                      {locale === 'ru' ? 'Запросить паузу' : 'Request pause'}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <PauseRequestModal
              open={pauseModalOpen}
              onClose={() => setPauseModalOpen(false)}
              onSubmit={({ reasonId, durationHours, comment }) => {
                if (!task.createdByUserId) return
                if (USE_API) {
                  if (!myAssignment?.id) {
                    void notifyToTelegramAndUi({
                      toast: toastUi,
                      telegramUserId,
                      email: userEmail,
                      text: locale === 'ru' ? 'Назначение не найдено. Обновите страницу.' : 'Assignment not found. Refresh the page.',
                      tone: 'error',
                    })
                    return
                  }
                  void (async () => {
                    try {
                      await requestPauseApi({ assignmentId: myAssignment.id, reasonId, durationHours, comment })
                      await Promise.all([refreshAssignments(), refreshNotifications(), refreshTasks()])
                      void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, email: userEmail, text: t('toast.pauseRequested'), tone: 'success' })
                      setPauseModalOpen(false)
                    } catch (e) {
                      const msg =
                        e instanceof ApiError
                          ? `${e.status ?? 'ERR'} ${String(e.message)}`
                          : locale === 'ru'
                            ? 'Не удалось запросить паузу.'
                            : 'Failed to request pause.'
                      void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, email: userEmail, text: msg, tone: 'error' })
                    }
                  })()
                  return
                }

                const updatedAssignment = taskAssignmentRepo.requestPause({
                  taskId: id,
                  executorId: user.id,
                  reasonId,
                  comment,
                  durationMs: Math.round(durationHours * 60 * 60 * 1000),
                })
                if (updatedAssignment && reasonId === 'force_majeure') {
                  checkAndApplyForceMajeureSanctions(user.id, id, updatedAssignment.id)
                }
                notificationRepo.addTaskPauseRequested({
                  recipientUserId: task.createdByUserId,
                  actorUserId: user.id,
                  taskId: id,
                  message: comment || undefined,
                })
                void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, email: userEmail, text: t('toast.pauseRequested'), tone: 'success' })
                setPauseModalOpen(false)
              }}
            />

            <div className="taskDetailsBody">
              <h2 className="taskDetailsSection__title">{t('task.details.description')}</h2>
              <p className="taskDetailsDescription">{pickText(task.description, locale)}</p>
              {(task.descriptionFiles?.length ? task.descriptionFiles : task.descriptionFile ? [task.descriptionFile] : []).length ? (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(task.descriptionFiles?.length ? task.descriptionFiles : task.descriptionFile ? [task.descriptionFile] : []).map(
                    (f, idx) => (
                      <button
                        key={`${f.name}-${idx}`}
                        type="button"
                        className="linkBtn"
                        onClick={() => downloadTextFile(f.name, f.text)}
                      >
                        {locale === 'ru' ? `Скачать файл: ${f.name}` : `Download file: ${f.name}`}
                      </button>
                    ),
                  )}
                </div>
              ) : null}
            </div>

            {task.reference ? (
              <div className="taskDetailsBody">
                <h2 className="taskDetailsSection__title">{locale === 'ru' ? 'Референс' : 'Reference'}</h2>
                {referenceUrls.length
                  ? referenceUrls.map((url) => (
                      <a key={url} className="linkBtn" href={url} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 8 }}>
                        {url.length > 50 ? url.slice(0, 47) + '…' : url}
                      </a>
                    ))
                  : null}

                {referenceVideos.length
                  ? referenceVideos.map((ref, idx) => {
                      const hasBlob = Boolean(ref.blobId)
                      const hasUrl = Boolean(ref.url)
                      const isThisSelected = referencePreviewTarget?.blobId === ref.blobId
                      const canPreview = Boolean(referenceVideoUrl) && isThisSelected
                      const key = ref.blobId ?? ref.url ?? `video-${idx}`
                      return (
                        <div key={key} className="referenceVideoCompact" style={{ marginTop: 10 }}>
                          <div className="referenceVideoCompact__meta">
                            <div className="referenceVideoCompact__kicker">
                              {locale === 'ru' ? 'Видео' : 'Video'}
                            </div>
                            <div className="referenceVideoCompact__name" title={ref.name}>
                              {ref.name}
                            </div>
                          </div>
                          <div className="referenceVideoCompact__actions">
                            {hasUrl ? (
                              <a className="linkBtn" href={ref.url} target="_blank" rel="noreferrer">
                                {locale === 'ru' ? 'Открыть видео' : 'Open video'}
                              </a>
                            ) : null}
                            {hasBlob ? (
                              <>
                                <button
                                  type="button"
                                  className="linkBtn"
                                  onClick={() => {
                                    setReferencePreviewTarget({ blobId: ref.blobId!, name: ref.name })
                                    setReferencePreviewOpen(true)
                                  }}
                                >
                                  {locale === 'ru' ? 'Смотреть' : 'Preview'}
                                </button>
                                <button
                                  type="button"
                                  className="linkBtn"
                                  onClick={() => {
                                    void (async () => {
                                      const blob = ref.blobId ? await getBlob(ref.blobId) : null
                                      if (!blob) return
                                      downloadBlob(ref.name, blob)
                                    })()
                                  }}
                                >
                                  {locale === 'ru' ? 'Скачать' : 'Download'}
                                </button>
                              </>
                            ) : null}
                          </div>
                          {hasBlob && referencePreviewTarget?.blobId === ref.blobId && !canPreview ? (
                            <div className="referenceVideoCompact__hint">
                              {locale === 'ru'
                                ? 'Видео недоступно для просмотра (не найдено в хранилище браузера). Можно скачать, если файл ещё есть.'
                                : 'Video preview is unavailable (not found in browser storage). You can try downloading if it still exists.'}
                            </div>
                          ) : null}
                        </div>
                      )
                    })
                  : null}
              </div>
            ) : null}

            {referencePreviewOpen && referencePreviewTarget && referenceVideoUrl ? (
              <div
                className="referenceVideoOverlay"
                role="dialog"
                aria-modal="true"
                aria-label={locale === 'ru' ? 'Просмотр референса' : 'Reference preview'}
                onClick={() => setReferencePreviewOpen(false)}
              >
                <div className="referenceVideoModal" onClick={(e) => e.stopPropagation()}>
                  <div className="referenceVideoModal__top">
                    <div className="referenceVideoModal__title" title={referencePreviewTarget.name}>
                      {referencePreviewTarget.name}
                    </div>
                    <button
                      type="button"
                      className="referenceVideoModal__close"
                      onClick={() => setReferencePreviewOpen(false)}
                      aria-label={locale === 'ru' ? 'Закрыть' : 'Close'}
                    >
                      ×
                    </button>
                  </div>
                  <video className="referenceVideoModal__player" controls autoPlay src={referenceVideoUrl} />
                </div>
              </div>
            ) : null}

            {task.requirements ? (
              <div className="taskDetailsBody">
                <h2 className="taskDetailsSection__title">
                  {locale === 'ru' ? 'Требования' : 'Requirements'}
                </h2>
                <p className="taskDetailsDescription" style={{ whiteSpace: 'pre-line' }}>
                  {pickText(task.requirements, locale)}
                </p>
              </div>
            ) : null}

            {submittedForReviewByMe ? (
              <div className="taskDetailsNotice">
                <strong className="taskDetailsNotice__title">
                  {locale === 'ru' ? 'Отправлено на проверку' : 'Submitted for review'}
                </strong>
                <div className="taskDetailsNotice__text">
                  {locale === 'ru'
                    ? 'Задание отправлено заказчику. Он примет работу или попросит доработку. Как только появится решение — вы увидите уведомление.'
                    : 'Your work was sent to the client. They will either approve it or request a revision. You will get a notification once a decision is made.'}
                </div>
              </div>
            ) : null}

            {canShowCompletionForm ? (
              <div className="taskDetailsSection">
                <h2 className="taskDetailsSection__title">{t('task.actions.complete')}</h2>
                <div className="taskDetailsForm">
                  {myContract?.status === 'revision_requested' ? (
                    <div className="taskDetailsHint" style={{ marginBottom: 10, whiteSpace: 'pre-line', opacity: 0.95 }}>
                      <strong>{locale === 'ru' ? 'Доработка' : 'Revision'}</strong>
                      {myContract.lastRevisionMessage ? (
                        <>
                          {'\n'}
                          {myContract.lastRevisionMessage}
                        </>
                      ) : (
                        <>
                          {'\n'}
                          {locale === 'ru'
                            ? 'Заказчик запросил доработку. Уточняющих деталей нет — можно задать вопрос в сообщении при пересдаче.'
                            : 'Client requested a revision. No details provided — add questions in your resubmission message.'}
                        </>
                      )}
                    </div>
                  ) : null}
                  <label className="taskDetailsField">
                    <span className="taskDetailsField__label">
                      {locale === 'ru' ? 'Сообщение' : 'Message'}
                    </span>
                    <textarea
                      className="taskDetailsField__textarea"
                      value={submissionMessage}
                      autoComplete="off"
                      onChange={(e) => setSubmissionMessage(e.target.value)}
                      placeholder={locale === 'ru' ? 'Коротко: что сделано, где смотреть, что учесть…' : 'What you delivered, where to check it, notes…'}
                      rows={3}
                    />
                  </label>
                  {requiresCompletionLinks
                    ? completionLinks.map((item, idx) => (
                        <label className="taskDetailsField" key={`${item.platform || 'link'}-${idx}`}>
                          <span className="taskDetailsField__label">
                            {t('task.completionLink')}
                            {item.platform ? ` — ${item.platform}` : ''}
                          </span>
                          <input
                            className="taskDetailsField__input"
                            value={item.url}
                            autoComplete="off"
                            onChange={(e) => {
                              const value = e.target.value
                              setCompletionLinks((prev) => prev.map((x, i) => (i === idx ? { ...x, url: value } : x)))
                              setCompletionError(null)
                            }}
                            placeholder="https://"
                          />
                        </label>
                      ))
                    : requiresUploadVideo
                      ? uploadTargets.map((target, idx) => {
                          const current = uploadVideos[target] ?? null
                          const busy = Boolean(uploadBusyByTarget[target])
                          const label = target ? ` — ${target}` : ''
                          return (
                            <label className="taskDetailsField" key={`upload-${target || 'video'}-${idx}`}>
                              <span className="taskDetailsField__label">
                                {t('task.completionUpload')}
                                {label}
                              </span>
                              <div className="taskDetailsFileControl">
                                <input
                                  ref={(el) => {
                                    uploadVideoInputRefs.current[target] = el
                                  }}
                                  className="taskDetailsFileControl__native"
                                  type="file"
                                  accept="video/*"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0] ?? null
                                    if (!file) return
                                    const maxBytes = MAX_UPLOAD_VIDEO_MB * 1024 * 1024
                                    if (file.size > maxBytes) {
                                      setCompletionError(
                                        locale === 'ru'
                                          ? `Файл слишком большой (максимум ${MAX_UPLOAD_VIDEO_MB} МБ).`
                                          : `File is too large (max ${MAX_UPLOAD_VIDEO_MB} MB).`,
                                      )
                                      e.currentTarget.value = ''
                                      return
                                    }
                                    const mime = (file.type ?? '').trim()
                                    if (!mime.startsWith('video/')) {
                                      setCompletionError(t('task.completionUpload.invalid'))
                                      e.currentTarget.value = ''
                                      return
                                    }
                                    e.currentTarget.value = ''
                                    if (USE_API) {
                                      setUploadBusyByTarget((prev) => ({ ...prev, [target]: true }))
                                      void (async () => {
                                        try {
                                          const uploaded = await uploadFileToServer(file, file.name || 'video.mp4')
                                          setUploadVideos((prev) => ({
                                            ...prev,
                                            [target]: { kind: 'url', url: uploaded.url, name: file.name || 'video', mimeType: mime },
                                          }))
                                          setCompletionError(null)
                                        } catch (err) {
                                          const code = err instanceof Error ? err.message : 'upload_failed'
                                          const msg =
                                            code === 'payload_too_large'
                                              ? locale === 'ru'
                                                ? 'Файл слишком большой для сервера (HTTP 413). Нужно увеличить лимит загрузки в nginx (client_max_body_size).'
                                                : 'File is too large for the server (HTTP 413). Increase nginx upload limit (client_max_body_size).'
                                              : locale === 'ru'
                                                ? `Не удалось загрузить видео: ${code}`
                                                : `Failed to upload video: ${code}`
                                          setCompletionError(msg)
                                          setUploadVideos((prev) => ({ ...prev, [target]: null }))
                                        } finally {
                                          setUploadBusyByTarget((prev) => ({ ...prev, [target]: false }))
                                        }
                                      })()
                                      return
                                    }

                                    const blobId = createId('blob')
                                    void putBlob(blobId, file).then(() => {
                                      setUploadVideos((prev) => ({
                                        ...prev,
                                        [target]: { kind: 'idb', blobId, name: file.name || 'video', mimeType: mime },
                                      }))
                                      setCompletionError(null)
                                    })
                                  }}
                                />

                                {!current ? (
                                  <button
                                    type="button"
                                    className="taskDetailsFileControl__pick taskDetailsFileControl__pick--full"
                                    disabled={busy}
                                    onClick={() => uploadVideoInputRefs.current[target]?.click()}
                                  >
                                    {busy
                                      ? locale === 'ru'
                                        ? 'Загрузка…'
                                        : 'Uploading…'
                                      : locale === 'ru'
                                        ? 'Выбрать файл'
                                        : 'Choose file'}
                                  </button>
                                ) : (
                                  <>
                                    <div className="taskDetailsFileControl__text">
                                      <div className="taskDetailsFileControl__name">{current.name}</div>
                                    </div>

                                    <div className="taskDetailsFileControl__actions">
                                      <button
                                        type="button"
                                        className="taskDetailsFileControl__pick"
                                        disabled={busy}
                                        onClick={() => uploadVideoInputRefs.current[target]?.click()}
                                      >
                                        {locale === 'ru' ? 'Заменить' : 'Replace'}
                                      </button>

                                      {current.kind === 'url' ? (
                                        <a
                                          className="linkBtn taskDetailsFileControl__action"
                                          href={current.url}
                                          target="_blank"
                                          rel="noreferrer"
                                        >
                                          {locale === 'ru' ? 'Открыть' : 'Open'}
                                        </a>
                                      ) : null}
                                      <button
                                        type="button"
                                        className="taskDetailsFileControl__remove"
                                        onClick={() => setUploadVideos((prev) => ({ ...prev, [target]: null }))}
                                      >
                                        {locale === 'ru' ? 'Убрать' : 'Remove'}
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            </label>
                          )
                        })
                      : null}
                  <div className="taskDetailsCopyright">
                    <div className="taskDetailsCopyright__header">
                      <span className="taskDetailsCopyright__title">
                        <HelpTip
                          triggerLabel={
                            <span className="taskDetailsField__label">
                              {locale === 'ru' ? 'Авторские права' : 'Copyright'}
                            </span>
                          }
                          open={copyrightHelpOpen}
                          onToggle={() => setCopyrightHelpOpen((v) => !v)}
                          onClose={() => setCopyrightHelpOpen(false)}
                          ariaLabel={
                            locale === 'ru'
                              ? 'Подсказка: отказ от претензий на авторские права'
                              : 'Help: copyright waiver'
                          }
                          content={
                            locale === 'ru'
                              ? [
                                  'Отмечая эту галочку, вы подтверждаете, что не будете предъявлять заказчику или платформе претензии по авторским правам на переданный результат и не будете отправлять жалобы/страйки (например, DMCA) из‑за его использования.',
                                  '',
                                  'Что это даёт заказчику:',
                                  '- право использовать результат в рамках задания (публиковать, показывать в портфолио/соцсетях, использовать в рекламе, при необходимости — адаптировать/монтажировать).',
                                  '',
                                  'Важно:',
                                  '- вы подтверждаете, что у вас есть права или разрешения на все материалы, которые вы использовали (музыка, шрифты, стоковые видео/фото и т.п.).',
                                  '- эта галочка не отменяет оплату и не меняет условия задания — она относится только к правам на использование результата.',
                                  '',
                                  'Если вам нужны другие условия (например, запрет на публикацию до даты, обязательное указание авторства и т.д.) — согласуйте их с заказчиком до сдачи работы.',
                                ].join('\n')
                              : [
                                  'By checking this box, you confirm that you will not raise copyright claims against the client or the platform regarding the delivered work, and you will not file takedowns/strikes (e.g., DMCA) due to the client using it.',
                                  '',
                                  'What it allows the client to do:',
                                  '- use the deliverable within the scope of the task (publish it, show it in portfolio/social media, use it in advertising, and edit/adapt it if needed).',
                                  '',
                                  'Important:',
                                  '- you confirm you have the necessary rights/permissions for all included materials (music, fonts, stock footage/photos, etc.).',
                                  '- this does not affect payment or task terms — it only covers usage rights for the deliverable.',
                                  '',
                                  'If you need different terms (e.g., no public posting until a date, mandatory credit, etc.), agree them with the client before submitting.',
                                ].join('\n')
                          }
                        />
                      </span>
                    </div>
                    <label className="taskDetailsCopyright__check">
                      <input
                        className="taskDetailsCopyright__checkbox"
                        type="checkbox"
                        checked={copyrightWaiverAccepted}
                        onChange={(e) => {
                          const v = e.target.checked
                          setCopyrightWaiverAccepted(v)
                          if (v) setCompletionError(null)
                        }}
                        onBlur={() => setCopyrightWaiverTouched(true)}
                      />
                      <span className="taskDetailsCopyright__text">
                        {locale === 'ru'
                          ? 'Отказываюсь от претензий на авторские права на результат, передаваемый заказчику.'
                          : 'I waive copyright claims to the deliverable provided to the client.'}
                      </span>
                    </label>
                    {!copyrightWaiverAccepted && copyrightWaiverTouched ? (
                      <div className="taskDetailsError" style={{ marginTop: 6 }}>
                        {locale === 'ru'
                          ? 'Чтобы сдать работу, подтвердите этот пункт.'
                          : 'To submit, please confirm this item.'}
                      </div>
                    ) : null}
                  </div>
                  {completionError ? <div className="taskDetailsError">{completionError}</div> : null}
                  <button
                    type="button"
                    className="taskDetailsButton taskDetailsButton--primary"
                    onClick={() => {
                      setCopyrightWaiverTouched(true)
                      const ok = validateCompletionBeforeSubmit()
                      if (!ok) return
                      setSubmitConfirmOpen(true)
                    }}
                    disabled={completionButtonDisabled}
                  >
                    {t('task.actions.complete')}
                  </button>
                </div>
              </div>
            ) : null}

            {isPostedByMe && pauseRequestsForTask.length > 0 ? (
              <div className="taskDetailsSection">
                {pauseRequestsForTask.map((a) => {
                    const executor = users.find((u) => userIdMatches(u, a.executorId)) ?? null
                    const reasonLabel =
                      a.pauseReasonId === 'illness'
                        ? locale === 'ru'
                          ? 'Болезнь'
                          : 'Illness'
                        : a.pauseReasonId === 'family'
                          ? locale === 'ru'
                            ? 'Семейные обстоятельства'
                            : 'Family'
                          : a.pauseReasonId === 'force_majeure'
                            ? locale === 'ru'
                              ? 'Форс-мажор'
                              : 'Force majeure'
                            : null
                    return (
                      <div key={a.id} className="taskDetailsApplication">
                        <div className="taskDetailsApplication__header">
                          <div className="taskDetailsApplication__who">
                            <span className="taskDetailsApplication__avatar" aria-hidden="true">
                              {executor?.avatarDataUrl ? (
                                <img src={executor.avatarDataUrl} alt="" />
                              ) : (
                                <span className="taskDetailsApplication__avatarFallback">
                                  {(executor?.fullName ?? executor?.email ?? '?').trim().slice(0, 1).toUpperCase()}
                                </span>
                              )}
                            </span>
                            <div>
                              <strong className="taskDetailsApplication__name">
                                {(executor?.fullName || executor?.email || a.executorId || t('notifications.someone')).trim()}
                              </strong>
                              <span className="taskDetailsApplication__status">
                                {locale === 'ru' ? 'пауза запрошена' : 'pause requested'}
                              </span>
                            </div>
                          </div>
                          <div className="taskDetailsApplication__headerRight">
                            <Link
                              className="taskDetailsApplication__link"
                              to={userProfilePath(executor?.id ?? a.executorId)}
                              state={{ backTo: taskDetailsPath(id) }}
                            >
                              {t('notifications.viewProfile')}
                            </Link>
                            <div className="taskDetailsApplication__actions">
                              <button
                                type="button"
                                className="taskDetailsApplication__actionButton taskDetailsApplication__actionButton--primary"
                                disabled={isPauseDecisionBusy(a.id) || isPauseDecisionDone(a.id) || a.status !== 'pause_requested'}
                                onClick={() => {
                                  if (isPauseDecisionBusy(a.id) || isPauseDecisionDone(a.id) || a.status !== 'pause_requested') return
                                  // Prevent repeated decisions even if backend is idempotent or refresh lags.
                                  markPauseDecisionDone(a.id, true)
                                  markPauseDecisionBusy(a.id, true)
                                  if (USE_API) {
                                    void (async () => {
                                      try {
                                        await acceptPauseApi(a.id)
                                        await Promise.all([refreshAssignments(), refreshNotifications(), refreshTasks()])
                                        void notifyToTelegramAndUi({
                                          toast: toastUi,
                                          telegramUserId,
                                          email: userEmail,
                                          text: t('toast.pauseAccepted'),
                                          tone: 'success',
                                        })
                                      } catch (e) {
                                        // Rollback so user can retry.
                                        markPauseDecisionDone(a.id, false)
                                        const msg =
                                          e instanceof ApiError
                                            ? `${e.status ?? 'ERR'} ${String(e.message)}`
                                            : locale === 'ru'
                                              ? 'Не удалось принять паузу.'
                                              : 'Failed to accept pause.'
                                        void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, email: userEmail, text: msg, tone: 'error' })
                                      } finally {
                                        markPauseDecisionBusy(a.id, false)
                                      }
                                    })()
                                    return
                                  }
                                  taskAssignmentRepo.acceptPause(task.id, a.executorId)
                                  notificationRepo.addTaskPauseAccepted({
                                    recipientUserId: a.executorId,
                                    actorUserId: user.id,
                                    taskId: task.id,
                                  })
                                  void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, email: userEmail, text: t('toast.pauseAccepted'), tone: 'success' })
                                  markPauseDecisionBusy(a.id, false)
                                }}
                              >
                                {locale === 'ru' ? 'Принять паузу' : 'Accept pause'}
                              </button>
                              <button
                                type="button"
                                className="taskDetailsApplication__actionButton taskDetailsApplication__actionButton--danger"
                                onClick={() => {
                                  const msg =
                                    locale === 'ru'
                                      ? 'Сменить исполнителя? Текущее назначение будет отменено.'
                                      : 'Switch executor? Current assignment will be cancelled.'
                                  if (!confirm(msg)) return
                                  if (USE_API) {
                                    void (async () => {
                                      try {
                                        await switchExecutorApi(a.id)
                                        await Promise.all([
                                          refreshAssignments(),
                                          refreshTasks(),
                                          refreshContracts(),
                                          refreshApplications(),
                                          refreshNotifications(),
                                        ])
                                        void notifyToTelegramAndUi({
                                          toast: toastUi,
                                          telegramUserId,
                                          email: userEmail,
                                          text: locale === 'ru' ? 'Исполнитель снят с задания.' : 'Executor removed from the task.',
                                          tone: 'success',
                                        })
                                      } catch (e) {
                                        const msg =
                                          e instanceof ApiError
                                            ? `${e.status ?? 'ERR'} ${String(e.message)}`
                                            : locale === 'ru'
                                              ? 'Не удалось сменить исполнителя.'
                                              : 'Failed to switch executor.'
                                        void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, email: userEmail, text: msg, tone: 'error' })
                                      }
                                    })()
                                    return
                                  }

                                  taskAssignmentRepo.cancelByCustomer(task.id, a.executorId)
                                  const contract = contractRepo.getForTaskExecutor(task.id, a.executorId)
                                  if (contract) contractRepo.setStatus(contract.id, 'cancelled')
                                  const released = balanceFreezeRepo.release(task.id, a.executorId)
                                  if (released > 0 && task.createdByUserId) balanceRepo.deposit(task.createdByUserId, released)
                                  const app = applicationRepo.listForTask(task.id).find((x) => x.executorUserId === a.executorId)
                                  if (app && app.status !== 'rejected') applicationRepo.reject(app.id)
                                  taskRepo.removeExecutor(task.id, a.executorId)
                                  notificationRepo.addTaskApplicationCancelled({
                                    recipientUserId: a.executorId,
                                    actorUserId: user.id,
                                    taskId: task.id,
                                  })
                                }}
                              >
                                {locale === 'ru' ? 'Сменить исполнителя' : 'Switch executor'}
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="taskDetailsHint" style={{ whiteSpace: 'pre-line', opacity: 0.95, marginTop: 8 }}>
                          {reasonLabel ? (
                            <>
                              <strong>{locale === 'ru' ? 'Причина' : 'Reason'}:</strong> {reasonLabel}
                              {'\n'}
                            </>
                          ) : null}
                          {a.pauseComment ? (
                            <>
                              <strong>{locale === 'ru' ? 'Комментарий' : 'Comment'}:</strong> {a.pauseComment}
                              {'\n'}
                            </>
                          ) : null}
                          {a.pauseAutoAcceptAt ? (
                            <>
                              <strong>{locale === 'ru' ? 'Авто-принятие через' : 'Auto-accept in'}:</strong>{' '}
                              {formatTimeLeft(timeLeftMs(a.pauseAutoAcceptAt, nowMs), locale)}
                            </>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
              </div>
            ) : null}

          {canAttemptApplyBase ? (
            <div className="taskDetailsSection">
              <h2 className="taskDetailsSection__title">{t('task.actions.apply')}</h2>
              <div className="taskDetailsForm">
                {!respondGuard.ok ? (
                  <div className="taskDetailsHint" style={{ marginBottom: 10, whiteSpace: 'pre-line', opacity: 0.95 }}>
                    <strong>{locale === 'ru' ? 'Отклики недоступны' : 'Applications disabled'}</strong>
                    {'\n'}
                    {(() => {
                      if (respondGuard.reason === 'banned') {
                        return locale === 'ru'
                          ? 'Ваш аккаунт заблокирован. Отклики недоступны.'
                          : 'Your account is banned. You cannot apply.'
                      }
                      if (respondGuard.reason === 'blocked' && respondGuard.until) {
                        const left = timeLeftMs(respondGuard.until, nowMs)
                        return locale === 'ru'
                          ? `Отклики заблокированы. Осталось: ${formatTimeLeft(left, locale)}`
                          : `Applications are blocked. Time left: ${formatTimeLeft(left, locale)}`
                      }
                      return null
                    })()}
                  </div>
                ) : null}
                <textarea
                  className="taskDetailsField__textarea"
                  value={applicationMessage}
                  onChange={(e) => setApplicationMessage(e.target.value)}
                  placeholder={t('task.application.placeholder')}
                  rows={4}
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="taskDetailsButton taskDetailsButton--primary"
                  disabled={applying || !respondGuard.ok}
                  onClick={async () => {
                    if (!task.createdByUserId || !auth.user) return
                    if (!executorRestrictionRepo.canRespond(auth.user.id, Date.now()).ok) return
                    const msg = applicationMessage.trim()
                    setApplying(true)
                    try {
                      if (USE_API) {
                        const created = await api.post<any>(`/applications`, { taskId: id, message: msg || undefined })
                        upsertApplication(created)
                        await refreshApplications()
                      } else {
                        applicationRepo.create({
                          taskId: id,
                          executorUserId: auth.user.id,
                          message: msg || undefined,
                        })
                        notificationRepo.addTaskApplication({
                          recipientUserId: task.createdByUserId,
                          actorUserId: auth.user.id,
                          taskId: id,
                        })
                      }
                      setApplicationMessage('')
                      void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, email: userEmail, text: t('toast.applied'), tone: 'success' })
                    } catch (e) {
                      if (e instanceof ApiError && e.status === 401) {
                        void notifyToTelegramAndUi({
                          toast: toastUi,
                          telegramUserId,
                          email: userEmail,
                          text: locale === 'ru' ? 'Сессия истекла. Войдите снова.' : 'Session expired. Please sign in again.',
                          tone: 'error',
                        })
                        navigate(paths.login)
                      } else if (e instanceof ApiError && e.status === 403) {
                        const code =
                          e.payload && typeof e.payload === 'object' && 'error' in e.payload ? (e.payload as any).error : null
                        if (code === 'executor_banned') {
                          void notifyToTelegramAndUi({
                            toast: toastUi,
                            telegramUserId,
                            email: userEmail,
                            text:
                              locale === 'ru'
                                ? 'Ваш аккаунт заблокирован. Отклики недоступны.'
                                : 'Your account is banned. You cannot apply.',
                            tone: 'error',
                          })
                        } else if (
                          code === 'respond_blocked' &&
                          e.payload &&
                          typeof e.payload === 'object' &&
                          typeof (e.payload as any).until === 'string'
                        ) {
                          const untilIso = String((e.payload as any).until)
                          const left = timeLeftMs(untilIso, Date.now())
                          const untilLabel =
                            Number.isFinite(Date.parse(untilIso)) && untilIso.trim()
                              ? new Date(untilIso).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US')
                              : untilIso
                          void notifyToTelegramAndUi({
                            toast: toastUi,
                            telegramUserId,
                            email: userEmail,
                            text:
                              locale === 'ru'
                                ? `Отклики заблокированы до ${untilLabel}. Осталось: ${formatTimeLeft(left, locale)}`
                                : `Applications are blocked until ${untilLabel}. Time left: ${formatTimeLeft(left, locale)}`,
                            tone: 'error',
                          })
                        } else {
                          void notifyToTelegramAndUi({
                            toast: toastUi,
                            telegramUserId,
                            email: userEmail,
                            text: locale === 'ru' ? 'Отклик запрещён сервером.' : 'Applying is forbidden by server.',
                            tone: 'error',
                          })
                        }
                      } else {
                        void notifyToTelegramAndUi({
                          toast: toastUi,
                          telegramUserId,
                          email: userEmail,
                          text: locale === 'ru' ? 'Не удалось отправить отклик.' : 'Failed to apply.',
                          tone: 'error',
                        })
                      }
                    } finally {
                      setApplying(false)
                    }
                  }}
                >
                  {t('task.actions.apply')}
                </button>
              </div>
            </div>
          ) : null}

          {isPostedByMe && (taskApplications.length > 0 || overdueAssignments.length > 0 || hasReviewLikeContractsForTask) ? (
            <div className="taskDetailsSection">
              <div className="taskDetailsSectionHeader">
                <h2 className="taskDetailsSection__title">
                  {hasReviewLikeContractsForTask
                    ? locale === 'ru'
                      ? 'Материалы сдачи'
                      : 'Submission materials'
                    : t('task.applications.title')}
                </h2>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {hasReviewLikeContractsForTask ? <StatusPill tone="review" label={t('task.status.review')} /> : null}
                  {overdueAssignments.length > 0 ? <StatusPill tone="overdue" label={t('executor.status.overdue')} /> : null}
                </div>
              </div>
              {overdueAssignments.length > 0 ? (
                <div className="taskDetailsHint" style={{ whiteSpace: 'pre-line', opacity: 0.95 }}>
                  {locale === 'ru'
                    ? 'Исполнитель не сдал работу вовремя. Можно выбрать другого исполнителя.'
                    : 'Executor missed the execution timer. You can choose another executor.'}
                </div>
              ) : null}
              <div className="taskDetailsApplications">
                {taskApplications.map((app) => {
                  const executor = users.find((u) => u.id === app.executorUserId)
                  const contract = contracts.find((c) => c.taskId === id && c.executorId === app.executorUserId) ?? null
                  const assignment =
                    assignmentsForTask.find((a) => a.executorId === app.executorUserId) ?? null
                  const isReviewLikeContract = Boolean(contract && (contract.status === 'submitted' || contract.status === 'disputed'))
                  const dispute = contract ? disputes.find((d) => d.contractId === contract.id) ?? null : null
                  const latestForContract =
                    contract
                      ? submissions
                          .filter((s) => s.contractId === contract.id && s.status === 'submitted')
                          .slice()
                          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
                      : null
                  const submissionFromOverride = contract ? submissionsByContractId[contract.id] ?? null : null
                  const submission =
                    contract
                      ? (submissionFromOverride ??
                        (contract.lastSubmissionId ? submissions.find((s) => s.id === contract.lastSubmissionId) ?? null : null) ??
                        latestForContract)
                      : null
                  const submittedAt = submission?.createdAt ?? contract?.updatedAt ?? contract?.createdAt ?? null
                  const externalFiles = submission?.files.filter((f) => f.kind === 'external_url' || f.kind === 'upload') ?? []
                  const started = Boolean(
                    contract &&
                      (USE_API
                        ? assignment?.startedAt
                        : taskAssignmentRepo.getForTaskExecutor(contract.taskId, contract.executorId)?.startedAt),
                  )
                  const revisionIncluded = contract?.revisionIncluded ?? 0
                  const revisionUsed = contract?.revisionUsed ?? 0
                  const revisionRemaining = Math.max(0, revisionIncluded - revisionUsed)
                  const canShowRevisionButton = revisionRemaining > 0
                  const isCompletedContract = Boolean(
                    contract && (contract.status === 'approved' || contract.status === 'resolved'),
                  )
                  const statusKey =
                    app.status === 'selected'
                      ? isCompletedContract
                        ? 'task.status.closed'
                        : assignment?.status === 'overdue'
                          ? ('executor.status.overdue' as const)
                          : assignment?.status === 'paused'
                            ? 'executor.status.paused'
                            : assignment?.status === 'pause_requested'
                              ? 'executor.status.pauseRequested'
                              : contract?.status === 'revision_requested'
                                ? 'task.status.revisionRequested'
                                : contract?.status === 'submitted' || contract?.status === 'disputed'
                                  ? 'task.status.review'
                                  : assignment?.startedAt
                                    ? 'executor.status.inWork'
                                    : 'executor.status.approved'
                      : app.status === 'rejected'
                        ? 'task.status.closed'
                        : 'task.status.open'
                  const tone: StatusTone =
                    app.status === 'rejected'
                      ? 'closed'
                      : app.status === 'selected'
                        ? isCompletedContract
                          ? 'closed'
                          : assignment?.status === 'overdue'
                            ? 'overdue'
                            : assignment?.status === 'paused' || assignment?.status === 'pause_requested'
                              ? 'paused'
                              : contract?.status === 'revision_requested'
                                ? 'pending'
                                : contract?.status === 'submitted' || contract?.status === 'disputed'
                                  ? 'review'
                                  : assignment?.startedAt
                                    ? 'in_progress'
                                    : 'open'
                        : 'open'
                  const isSubmissionLike = Boolean(isReviewLikeContract)
                  return (
                    <div
                      key={app.id}
                      className={`taskDetailsApplication taskDetailsApplication--clickable${isReviewLikeContract ? ' taskDetailsApplication--review' : ''}`}
                      role={isSubmissionLike ? 'button' : 'link'}
                      tabIndex={0}
                      aria-label={isSubmissionLike ? (locale === 'ru' ? 'Открыть материалы сдачи' : 'Open submission') : t('notifications.viewProfile')}
                      onClick={(e) => {
                        const target = e.target
                        if (target instanceof HTMLElement) {
                          const interactive = target.closest('a,button,input,textarea,select,[role="button"]')
                          // Ignore clicks on nested interactive elements, but allow clicking the card itself.
                          if (interactive && interactive !== e.currentTarget) return
                        }
                        if (isSubmissionLike && contract) {
                          setSubmissionDetailsOpen({ contractId: contract.id, executorUserId: app.executorUserId })
                          return
                        }
                        navigate(userProfilePath(app.executorUserId), { state: { backTo: taskDetailsPath(id) } })
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          if (isSubmissionLike && contract) {
                            setSubmissionDetailsOpen({ contractId: contract.id, executorUserId: app.executorUserId })
                            return
                          }
                          navigate(userProfilePath(app.executorUserId), { state: { backTo: taskDetailsPath(id) } })
                        }
                      }}
                    >
                      <div className="taskDetailsApplication__header">
                        <div className="taskDetailsApplication__who">
                          <span className="taskDetailsApplication__avatar" aria-hidden="true">
                            {executor?.avatarDataUrl ? (
                              <img src={executor.avatarDataUrl} alt="" />
                            ) : (
                              <span className="taskDetailsApplication__avatarFallback">
                                {(executor?.fullName ?? executor?.email ?? '?').trim().slice(0, 1).toUpperCase()}
                              </span>
                            )}
                          </span>
                          <div>
                            <strong className="taskDetailsApplication__name">
                              {(executor?.fullName || executor?.email || app.executorUserId || t('notifications.someone')).trim()}
                            </strong>
                            <StatusPill tone={tone} label={t(statusKey)} className="taskDetailsApplication__statusPill" />
                          </div>
                        </div>
                        <div className="taskDetailsApplication__headerRight">
                          <Link
                            className="taskDetailsApplication__link"
                            to={userProfilePath(app.executorUserId)}
                            state={{ backTo: taskDetailsPath(id) }}
                          >
                            {t('notifications.viewProfile')}
                          </Link>

                          {app.status === 'selected' && assignment?.status === 'overdue' ? (
                            <div className="taskDetailsApplication__actions">
                              <button
                                type="button"
                                className="taskDetailsApplication__actionButton taskDetailsApplication__actionButton--primary"
                                onClick={() => {
                                  setChooseOtherPrompt({ executorId: app.executorUserId })
                                }}
                              >
                                {locale === 'ru' ? 'Выбрать другого исполнителя' : 'Choose another executor'}
                              </button>
                              {contract?.status === 'revision_requested' && (contract.revisionUsed ?? 0) >= 2 ? (
                                <button
                                  type="button"
                                  className="taskDetailsApplication__actionButton taskDetailsApplication__actionButton--danger"
                                  onClick={() => setOpenDisputePrompt({ executorId: app.executorUserId })}
                                >
                                  {locale === 'ru' ? 'Открыть спор' : 'Open dispute'}
                                </button>
                              ) : null}
                            </div>
                          ) : null}

                          {isReviewLikeContract && contract ? (
                            <div className="taskDetailsApplication__actions">
                              <button
                                type="button"
                                className="taskDetailsApplication__actionButton taskDetailsApplication__actionButton--primary"
                                onClick={() => {
                                  if (contract.status === 'disputed') {
                                    setBlockedModal({
                                      title: locale === 'ru' ? 'Нельзя принять работу' : 'Cannot approve',
                                      message:
                                        locale === 'ru'
                                          ? 'Пока открыт спор, принять работу нельзя. Перейдите в спор и дождитесь решения арбитра.'
                                          : 'You cannot approve while the dispute is open. Open the dispute and wait for arbitration.',
                                    })
                                    return
                                  }
                                  if (!started) {
                                    setBlockedModal({
                                      title: locale === 'ru' ? 'Нельзя принять работу' : 'Cannot approve',
                                      message:
                                        locale === 'ru'
                                          ? 'Нельзя принять работу, если исполнитель не нажал «Начать работу».'
                                          : 'Cannot approve unless the executor clicked “Start work”.',
                                    })
                                    return
                                  }
                                  approveReviewContract(contract.id)
                                }}
                                title={
                                  contract.status === 'disputed'
                                    ? (locale === 'ru' ? 'Недоступно во время спора' : 'Unavailable during dispute')
                                    : !started
                                      ? locale === 'ru'
                                        ? 'Исполнитель не нажал «Начать работу»'
                                        : 'Executor did not click “Start work”'
                                      : undefined
                                }
                                style={contract.status === 'disputed' || !started ? { opacity: 0.7 } : undefined}
                              >
                                {t('customerReview.approve')}
                              </button>
                              {canShowRevisionButton ? (
                                <button
                                  type="button"
                                  className="taskDetailsApplication__actionButton"
                                  onClick={() => setReviewRevisionModalContractId(contract.id)}
                                  disabled={contract.status === 'disputed'}
                                  title={
                                    contract.status === 'disputed'
                                      ? (locale === 'ru' ? 'Недоступно во время спора' : 'Unavailable during dispute')
                                      : undefined
                                  }
                                >
                                  {t('customerReview.revision')}
                                </button>
                              ) : null}
                              {(contract.revisionUsed ?? 0) >= 2 ? (
                                <button
                                  type="button"
                                  className="taskDetailsApplication__actionButton taskDetailsApplication__actionButton--danger"
                                  onClick={() => {
                                    if (contract.status === 'disputed') {
                                    const existing = USE_API
                                      ? disputes.find((d) => d.contractId === contract.id) ?? null
                                      : disputeRepo.getForContract(contract.id)
                                      if (existing) {
                                        navigate(disputeThreadPath(existing.id))
                                      } else {
                                        setBlockedModal({
                                          title: locale === 'ru' ? 'Спор' : 'Dispute',
                                          message:
                                            locale === 'ru'
                                              ? 'Спор уже открыт, но не удалось найти его в списке.'
                                              : 'The dispute is already open, but it was not found.',
                                        })
                                      }
                                      return
                                    }
                                    if (USE_API) {
                                      void (async () => {
                                        try {
                                          const created = await api.post<any>(`/disputes`, {
                                            contractId: contract.id,
                                            reason: { categoryId: 'universal', reasonId: 'other' },
                                          })
                                          await Promise.all([refreshDisputes(), refreshContracts(), refreshAssignments(), refreshTasks(), refreshNotifications()])
                                          const id = typeof created?.id === 'string' ? created.id : (disputes.find((d) => d.contractId === contract.id)?.id ?? null)
                                          if (id) navigate(disputeThreadPath(id))
                                        } catch (e) {
                                          const msg =
                                            e instanceof ApiError
                                              ? `${e.status ?? 'ERR'} ${String(e.message)}`
                                              : locale === 'ru'
                                                ? 'Не удалось открыть спор.'
                                                : 'Failed to open dispute.'
                                          void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, email: userEmail, text: msg, tone: 'error' })
                                        }
                                      })()
                                      return
                                    }
                                    const dispute = disputeRepo.open({
                                      contractId: contract.id,
                                      openedByUserId: user.id,
                                      reason: { categoryId: 'universal', reasonId: 'other' },
                                    })
                                    notificationRepo.addDisputeOpened({
                                      recipientUserId: contract.executorId,
                                      actorUserId: user.id,
                                      taskId: contract.taskId,
                                      disputeId: dispute.id,
                                    })
                                    contractRepo.setStatus(contract.id, 'disputed')
                                    taskAssignmentRepo.openDispute(contract.taskId, contract.executorId)
                                    recomputeTaskStatus(contract.taskId)
                                    navigate(disputeThreadPath(dispute.id))
                                  }}
                                  title={
                                    contract.status === 'disputed'
                                      ? locale === 'ru'
                                        ? 'Перейти в спор'
                                        : 'Open dispute'
                                      : undefined
                                  }
                                  style={contract.status === 'disputed' ? { opacity: 0.85 } : undefined}
                                >
                                  {contract.status === 'disputed'
                                    ? locale === 'ru'
                                      ? 'Перейти в спор'
                                      : 'Open dispute'
                                    : locale === 'ru'
                                      ? 'Спор'
                                      : 'Dispute'}
                                </button>
                              ) : null}
                            </div>
                          ) : null}

                          {app.status === 'pending' ? (
                            <div className="taskDetailsApplication__actions">
                              <button
                                type="button"
                                className="taskDetailsApplication__actionButton taskDetailsApplication__actionButton--primary"
                                onClick={() => handleAssignApplication(app.id)}
                                disabled={!canManageApplications || !slotsAvailable}
                              >
                                {t('task.actions.assign')}
                              </button>
                              <button
                                type="button"
                                className="taskDetailsApplication__actionButton taskDetailsApplication__actionButton--danger"
                                onClick={() => handleRejectApplication(app.id)}
                                disabled={!canManageApplications}
                              >
                                {t('task.actions.reject')}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                      {app.message ? (
                        <p className="taskDetailsApplication__message">{app.message}</p>
                      ) : null}

                      {isReviewLikeContract && submittedAt ? (
                        <div className="taskDetailsReviewMeta">
                          <div className="taskDetailsReviewMeta__label">{locale === 'ru' ? 'Отправлено' : 'Submitted'}</div>
                          <div className="taskDetailsReviewMeta__value">
                            {new Date(submittedAt).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US')}
                          </div>

                          {submission?.message?.trim() ? (
                            <>
                              <div className="taskDetailsReviewMeta__label">{locale === 'ru' ? 'Сообщение' : 'Message'}</div>
                              <div className="taskDetailsReviewMeta__value taskDetailsReviewMeta__message">{submission.message}</div>
                            </>
                          ) : null}

                          {contract?.status === 'disputed' ? (
                            <>
                              <div className="taskDetailsReviewMeta__label">{locale === 'ru' ? 'Спор' : 'Dispute'}</div>
                              <div className="taskDetailsReviewMeta__value">
                                {locale === 'ru' ? 'Открыт' : 'Opened'}
                                {dispute?.reason?.reasonId ? ` (${dispute.reason.reasonId})` : ''}
                              </div>
                            </>
                          ) : null}

                          {externalFiles.length ? (
                            <>
                              <div className="taskDetailsReviewMeta__label">
                                {externalFiles.some((f) => f.kind === 'upload') ? t('task.completionDeliverable') : t('task.completionLink')}
                              </div>
                              <div className="taskDetailsReviewMeta__value">
                                <div className="taskDetailsChips">
                                  {externalFiles.map((f, idx) => (
                                    f.kind === 'upload' && f.url.startsWith('idb:') ? (
                                      <button
                                        key={`${f.url}-${idx}`}
                                        type="button"
                                        className="taskDetailsChip"
                                        title={locale === 'ru' ? 'Скачать файл' : 'Download file'}
                                        onClick={() => {
                                          const blobId = f.url.slice('idb:'.length)
                                          const name = (f.title ?? '').trim() || 'video'
                                          void (async () => {
                                            const blob = await getBlob(blobId)
                                            if (!blob) {
                                              void notifyToTelegramAndUi({
                                                toast: toastUi,
                                                telegramUserId,
                                                email: userEmail,
                                                text:
                                                  locale === 'ru'
                                                    ? 'Этот файл доступен только на устройстве исполнителя (локальная загрузка). Для продакшена нужен серверный upload.'
                                                    : 'This file is only available on the executor device (local upload). Production needs a server upload endpoint.',
                                                tone: 'error',
                                              })
                                              return
                                            }
                                            downloadBlob(name, blob)
                                          })()
                                        }}
                                      >
                                        <Icon name="film" size={16} className="iconInline" />
                                        {f.title ? f.title : t('task.completionDeliverable')}
                                      </button>
                                    ) : (
                                      <a
                                        key={`${f.url}-${idx}`}
                                        href={f.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="taskDetailsChip"
                                        title={f.url}
                                      >
                                        <Icon name="film" size={16} className="iconInline" />
                                        {f.title ? f.title : t('task.completionLink')}
                                      </a>
                                    )
                                  ))}
                                </div>
                              </div>
                            </>
                          ) : null}
                        </div>
                      ) : null}

                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

            {hasBottomActions ? (
              <div
                className={`taskDetailsActions${
                  isDraftPublishStep
                    ? ' taskDetailsActions--draft'
                    : showSingleDeleteCta
                      ? ' taskDetailsActions--singleDanger'
                      : ''
                }`}
              >
                {isDraftPublishStep ? (
                  <>
                    <button
                      type="button"
                      className="taskDetailsButton taskDetailsButton--primary"
                      onClick={handleFinalPublish}
                    >
                      {t('task.create.publish')}
                    </button>
                    {!fromCreateDraft ? (
                      <>
                        <button
                          type="button"
                          className="taskDetailsButton"
                          onClick={() =>
                            navigate(paths.taskCreate, { state: { draft: task, backTo: draftEditBackTo } })
                          }
                        >
                          {t('task.details.edit')}
                        </button>
                        <button
                          type="button"
                          className="taskDetailsButton taskDetailsButton--danger"
                          onClick={() => {
                            requestDelete(draftEditBackTo)
                          }}
                        >
                          {t('task.actions.delete')}
                        </button>
                      </>
                    ) : null}
                  </>
                ) : showSingleDeleteCta ? (
                  <button
                    type="button"
                    className="taskDetailsButton taskDetailsButton--danger"
                    onClick={() => {
                      requestDelete(paths.customerTasks)
                    }}
                  >
                    {t('task.actions.delete')}
                  </button>
                ) : (
                  <>
                    {canDelete ? (
                      <button
                        type="button"
                        className="taskDetailsButton taskDetailsButton--danger"
                        onClick={() => {
                          requestDelete(auth.user?.role === 'customer' ? paths.customerTasks : paths.tasks)
                        }}
                      >
                        {t('task.actions.delete')}
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {submitConfirmOpen ? (
        <div
          className="submitDoneOverlay"
          role="dialog"
          aria-modal="true"
          aria-label={locale === 'ru' ? 'Подтверждение отправки работы' : 'Confirm submission'}
          onClick={() => setSubmitConfirmOpen(false)}
        >
          <div className="submitDoneModal" onClick={(e) => e.stopPropagation()}>
            <h3 className="submitDoneModal__title">
              {locale === 'ru' ? 'Подтверждение отправки работы' : 'Confirm submission'}
            </h3>
            <p className="submitDoneModal__text" style={{ whiteSpace: 'pre-line' }}>
              {locale === 'ru'
                ? [
                    'Перед отправкой подтвердите, что работа выполнена в полном объёме и соответствует требованиям задания, а также замечаниям заказчика (если они были).',
                    '',
                    'После отправки вы не сможете изменить сообщение и ссылки до тех пор, пока заказчик не запросит доработку.',
                  ].join('\n')
                : [
                    'Before submitting, please confirm that the work is fully completed and matches the task requirements and the client’s feedback (if any).',
                    '',
                    'After submission, you won’t be able to change the message or links until the client requests a revision.',
                  ].join('\n')}
            </p>
            <div className="submitDoneModal__actions">
              <button
                type="button"
                className="submitDoneModal__primary"
                onClick={() => {
                  setSubmitConfirmOpen(false)
                  submitCompletion()
                }}
              >
                {locale === 'ru' ? 'Подтвердить и отправить заказчику' : 'Confirm and send to client'}
              </button>
              <button type="button" className="submitDoneModal__secondary" onClick={() => setSubmitConfirmOpen(false)}>
                {locale === 'ru' ? 'Вернуться к редактированию' : 'Back to editing'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* After submit: confirmation only (rating is allowed only after approval / after dispute). */}
      {submittedModalOpen ? (
        <div
          className="submitDoneOverlay"
          role="dialog"
          aria-modal="true"
          aria-label={locale === 'ru' ? 'Задание сдано' : 'Submitted'}
          onClick={() => setSubmittedModalOpen(false)}
        >
          <div className="submitDoneModal" onClick={(e) => e.stopPropagation()}>
            <h3 className="submitDoneModal__title">{locale === 'ru' ? 'Задание сдано' : 'Submitted'}</h3>
            <p className="submitDoneModal__text">
              {locale === 'ru'
                ? 'Работа отправлена заказчику на проверку. Он примет её или попросит доработку — вы получите уведомление.'
                : 'Your work was sent to the client for review. They will approve it or request a revision — you will get a notification.'}
            </p>
            <div className="submitDoneModal__actions">
              <button type="button" className="submitDoneModal__primary" onClick={() => setSubmittedModalOpen(false)}>
                {locale === 'ru' ? 'Ок' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {openSubmission && openSubmissionContract ? (
        <div className="taskDetailsSubmitOverlay" role="dialog" aria-modal="true" onClick={() => setSubmissionDetailsOpen(null)}>
          <div className="taskDetailsSubmitModal" onClick={(e) => e.stopPropagation()}>
            <div className="taskDetailsSubmitModal__header">
              <div>
                <div className="taskDetailsSubmitModal__title">{locale === 'ru' ? 'Материалы сдачи' : 'Submission materials'}</div>
                <div className="taskDetailsSubmitModal__sub">
                  {openSubmissionExecutor?.fullName
                    ? openSubmissionExecutor.fullName
                    : openSubmission.executorUserId}
                </div>
              </div>
              <button type="button" className="taskDetailsSubmitModal__close" onClick={() => setSubmissionDetailsOpen(null)} aria-label={t('common.cancel')}>
                ×
              </button>
            </div>

            <div className="taskDetailsSubmitModal__body">
              {openSubmissionValue?.message?.trim() ? (
                <div className="taskDetailsSubmitModal__message">{openSubmissionValue.message}</div>
              ) : null}

              {openSubmissionFiles.length ? (
                <div className="taskDetailsSubmitFiles">
                  {openSubmissionFiles.map((f, idx) => {
                    const meta = parseSubmissionTitle(f.title)
                    return (
                      <div key={`${f.url}-${idx}`} className="taskDetailsSubmitFiles__row">
                        <div className="taskDetailsSubmitFiles__left">
                          {meta.platform ? <div className="taskDetailsSubmitFiles__platform">{meta.platform}</div> : null}
                          <div className="taskDetailsSubmitFiles__name">{meta.name || f.url}</div>
                        </div>
                        <button type="button" className="taskDetailsSubmitFiles__download" onClick={() => void downloadSubmissionFile(f)}>
                          {locale === 'ru' ? 'Скачать' : 'Download'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div style={{ opacity: 0.75, fontSize: 13 }}>
                  {locale === 'ru' ? 'Файлы не найдены.' : 'No files found.'}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {deleteConfirmOpen ? (
        <div
          className="submitDoneOverlay"
          role="dialog"
          aria-modal="true"
          aria-label={t('task.actions.delete')}
          onClick={() => setDeleteConfirmOpen(false)}
        >
          <div className="submitDoneModal" onClick={(e) => e.stopPropagation()}>
            <h3 className="submitDoneModal__title">{t('task.actions.delete')}</h3>
            <p className="submitDoneModal__text">{t('task.actions.deleteConfirm')}</p>
            <div className="submitDoneModal__actions">
              <button
                type="button"
                className="submitDoneModal__secondary"
                onClick={() => setDeleteConfirmOpen(false)}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="submitDoneModal__primary"
                onClick={() => {
                  taskRepo.delete(id)
                  setDeleteConfirmOpen(false)
                  navigate(deleteAfterPath ?? (auth.user?.role === 'customer' ? paths.customerTasks : paths.tasks))
                }}
              >
                {t('task.actions.delete')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {insufficientBalanceOpen ? (
        <div
          className="submitDoneOverlay"
          role="dialog"
          aria-modal="true"
          aria-label={locale === 'ru' ? 'Недостаточно средств' : 'Insufficient funds'}
          onClick={() => setInsufficientBalanceOpen(false)}
        >
          <div className="submitDoneModal" onClick={(e) => e.stopPropagation()}>
            <h3 className="submitDoneModal__title">{locale === 'ru' ? 'Недостаточно средств' : 'Insufficient funds'}</h3>
            <p className="submitDoneModal__text">{t('profile.balance.insufficient')}</p>
            <div className="submitDoneModal__actions">
              <button type="button" className="submitDoneModal__secondary" onClick={() => setInsufficientBalanceOpen(false)}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="submitDoneModal__primary"
                onClick={() => {
                  setInsufficientBalanceOpen(false)
                  navigate(`${paths.profile}?tab=balance`)
                }}
              >
                {t('profile.balance.add')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <RatingModal
        open={rateCustomerOpen}
        title={locale === 'ru' ? 'Оценка заказчика' : 'Rate client'}
        subjectName={author?.fullName}
        onClose={() => setRateCustomerOpen(false)}
        onSubmit={({ rating, comment }) => {
          if (!auth.user || auth.user.role !== 'executor') return
          const toUserId = task?.createdByUserId
          if (!toUserId) return
          if (!myContract) return
          if (!canRateCustomerNow) {
            const msg =
              locale === 'ru'
                ? 'Нельзя оценить заказчика до принятия задания или завершения спора.'
                : 'You cannot rate the customer before the task is approved or the dispute is finished.'
            alert(msg)
            return
          }
          if (USE_API) {
            void (async () => {
              try {
                await createRatingApi({ contractId: myContract.id, toUserId, rating, comment })
                await Promise.all([refreshRatings(), refreshNotifications()])
                void notifyToTelegramAndUi({
                  toast: toastUi,
                  telegramUserId,
                  email: userEmail,
                  text: locale === 'ru' ? 'Оценка отправлена.' : 'Rating submitted.',
                  tone: 'success',
                })
              } catch (e) {
                const msg =
                  e instanceof ApiError
                    ? `${e.status ?? 'ERR'} ${String(e.message)}`
                    : locale === 'ru'
                      ? 'Не удалось отправить оценку.'
                      : 'Failed to submit rating.'
                void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, email: userEmail, text: msg, tone: 'error' })
                return
              } finally {
                setRateCustomerOpen(false)
              }
            })()
            return
          }
          ratingRepo.upsert({
            contractId: myContract.id,
            fromUserId: auth.user.id,
            toUserId,
            rating,
            comment,
          })
          setRateCustomerOpen(false)
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

      {chooseOtherPrompt ? (
        <div
          className="profileModalOverlay"
          role="dialog"
          aria-modal="true"
          aria-label={locale === 'ru' ? 'Подтверждение' : 'Confirmation'}
          onClick={() => setChooseOtherPrompt(null)}
        >
          <div className="profileModal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(560px, 100%)' }}>
            <div className="profileModalHeader">
              <h2 className="profileModalTitle">{locale === 'ru' ? 'Выбрать другого исполнителя' : 'Choose another executor'}</h2>
              <button type="button" className="profileModalClose" onClick={() => setChooseOtherPrompt(null)} aria-label={t('common.cancel')}>
                ×
              </button>
            </div>

            <div style={{ opacity: 0.92, lineHeight: 1.5 }}>
              {locale === 'ru'
                ? 'Отменить назначение и снова открыть задание для выбора другого исполнителя?'
                : 'Cancel this assignment and reopen the task to choose another executor?'}
            </div>

            <div className="profileConfirmActions" style={{ marginTop: 14 }}>
              <button type="button" className="profileBtn profileBtn--ghost" onClick={() => setChooseOtherPrompt(null)}>
                {locale === 'ru' ? 'Отмена' : 'Cancel'}
              </button>
              <button
                type="button"
                className="profileBtn profileBtn--danger"
                onClick={() => {
                  if (!task.createdByUserId) return
                  const executorId = chooseOtherPrompt.executorId
                  setChooseOtherPrompt(null)

                  taskAssignmentRepo.cancelByCustomer(task.id, executorId)
                  const contract = contractRepo.getForTaskExecutor(task.id, executorId)
                  if (contract) contractRepo.setStatus(contract.id, 'cancelled')
                  const released = balanceFreezeRepo.release(task.id, executorId)
                  if (released > 0) balanceRepo.deposit(task.createdByUserId, released)
                  const selectedApp = applicationRepo.listForTask(task.id).find((x) => x.executorUserId === executorId)
                  if (selectedApp && selectedApp.status !== 'rejected') applicationRepo.reject(selectedApp.id)
                  taskRepo.removeExecutor(task.id, executorId)
                }}
              >
                {locale === 'ru' ? 'Выбрать' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {openDisputePrompt ? (
        <div
          className="profileModalOverlay"
          role="dialog"
          aria-modal="true"
          aria-label={locale === 'ru' ? 'Подтверждение' : 'Confirmation'}
          onClick={() => setOpenDisputePrompt(null)}
        >
          <div className="profileModal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(560px, 100%)' }}>
            <div className="profileModalHeader">
              <h2 className="profileModalTitle">{locale === 'ru' ? 'Открыть спор' : 'Open dispute'}</h2>
              <button type="button" className="profileModalClose" onClick={() => setOpenDisputePrompt(null)} aria-label={t('common.cancel')}>
                ×
              </button>
            </div>

            <div style={{ opacity: 0.92, lineHeight: 1.5 }}>
              {locale === 'ru'
                ? 'Открыть спор по просрочке после доработки?'
                : 'Open a dispute due to missed deadline after a revision request?'}
            </div>

            <div className="profileConfirmActions" style={{ marginTop: 14 }}>
              <button type="button" className="profileBtn profileBtn--ghost" onClick={() => setOpenDisputePrompt(null)}>
                {locale === 'ru' ? 'Отмена' : 'Cancel'}
              </button>
              <button
                type="button"
                className="profileBtn profileBtn--danger"
                onClick={() => {
                  const executorId = openDisputePrompt.executorId
                  setOpenDisputePrompt(null)

                  const contract = contractRepo.getForTaskExecutor(task.id, executorId)
                  if (!contract) return
                  if ((contract.revisionUsed ?? 0) < 2) return

                  // Keep the same safety check as before: dispute only if there was some activity.
                  const hasActivity = submissionRepo
                    .listForContract(contract.id)
                    .some((s) => s.status === 'submitted' && ((s.files?.length ?? 0) > 0 || Boolean(s.message?.trim())))
                  if (!hasActivity) {
                    alert(
                      locale === 'ru'
                        ? 'Спор можно открыть только если была активность: файлы/сообщение и есть просрочка.'
                        : 'Dispute can be opened only if there was activity (files/message) and the task is overdue.',
                    )
                    return
                  }

                  if (USE_API) {
                    void (async () => {
                      try {
                        const created = await api.post<any>(`/disputes`, {
                          contractId: contract.id,
                          reason: { categoryId: 'quality', reasonId: 'miss_deadline' },
                        })
                        await Promise.all([refreshDisputes(), refreshContracts(), refreshAssignments(), refreshTasks(), refreshNotifications()])
                        const id = typeof created?.id === 'string' ? created.id : (disputes.find((d) => d.contractId === contract.id)?.id ?? null)
                        if (id) navigate(disputeThreadPath(id))
                      } catch (e) {
                        const msg =
                          e instanceof ApiError
                            ? `${e.status ?? 'ERR'} ${String(e.message)}`
                            : locale === 'ru'
                              ? 'Не удалось открыть спор.'
                              : 'Failed to open dispute.'
                        void notifyToTelegramAndUi({ toast: toastUi, telegramUserId, email: userEmail, text: msg, tone: 'error' })
                      }
                    })()
                    return
                  }

                  disputeRepo.open({
                    contractId: contract.id,
                    openedByUserId: user.id,
                    reason: { categoryId: 'quality', reasonId: 'miss_deadline' },
                  })
                  const dispute = disputeRepo.getForContract(contract.id)
                  if (dispute) {
                    notificationRepo.addDisputeOpened({
                      recipientUserId: executorId,
                      actorUserId: user.id,
                      taskId: task.id,
                      disputeId: dispute.id,
                    })
                    navigate(disputeThreadPath(dispute.id))
                  }
                  contractRepo.setStatus(contract.id, 'disputed')
                  taskAssignmentRepo.openDispute(task.id, executorId)
                  recomputeTaskStatus(task.id)
                }}
              >
                {locale === 'ru' ? 'Открыть' : 'Open'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {blockedModal ? (
        <div
          className="profileModalOverlay"
          role="dialog"
          aria-modal="true"
          aria-label={blockedModal.title}
          onClick={() => setBlockedModal(null)}
        >
          <div className="profileModal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(560px, 100%)' }}>
            <div className="profileModalHeader">
              <h2 className="profileModalTitle">{blockedModal.title}</h2>
              <button type="button" className="profileModalClose" onClick={() => setBlockedModal(null)} aria-label={t('common.cancel')}>
                ×
              </button>
            </div>
            <div style={{ opacity: 0.92, lineHeight: 1.5 }}>{blockedModal.message}</div>
            <div className="profileConfirmActions" style={{ marginTop: 14 }}>
              <button type="button" className="profileBtn" onClick={() => setBlockedModal(null)}>
                {locale === 'ru' ? 'Ок' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <RevisionRequestModal
        open={Boolean(reviewRevisionModalContractId)}
        executorName={(() => {
          const c = reviewRevisionModalContractId ? contracts.find((x) => x.id === reviewRevisionModalContractId) ?? null : null
          const u = c ? users.find((x) => x.id === c.executorId) ?? null : null
          return u?.fullName
        })()}
        onClose={() => setReviewRevisionModalContractId(null)}
        onSubmit={(message) => {
          if (!reviewRevisionModalContractId) return
          void requestReviewRevision(reviewRevisionModalContractId, message)
          setReviewRevisionModalContractId(null)
        }}
      />
    </main>
  )
}

