import { Outlet } from 'react-router-dom'
import { useEffect } from 'react'
import { Header } from '@/widgets/header/Header'
import { Sidebar } from '@/widgets/sidebar/Sidebar'
import { BottomNav } from '@/widgets/bottom-nav/BottomNav'
import { runTaskAssignmentJobs } from '@/entities/taskAssignment/lib/taskAssignmentJobs'
import './app-shell.css'

export function AppShell() {
  useEffect(() => {
    const run = () => runTaskAssignmentJobs(Date.now())
    run()
    const id = window.setInterval(run, 60_000)
    return () => window.clearInterval(id)
  }, [])

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

