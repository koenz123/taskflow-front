import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SocialPlatform, User, UserRole } from '@/entities/user/model/user'
import { userRepo } from '@/entities/user/lib/userRepo'
import { sessionRepo } from './sessionRepo'
import { AuthContext } from './AuthContext'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const userId = sessionRepo.getUserId()
    return userId ? userRepo.getById(userId) : null
  })

  const refresh = useCallback(() => {
    const userId = sessionRepo.getUserId()
    setUser(userId ? userRepo.getById(userId) : null)
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
      role: UserRole
      fullName: string
      phone: string
      email: string
      company?: string
      password: string
    }) => {
      const created = await userRepo.create({
        role: input.role,
        fullName: input.fullName,
        phone: input.phone,
        email: input.email,
        company: input.company,
        password: input.password,
      })
      sessionRepo.setUserId(created.id)
      refresh()
    },
    [refresh],
  )

  const signIn = useCallback(
    async (email: string, password: string, opts?: { remember?: boolean }) => {
      const u = await userRepo.verifyPassword(email, password)
      if (!u) throw new Error('invalid_credentials')
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

