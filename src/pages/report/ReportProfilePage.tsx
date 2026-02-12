import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useI18n } from '@/shared/i18n/I18nContext'
import { useUsers } from '@/entities/user/lib/useUsers'
import { useAuth } from '@/shared/auth/AuthContext'
import { userProfilePath } from '@/app/router/paths'
import { CustomSelect } from '@/shared/ui/custom-select/CustomSelect'
import { getReportCategories } from '@/features/report/reportCatalog'
import './report-page.css'

export function ReportProfilePage() {
  const { t } = useI18n()
  const auth = useAuth()
  const navigate = useNavigate()
  const { userId } = useParams<{ userId: string }>()
  const users = useUsers()

  const owner = userId ? users.find((u) => u.id === userId) ?? null : null

  const categories = useMemo(() => {
    return getReportCategories(owner?.role ?? null)
  }, [owner?.role])

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [selectedReasonId, setSelectedReasonId] = useState<string | null>(null)
  const [customDetail, setCustomDetail] = useState('')

  useEffect(() => {
    if (!categories.length) return
    setSelectedCategoryId((prev) => {
      if (prev && categories.some((c) => c.id === prev)) return prev
      return categories[0]?.id ?? null
    })
  }, [categories])

  useEffect(() => {
    setSelectedReasonId(null)
    setCustomDetail('')
  }, [selectedCategoryId])

  const selectedCategory = useMemo(() => {
    if (!selectedCategoryId) return categories[0] ?? null
    return categories.find((c) => c.id === selectedCategoryId) ?? categories[0] ?? null
  }, [categories, selectedCategoryId])

  const currentReasons = selectedCategory?.reasons ?? []

  useEffect(() => {
    if (!currentReasons.length) return
    setSelectedReasonId((prev) => {
      if (prev && currentReasons.some((r) => r.id === prev)) return prev
      return currentReasons[0]?.id ?? null
    })
  }, [selectedCategory?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const primaryReason = selectedReasonId ?? currentReasons[0]?.id ?? ''
  const isOther = primaryReason === 'other'

  const canSubmit = Boolean(owner && auth.user && selectedCategory && primaryReason && (!isOther || customDetail.trim()))

  const submit = () => {
    if (!owner || !auth.user || !selectedCategory || !primaryReason) return
    const payload = { ownerId: owner.id, categoryId: selectedCategory.id, reasonId: primaryReason, detail: customDetail.trim() }
    console.log('report submitted', payload)
    alert(t('profile.reportSent', { personalId: owner.personalId }))
    navigate(userProfilePath(owner.id))
  }

  if (!owner) {
    return (
      <main className="reportPage">
        <div className="reportPage__card">
          <div className="reportPage__top">
            <h1 className="reportPage__title">{t('profile.report')}</h1>
            <Link className="reportPage__back" to="/tasks">
              ← {t('tasks.back')}
            </Link>
          </div>
          <div className="reportPage__empty">{t('task.details.notFound')}</div>
        </div>
      </main>
    )
  }

  return (
    <main className="reportPage">
      <div className="reportPage__card">
        <div className="reportPage__top">
          <div>
            <p className="reportPage__kicker">{t('profile.report')}</p>
            <h1 className="reportPage__title">{owner.fullName}</h1>
            <p className="reportPage__subtitle">{owner.email}</p>
          </div>
          <div className="reportPage__topActions">
            <Link className="reportPage__back" to={userProfilePath(owner.id)}>
              ← {t('notifications.viewProfile')}
            </Link>
          </div>
        </div>

        <section className="reportPage__section">
          <p className="reportPage__step">{t('profile.reportStep1')}</p>
          <CustomSelect
            label={t('report.select.category')}
            value={(selectedCategory?.id ?? categories[0]?.id ?? '') as string}
            onChange={(value) => setSelectedCategoryId(value)}
            options={categories.map((c) => ({ value: c.id, label: t(c.labelKey) }))}
          />
        </section>

        {selectedCategory && currentReasons.length > 0 ? (
          <section className="reportPage__section">
            <p className="reportPage__step">{t('profile.reportStep2')}</p>
            <CustomSelect
              label={t('report.select.reason')}
              value={(primaryReason ?? '') as string}
              onChange={(value) => setSelectedReasonId(value)}
              options={currentReasons.map((r) => ({ value: r.id, label: t(r.labelKey) }))}
            />

            {isOther ? (
              <textarea
                className="reportPage__detail"
                placeholder={t('profile.reportDetailPlaceholder')}
                value={customDetail}
                onChange={(e) => setCustomDetail(e.target.value)}
                rows={4}
                autoFocus
              />
            ) : null}
          </section>
        ) : null}

        <footer className="reportPage__footer">
          <Link className="reportPage__cancel" to={userProfilePath(owner.id)}>
            {t('common.cancel')}
          </Link>
          <button type="button" className="reportPage__submit" onClick={submit} disabled={!canSubmit}>
            {t('profile.submitReport')}
          </button>
        </footer>
      </div>
    </main>
  )
}

