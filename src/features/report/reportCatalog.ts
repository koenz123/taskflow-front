import type { UserRole } from '@/entities/user/model/user'
import type { TranslationKey } from '@/shared/i18n/translations'

export type ReportReason = {
  id: string
  labelKey: TranslationKey
}

export type ReportCategory = {
  id: string
  labelKey: TranslationKey
  reasons: ReportReason[]
  roles: UserRole[]
}

const BASE_CATEGORIES: ReportCategory[] = [
  {
    id: 'quality',
    labelKey: 'report.category.quality',
    roles: ['executor'],
    reasons: [
      { id: 'not_done', labelKey: 'report.reason.not_done' },
      { id: 'partial', labelKey: 'report.reason.partial' },
      { id: 'low_quality', labelKey: 'report.reason.low_quality' },
      { id: 'not_matching', labelKey: 'report.reason.not_matching' },
      { id: 'miss_deadline', labelKey: 'report.reason.miss_deadline' },
    ],
  },
  {
    id: 'violations_executor',
    labelKey: 'report.category.violations',
    roles: ['executor'],
    reasons: [
      { id: 'fraud', labelKey: 'report.reason.fraud' },
      { id: 'fake_account', labelKey: 'report.reason.fake_account' },
      { id: 'plagiarism', labelKey: 'report.reason.plagiarism' },
      { id: 'bypass', labelKey: 'report.reason.bypass' },
    ],
  },
  {
    id: 'safety',
    labelKey: 'report.category.safety',
    roles: ['executor'],
    reasons: [
      { id: 'offensive', labelKey: 'report.reason.offensive' },
      { id: 'inappropriate', labelKey: 'report.reason.inappropriate' },
    ],
  },
  {
    id: 'task',
    labelKey: 'report.category.task',
    roles: ['customer'],
    reasons: [
      { id: 'unclear', labelKey: 'report.reason.unclear' },
      { id: 'illegal', labelKey: 'report.reason.illegal' },
    ],
  },
  {
    id: 'violations_customer',
    labelKey: 'report.category.violations',
    roles: ['customer'],
    reasons: [
      { id: 'customer_fake', labelKey: 'report.reason.fake_account' },
      { id: 'customer_policy', labelKey: 'report.reason.platform_violation' },
    ],
  },
]

const UNIVERSAL_CATEGORY: ReportCategory = {
  id: 'universal',
  labelKey: 'report.category.general',
  roles: ['customer', 'executor'],
  reasons: [
    { id: 'spam', labelKey: 'report.reason.spam' },
    { id: 'suspicious_activity', labelKey: 'report.reason.suspicious_activity' },
    { id: 'platform_violation', labelKey: 'report.reason.platform_violation' },
    { id: 'other', labelKey: 'report.reason.other' },
  ],
}

export function getReportCategories(ownerRole: UserRole | null): ReportCategory[] {
  const role = ownerRole ?? 'customer'
  const filtered = BASE_CATEGORIES.filter((category) => category.roles.includes(role))
  return [...filtered, UNIVERSAL_CATEGORY]
}

