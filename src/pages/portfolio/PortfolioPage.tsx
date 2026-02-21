import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { taskDetailsPath, worksPath } from '@/app/router/paths'
import { useI18n } from '@/shared/i18n/I18nContext'
import { useAuth } from '@/shared/auth/AuthContext'
import { useTasks } from '@/entities/task/lib/useTasks'
import { useWorks } from '@/entities/work/lib/useWorks'
import { fetchUserById, useUsers } from '@/entities/user/lib/useUsers'
import { pickText } from '@/entities/task/lib/taskText'
import { VideoEmbed } from '@/shared/ui/VideoEmbed'
import { workRepo } from '@/entities/work/lib/workRepo'
import { migrateLocalWorks } from '@/entities/work/lib/workMigration'
import type { TranslationKey } from '@/shared/i18n/translations'
import { AddWorksModal } from '@/features/work/AddWorksModal'
import './portfolio.css'
import { StatusPill } from '@/shared/ui/status-pill/StatusPill'
import { useContracts } from '@/entities/contract/lib/useContracts'

function initials(fullName: string) {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const a = parts[0]?.[0] ?? ''
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : ''
  return (a + b).toUpperCase() || 'U'
}

function statusLabel(status: string, t: (key: TranslationKey) => string) {
  if (status === 'open') return t('task.status.open')
  if (status === 'in_progress') return t('task.status.inProgress')
  if (status === 'review') return t('task.status.review')
  if (status === 'dispute') return t('task.status.dispute')
  if (status === 'closed') return t('task.status.closed')
  return status.replace('_', ' ')
}

function isExternalUrl(url?: string) {
  if (!url) return false
  return url.startsWith('http://') || url.startsWith('https://')
}

export function PortfolioPage() {
  const { t, locale } = useI18n()
  const auth = useAuth()
  const { userId } = useParams<{ userId: string }>()
  const users = useUsers()
  const works = useWorks(userId ?? null)
  const tasks = useTasks()
  const contracts = useContracts()

  const owner = userId ? users.find((u) => u.id === userId) ?? null : null
  const [ownerFetchTried, setOwnerFetchTried] = useState(false)

  useEffect(() => {
    const id = String(userId ?? '').trim()
    if (!id) return
    if (owner) return
    // In API mode, the user list might not include arbitrary profiles by default.
    setOwnerFetchTried(true)
    void fetchUserById(id).catch(() => {})
  }, [owner, userId])

  const completedMeta = useMemo(() => {
    if (!owner) return { list: [], doneAtByTaskId: new Map<string, string>(), completedTaskIds: new Set<string>() }

    // "Completed for customer" means there exists at least one contract
    // for this customer with status approved/resolved.
    const relevant = contracts.filter((c) => {
      if (c.status !== 'approved' && c.status !== 'resolved') return false
      return owner.role === 'executor' ? c.executorId === owner.id : c.clientId === owner.id
    })

    const doneAtByTaskId = new Map<string, string>()
    for (const c of relevant) {
      const prev = doneAtByTaskId.get(c.taskId) ?? ''
      const ts = c.updatedAt || c.createdAt
      if (!prev || ts.localeCompare(prev) > 0) doneAtByTaskId.set(c.taskId, ts)
    }

    const completedTaskIds = new Set<string>(relevant.map((c) => c.taskId))

    const list = tasks
      .filter((task) => {
        if (!completedTaskIds.has(task.id)) return false
        // Safety: ensure task belongs to the profile owner.
        return owner.role === 'executor'
          ? task.assignedExecutorIds.includes(owner.id)
          : task.createdByUserId === owner.id
      })
      .slice()
      .sort((a, b) => {
        const aDone = doneAtByTaskId.get(a.id) ?? a.completedAt ?? a.createdAt
        const bDone = doneAtByTaskId.get(b.id) ?? b.completedAt ?? b.createdAt
        return bDone.localeCompare(aDone)
      })

    return { list, doneAtByTaskId, completedTaskIds }
  }, [contracts, owner, tasks])

  const completedTasks = completedMeta.list

  const isExecutor = owner?.role === 'executor'
  const isOwner = Boolean(auth.user && owner && auth.user.id === owner.id)
  const canEditPortfolio = isOwner && owner?.role === 'executor'

  const externalWorks = useMemo(() => {
    if (!isExecutor) return []
    return works
      .filter((work) => isExternalUrl(work.mediaUrl ?? work.videoUrl))
      .slice()
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
  }, [isExecutor, works])

  const carouselWorks = useMemo(() => {
    if (!isExecutor) return []
    return works.filter((work) => {
      const url = work.mediaUrl ?? work.videoUrl
      if (!url) return false
      return !isExternalUrl(url)
    })
  }, [isExecutor, works])

  const [carouselIndex, setCarouselIndex] = useState(0)
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [workOverlayId, setWorkOverlayId] = useState<string | null>(null)
  const [overlayVideoPlaying, setOverlayVideoPlaying] = useState(false)
  const [overlayVideoControls, setOverlayVideoControls] = useState(false)
  const [carouselPlayingWorkId, setCarouselPlayingWorkId] = useState<string | null>(null)
  const [carouselControlsWorkId, setCarouselControlsWorkId] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const overlayWork = workOverlayId ? carouselWorks.find((w) => w.id === workOverlayId) ?? null : null

  const trackRef = useRef<HTMLDivElement | null>(null)
  const slideRefs = useRef<Array<HTMLDivElement | null>>([])
  const snappingRef = useRef(false)
  const snapTimerRef = useRef<number | null>(null)
  const videoByWorkIdRef = useRef<Map<string, HTMLVideoElement>>(new Map())
  const overlayVideoRef = useRef<HTMLVideoElement | null>(null)
  const overlaySourceVideoRef = useRef<HTMLVideoElement | null>(null)

  // Portfolio editor (only for owner-executor)
  const [isWorksOpen, setIsWorksOpen] = useState(false)
  const [serverAvailable, setServerAvailable] = useState(false)
  const [migrationError, setMigrationError] = useState<string | null>(null)
  const migratedUsersRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const activeId = carouselWorks[carouselIndex]?.id ?? null

    // When switching slides, hide controls of the previously played video.
    if (carouselControlsWorkId && carouselControlsWorkId !== activeId) {
      setCarouselControlsWorkId(null)
    }
    if (carouselPlayingWorkId && carouselPlayingWorkId !== activeId) {
      setCarouselPlayingWorkId(null)
    }

    // Best-effort: pause videos that are not active.
    for (const [id, el] of videoByWorkIdRef.current) {
      if (activeId && id === activeId) continue
      try {
        el.pause()
      } catch {
        // ignore
      }
    }
  }, [carouselControlsWorkId, carouselIndex, carouselPlayingWorkId, carouselWorks])

  useEffect(() => {
    if (!canEditPortfolio) return
    let canceled = false
    const base = import.meta.env.VITE_API_BASE ?? '/api'
    const checkServer = async () => {
      try {
        const res = await fetch(`${base}/health`)
        if (!canceled) setServerAvailable(res.ok)
      } catch {
        if (!canceled) setServerAvailable(false)
      }
    }
    checkServer()
    const interval = window.setInterval(checkServer, 30_000)
    return () => {
      canceled = true
      window.clearInterval(interval)
    }
  }, [canEditPortfolio])

  useEffect(() => {
    if (!canEditPortfolio || !owner || !serverAvailable || migratedUsersRef.current.has(owner.id)) return
    let canceled = false
    migrateLocalWorks(owner.id)
      .then((result) => {
        if (canceled) return
        if (!result.migrated) return
        setMigrationError(null)
      })
      .catch(() => {
        if (canceled) return
        setMigrationError(t('profile.workMigrationFailed'))
      })
      .finally(() => {
        if (!canceled) migratedUsersRef.current.add(owner.id)
      })
    return () => {
      canceled = true
    }
  }, [canEditPortfolio, owner, serverAvailable, t])

  useEffect(() => {
    // Clamp when list changes
    if (!carouselWorks.length) {
      setCarouselIndex(0)
      return
    }
    setCarouselIndex((prev) => Math.min(Math.max(prev, 0), carouselWorks.length - 1))
  }, [carouselWorks.length])

  useEffect(() => {
    if (!overlayWork) return
    setOverlayVideoPlaying(false)
    setOverlayVideoControls(false)
    setEditMode(false)
    setEditTitle(overlayWork.title ?? '')
    setEditDescription(overlayWork.description ?? '')
    setEditBusy(false)
    setEditError(null)
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isEditing =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)

      if (e.key === 'Escape') {
        closeOverlay()
        return
      }

      if (
        !isEditing &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
      ) {
        if (overlayWork.mediaType === 'photo') return
        const v = overlayVideoRef.current
        if (!v) return
        e.preventDefault()
        const step = 5
        const delta = e.key === 'ArrowLeft' ? -step : step
        const duration = Number.isFinite(v.duration) ? v.duration : null
        const next = v.currentTime + delta
        const clamped = duration != null ? Math.min(duration, Math.max(0, next)) : Math.max(0, next)
        try {
          v.currentTime = clamped
        } catch {
          // ignore
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [overlayWork])

  useEffect(() => {
    if (!overlayWork || overlayWork.mediaType === 'photo') return
    const srcVideo = overlaySourceVideoRef.current
    const overlayVideo = overlayVideoRef.current
    if (!overlayVideo) return

    const applySync = () => {
      if (!srcVideo) return
      if (Number.isFinite(srcVideo.currentTime)) {
        try {
          overlayVideo.currentTime = srcVideo.currentTime
        } catch {
          // ignore
        }
      }
      overlayVideo.muted = srcVideo.muted
      overlayVideo.volume = srcVideo.volume
      overlayVideo.playbackRate = srcVideo.playbackRate

      const shouldPlay = !srcVideo.paused
      srcVideo.pause()
      if (shouldPlay) void overlayVideo.play().catch(() => {})
      else overlayVideo.pause()
    }

    if (overlayVideo.readyState >= 1) applySync()
    else {
      overlayVideo.addEventListener('loadedmetadata', applySync, { once: true })
      return () => overlayVideo.removeEventListener('loadedmetadata', applySync)
    }
  }, [overlayWork?.id, overlayWork?.mediaType])

  function closeOverlay() {
    const srcVideo = overlaySourceVideoRef.current
    const overlayVideo = overlayVideoRef.current
    if (srcVideo && overlayVideo) {
      if (Number.isFinite(overlayVideo.currentTime)) {
        try {
          srcVideo.currentTime = overlayVideo.currentTime
        } catch {
          // ignore
        }
      }
      srcVideo.muted = overlayVideo.muted
      srcVideo.volume = overlayVideo.volume
      srcVideo.playbackRate = overlayVideo.playbackRate

      const shouldPlay = !overlayVideo.paused
      if (shouldPlay) void srcVideo.play().catch(() => {})
      else srcVideo.pause()
    }
    overlayVideoRef.current = null
    overlaySourceVideoRef.current = null
    setOverlayVideoPlaying(false)
    setOverlayVideoControls(false)
    setEditMode(false)
    setEditBusy(false)
    setEditError(null)
    setWorkOverlayId(null)
  }

  const scrollToIndex = (index: number, behavior: ScrollBehavior = 'smooth') => {
    const track = trackRef.current
    const slide = slideRefs.current[index]
    if (!track || !slide) return
    const left = slide.offsetLeft + slide.offsetWidth / 2 - track.clientWidth / 2
    track.scrollTo({ left, behavior })
  }

  const goTo = (index: number) => {
    if (!carouselWorks.length) return
    const next = Math.min(Math.max(index, 0), carouselWorks.length - 1)
    if (next === carouselIndex) {
      scrollToIndex(next)
      return
    }
    setCarouselIndex(next)
    snappingRef.current = true
    if (snapTimerRef.current !== null) window.clearTimeout(snapTimerRef.current)
    scrollToIndex(next)
    snapTimerRef.current = window.setTimeout(() => {
      snappingRef.current = false
      snapTimerRef.current = null
    }, 420)
  }

  const onTrackScroll = () => {
    if (snappingRef.current) return
    const track = trackRef.current
    if (!track || slideRefs.current.length === 0) return
    const trackCenterX = track.scrollLeft + track.clientWidth / 2
    let bestIdx = 0
    let bestDist = Number.POSITIVE_INFINITY
    for (let i = 0; i < slideRefs.current.length; i++) {
      const slide = slideRefs.current[i]
      if (!slide) continue
      const center = slide.offsetLeft + slide.offsetWidth / 2
      const d = Math.abs(center - trackCenterX)
      if (d < bestDist) {
        bestDist = d
        bestIdx = i
      }
    }
    if (bestIdx !== carouselIndex) setCarouselIndex(bestIdx)
  }

  const showPrev = () => {
    if (!carouselWorks.length) return
    const nextIndex = carouselIndex <= 0 ? carouselWorks.length - 1 : carouselIndex - 1
    goTo(nextIndex)
  }

  const showNext = () => {
    if (!carouselWorks.length) return
    const nextIndex = carouselIndex >= carouselWorks.length - 1 ? 0 : carouselIndex + 1
    goTo(nextIndex)
  }

  const toggleTaskDetails = (taskId: string) => {
    setExpandedTaskId((prev) => (prev === taskId ? null : taskId))
  }

  const deleteWork = async (workId: string) => {
    if (!canEditPortfolio) return
    const ok = window.confirm(t('profile.workDeleteConfirm'))
    if (!ok) return
    try {
      await workRepo.delete(workId)
      if (workOverlayId === workId) setWorkOverlayId(null)
    } catch {
      // no-op (repo broadcasts on success; errors are non-critical UI-wise)
    }
  }

  if (!owner) {
    if (userId && !ownerFetchTried) {
      return (
        <main className="portfolioPage">
          <div className="portfolioHeader">
            <div>
              <h1 className="portfolioTitle">{locale === 'ru' ? 'Загрузка…' : 'Loading…'}</h1>
              <p className="portfolioSubtitle" style={{ opacity: 0.8 }}>
                {locale === 'ru' ? 'Открываем профиль.' : 'Opening profile.'}
              </p>
            </div>
          </div>
        </main>
      )
    }
    return (
      <main className="portfolioPage">
        <div className="portfolioHeader">
          <div>
            <h1 className="portfolioTitle">{t('portfolio.notFoundTitle')}</h1>
            <p className="portfolioSubtitle">{t('portfolio.notFoundHint')}</p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="portfolioPage">
      <div className="portfolioHeader">
        <div className="portfolioHeaderLeft">
          <div className="portfolioAvatar" aria-hidden={Boolean(owner.avatarDataUrl)}>
            {owner.avatarDataUrl ? (
              <img className="portfolioAvatarImg" src={owner.avatarDataUrl} alt={owner.fullName} />
            ) : (
              <div className="portfolioAvatarFallback" aria-hidden="true">
                {initials(owner.fullName)}
              </div>
            )}
          </div>
          <div>
            <h1 className="portfolioTitle">{owner.fullName}</h1>
            <p className="portfolioSubtitle">{t('portfolio.subtitle')}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {canEditPortfolio ? (
            <button
              type="button"
              className="portfolioBackLink"
              onClick={() => setIsWorksOpen(true)}
            >
              {t('profile.addWorks')}
            </button>
          ) : null}
        </div>
      </div>

      {isExecutor ? (
        <section className="portfolioCarousel">
          <div className="portfolioCarousel__media">
            {carouselWorks.length === 0 ? (
              <div className="portfolioCarousel__empty">{t('portfolio.noWorks')}</div>
            ) : (
              <div
                className="portfolioCarousel__viewport"
                tabIndex={0}
                aria-label={t('portfolio.carouselTitle')}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft') {
                    e.preventDefault()
                    showPrev()
                  } else if (e.key === 'ArrowRight') {
                    e.preventDefault()
                    showNext()
                  }
                }}
              >
                <div className="portfolioCarousel__fade portfolioCarousel__fade--left" aria-hidden="true" />
                <div className="portfolioCarousel__fade portfolioCarousel__fade--right" aria-hidden="true" />

                <div
                  className={`portfolioCarousel__track${carouselWorks.length === 1 ? ' portfolioCarousel__track--single' : ''}`}
                  ref={trackRef}
                  onScroll={onTrackScroll}
                >
                  {carouselWorks.map((work, index) => (
                    <div
                      key={work.id}
                      className={`portfolioCarousel__slide${index === carouselIndex ? ' portfolioCarousel__slide--active' : ''}`}
                      ref={(el) => {
                        slideRefs.current[index] = el
                      }}
                      onClick={() => {
                        goTo(index)
                        if (work.mediaType === 'photo') {
                          overlaySourceVideoRef.current = null
                          setOverlayVideoPlaying(false)
                          setOverlayVideoControls(false)
                          setWorkOverlayId(work.id)
                        }
                      }}
                      role="group"
                      aria-label={`${index + 1} / ${carouselWorks.length}`}
                    >
                      <div className="portfolioCarousel__slideInner">
                        {work.mediaType === 'photo' ? (
                          <img
                            src={work.mediaUrl ?? work.videoUrl}
                            alt={work.title}
                            className="portfolioCarousel__image"
                            loading="lazy"
                          />
                        ) : (
                          <div
                            className={`portfolioVideo${carouselPlayingWorkId === work.id ? ' portfolioVideo--playing' : ''}`}
                          >
                            <button
                              type="button"
                              className="portfolioVideo__openBtn"
                              title={locale === 'ru' ? 'Открыть в оверлее' : 'Open in overlay'}
                              aria-label={locale === 'ru' ? 'Открыть в оверлее' : 'Open in overlay'}
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                overlaySourceVideoRef.current = videoByWorkIdRef.current.get(work.id) ?? null
                                setOverlayVideoPlaying(false)
                                setOverlayVideoControls(false)
                                setWorkOverlayId(work.id)
                              }}
                            >
                              <svg
                                className="portfolioVideo__openIcon"
                                viewBox="0 0 24 24"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                                aria-hidden="true"
                              >
                                <path
                                  d="M9 3H5a2 2 0 0 0-2 2v4"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                />
                                <path
                                  d="M15 3h4a2 2 0 0 1 2 2v4"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                />
                                <path
                                  d="M21 15v4a2 2 0 0 1-2 2h-4"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                />
                                <path
                                  d="M3 15v4a2 2 0 0 0 2 2h4"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                />
                              </svg>
                            </button>
                            <VideoEmbed
                              src={work.mediaUrl ?? work.videoUrl ?? ''}
                              controls={carouselControlsWorkId === work.id}
                              videoRef={(el) => {
                                const map = videoByWorkIdRef.current
                                if (el) map.set(work.id, el)
                                else map.delete(work.id)
                              }}
                              onPlay={() => {
                                setCarouselPlayingWorkId(work.id)
                                setCarouselControlsWorkId(work.id)
                              }}
                              onPause={() => setCarouselPlayingWorkId(null)}
                              onEnded={() => setCarouselPlayingWorkId(null)}
                            />
                            {index === carouselIndex ? (
                              <button
                                type="button"
                                className="portfolioVideo__playBtn"
                                aria-label={locale === 'ru' ? 'Воспроизвести' : 'Play'}
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  setCarouselControlsWorkId(work.id)

                                  // Pause any other inline videos (best-effort).
                                  for (const [k, el] of videoByWorkIdRef.current) {
                                    if (k === work.id) continue
                                    try {
                                      el.pause()
                                    } catch {
                                      // ignore
                                    }
                                  }

                                  const v = videoByWorkIdRef.current.get(work.id) ?? null
                                  if (!v) return
                                  void v.play().catch(() => {})
                                }}
                              />
                            ) : null}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {carouselWorks.length > 1 ? (
                  <>
                    <button
                      type="button"
                      className="portfolioCarousel__navBtn portfolioCarousel__navBtn--prev"
                      onClick={showPrev}
                      aria-label={t('portfolio.carouselPrev')}
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      className="portfolioCarousel__navBtn portfolioCarousel__navBtn--next"
                      onClick={showNext}
                      aria-label={t('portfolio.carouselNext')}
                    >
                      →
                    </button>
                  </>
                ) : null}
              </div>
            )}
          </div>
        </section>
      ) : null}

      {overlayWork ? (
        <div
          className="portfolioWorkOverlay"
          role="dialog"
          aria-modal="true"
          aria-label={overlayWork.title}
          onClick={() => closeOverlay()}
        >
          <div className="portfolioWorkOverlay__modal" onClick={(e) => e.stopPropagation()}>
            <div className="portfolioWorkOverlay__header">
              <div className="portfolioWorkOverlay__titleWrap">
                <div className="portfolioWorkOverlay__kicker">{t('profile.workShowcase')}</div>
                {editMode ? (
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder={locale === 'ru' ? 'Название работы' : 'Work title'}
                    style={{
                      width: 'min(560px, 100%)',
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      background: 'var(--card2)',
                      color: 'var(--text)',
                      outline: 'none',
                      fontSize: 16,
                      fontWeight: 700,
                    }}
                  />
                ) : (
                  <h3 className="portfolioWorkOverlay__title">{overlayWork.title}</h3>
                )}
              </div>
              <div className="portfolioWorkOverlay__headerActions">
                {canEditPortfolio ? (
                  <>
                    <button
                      type="button"
                      className="portfolioWorkOverlay__edit"
                      onClick={() => {
                        if (!editMode) {
                          setEditError(null)
                          setEditTitle(overlayWork.title ?? '')
                          setEditDescription(overlayWork.description ?? '')
                          setEditMode(true)
                          return
                        }
                        // Save
                        void (async () => {
                          if (!overlayWork) return
                          const nextTitle = editTitle.trim()
                          if (!nextTitle) {
                            setEditError(locale === 'ru' ? 'Название не может быть пустым.' : 'Title cannot be empty.')
                            return
                          }
                          setEditBusy(true)
                          setEditError(null)
                          try {
                            await workRepo.update(overlayWork.id, { title: nextTitle, description: editDescription })
                            setEditMode(false)
                          } catch (e) {
                            setEditError(
                              locale === 'ru'
                                ? 'Не удалось сохранить. Проверь, что сервер запущен.'
                                : 'Failed to save. Make sure the server is running.',
                            )
                          } finally {
                            setEditBusy(false)
                          }
                        })()
                      }}
                      disabled={editBusy}
                      title={
                        editMode
                          ? locale === 'ru'
                            ? 'Сохранить'
                            : 'Save'
                          : locale === 'ru'
                            ? 'Редактировать'
                            : 'Edit'
                      }
                      aria-label={
                        editMode
                          ? locale === 'ru'
                            ? 'Сохранить'
                            : 'Save'
                          : locale === 'ru'
                            ? 'Редактировать'
                            : 'Edit'
                      }
                    >
                      {editMode ? (locale === 'ru' ? 'Сохранить' : 'Save') : locale === 'ru' ? 'Редактировать' : 'Edit'}
                    </button>

                    {editMode ? (
                      <button
                        type="button"
                        className="portfolioWorkOverlay__edit"
                        style={{ background: 'transparent', opacity: 0.9 }}
                        onClick={() => {
                          setEditError(null)
                          setEditBusy(false)
                          setEditMode(false)
                          setEditTitle(overlayWork.title ?? '')
                          setEditDescription(overlayWork.description ?? '')
                        }}
                        disabled={editBusy}
                      >
                        {locale === 'ru' ? 'Отмена' : 'Cancel'}
                      </button>
                    ) : null}

                    <button
                      type="button"
                      className="portfolioWorkOverlay__delete"
                      onClick={() => deleteWork(overlayWork.id)}
                      disabled={editBusy}
                    >
                      {t('profile.workDelete')}
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className="portfolioWorkOverlay__close"
                  onClick={() => closeOverlay()}
                  aria-label={t('common.cancel')}
                >
                  ×
                </button>
              </div>
            </div>
            <div className="portfolioWorkOverlay__content">
              <div className="portfolioWorkOverlay__media">
                {overlayWork.mediaType === 'photo' ? (
                  <img
                    src={overlayWork.mediaUrl ?? overlayWork.videoUrl}
                    alt={overlayWork.title}
                    className="portfolioWorkOverlay__image"
                    loading="lazy"
                  />
                ) : (
                  <div className="portfolioWorkOverlay__video">
                    <div className={`portfolioVideo${overlayVideoPlaying ? ' portfolioVideo--playing' : ''}`}>
                      <VideoEmbed
                        src={overlayWork.mediaUrl ?? overlayWork.videoUrl ?? ''}
                        controls={overlayVideoControls}
                        videoRef={overlayVideoRef}
                        onPlay={() => setOverlayVideoPlaying(true)}
                        onPause={() => setOverlayVideoPlaying(false)}
                        onEnded={() => setOverlayVideoPlaying(false)}
                      />
                      <button
                        type="button"
                        className="portfolioVideo__playBtn"
                        aria-label={locale === 'ru' ? 'Воспроизвести' : 'Play'}
                        onClick={() => {
                          setOverlayVideoControls(true)
                          const v = overlayVideoRef.current
                          if (!v) return
                          if (v.paused) void v.play().catch(() => {})
                          else v.pause()
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
              <aside className="portfolioWorkOverlay__details">
                {editError ? (
                  <div style={{ color: 'rgba(239, 68, 68, 0.95)', fontSize: 13, fontWeight: 600 }}>{editError}</div>
                ) : null}
                {editMode ? (
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder={locale === 'ru' ? 'Описание (необязательно)…' : 'Description (optional)…'}
                    rows={6}
                    style={{
                      width: '100%',
                      resize: 'vertical',
                      padding: '10px 12px',
                      borderRadius: 12,
                      border: '1px solid var(--border)',
                      background: 'var(--card2)',
                      color: 'var(--text)',
                      outline: 'none',
                      fontSize: 13,
                      lineHeight: 1.5,
                    }}
                  />
                ) : overlayWork.description?.trim() ? (
                  <p className="portfolioWorkOverlay__description">{overlayWork.description}</p>
                ) : (
                  <p className="portfolioWorkOverlay__description" style={{ opacity: 0.6 }}>
                    {t('profile.workNoDescription')}
                  </p>
                )}
                <div className="portfolioWorkOverlay__meta">
                  {overlayWork.createdAt ? <span>{new Date(overlayWork.createdAt).toLocaleDateString()}</span> : null}
                  {(overlayWork.mediaUrl ?? overlayWork.videoUrl) ? (
                    <a href={overlayWork.mediaUrl ?? overlayWork.videoUrl} target="_blank" rel="noreferrer">
                      {t('profile.videoLink')}
                    </a>
                  ) : null}
                </div>
              </aside>
            </div>
          </div>
        </div>
      ) : null}

      {isExecutor && externalWorks.length > 0 ? (
        <section className="portfolioLinks">
          <div className="portfolioLinks__header">
            <div>
              <p className="portfolioLinks__label">{t('portfolio.externalWorksTitle')}</p>
            </div>
            <span className="portfolioLinks__count">{externalWorks.length}</span>
          </div>
          <ul className="portfolioLinksList">
            {externalWorks.map((work) => {
              const url = work.mediaUrl ?? work.videoUrl ?? ''
              return (
                <li key={work.id} className="portfolioLinksItem">
                  <div className="portfolioLinksItem__top">
                    <div className="portfolioLinksItem__titleWrap">
                      <h3 className="portfolioLinksItem__title">{work.title}</h3>
                      {work.createdAt ? (
                        <span className="portfolioLinksItem__date">{new Date(work.createdAt).toLocaleDateString()}</span>
                      ) : null}
                    </div>
                    <div className="portfolioLinksItem__actions">
                      {canEditPortfolio ? (
                        <button
                          type="button"
                          className="portfolioLinksItem__delete"
                          onClick={() => deleteWork(work.id)}
                        >
                          {t('profile.workDelete')}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {work.description?.trim() ? (
                    <p className="portfolioLinksItem__desc">{work.description}</p>
                  ) : (
                    <p className="portfolioLinksItem__desc portfolioLinksItem__desc--empty">{t('profile.workNoDescription')}</p>
                  )}
                  <a className="portfolioLinksItem__url" href={url} target="_blank" rel="noreferrer" title={url}>
                    {url}
                  </a>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      <section className="portfolioTasks">
        <div className="portfolioTasks__header">
          <div>
            <p className="portfolioTasks__label">
              {t('portfolio.completedTasksTitle')}{' '}
              <span className="portfolioTasks__countInline">({completedTasks.length})</span>
            </p>
            <p className="portfolioTasks__subtitle">
              {owner.role === 'executor' ? t('portfolio.executorCompletedHint') : t('portfolio.customerCompletedHint')}
            </p>
          </div>
        </div>
        {completedTasks.length === 0 ? (
          <div className="portfolioEmpty">{t('portfolio.completedTasksNone')}</div>
        ) : (
          <ul className="portfolioTasksList">
            {completedTasks.map((task) => {
              const assignedUserId = task.assignedExecutorIds[0] ?? null
              const assignedUser = assignedUserId ? users.find((u) => u.id === assignedUserId) ?? null : null
              const author =
                task.createdByUserId && task.createdByUserId !== owner.id
                  ? users.find((u) => u.id === task.createdByUserId) ?? null
                  : null

              const isExpanded = expandedTaskId === task.id
              const completedByContract = completedMeta.completedTaskIds.has(task.id)
              const doneAt = completedMeta.doneAtByTaskId.get(task.id) ?? task.completedAt ?? null

              return (
                <li key={task.id} className="portfolioTasksItem">
                  <button
                    type="button"
                    className="portfolioTasksItem__summary"
                    onClick={() => toggleTaskDetails(task.id)}
                  >
                    <div className="portfolioTasksItem__summaryMain">
                      <h3 className="portfolioTasksItem__title">{pickText(task.title, locale)}</h3>
                      <StatusPill
                        tone={completedByContract ? 'closed' : task.status}
                        label={completedByContract ? t('task.status.closed') : statusLabel(task.status, t)}
                        className="portfolioTasksItem__statusPill"
                      />
                    </div>
                    <span className="portfolioTasksItem__toggle">
                      {isExpanded ? t('portfolio.hideDetails') : t('portfolio.showDetails')}
                    </span>
                  </button>

                  {isExpanded ? (
                    <div className="portfolioTasksItem__details">
                      <div className="portfolioTasksItem__block">
                        <div className="portfolioTasksItem__blockTitle">
                          {locale === 'ru' ? 'Описание' : 'Description'}
                        </div>
                        <div className="portfolioTasksItem__text">
                          {pickText(task.description, locale) ? pickText(task.description, locale) : '—'}
                        </div>
                      </div>

                      <div className="portfolioTasksItem__block">
                        <div className="portfolioTasksItem__blockTitle">
                          {locale === 'ru' ? 'Детали' : 'Details'}
                        </div>
                        <div className="portfolioTasksItem__kv">
                          {doneAt ? (
                            <div className="portfolioTasksItem__kvRow">
                              <span className="portfolioTasksItem__kvKey">{t('profile.stats.completed')}</span>
                              <span className="portfolioTasksItem__kvValue">{new Date(doneAt).toLocaleDateString()}</span>
                            </div>
                          ) : null}
                          {task.dueDate ? (
                            <div className="portfolioTasksItem__kvRow">
                              <span className="portfolioTasksItem__kvKey">{t('tasks.due')}</span>
                              <span className="portfolioTasksItem__kvValue">{task.dueDate}</span>
                            </div>
                          ) : null}
                          <div className="portfolioTasksItem__kvRow">
                            <span className="portfolioTasksItem__kvKey">{t('task.meta.assigned')}</span>
                            <span className="portfolioTasksItem__kvValue">
                              {task.assignedExecutorIds.length}/{task.maxExecutors ?? 1}
                            </span>
                          </div>
                          {owner.role === 'customer' && assignedUser ? (
                            <div className="portfolioTasksItem__kvRow">
                              <span className="portfolioTasksItem__kvKey">{t('profile.takenBy')}</span>
                              <span className="portfolioTasksItem__kvValue portfolioTasksItem__person">
                                <Link to={worksPath(assignedUser.id)}>{assignedUser.fullName}</Link>
                              </span>
                            </div>
                          ) : null}
                          {owner.role === 'executor' && author ? (
                            <div className="portfolioTasksItem__kvRow">
                              <span className="portfolioTasksItem__kvKey">{t('task.meta.postedBy')}</span>
                              <span className="portfolioTasksItem__kvValue portfolioTasksItem__person">
                                <Link to={worksPath(author.id)}>{author.fullName}</Link>
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="portfolioTasksItem__block">
                        <div className="portfolioTasksItem__blockTitle">
                          {locale === 'ru' ? 'Ссылки' : 'Links'}
                        </div>
                        <div className="portfolioTasksItem__links">
                          {task.completionVideoUrl ? (
                            <a
                              className="portfolioTasksItem__completion"
                              href={task.completionVideoUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {t('portfolio.completionLinkLabel')}
                            </a>
                          ) : (
                            <span className="portfolioTasksItem__completionDisabled">
                              {t('portfolio.noCompletionLink')}
                            </span>
                          )}
                          <Link className="portfolioTasksItem__detailsLink" to={taskDetailsPath(task.id)}>
                            {t('portfolio.viewTask')}
                          </Link>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {canEditPortfolio ? (
        <AddWorksModal
          open={isWorksOpen}
          ownerId={owner.id}
          serverAvailable={serverAvailable}
          migrationError={migrationError}
          onClose={() => setIsWorksOpen(false)}
        />
      ) : null}
    </main>
  )
}
