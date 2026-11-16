import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Role } from './supabase'

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
    const [{ data: admin }, { data: rows }] = await Promise.all([
      supabase.rpc('am_i_platform_admin'),
      supabase
        .from('company_members')
        .select('company_id, role, employee_id, display_name, company:companies(id, name, sector, status)')
        .eq('user_id', s.user.id),
    ])
    setIsAdmin(Boolean(admin))
    setMemberships((rows ?? []) as unknown as Membership[])
  }, [])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
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
