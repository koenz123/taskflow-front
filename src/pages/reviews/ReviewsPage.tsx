import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { paths, taskDetailsPath, userProfilePath, userReviewsPath } from '@/app/router/paths'
import { useAuth } from '@/shared/auth/AuthContext'
import { useI18n } from '@/shared/i18n/I18nContext'
import { useUsers } from '@/entities/user/lib/useUsers'
import { useRatings } from '@/entities/rating/lib/useRatings'
import { useContracts } from '@/entities/contract/lib/useContracts'
import { useTasks } from '@/entities/task/lib/useTasks'
import { useSubmissions } from '@/entities/submission/lib/useSubmissions'
import { pickText } from '@/entities/task/lib/taskText'
import { Pagination } from '@/shared/ui/pagination/Pagination'
import { getBlob } from '@/shared/lib/blobStore'
import './reviews.css'
import { Icon } from '@/shared/ui/icon/Icon'

type ReviewVM = {
  id: string
  createdAt: string
  rating: number
  comment?: string
  fromUser: { id: string; fullName: string; avatarDataUrl?: string } | null
  task: {
    id: string
    title: string
    category?: string
    location?: string
    budgetAmount?: number
    budgetCurrency?: string
    dueDate?: string
    completionVideoUrl?: string
  } | null
  contractStatus?: string
  submission?: {
    createdAt: string
    message?: string
    files: Array<{ url: string; title?: string }>
  } | null
}

function Stars(props: { value: number }) {
  const v = Math.max(1, Math.min(5, Math.round(props.value)))
  return (
    <span className="reviewStars" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, idx) => {
        const active = idx + 1 <= v
        return <Icon key={idx} name="star" size={16} className={active ? 'reviewStar reviewStar--on' : 'reviewStar'} />
      })}
    </span>
  )
}

function formatBudget(amount?: number, currency?: string) {
  if (!amount) return null
  return `${amount} ${currency ?? ''}`.trim()
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

function contractStatusLabel(status: string | undefined, locale: 'ru' | 'en') {
  if (!status) return null
  if (locale === 'ru') {
    if (status === 'approved') return 'Выполнено'
    if (status === 'submitted') return 'На проверке'
    if (status === 'revision_requested') return 'Нужна доработка'
    if (status === 'disputed') return 'Спор'
    if (status === 'resolved') return 'Решено'
    if (status === 'cancelled') return 'Отменено'
    if (status === 'active') return 'В работе'
    return status
  }
  // en
  if (status === 'approved') return 'Completed'
  if (status === 'submitted') return 'Submitted'
  if (status === 'revision_requested') return 'Revision requested'
  if (status === 'disputed') return 'Disputed'
  if (status === 'resolved') return 'Resolved'
  if (status === 'cancelled') return 'Cancelled'
  if (status === 'active') return 'Active'
  return status
}

export function ReviewsPage() {
  const { t, locale } = useI18n()
  const auth = useAuth()
  const { userId } = useParams()
  const location = useLocation()
  const users = useUsers()
  const ratings = useRatings()
  const contracts = useContracts()
  const tasks = useTasks()
  const submissions = useSubmissions()

  const targetUserId = userId ?? auth.user?.id ?? null

  const backTo =
    (location.state as { backTo?: string } | null | undefined)?.backTo && typeof (location.state as any).backTo === 'string'
      ? ((location.state as any).backTo as string)
      : targetUserId && auth.user?.id === targetUserId
        ? paths.profile
        : targetUserId
          ? userProfilePath(targetUserId)
          : paths.home

  const contractsById = useMemo(() => new Map(contracts.map((c) => [c.id, c])), [contracts])
  const tasksById = useMemo(() => new Map(tasks.map((x) => [x.id, x])), [tasks])
  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])

  const latestSubmissionByContractId = useMemo(() => {
    const map = new Map<string, (typeof submissions)[number]>()
    for (const s of submissions) {
      if (s.status !== 'submitted') continue
      const prev = map.get(s.contractId)
      if (!prev || s.createdAt.localeCompare(prev.createdAt) > 0) map.set(s.contractId, s)
    }
    return map
  }, [submissions])

  const reviews = useMemo<ReviewVM[]>(() => {
    if (!targetUserId) return []

    const list = ratings
      .filter((r) => r.toUserId === targetUserId)
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    return list.map((r) => {
      const from = usersById.get(r.fromUserId) ?? null
      const contract = contractsById.get(r.contractId) ?? null
      const task = contract ? (tasksById.get(contract.taskId) ?? null) : null
      const sub = latestSubmissionByContractId.get(r.contractId) ?? null

      return {
        id: r.id,
        createdAt: r.createdAt,
        rating: r.rating,
        comment: r.comment,
        fromUser: from
          ? { id: from.id, fullName: from.fullName ?? from.email ?? t('notifications.someone'), avatarDataUrl: from.avatarDataUrl }
          : null,
        task: task
          ? {
              id: task.id,
              title: pickText(task.title, locale),
              category: task.category,
              location: task.location,
              budgetAmount: task.budgetAmount,
              budgetCurrency: task.budgetCurrency,
              dueDate: task.dueDate,
              completionVideoUrl: task.completionVideoUrl,
            }
          : null,
        contractStatus: contract?.status,
        submission: sub
          ? {
              createdAt: sub.createdAt,
              message: sub.message,
              files: (sub.files ?? []).map((f) => ({ url: f.url, title: f.title })),
            }
          : null,
      }
    })
  }, [contractsById, latestSubmissionByContractId, locale, ratings, t, targetUserId, tasksById, usersById])

  const PAGE_SIZE = 20
  const [page, setPage] = useState(1)
  const listRef = useRef<HTMLDivElement | null>(null)
  const prevPageRef = useRef<number | null>(null)

  const pageCount = useMemo(() => Math.max(1, Math.ceil(reviews.length / PAGE_SIZE)), [reviews.length])
  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return reviews.slice(start, start + PAGE_SIZE)
  }, [page, reviews])

  useEffect(() => setPage(1), [targetUserId])
  useEffect(() => setPage((p) => Math.min(Math.max(1, p), pageCount)), [pageCount])

  useEffect(() => {
    if (prevPageRef.current === null) {
      prevPageRef.current = page
      return
    }
    if (prevPageRef.current === page) return
    prevPageRef.current = page
    window.requestAnimationFrame(() => {
      listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [page])

  if (!targetUserId) {
    return (
      <main className="reviewsPage">
        <div className="reviewsContainer">
          <h1 className="reviewsTitle">{locale === 'ru' ? 'Отзывы' : 'Reviews'}</h1>
          <p>
            <Link to={paths.login}>{t('auth.signIn')}</Link>
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="reviewsPage">
      <div className="reviewsContainer">
        <div className="reviewsHeader">
          <div className="reviewsHeader__left">
            <h1 className="reviewsTitle">
              {locale === 'ru' ? 'Отзывы' : 'Reviews'}
              <span className="reviewsTitle__count">({reviews.length})</span>
            </h1>
            <div className="reviewsSubtitle">
              {locale === 'ru'
                ? 'Здесь собраны оценки и комментарии, привязанные к выполненным заданиям.'
                : 'Ratings and comments linked to completed tasks.'}
            </div>
          </div>
          <div className="reviewsHeader__right">
            <Link className="reviewsBackLink" to={backTo}>
              ← {locale === 'ru' ? 'Назад' : 'Back'}
            </Link>
          </div>
        </div>

        {reviews.length === 0 ? (
          <div className="reviewsEmpty">{locale === 'ru' ? 'Пока нет отзывов.' : 'No reviews yet.'}</div>
        ) : (
          <div ref={listRef} className="reviewsList">
            {paged.map((r) => {
              const statusLabel = contractStatusLabel(r.contractStatus, locale)
              const createdLabel = new Date(r.createdAt).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US')
              const submissionDate = r.submission?.createdAt
                ? new Date(r.submission.createdAt).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US')
                : null
              const budget = r.task ? formatBudget(r.task.budgetAmount, r.task.budgetCurrency) : null

              return (
                <article key={r.id} className="reviewCard">
                  <div className="reviewCard__top">
                    <div className="reviewCard__rating" aria-label={locale === 'ru' ? `Оценка ${r.rating} из 5` : `Rating ${r.rating} of 5`}>
                      <Stars value={r.rating} /> <span className="reviewCard__ratingNum">{r.rating}/5</span>
                    </div>
                    <div className="reviewCard__date">{createdLabel}</div>
                  </div>

                  <div className="reviewCard__who">
                    {r.fromUser ? (
                      <Link className="reviewCard__user" to={userProfilePath(r.fromUser.id)} state={{ backTo: userId ? userReviewsPath(userId) : paths.reviews }}>
                        <span className="reviewCard__avatar" aria-hidden="true">
                          {r.fromUser.avatarDataUrl ? <img src={r.fromUser.avatarDataUrl} alt="" /> : <span className="reviewCard__avatarFallback">{r.fromUser.fullName.trim().slice(0, 1).toUpperCase()}</span>}
                        </span>
                        <span className="reviewCard__userName">{r.fromUser.fullName}</span>
                      </Link>
                    ) : (
                      <span className="reviewCard__userName">{t('notifications.someone')}</span>
                    )}
                  </div>

                  {r.comment ? <div className="reviewCard__comment">“{r.comment}”</div> : null}

                  {r.task ? (
                    <div className="reviewCard__task">
                      <div className="reviewCard__taskTitleRow">
                        <span className="reviewCard__taskLabel">{locale === 'ru' ? 'Задание' : 'Task'}:</span>{' '}
                        <Link className="reviewCard__taskLink" to={taskDetailsPath(r.task.id)} state={{ backTo: userId ? userReviewsPath(userId) : paths.reviews }}>
                          {r.task.title}
                        </Link>
                        {statusLabel ? <span className="reviewCard__statusPill">{statusLabel}</span> : null}
                      </div>

                      <div className="reviewCard__taskMeta">
                        {budget ? (
                          auth.user?.role === 'executor' ? (
                            <span className="reviewCard__metaItem reviewCard__metaItem--payout">
                              {t('tasks.payout')}: {budget}
                            </span>
                          ) : (
                            <span className="reviewCard__metaItem">
                              {locale === 'ru' ? 'Бюджет' : 'Budget'}: {budget}
                            </span>
                          )
                        ) : null}
                        {r.task.dueDate ? <span className="reviewCard__metaItem">{locale === 'ru' ? 'Дедлайн' : 'Due'}: {r.task.dueDate}</span> : null}
                        {r.task.category ? <span className="reviewCard__metaItem">{locale === 'ru' ? 'Платформа' : 'Platform'}: {r.task.category}</span> : null}
                        {r.task.location ? <span className="reviewCard__metaItem">{locale === 'ru' ? 'Формат' : 'Format'}: {r.task.location}</span> : null}
                      </div>

                      {r.submission ? (
                        <div className="reviewCard__submission">
                          <div className="reviewCard__submissionTitle">
                            {locale === 'ru' ? 'Отправка работы' : 'Submission'}
                            {submissionDate ? <span className="reviewCard__submissionDate">({submissionDate})</span> : null}
                          </div>
                          {r.submission.message ? <div className="reviewCard__submissionMsg">{r.submission.message}</div> : null}
                          {r.submission.files.length ? (
                            <ul className="reviewCard__files">
                              {r.submission.files.map((f) => (
                                <li key={f.url} className="reviewCard__file">
                                  {f.url.startsWith('idb:') ? (
                                    <button
                                      type="button"
                                      className="reviewCard__fileLink"
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
                                      {f.title ? f.title : locale === 'ru' ? 'Скачать видео' : 'Download video'}
                                    </button>
                                  ) : (
                                    <a className="reviewCard__fileLink" href={f.url} target="_blank" rel="noreferrer">
                                      {f.title ? f.title : f.url}
                                    </a>
                                  )}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ) : r.task.completionVideoUrl ? (
                        <div className="reviewCard__submission">
                          <div className="reviewCard__submissionTitle">{locale === 'ru' ? 'Результат' : 'Result'}</div>
                          <a className="reviewCard__fileLink" href={r.task.completionVideoUrl} target="_blank" rel="noreferrer">
                            {locale === 'ru' ? 'Открыть ссылку на работу' : 'Open work link'}
                          </a>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="reviewCard__taskMissing">{locale === 'ru' ? 'Задание не найдено (возможно, удалено).' : 'Task not found (may have been deleted).'}</div>
                  )}
                </article>
              )
            })}
            <Pagination page={page} pageCount={pageCount} onChange={setPage} />
          </div>
        )}
      </div>
    </main>
  )
}

