import { createContext, useContext } from 'react'
import type { SocialPlatform, User, UserRole } from '@/entities/user/model/user'

type SignUpRole = Exclude<UserRole, 'arbiter'>

export type AuthApi = {
  user: User | null
  isAuthenticated: boolean

  signUp: (input: {
    role: SignUpRole
    fullName: string
    phone: string
    email: string
    company?: string
    password: string
  }) => Promise<void>

  signIn: (email: string, password: string, opts?: { remember?: boolean }) => Promise<void>
  signOut: () => void
  switchUser: (userId: string) => void

  updateProfile: (input: {
    fullName: string
    phone: string
    email: string
    company?: string
    socials?: Partial<Record<SocialPlatform, string>>
    avatarDataUrl?: string
  }) => void
}

export const AuthContext = createContext<AuthApi | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

