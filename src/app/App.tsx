import { AppRouter } from './router/AppRouter'
import { useAuth } from '@/shared/auth/AuthProvider'
import { SplashScreen } from '@/shared/ui/SplashScreen'

export function App() {
  const auth = useAuth()
  if (auth.status === 'loading') return <SplashScreen />
  return <AppRouter />
}

