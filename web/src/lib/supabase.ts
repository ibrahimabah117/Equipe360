import { createClient } from '@supabase/supabase-js'

// Clé publiable : prévue pour être utilisée dans le navigateur (la sécurité repose sur la RLS).
const url = import.meta.env.VITE_SUPABASE_URL ?? 'https://pssdfeckbbnagvcwmtfl.supabase.co'
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_c6pLlwaHg09d1q7v3fp8SA_439mHfwy'

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
})

export type Role = 'owner' | 'manager' | 'agent'

export interface Company {
  id: string
  name: string
  sector: string
  phone: string | null
  status: 'active' | 'suspended'
  monthly_price: number
  paid_until: string | null
  admin_note: string | null
  created_at: string
}

export interface Site {
  id: string
  company_id: string
  name: string
  zone: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  radius_m: number
  qr_token: string
  active: boolean
  created_at: string
}

export interface Employee {
  id: string
  company_id: string
  full_name: string
  phone: string | null
  job_title: string | null
  default_site_id: string | null
  base_salary: number
  active: boolean
  created_at: string
}

export interface Member {
  company_id: string
  user_id: string
  role: Role
  employee_id: string | null
  phone: string | null
  display_name: string | null
  created_at: string
}

export interface ShiftType {
  id: string
  company_id: string
  code: string
  label: string
  start_time: string
  end_time: string
}

/** Appelle la fonction Edge de gestion des accès et renvoie un message d'erreur lisible. */
export async function manageAccess(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('manage-access', { body })
  if (error) {
    let message = error.message
    try {
      const ctx = (error as { context?: Response }).context
      if (ctx) message = (await ctx.json()).error ?? message
    } catch {
      /* réponse non JSON */
    }
    throw new Error(message)
  }
  return data as { ok: true; user_id?: string; phone?: string }
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return 'Une erreur est survenue'
}
