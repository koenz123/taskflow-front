import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/shared/auth/AuthContext'
import { useI18n } from '@/shared/i18n/I18nContext'
import { paths, taskDetailsPath } from '@/app/router/paths'
import { useExecutorViolations } from '@/entities/executorSanction/lib/useExecutorViolations'
import { useTasks } from '@/entities/task/lib/useTasks'
import { pickText } from '@/entities/task/lib/taskText'
import './violations.css'

const DECAY_DAYS = 90
const DECAY_MS = DECAY_DAYS * 24 * 60 * 60 * 1000
const DISPLAY_MS = 4 * DECAY_MS

function sanctionKeyByIndex(n: number) {
  if (n <= 1) return 'violations.sanction.warning' as const
  if (n === 2) return 'violations.sanction.ratingPenalty5' as const
  if (n === 3) return 'violations.sanction.block24h' as const
  if (n === 4) return 'violations.sanction.block72h' as const
  return 'violations.sanction.ban' as const
}

function sanctionToneByIndex(n: number) {
  if (n <= 1) return 'warning'
  if (n === 2) return 'warning'
  return 'danger'
}

export function ViolationsPage() {
  const auth = useAuth()
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const tasks = useTasks()
  const user = auth.user!
  const violations = useExecutorViolations(user.role === 'executor' ? user.id : null)
  const [helpOpen, setHelpOpen] = useState(false)

  const taskById = useMemo(() => {
    const map = new Map<string, (typeof tasks)[number]>()
    for (const x of tasks) map.set(x.id, x)
    return map
  }, [tasks])

  const nowMs = Date.now()
  const sinceMs = nowMs - DISPLAY_MS

  const indexByViolationId = useMemo(() => {
    const inWindow = violations
      .filter((v) => {
        const ts = Date.parse(v.createdAt)
        return Number.isFinite(ts) && ts >= sinceMs
      })
      .slice()

    const byType = new Map<string, typeof inWindow>()
    for (const v of inWindow) {
      const list = byType.get(v.type) ?? []
      list.push(v)
      byType.set(v.type, list)
    }

    const map = new Map<string, number>()
    for (const [_type, list] of byType) {
      const sorted = list.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      let level = 0
      let lastTs: number | null = null
      for (const v of sorted) {
        const ts = Date.parse(v.createdAt)
        if (!Number.isFinite(ts)) continue
        if (lastTs != null) {
          const steps = Math.floor((ts - lastTs) / DECAY_MS)
          if (Number.isFinite(steps) && steps > 0) level = Math.max(0, level - steps)
        }
        level += 1
        map.set(v.id, level)
        lastTs = ts
      }
    }

    return map
  }, [sinceMs, violations])

  useEffect(() => {
    if (!helpOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHelpOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [helpOpen])

  if (user.role !== 'executor') {
    return (
      <main className="violationsPage">
        <div className="violationsContainer">
          <h1 className="violationsTitle">{t('violations.title')}</h1>
          <div className="violationsSubtitle" style={{ opacity: 0.85 }}>
            {locale === 'ru' ? 'Страница доступна только исполнителю.' : 'This page is available to executors only.'}
          </div>
        </div>
      </main>
    )
  }

  const list = violations
    .filter((v) => {
      const ts = Date.parse(v.createdAt)
      return Number.isFinite(ts) && ts >= sinceMs
    })
    .slice()
    // Show violations in chronological order (1st -> latest).
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  return (
    <main className="violationsPage">
      <div className="violationsContainer">
        <div className="violationsHeader">
          <div>
            <div className="violationsTitleRow">
              <button
                type="button"
                className="violationsBack"
                onClick={() => {
                  if (window.history.length > 1) navigate(-1)
                  else navigate(paths.profile)
                }}
                aria-label={t('task.details.back')}
                title={t('task.details.back')}
              >
                <span className="violationsBack__icon" aria-hidden="true">
                  ←
                </span>
              </button>
              <h1 className="violationsTitle">{t('violations.title')}</h1>
              <button
                type="button"
                className="violationsHelpBtn"
                aria-label={t('violations.help.buttonLabel')}
                title={t('violations.help.buttonLabel')}
                onClick={() => setHelpOpen(true)}
              >
                ?
              </button>
            </div>
            <div className="violationsSubtitle">{t('violations.subtitle')}</div>
          </div>
        </div>

        {list.length === 0 ? (
          <div className="violationsEmpty">{t('violations.empty')}</div>
        ) : (
          <ul className="violationsList" aria-label={t('violations.title')}>
            {list.map((v) => {
              const task = taskById.get(v.taskId) ?? null
              const taskTitle = task ? pickText(task.title, locale) : v.taskId
              const n = indexByViolationId.get(v.id) ?? 1
              const pillTone = sanctionToneByIndex(n)
              const created = new Date(v.createdAt).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US')
              const reasonKey =
                v.type === 'no_submit_24h' ? ('violations.reason.noSubmit24h' as const) : ('violations.reason.noStart12h' as const)

              return (
                <li key={v.id} className="violationsCard">
                  <div className="violationsCard__top">
                    <div className="violationsCard__meta">
                      <span className="violationsCard__date" title={t('violations.col.date')}>
                        {created}
                      </span>
                    </div>
                    <div className="violationsCard__badges">
                      <span className="violationsPill violationsPill--neutral" title={`#${n}`}>
                        #{n}
                      </span>
                      <span
                        className={`violationsPill ${pillTone === 'danger' ? 'violationsPill--danger' : 'violationsPill--warning'}`}
                        title={t('violations.col.sanction')}
                      >
                        {t(sanctionKeyByIndex(n))}
                      </span>
                    </div>
                  </div>

                  <div className="violationsCard__row">
                    <div className="violationsCard__label">{t('violations.col.task')}</div>
                    <div className="violationsCard__value">
                      <Link className="violationsLink" to={taskDetailsPath(v.taskId)}>
                        {taskTitle}
                      </Link>
                    </div>
                  </div>

                  <div className="violationsCard__row">
                    <div className="violationsCard__label">{t('violations.col.reason')}</div>
                    <div className="violationsCard__value">{t(reasonKey)}</div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {helpOpen ? (
        <div
          className="violationsHelpOverlay"
          role="dialog"
          aria-modal="true"
          aria-label={t('violations.help.title')}
          onClick={() => setHelpOpen(false)}
        >
          <div className="violationsHelpModal" onClick={(e) => e.stopPropagation()}>
            <div className="violationsHelpHeader">
              <h2 className="violationsHelpTitle">{t('violations.help.title')}</h2>
              <button
                type="button"
                className="violationsHelpClose"
                onClick={() => setHelpOpen(false)}
                aria-label={locale === 'ru' ? 'Закрыть' : 'Close'}
                title={locale === 'ru' ? 'Закрыть' : 'Close'}
              >
                ×
              </button>
            </div>
            <div className="violationsHelpBody">
              <p>{t('violations.help.p1')}</p>
              <p>
                <strong>{locale === 'ru' ? 'Нарушения:' : 'Violations:'}</strong>
              </p>
              <ul>
                <li>{t('violations.help.violation.noStart12h')}</li>
                <li>{t('violations.help.violation.noSubmit24h')}</li>
              </ul>
              <p>
                <strong>{t('violations.help.sanctionsTitle')}</strong>
              </p>
              <ul>
                <li>{t('violations.help.sanctions.warning')}</li>
                <li>{t('violations.help.sanctions.ratingPenalty')}</li>
                <li>{t('violations.help.sanctions.block24')}</li>
                <li>{t('violations.help.sanctions.block72')}</li>
                <li>{t('violations.help.sanctions.ban')}</li>
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

