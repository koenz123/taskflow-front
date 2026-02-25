/**
 * Clears all tasks, applications, contracts, assignments, submissions, disputes, dispute messages,
 * related notifications, audit log, balance freezes and customer balances from localStorage,
 * and notifies subscribers so the UI updates immediately.
 *
 * Use for local dev reset. In API mode this only clears local cache; refresh the page to drop
 * in-memory API cache. To wipe server data you need backend support.
 */
const KEYS_TO_CLEAR = [
  'ui-create-works.tasks.v2',
  'ui-create-works.tasks.v1',
  'ui-create-works.taskApplications.v1',
  'ui-create-works.contracts.v1',
  'ui-create-works.taskAssignments.v1',
  'ui-create-works.submissions.v1',
  'ui-create-works.disputes.v1',
  'ui-create-works.disputeMessages.v1',
  'ui-create-works.notifications.v1',
  'ui-create-works.auditLog.v1',
  'ui-create-works.balanceFreezes.v1',
  'ui-create-works.customerBalances.v1',
] as const

const EVENTS_TO_DISPATCH = [
  'ui-create-works.tasks.change',
  'ui-create-works.contracts.change',
  'ui-create-works.taskAssignments.change',
  'ui-create-works.taskApplications.change',
  'ui-create-works.submissions.change',
  'ui-create-works.disputes.change',
  'ui-create-works.disputeMessages.change',
  'ui-create-works.notifications.change',
  'ui-create-works.auditLog.change',
  'ui-create-works.balanceFreezes.change',
  'ui-create-works.customerBalances.change',
] as const

export function clearAllTaskData(): void {
  if (typeof window === 'undefined') return
  for (const key of KEYS_TO_CLEAR) {
    localStorage.removeItem(key)
  }
  for (const eventName of EVENTS_TO_DISPATCH) {
    window.dispatchEvent(new Event(eventName))
  }
}
