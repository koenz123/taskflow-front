import { useMemo } from 'react'
import { useI18n } from '@/shared/i18n/I18nContext'
import './pagination.css'

export function Pagination(props: { page: number; pageCount: number; onChange: (page: number) => void }) {
  const { locale } = useI18n()
  const page = Number.isFinite(props.page) && props.page > 0 ? Math.floor(props.page) : 1
  const pageCount = Number.isFinite(props.pageCount) && props.pageCount > 0 ? Math.floor(props.pageCount) : 1

  const canPrev = page > 1
  const canNext = page < pageCount

  const label = useMemo(() => {
    if (locale === 'ru') return `Стр. ${page} из ${pageCount}`
    return `Page ${page} of ${pageCount}`
  }, [locale, page, pageCount])

  if (pageCount <= 1) return null

  return (
    <div className="pager" role="navigation" aria-label={locale === 'ru' ? 'Пагинация' : 'Pagination'}>
      <button type="button" className="pager__btn" onClick={() => props.onChange(page - 1)} disabled={!canPrev}>
        {locale === 'ru' ? '← Назад' : '← Prev'}
      </button>
      <div className="pager__text" aria-live="polite">
        {label}
      </div>
      <button type="button" className="pager__btn" onClick={() => props.onChange(page + 1)} disabled={!canNext}>
        {locale === 'ru' ? 'Дальше →' : 'Next →'}
      </button>
    </div>
  )
}

