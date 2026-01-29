import type { SocialPlatform, User, UserRole } from '../model/user'
import { createId } from '@/shared/lib/id'
import { sha256Base64 } from '@/shared/lib/crypto'

const STORAGE_KEY = 'ui-create-works.users.v1'

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

function readAll(): User[] {
  return safeParse(localStorage.getItem(STORAGE_KEY))
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
      company: input.company?.trim() || undefined,
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

  updateProfile(userId: string, input: UpdateProfileInput): User {
    const users = readAll()
    const idx = users.findIndex((u) => u.id === userId)
    if (idx === -1) throw new Error('user_not_found')

    const email = normalizeEmail(input.email)
    const existing = users.find((u) => u.email.toLowerCase() === email && u.id !== userId)
    if (existing) throw new Error('email_taken')

    const now = new Date().toISOString()
    const updated: User = {
      ...users[idx],
      fullName: input.fullName.trim(),
      phone: input.phone.trim(),
      email,
      company: input.company?.trim() || undefined,
      socials: input.socials,
      avatarDataUrl: input.avatarDataUrl ?? users[idx].avatarDataUrl,
      updatedAt: now,
    }

    users[idx] = updated
    writeAll(users)
    return updated
  },
}

