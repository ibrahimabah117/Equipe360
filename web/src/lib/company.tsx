import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase, type Company, type Role } from './supabase'
import { useAuth } from './auth'

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
    const { data } = await supabase.from('companies').select('*').eq('id', companyId).maybeSingle()
    setCompany(data as Company | null)
    setState(data ? 'ok' : 'missing')
  }, [companyId])

  useEffect(() => {
    setState('loading')
    load()
  }, [load])

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
