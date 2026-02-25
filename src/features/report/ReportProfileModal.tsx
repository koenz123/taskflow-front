import { useEffect, useMemo, useState } from 'react'
import type { UserRole } from '@/entities/user/model/user'
import { useI18n } from '@/shared/i18n/I18nContext'
import { CustomSelect } from '@/shared/ui/custom-select/CustomSelect'
import { getReportCategories } from './reportCatalog'
import './report-profile-modal.css'

type Props = {
  open: boolean
  ownerRole: UserRole | null
  ownerName?: string
  onClose: () => void
  onSubmit: (report: { categoryId: string; reasonId: string; detail: string }) => void
}

export function ReportProfileModal({ open, ownerRole, ownerName, onClose, onSubmit }: Props) {
  const { t } = useI18n()
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [selectedReasonId, setSelectedReasonId] = useState<string | null>(null)
  const [customDetail, setCustomDetail] = useState('')

  const categories = useMemo(() => {
    return getReportCategories(ownerRole)
  }, [ownerRole])

  useEffect(() => {
    if (!open || !ownerRole) return
    if (!categories.length) return
    setSelectedCategoryId((prev) => {
      if (prev && categories.some((c) => c.id === prev)) return prev
      return categories[0]?.id ?? null
    })
  }, [categories, open, ownerRole])

  useEffect(() => {
    if (!open || !ownerRole) return
    setSelectedReasonId(null)
    setCustomDetail('')
  }, [selectedCategoryId])

  const selectedCategory = useMemo(() => {
    if (!selectedCategoryId) return categories[0] ?? null
    return categories.find((c) => c.id === selectedCategoryId) ?? categories[0] ?? null
  }, [categories, selectedCategoryId])

  const currentReasons = selectedCategory?.reasons ?? []

  useEffect(() => {
    if (!open || !ownerRole) return
    if (!currentReasons.length) return
    setSelectedReasonId((prev) => {
      if (prev && currentReasons.some((r) => r.id === prev)) return prev
      return currentReasons[0]?.id ?? null
    })
  }, [currentReasons, open, ownerRole])

  const primaryReason = selectedReasonId ?? currentReasons[0]?.id ?? ''
  const isOther = primaryReason === 'other'

  const handleSubmit = () => {
    if (!selectedCategory || !primaryReason) return
    onSubmit({ categoryId: selectedCategory.id, reasonId: primaryReason, detail: customDetail.trim() })
    setSelectedCategoryId(categories[0]?.id ?? null)
    setSelectedReasonId(null)
    setCustomDetail('')
    onClose()
  }

  if (!open || !ownerRole) return null

  return (
    <div className="reportOverlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="reportModal" onClick={(e) => e.stopPropagation()}>
        <header className="reportModal__header">
          <div className="reportModal__headerContent">
            <p className="reportModal__label">{t('profile.report')}</p>
            <h2 className="reportModal__title">{ownerName ?? t('profile.report')}</h2>
          </div>
          <button className="reportModal__close" type="button" onClick={onClose} aria-label={t('common.cancel')}>
            ×
          </button>
        </header>

        <div className="reportModal__body">
          {selectedCategory ? (
            <section className="reportModal__section">
              <p className="reportModal__step">{t('profile.reportStep1')}</p>
              <div className="reportModal__selects">
                <CustomSelect
                  label={t('report.select.category')}
                  value={selectedCategory.id}
                  onChange={(value) => setSelectedCategoryId(value)}
                  options={categories.map((c) => ({ value: c.id, label: t(c.labelKey) }))}
                />
              </div>
            </section>
          ) : null}

          {selectedCategory && currentReasons.length > 0 ? (
            <section className="reportModal__section">
              <p className="reportModal__step">{t('profile.reportStep2')}</p>
              <div className="reportModal__selects">
                <CustomSelect
                  label={t('report.select.reason')}
                  value={primaryReason}
                  onChange={(value) => setSelectedReasonId(value)}
                  options={currentReasons.map((r) => ({ value: r.id, label: t(r.labelKey) }))}
                />
              </div>
              {isOther ? (
                <div className="reportModal__detailWrapper">
                  <textarea
                    className="reportModal__detail"
                    placeholder={t('profile.reportDetailPlaceholder')}
                    autoComplete="off"
                    value={customDetail}
                    onChange={(e) => setCustomDetail(e.target.value)}
                    rows={4}
                    autoFocus
                  />
                </div>
              ) : null}
            </section>
          ) : null}
        </div>

        <footer className="reportModal__footer">
          <button type="button" className="reportModal__cancel" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="reportModal__submit"
            onClick={handleSubmit}
            disabled={!selectedCategory || !primaryReason || (isOther && !customDetail.trim())}
          >
            {t('profile.submitReport')}
          </button>
        </footer>
      </div>
    </div>
  )
}
