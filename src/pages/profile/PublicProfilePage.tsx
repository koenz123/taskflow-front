import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/shared/auth/AuthContext'
import { Link, useLocation, useParams } from 'react-router-dom'
import { paths, reportProfilePath, userReviewsPath } from '@/app/router/paths'
import { useI18n } from '@/shared/i18n/I18nContext'
import { fetchUserById, useUsers } from '@/entities/user/lib/useUsers'
import { SocialLinks } from '@/shared/social/SocialLinks'
import { useWorks } from '@/entities/work/lib/useWorks'
import { VideoEmbed } from '@/shared/ui/VideoEmbed'
import { PortfolioInline } from '@/pages/portfolio/PortfolioInline'
import { useRatings } from '@/entities/rating/lib/useRatings'
import { getEffectiveRatingSummaryForUser } from '@/shared/lib/ratingSummary'
import { useRatingAdjustments } from '@/entities/ratingAdjustment/lib/useRatingAdjustments'
import { useDevMode } from '@/shared/dev/devMode'
import { SplashScreen } from '@/shared/ui/SplashScreen'
import './profile.css'

export function PublicProfilePage() {
  const { t, locale } = useI18n()
  const { userId } = useParams()
  const location = useLocation()
  const users = useUsers()
  const auth = useAuth()
  const devMode = useDevMode()
  const ratings = useRatings()
  const adjustments = useRatingAdjustments()
  const USE_API = import.meta.env.VITE_DATA_SOURCE === 'api'
  const [loadedOnce, setLoadedOnce] = useState(false)

  const user = userId ? users.find((u) => u.id === userId) ?? null : null
  const works = useWorks(user?.id ?? null)
  const isOwner = user ? auth.user?.id === user.id : false
  // Show the portfolio section for cross-role views:
  // - customer -> executor: view executor works + completed tasks
  // - executor -> customer: view customer's completed tasks
  const showInlinePortfolio = Boolean(
    (auth.user?.role === 'customer' && user?.role === 'executor') ||
      (auth.user?.role === 'executor' && user?.role === 'customer'),
  )
  const ratingSummary = useMemo(
    () => getEffectiveRatingSummaryForUser(ratings, adjustments, user?.id),
    [ratings, adjustments, user?.id],
  )
  const backTo =
    (location.state as { backTo?: string } | null | undefined)?.backTo && typeof (location.state as any).backTo === 'string'
      ? ((location.state as any).backTo as string)
      : paths.tasks
  // Expect `/tasks/:taskId` shape (no additional segments).
  const isBackToTask = useMemo(() => /^\/tasks\/[^/]+$/.test(backTo), [backTo])
  const isBackToProfileApplications = useMemo(() => /^\/profile(\?|$)/.test(backTo) && backTo.includes('tab=applications'), [backTo])
  const backLabel = isBackToTask
    ? locale === 'ru'
      ? 'Назад к заданию'
      : 'Back to task'
    : isBackToProfileApplications
      ? locale === 'ru'
        ? 'Назад в заявки'
        : 'Back to applications'
    : t('task.details.backToTasks')

  useEffect(() => {
    if (!USE_API) return
    if (!userId) return
    setLoadedOnce(false)
    void fetchUserById(userId).finally(() => setLoadedOnce(true))
  }, [USE_API, userId])

  if (!user) {
    if (USE_API && userId && !loadedOnce) return <SplashScreen />
    return (
      <main className="profilePage">
        <div className="profileHero">
          <h1 className="profileTitle">{t('auth.profile')}</h1>
          <div className="profileEmpty">
            <strong>{t('profile.notFound.title')}</strong>
            <div style={{ marginTop: 6, opacity: 0.9 }}>{t('profile.notFound.text')}</div>
            {userId ? <div style={{ marginTop: 8, opacity: 0.75 }}>ID: {userId}</div> : null}
          </div>
          <div>
            <Link to={backTo}>{t('task.details.backToTasks')}</Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <>
      <main className="profilePage">
        <section className="profileHero">
          <div className="profileHeroTop">
          <div className="profileIdentity">
            <div className="profileAvatar" aria-hidden="true">
              {user.avatarDataUrl ? (
                <img className="profileAvatarImg" src={user.avatarDataUrl} alt={user.fullName} />
              ) : (
                <div className="profileAvatarMark" aria-hidden="true">
                  UI
                </div>
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <h1 className="profileTitle">{user.fullName}</h1>
              <div className="profileSubline">{user.email}</div>
              <div className="profileMetaLine">
                <span className="pill">{user.role === 'customer' ? t('profile.roleCustomer') : t('profile.roleExecutor')}</span>
                {ratingSummary ? (
                  <Link className="pill profileRatingLink" to={userReviewsPath(user.id)} state={{ backTo }}>
                    ★ {ratingSummary.avg.toFixed(1)} ({ratingSummary.count})
                  </Link>
                ) : null}
                <span className="pill">{user.phone}</span>
                {user.company ? <span className="pill">{user.company}</span> : null}
              </div>
          {devMode.enabled ? (
            <div className="profileMetaLine profileMetaLine--id">
              <span>
                {t('profile.personalIdLabel')}: {user.personalId}
              </span>
              {user.role === 'executor' ? (
                <span>
                  {t('profile.executorIdLabel')}: {user.id}
                </span>
              ) : null}
            </div>
          ) : null}
              <div className="profileSocials profileSocials--inline">
                <SocialLinks socials={user.socials} />
              </div>
            </div>
          </div>

          <div className="profileActions">
            <Link
              className="profileBtn"
              to={backTo}
              state={isBackToTask ? { fromProfileBack: true } : undefined}
            >
              <span aria-hidden="true" style={{ marginRight: 8 }}>
                ←
              </span>
              {backLabel}
            </Link>
            {!isOwner ? (
              <Link className="profileReportBtn" to={reportProfilePath(user.id)}>
                {t('profile.report')}
              </Link>
            ) : null}
          </div>
        </div>
      </section>
      {showInlinePortfolio && user ? (
        <section className="profileSection">
          <PortfolioInline ownerId={user.id} />
        </section>
      ) : works ? (
        <section className="profileSection profileWorksSection">
          <div className="profileSectionHeader">
            <h2 className="profileSectionTitle">{t('profile.workShowcase')}</h2>
            <div className="profileCount">{works.length}</div>
          </div>
          {works.length === 0 ? (
            <div className="profileEmpty">{t('profile.workEmpty')}</div>
          ) : (
          <div className="profileWorksGrid">
            {works.map((work) => (
              <div key={work.id} className="profileWorksCard">
                <div className="profileWorksCard__header">
                  <strong>{work.title}</strong>
                  {work.createdAt ? <span>{new Date(work.createdAt).toLocaleDateString()}</span> : null}
                </div>
                <p>{work.description}</p>
                {(() => {
                  const src = work.mediaUrl ?? work.videoUrl ?? null
                  if (!src) return null
                  return work.mediaType === 'photo' ? (
                    <img
                      src={src}
                      alt={work.title}
                      style={{ width: '100%', borderRadius: 10, marginTop: 6, objectFit: 'cover' }}
                    />
                  ) : (
                    <VideoEmbed src={src} />
                  )
                })()}
                {(work.mediaUrl ?? work.videoUrl) ? (
                  <a className="profileWorksCard__link" href={work.mediaUrl ?? work.videoUrl} target="_blank" rel="noreferrer">
                    {t('profile.videoLink')}
                  </a>
                ) : null}
              </div>
            ))}
          </div>
          )}
        </section>
      ) : null}
      </main>
    </>
  )
}
