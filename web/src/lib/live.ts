/**
 * Vue « en direct » : pour chaque lieu et chaque horaire en cours à l'instant `now`,
 * qui est là, qui est attendu, qui manque, et combien de postes restent vides.
 */
import { addDays, conakryInstant } from './dates'
import { shiftMinutes } from './payroll'
import type { ScheduleEntry, ShiftType, SiteNeed } from './supabase'

export type LiveState = 'present' | 'parti' | 'attendu' | 'manquant' | 'absent'

export interface LivePerson {
  entry_id: string
  employee_id: string
  state: LiveState
  arrivedAt?: number
  leftAt?: number
  replaces?: string | null
  absenceKind?: string | null
}

export interface LiveSlot {
  key: string
  site_id: string
  shift_type_id: string
  work_date: string
  start: number
  end: number
  required: number
  present: number
  /** postes requis sans personne prévue (absence non remplacée, départ, planning incomplet) */
  empty: number
  people: LivePerson[]
}

type Entry = Pick<ScheduleEntry, 'id' | 'employee_id' | 'site_id' | 'work_date' | 'shift_type_id' | 'status' | 'replaces_employee_id' | 'absence_kind'>
type P = { employee_id: string; kind: 'in' | 'out'; punched_at: string }

const ORDER: Record<LiveState, number> = { manquant: 0, attendu: 1, parti: 2, present: 3, absent: 4 }

export function computeLive(params: {
  now: number
  today: string
  entries: Entry[]
  shifts: Record<string, Pick<ShiftType, 'start_time' | 'end_time'>>
  needs: Pick<SiteNeed, 'site_id' | 'shift_type_id' | 'headcount'>[]
  punches: P[]
  /** minutes de tolérance avant qu'un retard devienne « manquant » */
  graceMin?: number
}): LiveSlot[] {
  const { now, today, entries, shifts, needs, punches } = params
  const grace = (params.graceMin ?? 10) * 60000
  const days = [addDays(today, -1), today]

  const window = (date: string, shiftId: string) => {
    const sh = shifts[shiftId]
    if (!sh) return null
    const start = conakryInstant(date, sh.start_time)
    const end = start + shiftMinutes(sh as ShiftType) * 60000
    return start <= now && now < end ? { start, end } : null
  }

  const slots = new Map<string, LiveSlot>()
  const slotFor = (site: string, shift: string, date: string) => {
    const w = window(date, shift)
    if (!w) return null
    const key = `${site}|${shift}|${date}`
    let s = slots.get(key)
    if (!s) {
      s = { key, site_id: site, shift_type_id: shift, work_date: date, ...w, required: 0, present: 0, empty: 0, people: [] }
      slots.set(key, s)
    }
    return s
  }

  for (const d of days) for (const n of needs) if (n.headcount > 0) {
    const s = slotFor(n.site_id, n.shift_type_id, d)
    if (s) s.required = n.headcount
  }

  const byEmp = new Map<string, { kind: 'in' | 'out'; t: number }[]>()
  for (const p of punches) {
    const list = byEmp.get(p.employee_id) ?? []
    list.push({ kind: p.kind, t: +new Date(p.punched_at) })
    byEmp.set(p.employee_id, list)
  }

  for (const e of entries) {
    if (!days.includes(e.work_date)) continue
    const s = slotFor(e.site_id, e.shift_type_id, e.work_date)
    if (!s) continue
    const base = { entry_id: e.id, employee_id: e.employee_id, replaces: e.replaces_employee_id }
    if (e.status === 'absent') {
      s.people.push({ ...base, state: 'absent', absenceKind: e.absence_kind })
      continue
    }
    const list = (byEmp.get(e.employee_id) ?? []).filter((p) => p.t <= now)
    const arrival = list.filter((p) => p.kind === 'in' && p.t >= s.start - 3 * 3600e3 && p.t <= s.end).sort((a, b) => a.t - b.t)[0]
    if (!arrival) {
      s.people.push({ ...base, state: now - s.start <= grace ? 'attendu' : 'manquant' })
      continue
    }
    const left = list.filter((p) => p.kind === 'out' && p.t > arrival.t).sort((a, b) => a.t - b.t)[0]
    s.people.push({ ...base, state: left ? 'parti' : 'present', arrivedAt: arrival.t, leftAt: left?.t })
  }

  for (const s of slots.values()) {
    s.present = s.people.filter((p) => p.state === 'present').length
    // un « pas pointé » est déjà signalé à part : il ne compte pas aussi comme poste vide
    const covered = s.people.filter((p) => p.state === 'present' || p.state === 'attendu' || p.state === 'manquant').length
    s.empty = Math.max(0, s.required - covered)
    s.people.sort((a, b) => ORDER[a.state] - ORDER[b.state])
  }
  return [...slots.values()].sort((a, b) => a.start - b.start)
}
