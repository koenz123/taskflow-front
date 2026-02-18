import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SocialPlatform, User, UserRole } from '@/entities/user/model/user'
import { userRepo } from '@/entities/user/lib/userRepo'
import { sessionRepo } from './sessionRepo'
import { AuthContext } from './AuthContext'
import { isEmailVerified, registerPendingSignup } from './emailVerificationApi'
import { sha256Base64 } from '@/shared/lib/crypto'
import { setLogContext } from '@/shared/logging/logger'
import type { TgUser } from './TelegramLoginButton'
import { api as httpApi } from '@/shared/api/api'
import { useDevMode } from '@/shared/dev/devMode'

// Convenience re-export to allow `import { useAuth } from "@/shared/auth/AuthProvider"`
export { useAuth } from './AuthContext'

type SignUpRole = Exclude<UserRole, 'arbiter' | 'pending'>

function isAbsoluteUrl(input: string) {
  return input.startsWith('http://') || input.startsWith('https://')
}

function joinUrl(base: string, path: string) {
  if (isAbsoluteUrl(path)) return path
  const b = base.endsWith('/') ? base.slice(0, -1) : base
  const p = path.startsWith('/') ? path : `/${path}`
  return `${b}${p}`
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'unauthenticated' | 'authenticated'>('loading')
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(() => sessionRepo.getToken())
  const devMode = useDevMode()
  const USE_API = import.meta.env.VITE_DATA_SOURCE === 'api'

  const setUserStable = useCallback((me: User | null) => {
    setUser((prev) => {
      if (me === null) return prev === null ? prev : null
      if (!prev) return me
      if (prev.id === me.id && prev.role === me.role) return prev
      return me
    })
  }, [])

  useEffect(() => {
    const syncToken = () => setToken(sessionRepo.getToken())
    window.addEventListener('ui-create-works.session.change', syncToken)
    window.addEventListener('storage', syncToken)
    return () => {
      window.removeEventListener('ui-create-works.session.change', syncToken)
      window.removeEventListener('storage', syncToken)
    }
  }, [])

  useEffect(() => {
    setLogContext({ userId: user?.id })
  }, [user?.id])

  useEffect(() => {
    // Local (non-API) mode: derive auth from local session only.
    if (!USE_API) {
      const userId = sessionRepo.getUserId()
      const u = userId ? userRepo.getById(userId) : null
      setUserStable(u)
      setStatus(u ? 'authenticated' : 'unauthenticated')
      return
    }

    // API mode: token is the only entrypoint.
    if (!token) {
      setUserStable(null)
      setStatus('unauthenticated')
      return
    }

    let cancelled = false
    const run = async () => {
      setStatus('loading')
      try {
        const raw = await httpApi.get<any>('/me')
        if (cancelled) return
        if (raw && typeof raw === 'object' && (raw as any).authenticated === false) {
          throw new Error('unauthenticated')
        }
        const me = (raw && typeof raw === 'object' && 'user' in raw ? (raw as any).user : raw) as any
        if (!me?.id) throw new Error('me_invalid')

        const u = userRepo.upsertFromServer({
          id: String(me.id),
          role: me.role,
          fullName: me.fullName ?? '',
          email: me.email ?? '',
          phone: me.phone ?? '',
          telegramUserId: me.telegramUserId ?? null,
          emailVerified: true,
        })

        sessionRepo.setUserId(u.id, { remember: true })
        if (u.telegramUserId) sessionRepo.setTelegramUserId(String(u.telegramUserId), { remember: true })

        setUserStable(u)

        const [{ fetchContracts }, { fetchAssignments }, { fetchApplications }] = await Promise.all([
          import('@/entities/contract/lib/useContracts'),
          import('@/entities/taskAssignment/lib/useTaskAssignments'),
          import('@/entities/task/lib/useApplications'),
        ])
        await Promise.all([fetchContracts(), fetchAssignments(), fetchApplications()])

        setStatus('authenticated')
      } catch {
        if (cancelled) return
        setUserStable(null)
        setStatus('unauthenticated')
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [USE_API, token, setUserStable])

  const signUp = useCallback(
    async (input: {
      role: SignUpRole
      fullName: string
      phone: string
      email: string
      company?: string
      password: string
    }) => {
      // Dev-only: allow immediate sign-up without email verification link.
      if (devMode.enabled) {
        const created = await userRepo.create({
          role: input.role,
          fullName: input.fullName,
          phone: input.phone,
          email: input.email,
          company: input.company,
          password: input.password,
        })
        const verified = userRepo.markEmailVerified(created.email) ?? created
        sessionRepo.setUserId(verified.id, { remember: true })
        setUserStable(verified)
        setStatus('authenticated')
        return
      }

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
    [devMode.enabled],
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
      setUserStable(u)
      setStatus('authenticated')
    },
    [],
  )

  const signInWithTelegram = useCallback(
    async (tgUser: TgUser) => {
      const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'
      const url = joinUrl(API_BASE, '/auth/telegram/login')
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tgUser),
      })
      const raw = (await r.json().catch(() => null)) as any
      if (!r.ok) {
        const code = typeof raw?.error === 'string' ? raw.error : `http_${r.status}`
        throw new Error(`telegram_login_failed:${code}`)
      }
      const data = raw as { token?: string; user?: any } | null
      if (!data?.token || !data.user?.id) throw new Error('telegram_login_invalid_response')

      // Telegram login should never grant "arbiter" role.
      // First TG auth must always land on role selection (pending).
      const serverId = String(data.user.id)
      if (serverId === 'user_dev_arbiter') {
        throw new Error('telegram_login_failed:invalid_user')
      }
      const existing = userRepo.getById(serverId)
      const existingRole = existing?.role ?? null
      const chosenAlready = existingRole === 'customer' || existingRole === 'executor'
      const desiredRole: UserRole = chosenAlready ? existingRole : 'pending'

      const u = userRepo.upsertFromServer({
        ...data.user,
        role: desiredRole,
        telegramUserId: data.user.telegramUserId ?? String(tgUser.id),
        emailVerified: true,
      })

      sessionRepo.setToken(String(data.token), { remember: true })
      setToken(String(data.token))
      sessionRepo.setTelegramUserId(String(u.telegramUserId ?? tgUser.id), { remember: true })
      sessionRepo.setUserId(u.id, { remember: true })
      setStatus('loading')
    },
    [],
  )

  const signOut = useCallback(() => {
    sessionRepo.clear()
    setToken(null)
    setUserStable(null)
    setStatus('unauthenticated')
  }, [])

  const chooseRole = useCallback(
    async (role: 'customer' | 'executor') => {
      await httpApi.patch('/me/role', { role })
      const raw = await httpApi.get<any>('/me')
      if (raw && typeof raw === 'object' && (raw as any).authenticated === false) return
      const me = (raw && typeof raw === 'object' && 'user' in raw ? (raw as any).user : raw) as any
      if (!me?.id) return
      const u = userRepo.upsertFromServer({
        id: String(me.id),
        role: me.role,
        fullName: me.fullName ?? '',
        email: me.email ?? '',
        phone: me.phone ?? '',
        telegramUserId: me.telegramUserId ?? null,
        emailVerified: true,
      })
      sessionRepo.setUserId(u.id, { remember: true })
      if (u.telegramUserId) sessionRepo.setTelegramUserId(String(u.telegramUserId), { remember: true })
      setUserStable(u)
    },
    [status, setUserStable],
  )

  const switchUser = useCallback(
    (userId: string) => {
      sessionRepo.setUserId(userId)
      const u = userRepo.getById(userId)
      setUserStable(u)
      setStatus(u ? 'authenticated' : 'unauthenticated')
    },
    [setUserStable],
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
      const u = userRepo.getById(user.id)
      setUserStable(u)
    },
    [user, setUserStable],
  )

  const api = useMemo(
    () => ({
      user,
      status,
      isAuthenticated: status === 'authenticated',
      signUp,
      signIn,
      signInWithTelegram,
      chooseRole,
      signOut,
      switchUser,
      updateProfile,
    }),
    [user, status, signUp, signIn, signInWithTelegram, chooseRole, signOut, switchUser, updateProfile],
  )

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>
}

