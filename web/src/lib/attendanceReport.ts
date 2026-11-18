import type { AbsenceKind, Employee, Punch, ScheduleEntry, ShiftType, Site } from './supabase'
import { conakryInstant } from './dates'
import { FLAG_INFO, suspectFlags } from './flags'

/** Retard toléré (minutes), comme l'écran Pointages et la paie */
export const REPORT_GRACE_MIN = 10

/** Absences qui ne comptent pas contre l'agent */
const JUSTIFIED: AbsenceKind[] = ['maladie', 'conge', 'permission', 'autre']

export type IncidentKind = 'retard' | 'depart_anticipe' | 'non_pointe' | 'absence_injustifiee' | 'absence' | 'suspect'

export interface Incident {
  date: string
  kind: IncidentKind
  site: string
  shift: string
  /** Minutes de retard ou de départ anticipé */
  minutes?: number
  /** Motif de l'absence, alertes du pointage… */
  detail?: string
}

export interface Counts {
  /** Gardes déjà commencées (absences comprises) */
  planned: number
  /** Gardes avec une arrivée pointée */
  worked: number
  late: number
  lateMinutes: number
  early: number
  unpunched: number
  absences: Record<AbsenceKind, number>
  suspect: number
}

export interface EmployeeLine extends Counts {
  employee: Employee
  incidents: Incident[]
}

export interface SiteLine extends Counts {
  site: Site
}

const emptyCounts = (): Counts => ({
  planned: 0,
  worked: 0,
  late: 0,
  lateMinutes: 0,
  early: 0,
  unpunched: 0,
  absences: { maladie: 0, conge: 0, permission: 0, injustifiee: 0, autre: 0 },
  suspect: 0,
})

function shiftMinutes(s: Pick<ShiftType, 'start_time' | 'end_time'>) {
  const [h1, m1] = s.start_time.split(':').map(Number)
  const [h2, m2] = s.end_time.split(':').map(Number)
  let d = h2 * 60 + m2 - (h1 * 60 + m1)
  if (d <= 0) d += 24 * 60
  return d
}

/** Gardes attendues = prévues − absences justifiées */
export function expected(c: Counts): number {
  return c.planned - JUSTIFIED.reduce((n, k) => n + c.absences[k], 0)
}

/** Taux de présence : gardes pointées / gardes attendues (null si rien d'attendu) */
export function presenceRate(c: Counts): number | null {
  const exp = expected(c)
  return exp > 0 ? Math.min(1, c.worked / exp) : null
}

/** Ponctualité : arrivées à l'heure / arrivées */
export function punctualityRate(c: Counts): number | null {
  return c.worked > 0 ? (c.worked - c.late) / c.worked : null
}

/**
 * Bilan d'assiduité d'une période : par agent, par site et pour l'entreprise.
 * Les pointages sont rattachés aux gardes comme sur l'écran Pointages :
 * arrivée entre 3 h avant le début et la fin de la garde, départ jusqu'à 4 h après la fin.
 */
export function buildAttendanceReport(params: {
  entries: ScheduleEntry[]
  punches: Punch[]
  employees: Employee[]
  sites: Site[]
  shifts: ShiftType[]
  /** Les gardes pas encore commencées sont ignorées */
  now?: number
}) {
  const now = params.now ?? Date.now()
  const shifts = new Map(params.shifts.map((s) => [s.id, s]))
  const sites = new Map(params.sites.map((s) => [s.id, s]))
  const byEmployee = new Map<string, Punch[]>()
  for (const p of params.punches) {
    const list = byEmployee.get(p.employee_id) ?? []
    list.push(p)
    byEmployee.set(p.employee_id, list)
  }
  for (const list of byEmployee.values()) list.sort((a, b) => a.punched_at.localeCompare(b.punched_at))

  const empLines = new Map<string, EmployeeLine>()
  const siteLines = new Map<string, SiteLine>()
  const total = emptyCounts()

  const entries = [...params.entries].sort((a, b) => a.work_date.localeCompare(b.work_date))
  for (const entry of entries) {
    const sh = shifts.get(entry.shift_type_id)
    const employee = params.employees.find((e) => e.id === entry.employee_id)
    const site = sites.get(entry.site_id)
    if (!sh || !employee || !site) continue
    const start = conakryInstant(entry.work_date, sh.start_time)
    if (start > now) continue
    const end = start + shiftMinutes(sh) * 60000

    let el = empLines.get(employee.id)
    if (!el) empLines.set(employee.id, (el = { ...emptyCounts(), employee, incidents: [] }))
    let sl = siteLines.get(site.id)
    if (!sl) siteLines.set(site.id, (sl = { ...emptyCounts(), site }))
    const targets: Counts[] = [el, sl, total]
    const add = (fn: (c: Counts) => void) => targets.forEach(fn)
    const incident = (i: Omit<Incident, 'date' | 'site' | 'shift'>) =>
      el.incidents.push({ date: entry.work_date, site: site.name, shift: sh.label, ...i })

    add((c) => c.planned++)

    if (entry.status === 'absent') {
      const kind: AbsenceKind = entry.absence_kind ?? 'autre'
      add((c) => c.absences[kind]++)
      incident({ kind: kind === 'injustifiee' ? 'absence_injustifiee' : 'absence', detail: kind })
      continue
    }

    const mine = byEmployee.get(employee.id) ?? []
    const arrival = mine.find((p) => p.kind === 'in' && +new Date(p.punched_at) >= start - 3 * 3600e3 && +new Date(p.punched_at) <= end)
    // Garde en cours : pas encore « non pointée » tant que le délai de grâce n'est pas passé
    if (!arrival) {
      if (now <= start + REPORT_GRACE_MIN * 60000) {
        add((c) => c.planned--)
        continue
      }
      add((c) => c.unpunched++)
      incident({ kind: 'non_pointe' })
      continue
    }
    const departure = [...mine].reverse().find((p) => p.kind === 'out' && +new Date(p.punched_at) >= start && +new Date(p.punched_at) <= end + 4 * 3600e3)

    add((c) => c.worked++)
    const late = Math.floor((+new Date(arrival.punched_at) - start) / 60000)
    if (late > REPORT_GRACE_MIN) {
      add((c) => {
        c.late++
        c.lateMinutes += late
      })
      incident({ kind: 'retard', minutes: late })
    }
    if (departure) {
      const early = Math.floor((end - +new Date(departure.punched_at)) / 60000)
      if (early > REPORT_GRACE_MIN) {
        add((c) => c.early++)
        incident({ kind: 'depart_anticipe', minutes: early })
      }
    }
    const flags = [...new Set([arrival, departure].flatMap((p) => (p ? suspectFlags(p) : [])))]
    if (flags.length) {
      add((c) => c.suspect++)
      incident({ kind: 'suspect', detail: flags.map((f) => FLAG_INFO[f].label).join(', ') })
    }
  }

  const byName = (a: { employee: Employee }, b: { employee: Employee }) => a.employee.full_name.localeCompare(b.employee.full_name)
  return {
    employees: [...empLines.values()].filter((l) => l.planned > 0).sort(byName),
    sites: [...siteLines.values()].filter((l) => l.planned > 0).sort((a, b) => a.site.name.localeCompare(b.site.name)),
    total,
  }
}
