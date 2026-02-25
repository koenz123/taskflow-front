import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/shared/i18n/I18nContext'
import './rating-modal.css'
import { Icon } from '@/shared/ui/icon/Icon'

type Props = {
  open: boolean
  title?: string
  subjectName?: string
  onClose: () => void
  onSubmit: (input: { rating: number; comment: string }) => void
}

export function RatingModal({ open, title, subjectName, onClose, onSubmit }: Props) {
  const { locale } = useI18n()
  const [rating, setRating] = useState<number>(5)
  const [comment, setComment] = useState('')

  useEffect(() => {
    if (!open) return
    setRating(5)
    setComment('')
  }, [open])

  const canSubmit = rating >= 1 && rating <= 5
  const label = useMemo(() => {
    if (locale === 'ru') return subjectName ? `Оцените: ${subjectName}` : 'Оцените'
    return subjectName ? `Rate: ${subjectName}` : 'Rate'
  }, [locale, subjectName])

  if (!open) return null

  return (
    <div className="ratingOverlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="ratingModal" onClick={(e) => e.stopPropagation()}>
        <header className="ratingModal__header">
          <div className="ratingModal__headerContent">
            <p className="ratingModal__label">{title ?? label}</p>
          </div>
          <button className="ratingModal__close" type="button" onClick={onClose} aria-label={locale === 'ru' ? 'Закрыть' : 'Close'}>
            ×
          </button>
        </header>

        <div className="ratingModal__body">
          <div className="ratingStars" aria-label={locale === 'ru' ? 'Оценка' : 'Rating'}>
            {Array.from({ length: 5 }).map((_, idx) => {
              const value = idx + 1
              const active = value <= rating
              return (
                <button
                  key={value}
                  type="button"
                  className={`ratingStar${active ? ' ratingStar--active' : ''}`}
                  onClick={() => setRating(value)}
                  aria-label={`${value}`}
                >
                  <Icon name="star" size={18} />
                </button>
              )
            })}
          </div>

          <textarea
            className="ratingModal__comment"
            placeholder={locale === 'ru' ? 'Комментарий (необязательно)…' : 'Comment (optional)…'}
            autoComplete="off"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
          />
        </div>

        <footer className="ratingModal__footer">
          <button type="button" className="ratingModal__cancel" onClick={onClose}>
            {locale === 'ru' ? 'Отмена' : 'Cancel'}
          </button>
          <button
            type="button"
            className="ratingModal__submit"
            onClick={() => onSubmit({ rating, comment: comment.trim() })}
            disabled={!canSubmit}
          >
            {locale === 'ru' ? 'Отправить' : 'Submit'}
          </button>
        </footer>
      </div>
    </div>
  )
}

