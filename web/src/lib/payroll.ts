import type { Employee, Punch, ScheduleEntry, ShiftType } from './supabase'
import { conakryInstant } from './dates'

export interface PayrollSettings {
  company_id: string
  absence_divisor: number
  unpunched_as_absence: boolean
  late_deduction: boolean
  late_tolerance_min: number
  reference_shift_hours: number
  night_bonus: number
  seniority_pct_per_year: number
  seniority_cap_pct: number
}

export const DEFAULT_SETTINGS: Omit<PayrollSettings, 'company_id'> = {
  absence_divisor: 30,
  unpunched_as_absence: false,
  late_deduction: true,
  late_tolerance_min: 60,
  reference_shift_hours: 12,
  night_bonus: 0,
  seniority_pct_per_year: 0,
  seniority_cap_pct: 25,
}

export interface PayrollRun {
  id: string
  company_id: string
  period: string // AAAA-MM-01
  status: 'draft' | 'validated'
  settings: Partial<PayrollSettings>
  created_at: string
  validated_at: string | null
}

export interface Payslip {
  id: string
  run_id: string
  company_id: string
  employee_id: string
  base_salary: number
  shifts_planned: number
  shifts_worked: number
  shifts_unpunched: number
  unjustified_absences: number
  absence_deduction: number
  late_minutes: number
  late_deduction: number
  night_shifts: number
  night_bonus: number
  seniority_years: number
  seniority_bonus: number
  bonus: number
  bonus_note: string | null
  advance: number
  other_deduction: number
  other_note: string | null
  gross: number
  net: number
  details: Record<string, unknown>
}

/** Champs saisis à la main : conservés quand on recalcule */
export type ManualFields = Pick<Payslip, 'bonus' | 'bonus_note' | 'advance' | 'other_deduction' | 'other_note'>

export const LATE_GRACE_MIN = 10

function isNight(s: ShiftType) {
  const h = Number(s.start_time.slice(0, 2))
  return h >= 18 || h < 5
}

function shiftMinutes(s: ShiftType) {
  const [h1, m1] = s.start_time.split(':').map(Number)
  const [h2, m2] = s.end_time.split(':').map(Number)
  let d = h2 * 60 + m2 - (h1 * 60 + m1)
  if (d <= 0) d += 24 * 60
  return d
}

export function monthEnd(period: string): string {
  const [y, m] = period.split('-').map(Number)
  const d = new Date(Date.UTC(y, m, 0))
  return d.toISOString().slice(0, 10)
}

export function periodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** Ancienneté en années pleines à la fin du mois */
export function seniorityYears(hireDate: string | null, period: string): number {
  if (!hireDate) return 0
  const end = monthEnd(period)
  const [y1, m1, d1] = hireDate.split('-').map(Number)
  const [y2, m2, d2] = end.split('-').map(Number)
  let years = y2 - y1
  if (m2 < m1 || (m2 === m1 && d2 < d1)) years--
  return Math.max(0, years)
}

/**
 * Calcule le bulletin d'un employé pour le mois.
 * entries : gardes du mois de l'employé ; punches : ses pointages couvrant le mois.
 */
export function computePayslip(params: {
  employee: Employee
  period: string
  settings: Omit<PayrollSettings, 'company_id'>
  entries: ScheduleEntry[]
  shifts: Record<string, ShiftType>
  punches: Punch[]
  manual?: Partial<ManualFields>
}) {
  const { employee, period, settings, entries, shifts, punches } = params
  const manual: ManualFields = {
    bonus: 0,
    bonus_note: null,
    advance: 0,
    other_deduction: 0,
    other_note: null,
    ...params.manual,
  }
  const base = Number(employee.base_salary) || 0
  const divisor = settings.absence_divisor || 30
  const dayRate = base / divisor

  let planned = 0
  let worked = 0
  let unpunched = 0
  let unjustified = 0
  let lateMinutes = 0
  let nightShifts = 0
  const lateDays: { date: string; minutes: number }[] = []

  const ins = punches.filter((p) => p.kind === 'in').map((p) => +new Date(p.punched_at))

  for (const e of entries) {
    const sh = shifts[e.shift_type_id]
    if (!sh) continue
    planned++
    if (e.status === 'absent') {
      if (e.absence_kind === 'injustifiee') unjustified++
      continue
    }
    const start = conakryInstant(e.work_date, sh.start_time)
    const end = start + shiftMinutes(sh) * 60000
    const arrival = ins.filter((t) => t >= start - 3 * 3600e3 && t <= end).sort((a, b) => a - b)[0]
    if (arrival == null) {
      unpunched++
      if (settings.unpunched_as_absence) {
        unjustified++
        continue
      }
    } else {
      const late = Math.floor((arrival - start) / 60000)
      if (late > LATE_GRACE_MIN) {
        lateMinutes += late
        lateDays.push({ date: e.work_date, minutes: late })
      }
    }
    worked++
    if (isNight(sh)) nightShifts++
  }

  const absenceDeduction = Math.round(unjustified * dayRate)
  const billableLate = settings.late_deduction ? Math.max(0, lateMinutes - settings.late_tolerance_min) : 0
  const lateDeduction = Math.round((billableLate * dayRate) / (settings.reference_shift_hours * 60))
  const nightBonus = Math.round(nightShifts * (Number(settings.night_bonus) || 0))
  const years = seniorityYears(employee.hire_date, period)
  const seniorityPct = Math.min(years * Number(settings.seniority_pct_per_year || 0), Number(settings.seniority_cap_pct || 0))
  const seniorityBonus = Math.round((base * seniorityPct) / 100)

  const gross = base + nightBonus + seniorityBonus + Number(manual.bonus || 0)
  const deductions = absenceDeduction + lateDeduction + Number(manual.advance || 0) + Number(manual.other_deduction || 0)
  const net = Math.max(0, gross - deductions)

  return {
    employee_id: employee.id,
    base_salary: base,
    shifts_planned: planned,
    shifts_worked: worked,
    shifts_unpunched: unpunched,
    unjustified_absences: unjustified,
    absence_deduction: absenceDeduction,
    late_minutes: lateMinutes,
    late_deduction: lateDeduction,
    night_shifts: nightShifts,
    night_bonus: nightBonus,
    seniority_years: years,
    seniority_bonus: seniorityBonus,
    ...manual,
    gross,
    net,
    details: { late_days: lateDays, billable_late_minutes: billableLate, seniority_pct: seniorityPct, day_rate: Math.round(dayRate) },
  }
}

/** Recalcule brut et net après une modification manuelle */
export function totals(p: Pick<Payslip, 'base_salary' | 'night_bonus' | 'seniority_bonus' | 'bonus' | 'absence_deduction' | 'late_deduction' | 'advance' | 'other_deduction'>) {
  const gross = Number(p.base_salary) + Number(p.night_bonus) + Number(p.seniority_bonus) + Number(p.bonus)
  const net = Math.max(0, gross - Number(p.absence_deduction) - Number(p.late_deduction) - Number(p.advance) - Number(p.other_deduction))
  return { gross, net }
}

/* ------------------------------------------------------------------ Montant en lettres */

const UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize']
const TENS = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante']

function below100(n: number): string {
  if (n <= 16) return UNITS[n]
  if (n < 20) return 'dix-' + UNITS[n - 10]
  if (n < 70) {
    const t = Math.floor(n / 10)
    const u = n % 10
    return TENS[t] + (u === 0 ? '' : u === 1 ? ' et un' : '-' + UNITS[u])
  }
  if (n < 80) return 'soixante' + (n === 71 ? ' et onze' : '-' + below100(n - 60))
  if (n === 80) return 'quatre-vingts'
  return 'quatre-vingt-' + below100(n - 80)
}

function below1000(n: number): string {
  const h = Math.floor(n / 100)
  const r = n % 100
  let s = ''
  if (h > 0) s = (h > 1 ? UNITS[h] + ' cent' : 'cent') + (h > 1 && r === 0 ? 's' : '')
  if (r > 0) s += (s ? ' ' : '') + below100(r)
  return s
}

/** 1 250 000 → « un million deux cent cinquante mille » */
export function numberToWords(value: number): string {
  let n = Math.round(Math.abs(value))
  if (n === 0) return 'zéro'
  const parts: string[] = []
  const scales: [number, string, string][] = [
    [1e9, 'milliard', 'milliards'],
    [1e6, 'million', 'millions'],
  ]
  for (const [size, one, many] of scales) {
    const q = Math.floor(n / size)
    if (q) {
      parts.push(`${below1000(q)} ${q > 1 ? many : one}`)
      n %= size
    }
  }
  const th = Math.floor(n / 1000)
  if (th) {
    // « mille » est invariable, et « cents » perd son s devant mille
    parts.push(th === 1 ? 'mille' : below1000(th).replace(/cents$/, 'cent').replace(/quatre-vingts$/, 'quatre-vingt') + ' mille')
    n %= 1000
  }
  if (n) parts.push(below1000(n))
  return parts.join(' ')
}
