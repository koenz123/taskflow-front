import { createContext, useContext } from 'react'
import type { SocialPlatform, User, UserRole } from '@/entities/user/model/user'
import type { TgUser } from './TelegramLoginButton'

type SignUpRole = Exclude<UserRole, 'arbiter' | 'pending'>

export type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated'

export type AuthApi = {
  user: User | null
  isAuthenticated: boolean
  status: AuthStatus

  signUp: (input: {
    role: SignUpRole
    fullName: string
    phone: string
    email: string
    company?: string
    password: string
  }) => Promise<void>

  signIn: (email: string, password: string, opts?: { remember?: boolean }) => Promise<void>
  signInWithTelegram: (tgUser: TgUser) => Promise<void>
  signInWithGoogle: (idToken: string, opts?: { remember?: boolean }) => Promise<void>
  chooseRole: (role: 'customer' | 'executor') => Promise<void>
  signOut: () => void

  updateProfile: (input: {
    fullName: string
    phone: string
    email: string
    company?: string
    socials?: Partial<Record<SocialPlatform, string>>
    avatarDataUrl?: string
  }) => Promise<void>
}

export const AuthContext = createContext<AuthApi | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

