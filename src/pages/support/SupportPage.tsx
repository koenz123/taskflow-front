import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { paths, supportThreadPath } from '@/app/router/paths'
import { useAuth } from '@/shared/auth/AuthContext'
import { useI18n } from '@/shared/i18n/I18nContext'
import { supportRepo } from '@/entities/support/lib/supportRepo'
import { notificationRepo } from '@/entities/notification/lib/notificationRepo'
import { userRepo } from '@/entities/user/lib/userRepo'
import { submitSupportMessage, useSupportThreadsFromApi } from '@/entities/support/lib/supportApi'
import { ApiError } from '@/shared/api/api'
import { uploadFileToServer } from '@/shared/api/uploads'
import { timeAgo } from '@/shared/lib/timeAgo'
import './support.css'

const USE_API = import.meta.env.VITE_DATA_SOURCE === 'api'
const FALLBACK_ARBITER_IDS = ['user_dev_arbiter', 'user_arbiter_main']
const MAX_SUPPORT_ATTACHMENTS = 5
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const SUPPORT_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'

export function SupportPage() {
  const auth = useAuth()
  const { t, locale } = useI18n()
  const [text, setText] = useState('')
  const [attachmentUrls, setAttachmentUrls] = useState<string[]>([])
  const [attachmentUploading, setAttachmentUploading] = useState(false)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const apiThreads = useSupportThreadsFromApi()

  const canSubmit = text.trim().length > 0 && auth.user && !submitting

  const arbiterIds = auth.user
    ? (() => {
        const byRole = userRepo.list().filter((u) => u.role === 'arbiter').map((u) => u.id)
        return byRole.length > 0 ? byRole : FALLBACK_ARBITER_IDS
      })()
    : []

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files?.length) return
    setAttachmentError(null)
    const remaining = MAX_SUPPORT_ATTACHMENTS - attachmentUrls.length
    if (remaining <= 0) {
      setAttachmentError(t('support.maxFiles', { n: MAX_SUPPORT_ATTACHMENTS }))
      e.target.value = ''
      return
    }
    const toAdd = Array.from(files).slice(0, remaining)
    for (const f of toAdd) {
      if (f.size > MAX_FILE_SIZE) {
        setAttachmentError(t('support.fileTooLarge'))
        e.target.value = ''
        return
      }
    }
    setAttachmentUploading(true)
    try {
      const urls: string[] = []
      for (const file of toAdd) {
        const res = await uploadFileToServer(file, file.name)
        urls.push(res.url)
      }
      setAttachmentUrls((prev) => [...prev, ...urls])
    } catch {
      setAttachmentError(t('support.uploadFailed'))
    } finally {
      setAttachmentUploading(false)
      e.target.value = ''
    }
  }

  function removeAttachment(url: string) {
    setAttachmentUrls((prev) => prev.filter((u) => u !== url))
    setAttachmentError(null)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!auth.user || !text.trim()) return
    setSubmitting(true)
    try {
      if (USE_API) {
        const result = await submitSupportMessage(auth.user.id, text.trim(), {
          role: auth.user.role,
          telegramUserId: auth.user.telegramUserId ?? null,
          attachmentUrls: attachmentUrls.length ? attachmentUrls : undefined,
        })
        if (!result) {
          setError(t('support.sendFailed'))
          return
        }
        supportRepo.ensureThreadFromApi(auth.user.id, result.thread)
      } else {
        const thread = supportRepo.getOrCreateThreadForUser(auth.user.id)
        supportRepo.addMessage(thread.id, auth.user.id, text.trim(), attachmentUrls.length ? attachmentUrls : undefined)
        for (const recipientUserId of arbiterIds) {
          notificationRepo.addSupportMessage({
            recipientUserId,
            actorUserId: auth.user.id,
            supportThreadId: thread.id,
          })
        }
      }
      setText('')
      setAttachmentUrls([])
      setSubmitted(true)
    } catch (err) {
      const msg = err instanceof ApiError && err.status === 403 ? t('support.accessDenied') : t('support.sendFailed')
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  if (!auth.user) {
    return (
      <main className="supportPage">
        <div className="supportCard">
          <h1 className="supportTitle">{t('support.title')}</h1>
          <p className="supportText">{t('support.signInToContact')}</p>
          <Link to={paths.login} className="supportLink">
            {t('support.signIn')}
          </Link>
        </div>
      </main>
    )
  }

  const myThread = auth.user
    ? USE_API
      ? (() => {
          const userThreads = apiThreads.filter((t) => t.userId === auth.user!.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          return userThreads[0] ?? null
        })()
      : supportRepo.getOrCreateThreadForUser(auth.user.id)
    : null
  const myMessages = myThread && !USE_API ? supportRepo.getMessagesForThread(myThread.id) : []
  const lastMessage = myMessages.length > 0 ? myMessages[myMessages.length - 1] : null

  return (
    <main className="supportPage">
      <div className="supportCard">
        <h1 className="supportTitle">{t('support.title')}</h1>
        <p className="supportIntro">{t('support.intro')}</p>
        {submitted ? (
          <div className="supportSuccess" role="status">
            {t('support.success')}
          </div>
        ) : null}
        <form onSubmit={handleSubmit} className="supportForm">
          <label className="supportLabel">
            <span className="supportLabelText">{t('support.messageLabel')}</span>
            <textarea
              className="supportTextarea"
              value={text}
              autoComplete="off"
              onChange={(e) => setText(e.target.value)}
              placeholder={t('support.placeholder')}
              rows={6}
              maxLength={2000}
            />
          </label>
          <div className="supportAttachments">
            <input
              ref={fileInputRef}
              type="file"
              accept={SUPPORT_ACCEPT}
              multiple
              className="supportAttachmentsInput"
              aria-label={locale === 'ru' ? 'Прикрепить файл' : 'Attach file'}
              onChange={handleFileSelect}
            />
            <button
              type="button"
              className="supportAttachBtn"
              disabled={attachmentUploading || attachmentUrls.length >= MAX_SUPPORT_ATTACHMENTS}
              onClick={() => fileInputRef.current?.click()}
            >
              {attachmentUploading ? t('support.uploading') : t('support.attach')}
            </button>
            {attachmentUrls.length > 0 ? (
              <div className="supportAttachmentPreviews">
                {attachmentUrls.map((url) => (
                  <div key={url} className="supportAttachmentPreview">
                    <img src={url} alt="" className="supportAttachmentPreview__img" />
                    <button
                      type="button"
                      className="supportAttachmentPreview__remove"
                      onClick={() => removeAttachment(url)}
                      aria-label={t('support.remove')}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            {attachmentError ? <p className="supportError" role="alert">{attachmentError}</p> : null}
          </div>
          {error ? <p className="supportError" role="alert">{error}</p> : null}
          <button type="submit" className="supportSubmit" disabled={!canSubmit}>
            {t('support.send')}
          </button>
        </form>

        {myThread && (
          <section className="supportMyRequests" aria-labelledby="support-my-requests-heading">
            <h2 id="support-my-requests-heading" className="supportMyRequests__title">
              {t('support.yourRequests')}
            </h2>
            <Link to={supportThreadPath(myThread.id)} className="supportMyRequests__card">
              <span className="supportMyRequests__meta">
                {myMessages.length > 0
                  ? t('support.messagesCount', { count: myMessages.length })
                  : t('support.noMessagesYet')}
                {lastMessage ? (
                  <span className="supportMyRequests__time">
                    {' · '}
                    {timeAgo(lastMessage.createdAt, locale, Date.now())}
                  </span>
                ) : null}
                {(myThread.status ?? 'open') === 'closed' ? (
                  <span className="supportMyRequests__status supportMyRequests__status--closed">
                    {' · '}{t('support.statusClosed')}
                  </span>
                ) : (
                  <span className="supportMyRequests__status supportMyRequests__status--open">
                    {' · '}{t('support.statusOpen')}
                  </span>
                )}
              </span>
              {lastMessage ? (
                <p className="supportMyRequests__preview">
                  {lastMessage.text.length > 120 ? `${lastMessage.text.slice(0, 120).trim()}…` : lastMessage.text}
                </p>
              ) : (
                <p className="supportMyRequests__preview supportMyRequests__preview--muted">
                  {t('support.openToView')}
                </p>
              )}
              {myThread.rating != null ? (
                <span className="supportMyRequests__rating" aria-label={t('support.yourRating')}>
                  {'★'.repeat(myThread.rating)}{'☆'.repeat(5 - myThread.rating)}
                </span>
              ) : null}
              <span className="supportMyRequests__link">
                {t('support.openRequest')}
              </span>
            </Link>
          </section>
        )}
      </div>
    </main>
  )
}
