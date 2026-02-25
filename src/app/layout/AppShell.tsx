import { Outlet, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { Header } from '@/widgets/header/Header'
import { Sidebar } from '@/widgets/sidebar/Sidebar'
import { BottomNav } from '@/widgets/bottom-nav/BottomNav'
import { runTaskAssignmentJobs } from '@/entities/taskAssignment/lib/taskAssignmentJobs'
import { useAuth } from '@/shared/auth/AuthProvider'
import { isArbiterAccount, userRepo } from '@/entities/user/lib/userRepo'
import { paths } from '@/app/router/paths'
import './app-shell.css'

export function AppShell() {
  const auth = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (auth.status !== 'authenticated') return
    if (auth.user?.role === 'pending') {
      if (isArbiterAccount(auth.user)) {
        userRepo.forceArbiterRole(auth.user.id)
        navigate(paths.disputes, { replace: true })
      } else {
        navigate(paths.chooseRole, { replace: true })
      }
      return
    }
    const run = () => runTaskAssignmentJobs(Date.now())
    run()
    const id = window.setInterval(run, 60_000)
    return () => window.clearInterval(id)
  }, [auth.status, auth.user?.role, navigate])

  return (
    <div className="appShell">
      <Sidebar />
      <div className="appShell__main">
        <Header />
        <div className="appShell__content">
          <Outlet />
        </div>
      </div>
      <BottomNav />
    </div>
  )
}

