import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { paths, taskDetailsPath, userProfilePath } from '@/app/router/paths'
import { useAuth } from '@/shared/auth/AuthContext'
import { useI18n } from '@/shared/i18n/I18nContext'
import { useTasks } from '@/entities/task/lib/useTasks'
import { pickText } from '@/entities/task/lib/taskText'
import { SocialLinks } from '@/shared/social/SocialLinks'
import { useUsers } from '@/entities/user/lib/useUsers'
import { formatTimeLeft, timeLeftMs } from '@/entities/task/lib/taskDeadline'
import { fileToAvatarDataUrl } from '@/shared/lib/image'
import { applicationRepo } from '@/entities/task/lib/applicationRepo'
import { taskRepo } from '@/entities/task/lib/taskRepo'
import { useApplications } from '@/entities/task/lib/useApplications'
import { notificationRepo } from '@/entities/notification/lib/notificationRepo'
import './profile.css'

export function ProfilePage() {
  const { t, locale } = useI18n()
  const auth = useAuth()
  const tasks = useTasks()
  const users = useUsers()
  const MAX_PREVIEW = 6
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [isSwitchOpen, setIsSwitchOpen] = useState(false)
  const switchRef = useRef<HTMLDivElement | null>(null)
  const [applicationsOpen, setApplicationsOpen] = useState(false)
  const applications = useApplications()
  const [openList, setOpenList] = useState<null | 'customerMy' | 'executorActive' | 'executorCompleted'>(null)
  const navigate = useNavigate()

  const currentUserLabel = useMemo(() => {
    const u = users.find((x) => x.id === auth.user?.id) ?? auth.user
    if (!u) return ''
    return `${u.email} (${u.role})`
  }, [users, auth.user])

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!isSwitchOpen) return

    const onPointerDown = (e: PointerEvent) => {
      const el = switchRef.current
      if (!el) return
      if (e.target instanceof Node && !el.contains(e.target)) setIsSwitchOpen(false)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsSwitchOpen(false)
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isSwitchOpen])

  useEffect(() => {
    if (!openList) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenList(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openList])

  const user = auth.user
  const posted = user ? tasks.filter((x) => x.createdByUserId === user.id) : []
  const taken = user ? tasks.filter((x) => x.assignedToUserId === user.id && x.status === 'in_progress') : []
  const completed = user
    ? tasks
        .filter((x) => x.assignedToUserId === user.id && x.status === 'closed')
        .filter((x) => typeof x.completedAt === 'string' && x.completedAt && x.completedAt <= x.expiresAt)
    : []

  const postedMy = posted.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const myActive = taken.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const myCompleted = completed.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const postedMyPreview = postedMy.slice(0, MAX_PREVIEW)
  const myActivePreview = myActive.slice(0, MAX_PREVIEW)
  const myCompletedPreview = myCompleted.slice(0, MAX_PREVIEW)

  const modalTitle = openList
    ? openList === 'customerMy'
      ? t('profile.myTasks')
      : openList === 'executorActive'
        ? t('profile.postedActive')
        : t('profile.postedCompleted')
    : ''

  const customerTaskIds = posted.map((x) => x.id)
  const customerApplications = applications
    .filter((app) => customerTaskIds.includes(app.taskId))
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const postedTaskMap = new Map<string, typeof posted[number]>()
  for (const task of posted) {
    postedTaskMap.set(task.id, task)
  }

  const modalItems = openList
    ? openList === 'customerMy'
      ? postedMy
      : openList === 'executorActive'
        ? myActive
        : myCompleted
    : []

  if (!user) {
    return (
      <main className="profilePage">
        <div className="profileHero">
          <h1 className="profileTitle">{t('auth.profile')}</h1>
          <div className="profileEmpty">
            <Link to={paths.login}>{t('auth.signIn')}</Link>
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
            <label className="profileAvatar profileAvatarUpload" title={t('profile.avatar.hint')}>
              <input
                className="profileAvatarInput"
                type="file"
                accept="image/*"
                disabled={avatarBusy}
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0]
                  if (!file) return
                  void (async () => {
                    setAvatarBusy(true)
                    try {
                      const avatarDataUrl = await fileToAvatarDataUrl(file, 160)
                      auth.updateProfile({
                        fullName: user.fullName,
                        phone: user.phone,
                        email: user.email,
                        company: user.company,
                        socials: user.socials,
                        avatarDataUrl,
                      })
                    } finally {
                      setAvatarBusy(false)
                      e.currentTarget.value = ''
                    }
                  })()
                }}
              />
              {user.avatarDataUrl ? (
                <img className="profileAvatarImg" src={user.avatarDataUrl} alt={t('profile.avatar.change')} />
              ) : (
                <div className="profileAvatarMark" aria-hidden="true">
                  UI
                </div>
              )}
              <div className="profileAvatarOverlay" aria-label={t('profile.avatar.upload')}>
                {avatarBusy ? (
                  <span className="profileAvatarOverlayIcon" aria-hidden="true">
                    ⏳
                  </span>
                ) : (
                  <svg
                    className="profileAvatarOverlayIcon"
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M9 7L10.2 5.4C10.5 5 11 4.8 11.5 4.8H12.5C13 4.8 13.5 5 13.8 5.4L15 7"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M20 7H4C2.9 7 2 7.9 2 9V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V9C22 7.9 21.1 7 20 7Z"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M12 17C13.7 17 15 15.7 15 14C15 12.3 13.7 11 12 11C10.3 11 9 12.3 9 14C9 15.7 10.3 17 12 17Z"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
            </label>
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
            <div className="profileSelectWrap" ref={switchRef}>
              <button
                type="button"
                className="profileSelectBtn"
                aria-haspopup="menu"
                aria-expanded={isSwitchOpen}
                onClick={() => setIsSwitchOpen((v) => !v)}
                title={t('account.switch')}
              >
                <span className="profileSelectValue">{currentUserLabel}</span>
                <span className="profileSelectChevron" aria-hidden="true">
                  ▾
                </span>
              </button>

              {isSwitchOpen ? (
                <div className="profileSelectMenu" role="menu" aria-label={t('account.switch')}>
                  {users.map((u) => {
                    const active = u.id === auth.user?.id
                    return (
                      <button
                        key={u.id}
                        type="button"
                        role="menuitem"
                        className={`profileSelectItem${active ? ' profileSelectItem--active' : ''}`}
                        onClick={() => {
                          auth.switchUser(u.id)
                          setIsSwitchOpen(false)
                        }}
                      >
                        <span className="profileSelectItemText">
                          {u.email} ({u.role})
                        </span>
                        {active ? <span className="profileSelectItemMark">✓</span> : null}
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>
          {user.role === 'customer' ? (
            <button type="button" className="profileBtn" onClick={() => setApplicationsOpen(true)}>
              {t('profile.applications')}
            </button>
          ) : null}
            <Link className="profileBtn" to={paths.register}>
              {t('account.add')}
            </Link>
            <Link className="profileBtn" to={paths.profileEdit}>
              {t('profile.edit')}
            </Link>
            <button
              type="button"
              className="profileBtn"
              onClick={() => {
                auth.signOut()
                navigate(paths.login)
              }}
            >
              {t('auth.signOut')}
            </button>
          </div>
        </div>

        <div className="profileSocials">
          <div className="profileSocialsTitle">{t('profile.socials')}</div>
          <SocialLinks socials={user.socials} />
        </div>
      </section>

      {user.role === 'customer' ? (
        <div className="profileGrid">
          <section className="profileSection">
            <div className="profileSectionHeader">
              <h2 className="profileSectionTitle">{t('profile.myTasks')}</h2>
              <div className="profileSectionHeaderRight">
                {postedMy.length > MAX_PREVIEW ? (
                  <button type="button" className="profileShowAllBtn" onClick={() => setOpenList('customerMy')}>
                    {t('profile.showAll')}
                  </button>
                ) : null}
                <div className="profileCount">{postedMy.length}</div>
              </div>
            </div>

            {postedMy.length === 0 ? (
              <div className="profileEmpty">
                {t('profile.noneYet')} <Link to={paths.taskCreate}>{t('nav.postTask')}</Link>
              </div>
            ) : (
              <ul className="profileList">
                {postedMyPreview.map((x) => {
                  const assigned = x.assignedToUserId ? users.find((u) => u.id === x.assignedToUserId) ?? null : null
                  const left = timeLeftMs(x.expiresAt, nowMs)
                  return (
                    <li key={x.id} className="profileItem">
                      <div className="profileItemTitleRow">
                        <Link className="profileItemTitle" to={taskDetailsPath(x.id)}>
                          {pickText(x.title, locale)}
                        </Link>
                        <span className="pill">
                          {t(
                            x.status === 'closed' ? 'task.status.closed' : x.status === 'in_progress' ? 'task.status.inProgress' : 'task.status.open',
                          )}
                        </span>
                      </div>

                      {x.status !== 'closed' || assigned ? (
                        <div className="profileItemMeta">
                          {x.status !== 'closed' ? (
                            <span className="pill">
                              {t('tasks.timeLeft')}: {left === 0 ? t('tasks.expired') : formatTimeLeft(left, locale)}
                            </span>
                          ) : null}
                          {assigned ? (
                            <span className="pill">
                              {t('profile.takenBy')} <Link to={userProfilePath(assigned.id)}>{assigned.fullName}</Link>
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      ) : (
        <div className="profileGrid">
          <section className="profileSection">
            <div className="profileSectionHeader">
              <h2 className="profileSectionTitle">{t('profile.postedActive')}</h2>
              <div className="profileSectionHeaderRight">
                {myActive.length > MAX_PREVIEW ? (
                  <button type="button" className="profileShowAllBtn" onClick={() => setOpenList('executorActive')}>
                    {t('profile.showAll')}
                  </button>
                ) : null}
                <div className="profileCount">{myActive.length}</div>
              </div>
            </div>
            {myActive.length === 0 ? (
              <div className="profileEmpty">
                {t('profile.noneYet')} <Link to={paths.tasks}>{t('profile.takeTask')}</Link>
              </div>
            ) : (
              <ul className="profileList">
                {myActivePreview.map((x) => (
                  <li key={x.id} className="profileItem">
                    <div className="profileItemTitleRow">
                      <Link className="profileItemTitle" to={taskDetailsPath(x.id)}>
                        {pickText(x.title, locale)}
                      </Link>
                      <span className="pill">{t('task.status.inProgress')}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="profileSection">
            <div className="profileSectionHeader">
              <h2 className="profileSectionTitle">{t('profile.postedCompleted')}</h2>
              <div className="profileSectionHeaderRight">
                {myCompleted.length > MAX_PREVIEW ? (
                  <button type="button" className="profileShowAllBtn" onClick={() => setOpenList('executorCompleted')}>
                    {t('profile.showAll')}
                  </button>
                ) : null}
                <div className="profileCount">{myCompleted.length}</div>
              </div>
            </div>

            {myCompleted.length === 0 ? (
              <div className="profileEmpty">{t('profile.noneYet')}</div>
            ) : (
              <ul className="profileList">
                {myCompletedPreview.map((x) => (
                  <li key={x.id} className="profileItem">
                    <div className="profileItemTitleRow">
                      <Link className="profileItemTitle" to={taskDetailsPath(x.id)}>
                        {pickText(x.title, locale)}
                      </Link>
                      <span className="pill">{t('task.status.closed')}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {openList ? (
        <div className="profileModalOverlay" role="dialog" aria-modal="true" aria-label={modalTitle} onClick={() => setOpenList(null)}>
          <div className="profileModal" onClick={(e) => e.stopPropagation()}>
            <div className="profileModalHeader">
              <h2 className="profileModalTitle">{modalTitle}</h2>
              <button type="button" className="profileModalClose" onClick={() => setOpenList(null)}>
                {t('common.cancel')}
              </button>
            </div>

            {modalItems.length === 0 ? (
              <div className="profileEmpty">{t('profile.noneYet')}</div>
            ) : (
              <ul className="profileList">
                {modalItems.map((x) => {
                  const assigned = x.assignedToUserId ? users.find((u) => u.id === x.assignedToUserId) ?? null : null
                  const left = timeLeftMs(x.expiresAt, nowMs)
                  const statusKey =
                    x.status === 'closed' ? 'task.status.closed' : x.status === 'in_progress' ? 'task.status.inProgress' : 'task.status.open'

                  return (
                    <li key={x.id} className="profileItem">
                      <div className="profileItemTitleRow">
                        <Link className="profileItemTitle" to={taskDetailsPath(x.id)} onClick={() => setOpenList(null)}>
                          {pickText(x.title, locale)}
                        </Link>
                        <span className="pill">{t(statusKey)}</span>
                      </div>

                      {openList === 'customerMy' && (x.status !== 'closed' || assigned) ? (
                        <div className="profileItemMeta">
                          {x.status !== 'closed' ? (
                            <span className="pill">
                              {t('tasks.timeLeft')}: {left === 0 ? t('tasks.expired') : formatTimeLeft(left, locale)}
                            </span>
                          ) : null}
                          {assigned ? (
                            <span className="pill">
                              {t('profile.takenBy')}{' '}
                              <Link to={userProfilePath(assigned.id)} onClick={() => setOpenList(null)}>
                                {assigned.fullName}
                              </Link>
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {applicationsOpen ? (
        <div
          className="profileModalOverlay"
          role="dialog"
          aria-modal="true"
          aria-label={t('profile.applications')}
          onClick={() => setApplicationsOpen(false)}
        >
          <div className="profileModal" onClick={(e) => e.stopPropagation()}>
            <div className="profileModalHeader">
              <h2 className="profileModalTitle">{t('profile.applications')}</h2>
              <button type="button" className="profileModalClose" onClick={() => setApplicationsOpen(false)}>
                {t('common.cancel')}
              </button>
            </div>

            {customerApplications.length === 0 ? (
              <div className="profileEmpty">{t('profile.noneYet')}</div>
            ) : (
              <ul className="profileList">
                {customerApplications.map((app) => {
                  const task = postedTaskMap.get(app.taskId)
                  const executor = users.find((u) => u.id === app.executorUserId)
                  const statusKey =
                    app.status === 'selected' ? 'task.status.inProgress' : app.status === 'rejected' ? 'task.status.closed' : 'task.status.open'
                  return (
                    <li key={app.id} className="profileItem">
                      <div className="profileItemTitleRow">
                        <Link to={task ? taskDetailsPath(task.id) : paths.tasks} onClick={() => setApplicationsOpen(false)}>
                          {task ? pickText(task.title, locale) : t('task.details.backToTasks')}
                        </Link>
                        <span className="pill">{t(statusKey)}</span>
                      </div>
                      <div className="profileItemMeta">
                        <span className="pill">
                          {executor?.fullName ?? executor?.email ?? t('notifications.someone')}
                        </span>
                        <span className="pill">{new Date(app.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="applicationItemMessage">{app.message ?? t('task.application.placeholder')}</p>
                      {app.status === 'pending' ? (
                        <div style={{ display: 'flex', gap: 10 }}>
                          <button
                            type="button"
                            className="linkBtn"
                            onClick={() => {
                              if (!task) return
                              taskRepo.update(task.id, (prev) => ({
                                ...prev,
                                status: 'in_progress',
                                assignedToUserId: app.executorUserId,
                                takenAt: new Date().toISOString(),
                              }))
                              applicationRepo.select(app.id)
                              notificationRepo.addTaskAssigned({
                                recipientUserId: app.executorUserId,
                                actorUserId: user.id,
                                taskId: task.id,
                              })
                            }}
                          >
                            {t('task.actions.assign')}
                          </button>
                          <button type="button" className="linkBtn" onClick={() => applicationRepo.reject(app.id)}>
                            {t('task.actions.reject')}
                          </button>
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </main>
  )
}

