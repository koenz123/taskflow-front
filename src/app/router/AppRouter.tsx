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
import { RequireTasksLoaded } from '@/shared/tasks/RequireTasksLoaded'
import { RequireAuth } from '@/shared/auth/RequireAuth'

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

      <Route path="/home" element={<Navigate to={paths.home} replace />} />

      {/* App shell is shared for ALL in-app routes (prevents sidebar remount flicker). */}
      <Route element={<AppShell />}>
        <Route
          path={paths.home}
          element={
            auth.status === 'authenticated'
              ? isExecutor
                ? <Navigate to={paths.tasks} replace />
                : isCustomer
                  ? <Navigate to={paths.customerTasks} replace />
                  : isArbiter
                    ? <Navigate to={paths.disputes} replace />
                    : <Navigate to={paths.profile} replace />
              : <HomePage />
          }
        />
        <Route
          path={paths.tasks}
          element={
            auth.status === 'authenticated' && auth.user?.role === 'pending' ? (
              <Navigate to={paths.chooseRole} replace />
            ) : isCustomer ? (
              <Navigate to={paths.customerTasks} replace />
            ) : (
              <TasksPage />
            )
          }
        />
        <Route
          path={paths.profile}
          element={
            <RequireAuth>
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            </RequireAuth>
          }
        />
        <Route
          path={paths.profileEdit}
          element={
            <RequireAuth>
              <ProtectedRoute>
                <EditProfilePage />
              </ProtectedRoute>
            </RequireAuth>
          }
        />
        <Route
          path={paths.reviews}
          element={
            <RequireAuth>
              <ReviewsPage />
            </RequireAuth>
          }
        />
        <Route
          path={paths.notifications}
          element={
            <RequireAuth>
              <ProtectedRoute>
                <NotificationsPage />
              </ProtectedRoute>
            </RequireAuth>
          }
        />
        <Route
          path={paths.violations}
          element={
            <RequireAuth>
              <ProtectedRoute>
                <ViolationsPage />
              </ProtectedRoute>
            </RequireAuth>
          }
        />
        <Route
          path={paths.disputes}
          element={
            <RequireAuth>
              <ProtectedRoute>
                {isArbiter ? <DisputesInboxPage /> : <Navigate to={paths.profile} replace />}
              </ProtectedRoute>
            </RequireAuth>
          }
        />
        <Route
          path={paths.disputeThread}
          element={
            <RequireAuth>
              <ProtectedRoute>
                <DisputeThreadPage />
              </ProtectedRoute>
            </RequireAuth>
          }
        />
        <Route
          path={paths.userProfile}
          element={
            <RequireAuth>
              <PublicProfilePage />
            </RequireAuth>
          }
        />
        <Route
          path={paths.userReviews}
          element={
            <RequireAuth>
              <ReviewsPage />
            </RequireAuth>
          }
        />
        <Route
          path={paths.reportProfile}
          element={
            <RequireAuth>
              <ProtectedRoute>
                <ReportProfilePage />
              </ProtectedRoute>
            </RequireAuth>
          }
        />
        <Route
          path={paths.customerTasks}
          element={
            <RequireAuth>
              <ProtectedRoute>
                <CustomerTasksPage />
              </ProtectedRoute>
            </RequireAuth>
          }
        />
        <Route
          path={paths.customerArchive}
          element={
            <RequireAuth>
              <ProtectedRoute>
                <ArchivesPage />
              </ProtectedRoute>
            </RequireAuth>
          }
        />
        <Route
          path={paths.customerReview}
          element={
            <RequireAuth>
              <ProtectedRoute>
                <CustomerReviewsPage />
              </ProtectedRoute>
            </RequireAuth>
          }
        />
        <Route
          path={paths.customerRequests}
          element={
            <RequireAuth>
              <ProtectedRoute>
                <CustomerRequestsPage />
              </ProtectedRoute>
            </RequireAuth>
          }
        />
        <Route
          path={paths.taskCreate}
          element={
            <RequireAuth>
              <ProtectedRoute>
                <CreateTaskPage />
              </ProtectedRoute>
            </RequireAuth>
          }
        />
        <Route
          path={paths.taskDetails}
          element={
            <RequireAuth>
              <ProtectedRoute>
                <RequireTasksLoaded>
                  <TaskDetailsPage />
                </RequireTasksLoaded>
              </ProtectedRoute>
            </RequireAuth>
          }
        />
        <Route
          path={paths.taskEdit}
          element={
            <RequireAuth>
              <ProtectedRoute>
                <RequireTasksLoaded>
                  <EditTaskPage />
                </RequireTasksLoaded>
              </ProtectedRoute>
            </RequireAuth>
          }
        />
        <Route
          path={paths.portfolio}
          element={
            <RequireAuth>
              <PortfolioPage />
            </RequireAuth>
          }
        />

        <Route path={paths.notFound} element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

