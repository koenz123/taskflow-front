import { Navigate, Route, Routes } from 'react-router-dom'
import { paths } from './paths'
import { LoginPage } from '@/pages/login/LoginPage'
import { ForgotPasswordPage } from '@/pages/login/ForgotPasswordPage'
import { NotFoundPage } from '@/pages/not-found/NotFoundPage'
import { RegisterPage } from '@/pages/register/RegisterPage'
import { VerifyEmailPage } from '@/pages/verify-email/VerifyEmailPage'
import { VerifyEmailSentPage } from '@/pages/verify-email/VerifyEmailSentPage'
import { AppShell } from '@/app/layout/AppShell'
import { AuthShell } from '@/app/layout/AuthShell'
import { TasksPage } from '@/pages/tasks/TasksPage'
import { CreateTaskPage } from '@/pages/tasks/CreateTaskPage'
import { TaskDetailsPage } from '@/pages/tasks/TaskDetailsPage'
import { EditTaskPage } from '@/pages/tasks/EditTaskPage'
import { ProfilePage } from '@/pages/profile/ProfilePage'
import { EditProfilePage } from '@/pages/profile/EditProfilePage'
import { PublicProfilePage } from '@/pages/profile/PublicProfilePage'
import { PortfolioPage } from '@/pages/portfolio/PortfolioPage'
import { CustomerTasksPage } from '@/pages/profile/CustomerTasksPage'
import { ArchivesPage } from '@/pages/profile/ArchivesPage'
import { CustomerReviewsPage } from '@/pages/profile/CustomerReviewsPage'
import { CustomerRequestsPage } from '@/pages/profile/CustomerRequestsPage'
import { HomePage } from '@/pages/home/HomePage'
import { useAuth } from '@/shared/auth/AuthContext'
import { ReportProfilePage } from '@/pages/report/ReportProfilePage'
import { NotificationsPage } from '@/pages/notifications/NotificationsPage'
import { ViolationsPage } from '@/pages/violations/ViolationsPage'
import { ReviewsPage } from '@/pages/reviews/ReviewsPage'
import { DisputesInboxPage } from '@/pages/disputes/DisputesInboxPage'
import { DisputeThreadPage } from '@/pages/disputes/DisputeThreadPage'
import { ChooseRolePage } from '@/pages/choose-role/ChooseRolePage'
import { ProtectedRoute } from '@/shared/auth/ProtectedRoute'

export function AppRouter() {
  const auth = useAuth()
  const isCustomer = auth.user?.role === 'customer'
  const isExecutor = auth.user?.role === 'executor'
  const isArbiter = auth.user?.role === 'arbiter'

  return (
    <Routes>
      <Route element={<AuthShell />}>
        <Route path={paths.login} element={<LoginPage />} />
        <Route path={paths.forgotPassword} element={<ForgotPasswordPage />} />
        <Route
          path={paths.chooseRole}
          element={
            <ProtectedRoute>
              <ChooseRolePage />
            </ProtectedRoute>
          }
        />
        <Route path={paths.register} element={<RegisterPage />} />
        <Route path={paths.verifyEmailSent} element={<VerifyEmailSentPage />} />
        <Route path={paths.verifyEmail} element={<VerifyEmailPage />} />
      </Route>

      <Route
        element={
          auth.status === 'authenticated' && auth.user?.role === 'pending' ? <Navigate to={paths.chooseRole} replace /> : <AppShell />
        }
      >
        <Route
          path={paths.profile}
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path={paths.profileEdit}
          element={
            <ProtectedRoute>
              <EditProfilePage />
            </ProtectedRoute>
          }
        />
        <Route path={paths.reviews} element={<ReviewsPage />} />
        <Route
          path={paths.notifications}
          element={
            <ProtectedRoute>
              <NotificationsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path={paths.violations}
          element={
            <ProtectedRoute>
              <ViolationsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path={paths.disputes}
          element={
            <ProtectedRoute>
              {isArbiter ? <DisputesInboxPage /> : <Navigate to={paths.profile} replace />}
            </ProtectedRoute>
          }
        />
        <Route
          path={paths.disputeThread}
          element={
            <ProtectedRoute>
              <DisputeThreadPage />
            </ProtectedRoute>
          }
        />
        <Route path={paths.userProfile} element={<PublicProfilePage />} />
        <Route path={paths.userReviews} element={<ReviewsPage />} />
        <Route
          path={paths.reportProfile}
          element={
            <ProtectedRoute>
              <ReportProfilePage />
            </ProtectedRoute>
          }
        />
        <Route path={paths.tasks} element={isCustomer ? <Navigate to={paths.customerTasks} replace /> : <TasksPage />} />
        <Route
          path={paths.customerTasks}
          element={
            <ProtectedRoute>
              <CustomerTasksPage />
            </ProtectedRoute>
          }
        />
        <Route
          path={paths.customerArchive}
          element={
            <ProtectedRoute>
              <ArchivesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path={paths.customerReview}
          element={
            <ProtectedRoute>
              <CustomerReviewsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path={paths.customerRequests}
          element={
            <ProtectedRoute>
              <CustomerRequestsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path={paths.taskCreate}
          element={
            <ProtectedRoute>
              <CreateTaskPage />
            </ProtectedRoute>
          }
        />
        <Route
          path={paths.taskDetails}
          element={
            <ProtectedRoute>
              <TaskDetailsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path={paths.taskEdit}
          element={
            <ProtectedRoute>
              <EditTaskPage />
            </ProtectedRoute>
          }
        />
        <Route path={paths.portfolio} element={<PortfolioPage />} />

        <Route
          path={paths.home}
          element={
            isExecutor ? <Navigate to={paths.tasks} replace /> : <HomePage />
          }
        />
        <Route
          path="/home"
          element={
            isExecutor ? <Navigate to={paths.tasks} replace /> : <HomePage />
          }
        />

        <Route path={paths.notFound} element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

