import { Navigate, Route, Routes } from 'react-router-dom'
import { paths } from './paths'
import { HomePage } from '@/pages/home/HomePage'
import { LoginPage } from '@/pages/login/LoginPage'
import { ForgotPasswordPage } from '@/pages/login/ForgotPasswordPage'
import { NotFoundPage } from '@/pages/not-found/NotFoundPage'
import { RegisterPage } from '@/pages/register/RegisterPage'
import { AppShell } from '@/app/layout/AppShell'
import { TasksPage } from '@/pages/tasks/TasksPage'
import { CreateTaskPage } from '@/pages/tasks/CreateTaskPage'
import { TaskDetailsPage } from '@/pages/tasks/TaskDetailsPage'
import { EditTaskPage } from '@/pages/tasks/EditTaskPage'
import { ProfilePage } from '@/pages/profile/ProfilePage'
import { EditProfilePage } from '@/pages/profile/EditProfilePage'
import { PublicProfilePage } from '@/pages/profile/PublicProfilePage'

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path={paths.home} element={<HomePage />} />
        <Route path={paths.login} element={<LoginPage />} />
        <Route path={paths.forgotPassword} element={<ForgotPasswordPage />} />
        <Route path={paths.register} element={<RegisterPage />} />
        <Route path={paths.profile} element={<ProfilePage />} />
        <Route path={paths.profileEdit} element={<EditProfilePage />} />
        <Route path={paths.userProfile} element={<PublicProfilePage />} />
        <Route path={paths.tasks} element={<TasksPage />} />
        <Route path={paths.taskCreate} element={<CreateTaskPage />} />
        <Route path={paths.taskDetails} element={<TaskDetailsPage />} />
        <Route path={paths.taskEdit} element={<EditTaskPage />} />

        <Route path="/home" element={<Navigate to={paths.home} replace />} />

        <Route path={paths.notFound} element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

