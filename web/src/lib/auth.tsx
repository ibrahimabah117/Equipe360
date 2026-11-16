import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Role } from './supabase'
import { cacheGet, cacheSet, isNetworkError, useQueueSync } from './offline'

export interface Membership {
  company_id: string
  role: Role
  employee_id: string | null
  display_name: string | null
  /** null quand l'entreprise est suspendue (elle n'est plus lisible) */
  company: { id: string; name: string; sector: string; status: string } | null
}

interface AuthState {
  session: Session | null
  loading: boolean
  isAdmin: boolean
  memberships: Membership[]
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [memberships, setMemberships] = useState<Membership[]>([])

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) {
      setIsAdmin(false)
      setMemberships([])
      return
    }
    const cacheKey = 'profile.' + s.user.id
    const [{ data: admin, error: e1 }, { data: rows, error: e2 }] = await Promise.all([
      supabase.rpc('am_i_platform_admin'),
      supabase
        .from('company_members')
        .select('company_id, role, employee_id, display_name, company:companies(id, name, sector, status)')
        .eq('user_id', s.user.id),
    ])
    if (isNetworkError(e1) || isNetworkError(e2)) {
      // Hors connexion : on reprend le dernier profil connu
      const cached = cacheGet<{ isAdmin: boolean; memberships: Membership[] }>(cacheKey)
      setIsAdmin(cached?.isAdmin ?? false)
      setMemberships(cached?.memberships ?? [])
      return
    }
    setIsAdmin(Boolean(admin))
    setMemberships((rows ?? []) as unknown as Membership[])
    cacheSet(cacheKey, { isAdmin: Boolean(admin), memberships: rows ?? [] })
  }, [])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      // Affichage immédiat avec le dernier profil connu, mise à jour en arrière-plan
      const cached = data.session ? cacheGet<{ isAdmin: boolean; memberships: Membership[] }>('profile.' + data.session.user.id) : null
      if (cached) {
        setIsAdmin(cached.isAdmin)
        setMemberships(cached.memberships)
        setLoading(false)
        loadProfile(data.session)
        return
      }
      await loadProfile(data.session)
      if (active) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // différé pour ne pas bloquer le client Supabase pendant le rappel
        setTimeout(async () => {
          setLoading(true)
          await loadProfile(s)
          setLoading(false)
        }, 0)
      }
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  useQueueSync(Boolean(session))

  const refresh = useCallback(() => loadProfile(session), [loadProfile, session])
  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  return (
    <AuthContext.Provider value={{ session, loading, isAdmin, memberships, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth hors AuthProvider')
  return ctx
}
