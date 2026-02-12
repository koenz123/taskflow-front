import { useEffect, useState } from 'react'
import { useI18n } from '@/shared/i18n/I18nContext'
import './revision-request-modal.css'

type Props = {
  open: boolean
  executorName?: string
  onClose: () => void
  onSubmit: (message: string) => void
}

export function RevisionRequestModal({ open, executorName, onClose, onSubmit }: Props) {
  const { locale } = useI18n()
  const [message, setMessage] = useState('')
  const [missingDetailsOpen, setMissingDetailsOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    setMessage('')
    setMissingDetailsOpen(false)
  }, [open])

  if (!open) return null

  return (
    <div className="revisionOverlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="revisionModal" onClick={(e) => e.stopPropagation()}>
        <header className="revisionModal__header">
          <div className="revisionModal__headerContent">
            <p className="revisionModal__label">{locale === 'ru' ? 'Запрос доработки' : 'Request revision'}</p>
            <h2 className="revisionModal__title">
              {executorName ?? (locale === 'ru' ? 'Исполнитель' : 'Executor')}
            </h2>
          </div>
          <button className="revisionModal__close" type="button" onClick={onClose} aria-label={locale === 'ru' ? 'Отмена' : 'Cancel'}>
            ×
          </button>
        </header>

        <div className="revisionModal__body">
          <p className="revisionModal__hint" style={{ marginTop: 0 }}>
            {locale === 'ru'
              ? 'Опишите, что нужно исправить или уточнить. Исполнитель увидит это в уведомлении и на странице задания.'
              : 'Describe what to fix or уточнить. Executor will see it in notifications and on the task page.'}
          </p>
          <textarea
            className="revisionModal__detail"
            placeholder={locale === 'ru' ? 'Например: замените музыку, добавьте субтитры, исправьте первый кадр…' : 'E.g. replace music, add subtitles, fix the first frame…'}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            autoFocus
          />
        </div>

        <footer className="revisionModal__footer">
          <button type="button" className="revisionModal__cancel" onClick={onClose}>
            {locale === 'ru' ? 'Отмена' : 'Cancel'}
          </button>
          <button
            type="button"
            className="revisionModal__submit"
            onClick={() => {
              const trimmed = message.trim()
              if (!trimmed) {
                setMissingDetailsOpen(true)
                return
              }
              onSubmit(trimmed)
            }}
          >
            {locale === 'ru' ? 'Отправить' : 'Send'}
          </button>
        </footer>
      </div>

      {missingDetailsOpen ? (
        <div
          className="revisionInfoOverlay"
          role="dialog"
          aria-modal="true"
          aria-label={locale === 'ru' ? 'Нужны детали' : 'Details required'}
          onClick={() => setMissingDetailsOpen(false)}
        >
          <div className="revisionInfoModal" onClick={(e) => e.stopPropagation()}>
            <h3 className="revisionInfoModal__title">
              {locale === 'ru' ? 'Добавьте уточняющие детали' : 'Add clarification details'}
            </h3>
            <p className="revisionInfoModal__text">
              {locale === 'ru'
                ? 'Чтобы исполнитель сделал именно то, что вы ожидаете, в запросе доработки нужно описать конкретные правки. Укажите, что именно исправить, где это находится (таймкоды/кадры), и какой результат вы хотите получить.'
                : 'To help the executor deliver exactly what you expect, a revision request must include specific changes. Describe what to adjust, where it appears (timestamps/frames), and what outcome you want.'}
            </p>
            <div className="revisionInfoModal__actions">
              <button type="button" className="revisionInfoModal__button" onClick={() => setMissingDetailsOpen(false)}>
                {locale === 'ru' ? 'Понятно' : 'Got it'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

