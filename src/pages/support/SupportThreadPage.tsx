import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { paths } from '@/app/router/paths'
import { useAuth } from '@/shared/auth/AuthContext'
import { useI18n } from '@/shared/i18n/I18nContext'
import { supportRepo } from '@/entities/support/lib/supportRepo'
import { useSupportThreadsFromApi, useSupportThreadMessages, postSupportThreadMessage, closeSupportThread, rateSupportThread } from '@/entities/support/lib/supportApi'
import { ApiError } from '@/shared/api/api'
import { uploadFileToServer } from '@/shared/api/uploads'
import { notificationRepo } from '@/entities/notification/lib/notificationRepo'
import { userRepo } from '@/entities/user/lib/userRepo'
import { useUsers } from '@/entities/user/lib/useUsers'
import { timeAgo } from '@/shared/lib/timeAgo'
import { StatusPill } from '@/shared/ui/status-pill/StatusPill'
import { Icon } from '@/shared/ui/icon/Icon'
import './support-inbox.css'

const USE_API = import.meta.env.VITE_DATA_SOURCE === 'api'
const MAX_SUPPORT_ATTACHMENTS = 5
const MAX_FILE_SIZE = 10 * 1024 * 1024
const SUPPORT_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'

export function SupportThreadPage() {
  const auth = useAuth()
  const { t, locale } = useI18n()
  const { threadId } = useParams<{ threadId: string }>()
  const navigate = useNavigate()
  const users = useUsers()
  const apiThreads = useSupportThreadsFromApi()
  const { messages: apiMessages, refetch: refetchApiMessages } = useSupportThreadMessages(threadId ?? undefined)
  const [replyText, setReplyText] = useState('')
  const [replyAttachmentUrls, setReplyAttachmentUrls] = useState<string[]>([])
  const [replyAttachmentUploading, setReplyAttachmentUploading] = useState(false)
  const [replyAttachmentError, setReplyAttachmentError] = useState<string | null>(null)
  const [replyError, setReplyError] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const [closedError, setClosedError] = useState<string | null>(null)
  const [ratingValue, setRatingValue] = useState(5)
  const [ratingComment, setRatingComment] = useState('')
  const [ratingSubmitting, setRatingSubmitting] = useState(false)
  const [ratingError, setRatingError] = useState<string | null>(null)
  const replyFileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const threadFromRepo = threadId ? supportRepo.getThread(threadId) : null
  const threadFromApi = threadId && USE_API ? apiThreads.find((x) => x.id === threadId) ?? null : null
  // Prefer API thread when using API so owner sees closed status after arbiter closes
  const thread = USE_API ? (threadFromApi ?? threadFromRepo) : (threadFromRepo ?? threadFromApi ?? null)
  const messages = USE_API && thread
    ? apiMessages
    : thread
      ? supportRepo.getMessagesForThread(thread.id)
      : []
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])

  const isArbiter = auth.user?.role === 'arbiter'
  const isThreadOwner = thread && auth.user && thread.userId === auth.user.id

  useEffect(() => {
    if (auth.user && threadId && thread && auth.user.role === 'arbiter') {
      notificationRepo.markReadBySupportThread(auth.user.id, thread.id)
    }
  }, [auth.user, threadId, thread])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const threadOpen = (thread?.status ?? 'open') === 'open'
  const showReplyForm = (isArbiter || isThreadOwner) && threadOpen

  async function handleCloseThread() {
    if (!thread || !auth.user || closing) return
    setClosedError(null)
    setClosing(true)
    try {
      if (USE_API) {
        const updated = await closeSupportThread(thread.id)
        if (!updated) setClosedError(t('support.sendFailed'))
        else if (threadFromRepo) supportRepo.ensureThreadFromApi(thread.userId, updated)
      } else {
        supportRepo.closeThread(thread.id, auth.user.id)
      }
    } catch {
      setClosedError(t('support.sendFailed'))
    } finally {
      setClosing(false)
    }
  }

  async function handleRateSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!thread || ratingSubmitting || ratingValue < 1 || ratingValue > 5) return
    setRatingError(null)
    setRatingSubmitting(true)
    try {
      if (USE_API) {
        const updated = await rateSupportThread(thread.id, ratingValue, ratingComment.trim() || undefined)
        if (updated && threadFromRepo) supportRepo.ensureThreadFromApi(thread.userId, updated)
      } else {
        supportRepo.setThreadRating(thread.id, ratingValue, ratingComment.trim())
      }
    } catch {
      setRatingError(t('support.sendFailed'))
    } finally {
      setRatingSubmitting(false)
    }
  }

  async function handleReplyFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files?.length) return
    setReplyAttachmentError(null)
    const remaining = MAX_SUPPORT_ATTACHMENTS - replyAttachmentUrls.length
    if (remaining <= 0) {
      setReplyAttachmentError(t('support.maxFiles', { n: MAX_SUPPORT_ATTACHMENTS }))
      e.target.value = ''
      return
    }
    const toAdd = Array.from(files).slice(0, remaining)
    for (const f of toAdd) {
      if (f.size > MAX_FILE_SIZE) {
        setReplyAttachmentError(t('support.fileTooLarge'))
        e.target.value = ''
        return
      }
    }
    setReplyAttachmentUploading(true)
    try {
      const urls: string[] = []
      for (const file of toAdd) {
        const res = await uploadFileToServer(file, file.name)
        urls.push(res.url)
      }
      setReplyAttachmentUrls((prev) => [...prev, ...urls])
    } catch {
      setReplyAttachmentError(t('support.uploadFailed'))
    } finally {
      setReplyAttachmentUploading(false)
      e.target.value = ''
    }
  }

  if (!auth.user) {
    navigate(paths.login, { replace: true })
    return null
  }

  if (!threadId || !thread) {
    if (isArbiter) {
      return (
        <main className="supportInboxPage">
          <p>{t('support.threadNotFound')}</p>
          <Link to={paths.supportInbox}>{t('support.backToList')}</Link>
        </main>
      )
    }
    navigate(paths.support, { replace: true })
    return null
  }

  if (!isArbiter && !isThreadOwner) {
    navigate(paths.support, { replace: true })
    return null
  }

  const threadUser = userById.get(thread.userId)
  const displayName =
    thread.userFullName?.trim() ||
    threadUser?.fullName?.trim() ||
    threadUser?.email?.trim() ||
    thread.userId

  const arbiterIds = thread
    ? userRepo.list().filter((u) => u.role === 'arbiter').map((u) => u.id)
    : []

  async function handleReply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!thread || !auth.user || !replyText.trim()) return
    setReplyError(null)
    setReplyAttachmentError(null)
    const text = replyText.trim()
    const urls = replyAttachmentUrls.length ? replyAttachmentUrls : undefined
    setReplyText('')
    setReplyAttachmentUrls([])
    if (USE_API) {
      try {
        await postSupportThreadMessage(thread.id, auth.user.id, text, {
          telegramUserId: auth.user.telegramUserId ?? null,
          attachmentUrls: urls,
        })
        refetchApiMessages()
      } catch (err) {
        const msg = err instanceof ApiError && err.status === 403 ? t('support.accessDenied') : t('support.sendFailed')
        setReplyError(msg)
        setReplyText(text)
        if (urls?.length) setReplyAttachmentUrls(urls)
      }
      return
    }
    supportRepo.addMessage(thread.id, auth.user.id, text, urls)
    if (auth.user.role !== 'arbiter') {
      for (const recipientUserId of arbiterIds.length > 0 ? arbiterIds : ['user_dev_arbiter', 'user_arbiter_main']) {
        notificationRepo.addSupportMessage({
          recipientUserId,
          actorUserId: auth.user.id,
          supportThreadId: thread.id,
        })
      }
    }
  }

  const backTo = isArbiter ? paths.supportInbox : paths.support
  const backLabel = isArbiter ? t('support.backToList') : t('support.backToSupport')

  return (
    <main className="supportThreadPage">
      <header className="supportThreadHeader">
        <Link to={backTo} className="supportThreadBack">
          {backLabel}
        </Link>
        <div className="supportThreadTitleRow">
          <h1 className="supportThreadTitle">
            {isArbiter ? displayName : t('support.yourRequest')}
          </h1>
          <StatusPill
            tone={threadOpen ? 'open' : 'closed'}
            label={threadOpen ? t('support.statusOpen') : t('support.statusClosed')}
            className="supportThreadStatusPill"
          />
        </div>
        {isArbiter && threadOpen ? (
          <button
            type="button"
            className="supportThreadCloseBtn"
            onClick={handleCloseThread}
            disabled={closing}
          >
            {closing ? t('support.closing') : t('support.closeRequest')}
          </button>
        ) : null}
        {!threadOpen && thread.closedAt ? (
          <p className="supportThreadClosedInfo">
            {t('support.closedInfo', { timeAgo: timeAgo(thread.closedAt, locale, Date.now()) })}
          </p>
        ) : null}
        {closedError ? <p className="supportThreadReplyError" role="alert">{closedError}</p> : null}
      </header>

      <div className="supportThreadMessages">
        {messages.map((msg) => {
          const fromArbiter = userById.get(msg.fromUserId)?.role === 'arbiter'
          const isOwn = msg.fromUserId === auth.user?.id
          const author = userById.get(msg.fromUserId)
          const authorName = author?.fullName?.trim() || author?.email || (fromArbiter ? t('support.authorSupport') : (isOwn ? t('support.authorYou') : '—'))
          return (
            <div
              key={msg.id}
              className={`supportThreadMessage ${fromArbiter ? 'supportThreadMessage--arbiter' : ''} ${isOwn ? 'supportThreadMessage--own' : ''}`}
            >
              <span className="supportThreadMessage__author">{authorName}</span>
              {msg.text ? <p className="supportThreadMessage__text">{msg.text}</p> : null}
              {msg.attachmentUrls?.length ? (
                <div className="supportThreadMessage__attachments">
                  {msg.attachmentUrls.map((url) => {
                    const isImage = /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url) || /image\//.test(url) || /\/uploads\//.test(url)
                    return isImage ? (
                      <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="supportThreadMessage__attachment supportThreadMessage__attachment--img">
                        <img src={url} alt="" />
                      </a>
                    ) : (
                      <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="supportThreadMessage__attachment">
                        {t('support.attachShort')}
                      </a>
                    )
                  })}
                </div>
              ) : null}
              <span className="supportThreadMessage__time">{timeAgo(msg.createdAt, locale, Date.now())}</span>
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {replyError ? (
        <p className="supportThreadReplyError" role="alert">
          {replyError}
        </p>
      ) : null}
      {isThreadOwner && !threadOpen && !isArbiter ? (
        <section className="supportThreadRating" aria-labelledby="support-thread-rating-heading">
          <h2 id="support-thread-rating-heading" className="supportThreadRating__title">
            {thread.ratedAt ? t('support.yourRating') : t('support.rateTitle')}
          </h2>
          {thread.ratedAt ? (
            <div className="supportThreadRatingDone">
              {thread.rating != null ? (
                <div className="supportThreadRatingStars" aria-label={t('support.yourRating')}>
                  {[1, 2, 3, 4, 5].map((v) => (
                    <span key={v} className={`supportThreadRatingStar ${v <= (thread.rating ?? 0) ? 'supportThreadRatingStar--active' : ''}`}>
                      <Icon name="star" size={18} />
                    </span>
                  ))}
                </div>
              ) : null}
              {thread.ratingComment ? <p className="supportThreadRatingComment">{thread.ratingComment}</p> : null}
              <p className="supportThreadRatingThanks">
                {t('support.ratingThanks')}
              </p>
            </div>
          ) : (
            <form onSubmit={handleRateSubmit} className="supportThreadRatingForm">
              <div className="supportThreadRatingStars" role="group" aria-label={t('support.yourRating')}>
                {[1, 2, 3, 4, 5].map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={`supportThreadRatingStar ${v <= ratingValue ? 'supportThreadRatingStar--active' : ''}`}
                    onClick={() => setRatingValue(v)}
                    aria-label={`${v}`}
                  >
                    <Icon name="star" size={22} />
                  </button>
                ))}
              </div>
              <textarea
                className="supportThreadRatingCommentInput"
                autoComplete="off"
                placeholder={t('support.ratingCommentPlaceholder')}
                value={ratingComment}
                onChange={(e) => setRatingComment(e.target.value)}
                rows={3}
                maxLength={500}
              />
              {ratingError ? <p className="supportThreadReplyError" role="alert">{ratingError}</p> : null}
              <button type="submit" className="supportThreadReply__btn" disabled={ratingSubmitting}>
                {ratingSubmitting ? t('support.submitting') : t('support.submitRating')}
              </button>
            </form>
          )}
        </section>
      ) : null}
      {showReplyForm ? (
        <form onSubmit={handleReply} className="supportThreadReply">
          <textarea
            className="supportThreadReply__input"
            value={replyText}
            autoComplete="off"
            onChange={(e) => setReplyText(e.target.value)}
            placeholder={t('support.reply')}
            rows={3}
            maxLength={2000}
          />
          <div className="supportThreadReplyAttachments">
            <input
              ref={replyFileInputRef}
              type="file"
              accept={SUPPORT_ACCEPT}
              multiple
              className="supportThreadReplyAttachmentsInput"
              aria-label={t('support.attachShort')}
              onChange={handleReplyFileSelect}
            />
            <button
              type="button"
              className="supportThreadReplyAttachBtn"
              disabled={replyAttachmentUploading || replyAttachmentUrls.length >= MAX_SUPPORT_ATTACHMENTS}
              onClick={() => replyFileInputRef.current?.click()}
            >
              {replyAttachmentUploading ? t('support.uploading') : t('support.attachShort')}
            </button>
            {replyAttachmentUrls.length > 0 ? (
              <div className="supportThreadReplyPreviews">
                {replyAttachmentUrls.map((url) => (
                  <div key={url} className="supportThreadReplyPreview">
                    <img src={url} alt="" />
                    <button
                      type="button"
                      className="supportThreadReplyPreview__remove"
                      onClick={() => setReplyAttachmentUrls((prev) => prev.filter((u) => u !== url))}
                      aria-label={t('support.remove')}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            {replyAttachmentError ? <p className="supportThreadReplyError" role="alert">{replyAttachmentError}</p> : null}
          </div>
          <button type="submit" className="supportThreadReply__btn" disabled={!replyText.trim()}>
            {t('support.replySend')}
          </button>
        </form>
      ) : null}
    </main>
  )
}
