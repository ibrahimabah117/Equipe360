import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase, type Company, type Role } from './supabase'
import { useAuth } from './auth'
import { cacheGet, cacheSet, isNetworkError } from './offline'

interface CompanyState {
  company: Company
  /** 'admin' = administrateur Équipe360 (accès responsable partout) */
  role: Role | 'admin'
  canManage: boolean
  isOwnerLevel: boolean
  employeeId: string | null
  reload: () => Promise<void>
}

const CompanyContext = createContext<CompanyState | null>(null)

export function CompanyProvider({
  companyId,
  children,
  fallback,
  notFound,
}: {
  companyId: string
  children: ReactNode
  fallback: ReactNode
  notFound: ReactNode
}) {
  const { isAdmin, memberships } = useAuth()
  const [company, setCompany] = useState<Company | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading')

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('companies').select('*').eq('id', companyId).maybeSingle()
    if (isNetworkError(error) || error) {
      const cached = cacheGet<Company>('company.' + companyId)
      // Réseau absent ou erreur : on garde la dernière version connue
      if (cached) {
        setCompany(cached)
        setState('ok')
      } else setState('missing')
      return
    }
    if (data) cacheSet('company.' + companyId, data)
    setCompany(data as Company | null)
    setState(data ? 'ok' : 'missing')
  }, [companyId])

  useEffect(() => {
    // Affichage immédiat depuis le cache, puis actualisation
    const cached = cacheGet<Company>('company.' + companyId)
    if (cached) {
      setCompany(cached)
      setState('ok')
    } else setState('loading')
    load()
  }, [load, companyId])

  if (state === 'loading') return <>{fallback}</>
  if (state === 'missing' || !company) return <>{notFound}</>

  const m = memberships.find((x) => x.company_id === companyId)
  const role: Role | 'admin' = isAdmin ? 'admin' : (m?.role ?? 'agent')
  const value: CompanyState = {
    company,
    role,
    canManage: role === 'admin' || role === 'owner' || role === 'manager',
    isOwnerLevel: role === 'admin' || role === 'owner',
    employeeId: m?.employee_id ?? null,
    reload: load,
  }
  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>
}

export function useCompany() {
  const ctx = useContext(CompanyContext)
  if (!ctx) throw new Error('useCompany hors CompanyProvider')
  return ctx
}
