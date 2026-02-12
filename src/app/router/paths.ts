export const paths = {
  home: '/',
  login: '/login',
  forgotPassword: '/forgot-password',
  register: '/register',
  verifyEmail: '/verify-email',
  verifyEmailSent: '/verify-email-sent',
  profile: '/profile',
  profileEdit: '/profile/edit',
  reviews: '/reviews',
  notifications: '/notifications',
  violations: '/violations',
  disputes: '/disputes',
  disputeThread: '/disputes/:disputeId',
  userProfile: '/users/:userId',
  userReviews: '/users/:userId/reviews',
  reportProfile: '/report/:userId',
  portfolio: '/works/:userId',
  tasks: '/tasks',
  customerTasks: '/my-tasks',
  customerArchive: '/my-tasks/archive',
  customerReview: '/my-tasks/review',
  customerRequests: '/my-tasks/requests',
  taskCreate: '/tasks/new',
  taskDetails: '/tasks/:taskId',
  taskEdit: '/tasks/:taskId/edit',
  notFound: '*',
} as const

export function taskDetailsPath(taskId: string) {
  return `/tasks/${taskId}`
}

export function taskEditPath(taskId: string) {
  return `/tasks/${taskId}/edit`
}

export function userProfilePath(userId: string) {
  return `/users/${userId}`
}

export function userReviewsPath(userId: string) {
  return `/users/${userId}/reviews`
}

export function reportProfilePath(userId: string) {
  return `/report/${userId}`
}

export function worksPath(userId: string) {
  return `/works/${userId}`
}

export function disputeThreadPath(disputeId: string) {
  return `/disputes/${disputeId}`
}
