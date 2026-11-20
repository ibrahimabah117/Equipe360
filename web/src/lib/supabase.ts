import type { PunchKind } from './punchKinds'
import { createClient } from '@supabase/supabase-js'
import { demoFetch, demoStorage } from '../demo/store'

/** Version de démonstration : fausses données en mémoire, aucun appel à Supabase */
export const DEMO = import.meta.env.VITE_DEMO === '1'

// Clé publiable : prévue pour être utilisée dans le navigateur (la sécurité repose sur la RLS).
const url = import.meta.env.VITE_SUPABASE_URL ?? 'https://pssdfeckbbnagvcwmtfl.supabase.co'
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_c6pLlwaHg09d1q7v3fp8SA_439mHfwy'

/** Réseau faible : on abandonne une requête au bout de 15 s plutôt que de bloquer l'écran */
function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 15000)
  init?.signal?.addEventListener('abort', () => ctrl.abort())
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(t))
}

export const supabase = createClient(url, key, {
  auth: DEMO ? { persistSession: true, autoRefreshToken: false, storage: demoStorage } : { persistSession: true, autoRefreshToken: true },
  global: { fetch: DEMO ? demoFetch : fetchWithTimeout },
})

export type Role = 'owner' | 'manager' | 'agent'
export type PayMode = 'monthly' | 'per_shift' | 'hourly'

export interface Company {
  id: string
  name: string
  sector: string
  phone: string | null
  status: 'active' | 'suspended'
  monthly_price: number
  paid_until: string | null
  admin_note: string | null
  /** Selfie obligatoire quand un agent pointe avec son téléphone */
  punch_photo_required: boolean
  /** Pointage des pauses (début / fin) */
  breaks_enabled?: boolean
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
  /** monthly = salaire mensuel ; per_shift = tarif par garde ; hourly = tarif horaire */
  pay_mode: PayMode
  pay_rate: number
  /** Jeton du badge QR (pointage à la borne) */
  badge_token: string
  hire_date: string | null
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
  return data as { ok: true; user_id?: string; phone?: string; temporary?: boolean }
}

/**
 * Lit toutes les lignes d'une requête, par pages de 1 000 (limite du serveur).
 * La requête doit avoir un ordre stable (terminer par .order('id')).
 */
export async function fetchAll<T>(
  make: () => { range: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }> },
  pageSize = 1000,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const all: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await make().range(from, from + pageSize - 1)
    if (error) return { data: all, error }
    const rows = (data ?? []) as T[]
    all.push(...rows)
    if (rows.length < pageSize) return { data: all, error: null }
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return 'Une erreur est survenue'
}

export type EntryStatus = 'planned' | 'absent' | 'replacement'
export type AbsenceKind = 'maladie' | 'conge' | 'injustifiee' | 'permission' | 'autre'

export interface ScheduleEntry {
  id: string
  company_id: string
  employee_id: string
  site_id: string
  work_date: string
  shift_type_id: string
  status: EntryStatus
  replaces_employee_id: string | null
  absence_kind: AbsenceKind | null
  note: string | null
  created_at: string
}

export interface SiteNeed {
  company_id: string
  site_id: string
  shift_type_id: string
  headcount: number
}

export interface Punch {
  id: string
  company_id: string
  employee_id: string
  site_id: string
  kind: PunchKind
  punched_at: string
  received_at: string
  latitude: number | null
  longitude: number | null
  distance_m: number | null
  gps_ok: boolean
  client_id: string
  recorded_by: string | null
  /** Précision GPS annoncée par le téléphone (m) */
  accuracy_m: number | null
  device_id: string | null
  /** Selfie dans le stockage « punch-photos » */
  photo_path: string | null
  /** Alertes calculées par le serveur (voir lib/flags.ts) */
  flags: string[]
}
