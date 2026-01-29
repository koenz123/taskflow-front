import { Outlet } from 'react-router-dom'
import { Header } from '@/widgets/header/Header'
import { Footer } from '@/widgets/footer/Footer'
import './app-shell.css'

export function AppShell() {
  return (
    <div className="appShell">
      <Header />
      <div className="appShell__content">
        <Outlet />
      </div>
      <Footer />
    </div>
  )
}

