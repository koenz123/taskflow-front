import { useEffect } from 'react'
import { useI18n } from '@/shared/i18n/I18nContext'
import './no-start-assign-modal.css'

type Props = {
  open: boolean
  count: number
  onClose: () => void
  onConfirm: () => void
}

export function NoStartAssignModal({ open, count, onClose, onConfirm }: Props) {
  const { locale } = useI18n()

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const title = locale === 'ru' ? 'Внимание' : 'Heads up'
  const text =
    locale === 'ru'
      ? `Исполнитель ранее ${count} раза не приступал к заданиям. Назначить всё равно?`
      : `This executor previously did not start assigned tasks ${count} times. Assign anyway?`

  return (
    <div className="noStartOverlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="noStartModal" onClick={(e) => e.stopPropagation()}>
        <header className="noStartModal__header">
          <div className="noStartModal__headerContent">
            <p className="noStartModal__label">{locale === 'ru' ? 'Проверка перед назначением' : 'Before you assign'}</p>
            <h2 className="noStartModal__title">{title}</h2>
          </div>
          <button
            className="noStartModal__close"
            type="button"
            onClick={onClose}
            aria-label={locale === 'ru' ? 'Закрыть' : 'Close'}
            title={locale === 'ru' ? 'Закрыть' : 'Close'}
          >
            ×
          </button>
        </header>

        <div className="noStartModal__body">
          <p className="noStartModal__text">{text}</p>
        </div>

        <footer className="noStartModal__footer">
          <button type="button" className="noStartModal__cancel" onClick={onClose}>
            {locale === 'ru' ? 'Отмена' : 'Cancel'}
          </button>
          <button
            type="button"
            className="noStartModal__confirm"
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {locale === 'ru' ? 'Назначить' : 'Assign'}
          </button>
        </footer>
      </div>
    </div>
  )
}

