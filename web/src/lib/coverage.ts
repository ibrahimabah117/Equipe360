/**
 * Couverture des postes : pour chaque jour, combien de postes étaient prévus,
 * combien ont été réellement tenus (agent pointé), combien l'agent n'a pas pointé
 * et combien sont restés vides (absence non remplacée ou personne au planning).
 */
import { conakryInstant, range } from './dates'
import { shiftMinutes } from './payroll'
import type { ScheduleEntry, ShiftType, SiteNeed } from './supabase'

type Entry = Pick<ScheduleEntry, 'employee_id' | 'site_id' | 'work_date' | 'shift_type_id' | 'status'>
type PunchIn = { employee_id: string; site_id: string; punched_at: string }

export interface CoverageIssue {
  kind: 'vide' | 'non_pointe'
  site_id: string
  shift_type_id: string
  /** Agent prévu mais non pointé (absent pour un poste vide) */
  employee_id?: string
  /** Nombre de postes concernés (poste vide) */
  count: number
}

export interface CoverageDay {
  date: string
  /** Postes à tenir (gardes déjà commencées seulement) */
  required: number
  /** Agent présent et pointé */
  punched: number
  /** Agent prévu mais aucun pointage d'arrivée */
  unpunched: number
  /** Personne sur le poste : absence non remplacée ou planning incomplet */
  empty: number
  issues: CoverageIssue[]
}

/** Une arrivée compte pour la garde si elle est sur le bon site, entre 3 h avant le début et la fin de la garde. */
export function computeCoverage(params: {
  from: string
  days: number
  entries: Entry[]
  needs: Pick<SiteNeed, 'site_id' | 'shift_type_id' | 'headcount'>[]
  shifts: Record<string, Pick<ShiftType, 'start_time' | 'end_time'>>
  punches: PunchIn[]
  now?: number
}): CoverageDay[] {
  const { from, days, entries, needs, shifts, punches } = params
  const now = params.now ?? Date.now()

  const insByEmployee = new Map<string, { site: string; t: number }[]>()
  for (const p of punches) {
    const list = insByEmployee.get(p.employee_id) ?? []
    list.push({ site: p.site_id, t: +new Date(p.punched_at) })
    insByEmployee.set(p.employee_id, list)
  }

  const byDay = new Map<string, Entry[]>()
  for (const e of entries) {
    const list = byDay.get(e.work_date) ?? []
    list.push(e)
    byDay.set(e.work_date, list)
  }

  return range(from, days).map((date) => {
    const day: CoverageDay = { date, required: 0, punched: 0, unpunched: 0, empty: 0, issues: [] }
    const dayEntries = byDay.get(date) ?? []

    // Tous les couples site × garde à examiner : besoins définis + gardes au planning
    const slots = new Map<string, { site: string; shift: string; need: number | null }>()
    for (const n of needs) slots.set(`${n.site_id}|${n.shift_type_id}`, { site: n.site_id, shift: n.shift_type_id, need: n.headcount })
    for (const e of dayEntries) {
      const k = `${e.site_id}|${e.shift_type_id}`
      if (!slots.has(k)) slots.set(k, { site: e.site_id, shift: e.shift_type_id, need: null })
    }

    for (const { site, shift, need } of slots.values()) {
      const sh = shifts[shift]
      if (!sh) continue
      const start = conakryInstant(date, sh.start_time)
      if (start > now) continue // garde pas encore commencée
      const end = start + shiftMinutes(sh as ShiftType) * 60000

      const here = dayEntries.filter((e) => e.site_id === site && e.shift_type_id === shift)
      const working = here.filter((e) => e.status !== 'absent')
      // Sans besoin défini, on considère que chaque garde au planning (même absente) est un poste à tenir
      const required = need ?? here.length
      if (required === 0) continue

      let punched = 0
      const missing: string[] = []
      for (const e of working) {
        const ok = (insByEmployee.get(e.employee_id) ?? []).some((p) => p.site === site && p.t >= start - 3 * 3600e3 && p.t <= end)
        if (ok) punched++
        else missing.push(e.employee_id)
      }
      // Les agents en surnombre ne couvrent pas d'autres postes
      const p = Math.min(punched, required)
      const u = Math.min(missing.length, required - p)
      const empty = Math.max(0, required - p - u)

      day.required += required
      day.punched += p
      day.unpunched += u
      day.empty += empty
      if (empty) day.issues.push({ kind: 'vide', site_id: site, shift_type_id: shift, count: empty })
      for (const id of missing.slice(0, u)) day.issues.push({ kind: 'non_pointe', site_id: site, shift_type_id: shift, employee_id: id, count: 1 })
    }
    return day
  })
}

/** Taux de couverture (postes tenus ÷ postes prévus), en %, ou null s'il n'y avait rien à tenir */
export function coverageRate(days: CoverageDay[]): number | null {
  const req = days.reduce((a, d) => a + d.required, 0)
  if (!req) return null
  return Math.round((days.reduce((a, d) => a + d.punched, 0) / req) * 1000) / 10
}
