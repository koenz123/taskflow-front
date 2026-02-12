import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SocialPlatform, User, UserRole } from '@/entities/user/model/user'
import { userRepo } from '@/entities/user/lib/userRepo'
import { sessionRepo } from './sessionRepo'
import { AuthContext } from './AuthContext'
import { isEmailVerified, registerPendingSignup } from './emailVerificationApi'
import { sha256Base64 } from '@/shared/lib/crypto'

type SignUpRole = Exclude<UserRole, 'arbiter'>

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const userId = sessionRepo.getUserId()
    return userId ? userRepo.getById(userId) : null
  })

  const refresh = useCallback(() => {
    const userId = sessionRepo.getUserId()
    if (!userId) {
      setUser(null)
      return
    }
    const u = userRepo.getById(userId)
    if (!u) {
      sessionRepo.clear()
      setUser(null)
      return
    }
    setUser(u)
  }, [])

  useEffect(() => {
    const onSession = () => refresh()
    const onUsers = () => refresh()
    window.addEventListener('ui-create-works.session.change', onSession)
    window.addEventListener('ui-create-works.users.change', onUsers)
    window.addEventListener('storage', onSession)
    return () => {
      window.removeEventListener('ui-create-works.session.change', onSession)
      window.removeEventListener('ui-create-works.users.change', onUsers)
      window.removeEventListener('storage', onSession)
    }
  }, [refresh])

  const signUp = useCallback(
    async (input: {
      role: SignUpRole
      fullName: string
      phone: string
      email: string
      company?: string
      password: string
    }) => {
      // Don't create user until email is verified.
      if (userRepo.findByEmail(input.email)) throw new Error('email_taken')
      const passwordHash = await sha256Base64(input.password)
      await registerPendingSignup({
        role: input.role,
        fullName: input.fullName,
        phone: input.phone,
        email: input.email,
        company: input.company,
        passwordHash,
      })
    },
    [refresh],
  )

  const signIn = useCallback(
    async (email: string, password: string, opts?: { remember?: boolean }) => {
      const u = await userRepo.verifyPassword(email, password)
      if (!u) throw new Error('invalid_credentials')
      if (!u.emailVerified) {
        const ok = await isEmailVerified(u.email)
        if (!ok) throw new Error('email_not_verified')
        userRepo.markEmailVerified(u.email)
      }
      sessionRepo.setUserId(u.id, { remember: opts?.remember })
      refresh()
    },
    [refresh],
  )

  const signOut = useCallback(() => {
    sessionRepo.clear()
    refresh()
  }, [refresh])

  const switchUser = useCallback(
    (userId: string) => {
      sessionRepo.setUserId(userId)
      refresh()
    },
    [refresh],
  )

  const updateProfile = useCallback(
    (input: {
      fullName: string
      phone: string
      email: string
      company?: string
      socials?: Partial<Record<SocialPlatform, string>>
      avatarDataUrl?: string
    }) => {
      if (!user) throw new Error('not_authenticated')
      userRepo.updateProfile(user.id, input)
      refresh()
    },
    [user, refresh],
  )

  const api = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      signUp,
      signIn,
      signOut,
      switchUser,
      updateProfile,
    }),
    [user, signUp, signIn, signOut, switchUser, updateProfile],
  )

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>
}

