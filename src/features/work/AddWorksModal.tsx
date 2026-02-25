import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '@/shared/i18n/I18nContext'
import type { WorkMediaType } from '@/entities/work/model/work'
import { workRepo } from '@/entities/work/lib/workRepo'
import './add-works-modal.css'

type DraftWorkStatus = 'idle' | 'uploading' | 'done' | 'error'

type DraftWork = {
  id: string
  title: string
  description: string
  mediaUrl: string
  mediaType: WorkMediaType
  file: File | null
  fileName: string | null
  previewUrl: string | null
  status: DraftWorkStatus
  error: string | null
}

type Props = {
  open: boolean
  ownerId: string
  serverAvailable: boolean
  migrationError?: string | null
  onClose: () => void
}

const MAX_MEDIA_FILE_BYTES = 2 * 1024 * 1024 * 1024

function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function stripExtension(fileName: string) {
  const idx = fileName.lastIndexOf('.')
  return idx > 0 ? fileName.slice(0, idx) : fileName
}

function isLikelyValidUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return true
  if (trimmed.startsWith('/videos/')) return true
  return trimmed.startsWith('https://') || trimmed.startsWith('http://')
}

export function AddWorksModal({ open, ownerId, serverAvailable, migrationError, onClose }: Props) {
  const { t } = useI18n()
  const [items, setItems] = useState<DraftWork[]>([])
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ loaded: number; total?: number; percent?: number } | null>(null)
  const [uploadCounter, setUploadCounter] = useState<{ current: number; total: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [linkTitle, setLinkTitle] = useState('')
  const [linkDescription, setLinkDescription] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkMediaType, setLinkMediaType] = useState<WorkMediaType>('video')

  const hasPending = useMemo(() => items.some((w) => w.status === 'idle' || w.status === 'error'), [items])
  const pendingCount = useMemo(() => items.filter((w) => w.status === 'idle' || w.status === 'error').length, [items])

  useEffect(() => {
    if (!open) return
    setGlobalError(null)
    setUploadProgress(null)
    setUploadCounter(null)
    setLinkTitle('')
    setLinkDescription('')
    setLinkUrl('')
    setLinkMediaType('video')
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (open) return
    // Cleanup previews on close
    setItems((prev) => {
      for (const it of prev) {
        if (it.previewUrl) URL.revokeObjectURL(it.previewUrl)
      }
      return []
    })
    setGlobalError(null)
    setIsUploading(false)
    setUploadProgress(null)
    setUploadCounter(null)
  }, [open])

  if (!open) return null

  function updateItem(itemId: string, patch: Partial<DraftWork>) {
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, ...patch } : it)))
  }

  function removeItem(itemId: string) {
    setItems((prev) => {
      const target = prev.find((x) => x.id === itemId) ?? null
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((x) => x.id !== itemId)
    })
  }

  function addLinkToQueue() {
    const title = linkTitle.trim()
    const description = linkDescription.trim()
    const mediaUrl = linkUrl.trim()
    const hasMedia = Boolean(mediaUrl)
    const urlOk = isLikelyValidUrl(mediaUrl) && Boolean(mediaUrl)
    const error =
      !title ? t('validation.taskTitleRequired') : !hasMedia ? t('profile.workNeedMedia') : !urlOk ? t('profile.workInvalidUrl') : null

    if (error) {
      setGlobalError(error)
      return
    }

    setGlobalError(null)
    setItems((prev) => [
      {
        id: id(),
        title,
        description,
        mediaUrl,
        mediaType: linkMediaType,
        file: null,
        fileName: null,
        previewUrl: null,
        status: 'idle',
        error: null,
      },
      ...prev,
    ])
    setLinkTitle('')
    setLinkDescription('')
    setLinkUrl('')
    setLinkMediaType('video')
  }

  function addFiles(files: File[]) {
    const next: DraftWork[] = []
    let firstError: string | null = null

    for (const file of files) {
      if (file.size > MAX_MEDIA_FILE_BYTES) {
        if (!firstError) firstError = t('profile.workTooLargeOne', { name: file.name })
        continue
      }
      if (!file.type.startsWith('video/') && !file.type.startsWith('image/')) {
        if (!firstError) firstError = t('profile.workStorageFailed')
        continue
      }

      const previewUrl = URL.createObjectURL(file)
      next.push({
        id: id(),
        title: stripExtension(file.name),
        description: '',
        mediaUrl: '',
        mediaType: file.type.startsWith('image/') ? 'photo' : 'video',
        file,
        fileName: file.name,
        previewUrl,
        status: 'idle',
        error: null,
      })
    }

    if (firstError) setGlobalError(firstError)
    if (next.length) setItems((prev) => [...next, ...prev])
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    // allow selecting same files again
    e.target.value = ''
    if (!files.length) return
    setGlobalError(null)
    addFiles(files)
  }

  function normalizeError(err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    if (message === 'file_too_large') return t('profile.workTooLarge')
    if (message === 'invalid_url') return t('profile.workInvalidUrl')
    if (message === 'missing_video' || message === 'missing_fields') return t('profile.workNeedMedia')
    if (message === 'network_error') return t('profile.serverUnavailable')
    if (message === 'media_only') return t('profile.workStorageFailed')
    return t('profile.workStorageFailed')
  }

  async function saveAll() {
    if (isUploading) return
    setGlobalError(null)

    const validated = items.map((it) => {
      if (it.status === 'done') return { ...it, error: null }
      const title = it.title.trim()
      const description = it.description.trim()
      const mediaUrl = it.mediaUrl.trim()
      const hasMedia = Boolean(it.file) || Boolean(mediaUrl)
      const urlOk = isLikelyValidUrl(mediaUrl)
      const error =
        !title ? t('validation.taskTitleRequired') : !hasMedia ? t('profile.workNeedMedia') : !urlOk ? t('profile.workInvalidUrl') : null
      const status: DraftWorkStatus = error ? 'error' : 'idle'
      return { ...it, title, description, mediaUrl, error, status }
    })

    setItems(validated)

    const queue = validated.filter((it) => it.status !== 'done' && !it.error)
    if (queue.length === 0) {
      setGlobalError(t('profile.workQueueEmpty'))
      return
    }
    if (!serverAvailable) {
      setGlobalError(t('profile.serverUnavailable'))
      return
    }

    setIsUploading(true)
    setUploadCounter({ current: 0, total: queue.length })
    setUploadProgress(null)

    let ok = 0
    for (let i = 0; i < queue.length; i++) {
      const it = queue[i]
      setUploadCounter({ current: i + 1, total: queue.length })
      updateItem(it.id, { status: 'uploading', error: null })
      setUploadProgress(it.file ? { loaded: 0, total: it.file.size } : null)
      try {
        await workRepo.create({
          ownerId,
          title: it.title,
          description: it.description,
          mediaUrl: it.file ? undefined : it.mediaUrl || undefined,
          mediaType: it.mediaType,
          file: it.file,
          onProgress: (p) => setUploadProgress(p),
        })
        ok++
        updateItem(it.id, { status: 'done', error: null })
      } catch (err) {
        updateItem(it.id, { status: 'error', error: normalizeError(err) })
      } finally {
        setUploadProgress(null)
      }
    }

    setIsUploading(false)
    setUploadCounter(null)
    setUploadProgress(null)

    // If everything is ok -> clear and close. Otherwise keep list for retry.
    if (ok === queue.length) {
      onClose()
    } else {
      setGlobalError(`${t('profile.workSaving', { current: ok, total: queue.length })}`)
    }
  }

  const uploadStatusText = uploadCounter
    ? t('profile.workSaving', { current: uploadCounter.current, total: uploadCounter.total })
    : uploadProgress?.total
      ? t('profile.workUploadProgress', {
          loaded: (uploadProgress.loaded / 1024 / 1024).toFixed(1),
          total: (uploadProgress.total / 1024 / 1024).toFixed(1),
        })
      : uploadProgress
        ? t('profile.workUploadProgressUnknown', { loaded: (uploadProgress.loaded / 1024 / 1024).toFixed(1) })
        : null

  return (
    <div className="addWorksOverlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={t('profile.worksTitle')}>
      <div className="addWorksModal" onClick={(e) => e.stopPropagation()}>
        <header className="addWorksModal__header">
          <div className="addWorksModal__headerContent">
            <p className="addWorksModal__label">{t('profile.workShowcase')}</p>
            <h2 className="addWorksModal__title">{t('profile.addWorks')}</h2>
          </div>
          <button className="addWorksModal__close" type="button" onClick={onClose} aria-label={t('common.cancel')}>
            ×
          </button>
        </header>

        <div className="addWorksModal__body">
          {!serverAvailable ? <div className="addWorksModal__alert">{t('profile.serverUnavailable')}</div> : null}
          {migrationError ? <div className="addWorksModal__alert">{migrationError}</div> : null}
          {globalError ? <div className="addWorksModal__alert">{globalError}</div> : null}

          <div className="addWorksModal__toolbar">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="video/*,image/*"
              disabled={isUploading}
              onChange={handleFileChange}
              className="addWorksModal__fileInput"
            />
            <button
              type="button"
              className="addWorksModal__button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {t('profile.workUploadMany')}
            </button>
          </div>

          <div className="addWorksLinkBlock">
            <div className="addWorksLinkBlock__header">
              <p className="addWorksLinkBlock__title">{t('profile.workAddByLink')}</p>
            </div>
            <div className="addWorksLinkBlock__grid">
              <label className="addWorksLinkBlock__field">
                <span className="addWorksLinkBlock__label">{t('profile.workTitle')}</span>
                <input
                  className="addWorksLinkBlock__input"
                  value={linkTitle}
                  autoComplete="off"
                  onChange={(e) => setLinkTitle(e.target.value)}
                  disabled={isUploading}
                />
              </label>
              <div className="addWorksLinkBlock__type">
                <span className="addWorksLinkBlock__label">{t('portfolio.mediaTypeLabel')}</span>
                <div className="addWorksLinkBlock__typeButtons">
                  <button
                    type="button"
                    className={`addWorksLinkBlock__typeBtn${linkMediaType === 'video' ? ' addWorksLinkBlock__typeBtn--active' : ''}`}
                    onClick={() => setLinkMediaType('video')}
                    disabled={isUploading}
                  >
                    {t('portfolio.mediaTypeVideo')}
                  </button>
                  <button
                    type="button"
                    className={`addWorksLinkBlock__typeBtn${linkMediaType === 'photo' ? ' addWorksLinkBlock__typeBtn--active' : ''}`}
                    onClick={() => setLinkMediaType('photo')}
                    disabled={isUploading}
                  >
                    {t('portfolio.mediaTypePhoto')}
                  </button>
                </div>
              </div>
              <label className="addWorksLinkBlock__field addWorksLinkBlock__field--span2">
                <span className="addWorksLinkBlock__label">{t('profile.workLink')}</span>
                <input
                  className="addWorksLinkBlock__input"
                  value={linkUrl}
                  autoComplete="off"
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://"
                  disabled={isUploading}
                />
              </label>
              <label className="addWorksLinkBlock__field addWorksLinkBlock__field--span2">
                <span className="addWorksLinkBlock__label">
                  {t('profile.workDescription')} <span className="addWorksCard__optional">{t('common.optional')}</span>
                </span>
                <textarea
                  className="addWorksLinkBlock__textarea"
                  value={linkDescription}
                  autoComplete="off"
                  onChange={(e) => setLinkDescription(e.target.value)}
                  rows={3}
                  disabled={isUploading}
                  placeholder={t('profile.workNoDescription')}
                />
              </label>
              <div className="addWorksLinkBlock__actions">
                <button type="button" className="addWorksModal__button" onClick={addLinkToQueue} disabled={isUploading}>
                  {t('profile.workAddLinkToQueue')}
                </button>
              </div>
            </div>
          </div>

          <div className="addWorksModal__queueHeader">
            <p className="addWorksModal__queueTitle">
              {t('profile.workQueue')} <span className="addWorksModal__queueCount">({items.length})</span>
            </p>
          </div>

          {items.length === 0 ? (
            <div className="addWorksModal__empty">{t('profile.workQueueEmpty')}</div>
          ) : (
            <div className="addWorksModal__grid">
              {items.map((it) => (
                <div key={it.id} className={`addWorksCard${it.status === 'done' ? ' addWorksCard--done' : ''}`}>
                  <div className="addWorksCard__media">
                    {it.previewUrl ? (
                      it.file?.type.startsWith('image/') ? (
                        <img className="addWorksCard__img" src={it.previewUrl} alt={it.title || it.fileName || ''} />
                      ) : (
                        <video className="addWorksCard__video" src={it.previewUrl} controls />
                      )
                    ) : (
                      <div className="addWorksCard__placeholder">
                        {it.mediaType === 'photo' ? t('portfolio.mediaTypePhoto') : t('portfolio.mediaTypeVideo')}
                      </div>
                    )}
                  </div>

                  <div className="addWorksCard__fields">
                    <label className="addWorksCard__field">
                      <span className="addWorksCard__label">{t('profile.workTitle')}</span>
                      <input
                        className="addWorksCard__input"
                        value={it.title}
                        onChange={(e) => updateItem(it.id, { title: e.target.value, status: 'idle', error: null })}
                        disabled={isUploading}
                        autoComplete="off"
                      />
                    </label>

                    <label className="addWorksCard__field">
                      <span className="addWorksCard__label">
                        {t('profile.workDescription')} <span className="addWorksCard__optional">{t('common.optional')}</span>
                      </span>
                      <textarea
                        className="addWorksCard__textarea"
                        value={it.description}
                        onChange={(e) => updateItem(it.id, { description: e.target.value, status: 'idle', error: null })}
                        rows={3}
                        disabled={isUploading}
                        placeholder={t('profile.workNoDescription')}
                        autoComplete="off"
                      />
                    </label>

                    {!it.file ? (
                      <label className="addWorksCard__field">
                        <span className="addWorksCard__label">{t('profile.workLink')}</span>
                        <input
                          className="addWorksCard__input"
                          value={it.mediaUrl}
                          onChange={(e) => updateItem(it.id, { mediaUrl: e.target.value, status: 'idle', error: null })}
                          placeholder="https://"
                          disabled={isUploading}
                          autoComplete="off"
                        />
                      </label>
                    ) : (
                      <div className="addWorksCard__fileName" title={it.fileName ?? undefined}>
                        {it.fileName}
                      </div>
                    )}

                    {it.error ? <div className="addWorksCard__error">{it.error}</div> : null}

                    <div className="addWorksCard__actions">
                      <button
                        type="button"
                        className="addWorksCard__remove"
                        onClick={() => removeItem(it.id)}
                        disabled={isUploading || it.status === 'uploading'}
                      >
                        {t('profile.workRemoveFromQueue')}
                      </button>
                      <span className="addWorksCard__status">
                        {it.status === 'uploading'
                          ? t('profile.workUploading')
                          : it.status === 'done'
                            ? 'OK'
                            : it.status === 'error'
                              ? '—'
                              : ''}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className="addWorksModal__footer">
          <button type="button" className="addWorksModal__cancel" onClick={onClose} disabled={isUploading}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="addWorksModal__submit"
            onClick={saveAll}
            disabled={isUploading || !hasPending || items.length === 0 || !serverAvailable}
          >
            {t('profile.workSaveAll', { count: pendingCount })}
          </button>
        </footer>

        {uploadStatusText ? <div className="addWorksModal__progress">{uploadStatusText}</div> : null}
      </div>
    </div>
  )
}

