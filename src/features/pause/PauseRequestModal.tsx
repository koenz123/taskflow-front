import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/shared/i18n/I18nContext'
import { CustomSelect } from '@/shared/ui/custom-select/CustomSelect'
import './pause-request-modal.css'

type PauseReason = 'illness' | 'family' | 'force_majeure'
type DurationHours = `${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24}`

type Props = {
  open: boolean
  onClose: () => void
  onSubmit: (input: { reasonId: PauseReason; durationHours: number; comment: string }) => void
}

export function PauseRequestModal({ open, onClose, onSubmit }: Props) {
  const { locale } = useI18n()
  const [reasonId, setReasonId] = useState<PauseReason>('illness')
  const [hours, setHours] = useState<DurationHours>('6')
  const [comment, setComment] = useState('')

  useEffect(() => {
    if (!open) return
    setReasonId('illness')
    setHours('6')
    setComment('')
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  const reasonOptions = useMemo(
    () => [
      { value: 'illness' as const, label: locale === 'ru' ? 'Болезнь' : 'Illness' },
      { value: 'family' as const, label: locale === 'ru' ? 'Семейные обстоятельства' : 'Family circumstances' },
      { value: 'force_majeure' as const, label: locale === 'ru' ? 'Форс-мажор' : 'Force majeure' },
    ],
    [locale],
  )

  const durationOptions = useMemo(() => {
    return Array.from({ length: 24 }).map((_, i) => {
      const v = String(i + 1) as DurationHours
      return { value: v, label: locale === 'ru' ? `${v} ч` : `${v} h` }
    })
  }, [locale])

  if (!open) return null

  const hoursNum = Number(hours)
  const canSubmit = Number.isFinite(hoursNum) && hoursNum >= 1 && hoursNum <= 24

  return (
    <div className="pauseOverlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="pauseModal" onClick={(e) => e.stopPropagation()}>
        <header className="pauseModal__header">
          <div className="pauseModal__headerContent">
            <p className="pauseModal__label">{locale === 'ru' ? 'Запрос паузы' : 'Request pause'}</p>
            <h2 className="pauseModal__title">{locale === 'ru' ? 'Форс-мажор' : 'Force majeure'}</h2>
          </div>
          <button
            className="pauseModal__close"
            type="button"
            onClick={onClose}
            aria-label={locale === 'ru' ? 'Отмена' : 'Cancel'}
          >
            ×
          </button>
        </header>

        <div className="pauseModal__body">
          <p className="pauseModal__hint" style={{ marginTop: 0, whiteSpace: 'pre-line' }}>
            {locale === 'ru'
              ? 'Обстоятельства учитываются только ДО дедлайна.\nПауза доступна один раз и не более 24 часов. Документы не требуются.'
              : 'Circumstances are considered only BEFORE the deadline.\nPause is available once and up to 24 hours. No documents required.'}
          </p>

          <div className="pauseModal__grid">
            <CustomSelect
              label={locale === 'ru' ? 'Причина' : 'Reason'}
              value={reasonId}
              onChange={setReasonId}
              options={reasonOptions}
            />
            <CustomSelect
              label={locale === 'ru' ? 'Длительность' : 'Duration'}
              value={hours}
              onChange={setHours}
              options={durationOptions}
            />
          </div>

<textarea
          className="pauseModal__detail"
          placeholder={locale === 'ru' ? 'Комментарий (необязательно)…' : 'Comment (optional)…'}
          autoComplete="off"
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, 500))}
            rows={4}
            autoFocus
          />
        </div>

        <footer className="pauseModal__footer">
          <button type="button" className="pauseModal__cancel" onClick={onClose}>
            {locale === 'ru' ? 'Отмена' : 'Cancel'}
          </button>
          <button
            type="button"
            className="pauseModal__submit"
            onClick={() => onSubmit({ reasonId, durationHours: hoursNum, comment: comment.trim() })}
            disabled={!canSubmit}
          >
            {locale === 'ru' ? 'Отправить' : 'Send'}
          </button>
        </footer>
      </div>
    </div>
  )
}

