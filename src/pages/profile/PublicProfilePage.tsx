import { Link, useParams } from 'react-router-dom'
import { paths } from '@/app/router/paths'
import { useI18n } from '@/shared/i18n/I18nContext'
import { useUsers } from '@/entities/user/lib/useUsers'
import { SocialLinks } from '@/shared/social/SocialLinks'
import './profile.css'

export function PublicProfilePage() {
  const { t } = useI18n()
  const { userId } = useParams()
  const users = useUsers()

  const user = userId ? users.find((u) => u.id === userId) ?? null : null

  if (!user) {
    return (
      <main className="profilePage">
        <div className="profileHero">
          <h1 className="profileTitle">{t('auth.profile')}</h1>
          <div className="profileEmpty">{t('task.details.notFound')}</div>
          <div>
            <Link to={paths.tasks}>{t('task.details.backToTasks')}</Link>
          </div>
        </div>
      </main>
    )
  }

  return (
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
                <span className="pill">{user.phone}</span>
                {user.company ? <span className="pill">{user.company}</span> : null}
              </div>
            </div>
          </div>

          <div className="profileActions">
            <Link className="profileBtn" to={paths.tasks}>
              {t('task.details.backToTasks')}
            </Link>
          </div>
        </div>

        <div className="profileSocials">
          <div className="profileSocialsTitle">{t('profile.socials')}</div>
          <SocialLinks socials={user.socials} />
        </div>
      </section>
    </main>
  )
}

