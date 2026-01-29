export const paths = {
  home: '/',
  login: '/login',
  forgotPassword: '/forgot-password',
  register: '/register',
  profile: '/profile',
  profileEdit: '/profile/edit',
  userProfile: '/users/:userId',
  tasks: '/tasks',
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

