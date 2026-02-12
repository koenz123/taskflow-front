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
        <Route path={paths.register} element={<RegisterPage />} />
        <Route path={paths.verifyEmailSent} element={<VerifyEmailSentPage />} />
        <Route path={paths.verifyEmail} element={<VerifyEmailPage />} />
      </Route>

      <Route element={<AppShell />}>
        <Route path={paths.profile} element={<ProfilePage />} />
        <Route path={paths.profileEdit} element={<EditProfilePage />} />
        <Route path={paths.reviews} element={<ReviewsPage />} />
        <Route path={paths.notifications} element={<NotificationsPage />} />
        <Route path={paths.violations} element={<ViolationsPage />} />
        <Route
          path={paths.disputes}
          element={isArbiter ? <DisputesInboxPage /> : <Navigate to={paths.profile} replace />}
        />
        <Route path={paths.disputeThread} element={<DisputeThreadPage />} />
        <Route path={paths.userProfile} element={<PublicProfilePage />} />
        <Route path={paths.userReviews} element={<ReviewsPage />} />
        <Route path={paths.reportProfile} element={<ReportProfilePage />} />
        <Route path={paths.tasks} element={isCustomer ? <Navigate to={paths.customerTasks} replace /> : <TasksPage />} />
        <Route path={paths.customerTasks} element={<CustomerTasksPage />} />
        <Route path={paths.customerArchive} element={<ArchivesPage />} />
        <Route path={paths.customerReview} element={<CustomerReviewsPage />} />
        <Route path={paths.customerRequests} element={<CustomerRequestsPage />} />
        <Route path={paths.taskCreate} element={<CreateTaskPage />} />
        <Route path={paths.taskDetails} element={<TaskDetailsPage />} />
        <Route path={paths.taskEdit} element={<EditTaskPage />} />
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

