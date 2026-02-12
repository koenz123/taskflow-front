import type { SocialPlatform, User, UserRole } from '../model/user'
import { createId } from '@/shared/lib/id'
import { sha256Base64 } from '@/shared/lib/crypto'

const STORAGE_KEY = 'ui-create-works.users.v1'

// Built-in arbiter account.
const DEV_ARBITER_USER_ID = 'user_dev_arbiter'
const DEV_ARBITER_EMAIL = 'arbiter@taskflow.dev'
// sha256Base64('arbiter_dev_2026')
const DEV_ARBITER_PASSWORD_HASH = 'CwG12uZbzAiJe0vqBdZQXYCj2zFiQ5rmemveW3zuxUo='

type CreateUserInput = {
  role: UserRole
  fullName: string
  phone: string
  email: string
  company?: string
  password: string
}

type UpdateProfileInput = {
  fullName: string
  phone: string
  email: string
  company?: string
  socials?: Partial<Record<SocialPlatform, string>>
  avatarDataUrl?: string
}

function safeParse(json: string | null): User[] {
  if (!json) return []
  try {
    const data = JSON.parse(json) as unknown
    if (!Array.isArray(data)) return []
    return data as User[]
  } catch {
    return []
  }
}

function createPersonalId() {
  return createId('personal')
}

function readAll(): User[] {
  const raw = safeParse(localStorage.getItem(STORAGE_KEY))
  let changed = false
  let normalized = raw.map((user) => {
    const personalId = typeof user?.personalId === 'string' && user.personalId.trim()
      ? user.personalId
      : createPersonalId()
    if (user.personalId !== personalId) changed = true
    const emailVerified = typeof user?.emailVerified === 'boolean' ? user.emailVerified : false
    if (user.emailVerified !== emailVerified) changed = true
    return {
      ...user,
      personalId,
      emailVerified,
    } as User
  })

  // Ensure the built-in arbiter account exists (always available).
  const idx = normalized.findIndex(
    (u) => normalizeEmail(String((u as any)?.email ?? '')) === DEV_ARBITER_EMAIL || u.id === DEV_ARBITER_USER_ID,
  )
  const now = new Date().toISOString()
  if (idx === -1) {
    normalized = normalized.concat([
      {
        id: DEV_ARBITER_USER_ID,
        role: 'arbiter',
        fullName: 'Арбитр',
        phone: '',
        email: DEV_ARBITER_EMAIL,
        emailVerified: true,
        personalId: createPersonalId(),
        passwordHash: DEV_ARBITER_PASSWORD_HASH,
        createdAt: now,
        updatedAt: now,
      } satisfies User,
    ])
    changed = true
  } else {
    const prev = normalized[idx]
    const next: User = {
      ...prev,
      id: DEV_ARBITER_USER_ID,
      role: 'arbiter',
      fullName: prev.fullName?.trim() ? prev.fullName : 'Арбитр',
      phone: typeof prev.phone === 'string' ? prev.phone : '',
      email: DEV_ARBITER_EMAIL,
      emailVerified: true,
      passwordHash: DEV_ARBITER_PASSWORD_HASH,
      personalId: prev.personalId || createPersonalId(),
      updatedAt: now,
      createdAt: prev.createdAt || now,
    }
    if (
      next.id !== prev.id ||
      next.role !== prev.role ||
      normalizeEmail(next.email) !== normalizeEmail(prev.email) ||
      next.emailVerified !== prev.emailVerified ||
      next.passwordHash !== prev.passwordHash
    ) {
      normalized = normalized.slice()
      normalized[idx] = next
      changed = true
    }
  }

  if (changed) writeAll(normalized)
  return normalized
}

function writeAll(users: User[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users))
  window.dispatchEvent(new Event('ui-create-works.users.change'))
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export const userRepo = {
  list(): User[] {
    return readAll().slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },

  getById(userId: string): User | null {
    return readAll().find((u) => u.id === userId) ?? null
  },

  findByEmail(email: string): User | null {
    const e = normalizeEmail(email)
    return readAll().find((u) => u.email.toLowerCase() === e) ?? null
  },

  async create(input: CreateUserInput): Promise<User> {
    const now = new Date().toISOString()
    const email = normalizeEmail(input.email)

    if (this.findByEmail(email)) {
      throw new Error('email_taken')
    }

    const passwordHash = await sha256Base64(input.password)

    const user: User = {
      id: createId('user'),
      role: input.role,
      fullName: input.fullName.trim(),
      phone: input.phone.trim(),
      email,
      emailVerified: false,
      company: input.company?.trim() || undefined,
      personalId: createPersonalId(),
      passwordHash,
      createdAt: now,
      updatedAt: now,
    }

    const users = readAll()
    users.push(user)
    writeAll(users)
    return user
  },

  async verifyPassword(email: string, password: string): Promise<User | null> {
    const user = this.findByEmail(email)
    if (!user) return null
    const passwordHash = await sha256Base64(password)
    return passwordHash === user.passwordHash ? user : null
  },

  createVerifiedFromPending(pending: {
    role: UserRole
    fullName: string
    phone: string
    email: string
    company?: string
    passwordHash: string
    createdAt?: string
  }): User {
    const now = new Date().toISOString()
    const email = normalizeEmail(pending.email)

    const existing = this.findByEmail(email)
    if (existing) {
      // If somehow already exists, just ensure it's marked verified.
      if (!existing.emailVerified) {
        return this.markEmailVerified(existing.email) ?? existing
      }
      return existing
    }

    const user: User = {
      id: createId('user'),
      role: pending.role,
      fullName: pending.fullName.trim(),
      phone: pending.phone.trim(),
      email,
      emailVerified: true,
      company: pending.company?.trim() || undefined,
      personalId: createPersonalId(),
      passwordHash: pending.passwordHash,
      createdAt: pending.createdAt ?? now,
      updatedAt: now,
    }

    const users = readAll()
    users.push(user)
    writeAll(users)
    return user
  },

  updateProfile(userId: string, input: UpdateProfileInput): User {
    const users = readAll()
    const idx = users.findIndex((u) => u.id === userId)
    if (idx === -1) throw new Error('user_not_found')

    const email = normalizeEmail(input.email)
    const existing = users.find((u) => u.email.toLowerCase() === email && u.id !== userId)
    if (existing) throw new Error('email_taken')

    const now = new Date().toISOString()
    const prevEmail = users[idx].email
    const emailChanged = normalizeEmail(prevEmail) !== email
    const updated: User = {
      ...users[idx],
      fullName: input.fullName.trim(),
      phone: input.phone.trim(),
      email,
      // If user changes their email, require re-verification.
      emailVerified: emailChanged ? false : (users[idx].emailVerified ?? false),
      company: input.company?.trim() || undefined,
      socials: input.socials,
      avatarDataUrl: input.avatarDataUrl ?? users[idx].avatarDataUrl,
      personalId: users[idx].personalId,
      updatedAt: now,
    }

    users[idx] = updated
    writeAll(users)
    return updated
  },

  pruneCustomersExceptEmail(emailToKeep: string): { removed: number; keptUserId: string } {
    const keepEmail = normalizeEmail(emailToKeep)
    const users = readAll()
    const keep = users.find((u) => u.role === 'customer' && u.email.toLowerCase() === keepEmail) ?? null
    if (!keep) throw new Error('user_not_found')

    const next = users.filter((u) => u.role !== 'customer' || u.email.toLowerCase() === keepEmail)
    const removed = users.length - next.length
    writeAll(next)
    return { removed, keptUserId: keep.id }
  },

  markEmailVerified(email: string): User | null {
    const e = normalizeEmail(email)
    const users = readAll()
    const idx = users.findIndex((u) => u.email.toLowerCase() === e)
    if (idx === -1) return null
    if (users[idx].emailVerified) return users[idx]

    const now = new Date().toISOString()
    const next: User = { ...users[idx], emailVerified: true, updatedAt: now }
    users[idx] = next
    writeAll(users)
    return next
  },
}

