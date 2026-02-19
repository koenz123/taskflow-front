import { useEffect } from 'react'
import { fetchTasks, useTasksMeta } from '@/entities/task/lib/useTasks'
import { SplashScreen } from '@/shared/ui/SplashScreen'

const USE_API = import.meta.env.VITE_DATA_SOURCE === 'api'

export function RequireTasksLoaded({ children }: { children: React.ReactNode }) {
  const meta = useTasksMeta()

  useEffect(() => {
    if (!USE_API) return
    void fetchTasks()
  }, [])

  if (!USE_API) return <>{children}</>
  if (!meta.loaded) return <SplashScreen />
  return <>{children}</>
}

