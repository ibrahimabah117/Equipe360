// Chargement des données d'un mois de paie : planning, horaires, pointages et
// décisions sur les heures sup. Partagé par la page Paie et la page Heures sup.
import { conakryInstant, weekStart } from './dates'
import { DEFAULT_SETTINGS, monthEnd, type OvertimeDecision, type PayrollSettings } from './payroll'
import { fetchAll, supabase, type Punch, type ScheduleEntry, type ShiftType } from './supabase'

export interface OvertimeApproval extends OvertimeDecision {
  company_id: string
  employee_id: string
  week_start: string
  note: string | null
  decided_by: string | null
  decided_at: string
}

export async function loadMonthData(companyId: string, period: string) {
  const end = monthEnd(period)
  const [en, sh, pu] = await Promise.all([
    // Par pages : au-delà de 1 000 lignes, le serveur coupe la réponse
    fetchAll<ScheduleEntry>(() => supabase.from('schedule_entries').select('*').eq('company_id', companyId).gte('work_date', period).lte('work_date', end).order('id')),
    supabase.from('shift_types').select('*').eq('company_id', companyId),
    fetchAll<Punch>(() =>
      supabase
        .from('punches')
        .select('*')
        .eq('company_id', companyId)
        .gte('punched_at', new Date(conakryInstant(period, '00:00') - 4 * 3600e3).toISOString())
        .lte('punched_at', new Date(conakryInstant(end, '23:59') + 24 * 3600e3).toISOString())
        .order('id'),
    ),
  ])
  if (pu.error) throw pu.error
  if (en.error) throw en.error
  if (sh.error) throw sh.error
  return {
    entries: (en.data ?? []) as ScheduleEntry[],
    shifts: Object.fromEntries(((sh.data ?? []) as ShiftType[]).map((s) => [s.id, s])) as Record<string, ShiftType>,
    punches: (pu.data ?? []) as Punch[],
  }
}

/** Décisions sur les heures sup des semaines qui touchent le mois, rangées par employé puis par semaine */
export async function loadOvertimeApprovals(companyId: string, period: string) {
  const { data, error } = await supabase
    .from('overtime_approvals')
    .select('*')
    .eq('company_id', companyId)
    .gte('week_start', weekStart(period))
    .lte('week_start', monthEnd(period))
  if (error) throw error
  const byEmployee: Record<string, Record<string, OvertimeDecision>> = {}
  for (const a of (data ?? []) as OvertimeApproval[]) {
    ;(byEmployee[a.employee_id] ??= {})[a.week_start] = { status: a.status, approved_hours: Number(a.approved_hours) }
  }
  return { rows: (data ?? []) as OvertimeApproval[], byEmployee }
}

export async function loadPayrollSettings(companyId: string): Promise<Omit<PayrollSettings, 'company_id'>> {
  const [{ data }, { data: c }] = await Promise.all([
    supabase.from('payroll_settings').select('*').eq('company_id', companyId).maybeSingle(),
    supabase.from('companies').select('breaks_enabled').eq('id', companyId).maybeSingle(),
  ])
  return { ...DEFAULT_SETTINGS, ...(data ?? {}), breaks_enabled: !!c?.breaks_enabled }
}
