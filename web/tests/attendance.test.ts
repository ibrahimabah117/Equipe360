import { buildAttendanceReport, expected, presenceRate, punctualityRate } from '../src/lib/attendanceReport.ts'
const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, a, '!=', b); process.exitCode = 1 } else console.log('ok', m) }

const shifts = [
  { id: 'j', company_id: 'c', code: 'J', label: 'Jour', start_time: '07:00:00', end_time: '19:00:00' },
  { id: 'n', company_id: 'c', code: 'N', label: 'Nuit', start_time: '19:00:00', end_time: '07:00:00' },
]
const sites = [{ id: 's1', name: 'Banque' }, { id: 's2', name: 'Port' }] as any
const employees = [{ id: 'a', full_name: 'Aminata' }, { id: 'b', full_name: 'Bakary' }] as any
const E = (emp: string, d: string, s: string, site = 's1', status = 'planned', kind: string | null = null) =>
  ({ id: emp + d + s, company_id: 'c', employee_id: emp, site_id: site, work_date: d, shift_type_id: s, status, replaces_employee_id: null, absence_kind: kind, note: null, created_at: '' }) as any
const P = (emp: string, kind: 'in' | 'out', iso: string, flags: string[] = []) =>
  ({ id: emp + kind + iso, employee_id: emp, kind, punched_at: iso, gps_ok: true, distance_m: 10, flags }) as any

const entries = [
  E('a', '2026-11-02', 'j'), // à l'heure
  E('a', '2026-11-03', 'j'), // 40 min de retard, part 2 h plus tôt
  E('a', '2026-11-04', 'n'), // nuit, téléphone partagé
  E('a', '2026-11-05', 'j'), // non pointé
  E('a', '2026-11-06', 'j', 's1', 'absent', 'maladie'),
  E('b', '2026-11-02', 'j', 's2'),
  E('b', '2026-11-03', 'j', 's2', 'absent', 'injustifiee'),
  E('b', '2026-11-30', 'j', 's2'), // pas encore commencée
]
const punches = [
  P('a', 'in', '2026-11-02T06:55:00Z'), P('a', 'out', '2026-11-02T19:02:00Z'),
  P('a', 'in', '2026-11-03T07:40:00Z'), P('a', 'out', '2026-11-03T17:00:00Z'),
  P('a', 'in', '2026-11-04T18:50:00Z', ['appareil_partage']), P('a', 'out', '2026-11-05T07:05:00Z'),
  P('b', 'in', '2026-11-02T07:08:00Z'),
]
const now = Date.UTC(2026, 10, 18, 12)
const r = buildAttendanceReport({ entries, punches, employees, sites, shifts: shifts as any, now })

const a = r.employees.find((l) => l.employee.id === 'a')!
eq([a.planned, a.worked, a.late, a.lateMinutes, a.early, a.unpunched, a.suspect], [5, 3, 1, 40, 1, 1, 1], 'agent A')
eq(a.absences.maladie, 1, 'A maladie')
eq(expected(a), 4, 'A attendues (maladie exclue)')
eq(presenceRate(a), 0.75, 'A présence 3/4')
eq(punctualityRate(a), 2 / 3, 'A ponctualité')
eq(a.incidents.map((i) => i.kind), ['retard', 'depart_anticipe', 'suspect', 'non_pointe', 'absence'], 'A incidents')
eq(a.incidents[2].detail, 'Téléphone partagé', 'A détail alerte')

const b = r.employees.find((l) => l.employee.id === 'b')!
eq([b.planned, b.worked, b.late, b.absences.injustifiee], [2, 1, 0, 1], 'agent B (garde future ignorée, 8 min tolérées)')
eq(presenceRate(b), 0.5, 'B présence 1/2')

eq(r.sites.map((s) => [s.site.name, s.planned, s.worked]), [['Banque', 5, 3], ['Port', 2, 1]], 'sites')
eq([r.total.planned, r.total.worked, r.total.unpunched, r.total.suspect], [7, 4, 1, 1], 'total')

// Garde en cours, délai de grâce pas encore passé : pas comptée
const r2 = buildAttendanceReport({ entries: [E('a', '2026-11-18', 'j')], punches: [], employees, sites, shifts: shifts as any, now: Date.UTC(2026, 10, 18, 7, 5) })
eq(r2.employees.length, 0, 'garde qui commence : pas encore non pointée')
const r3 = buildAttendanceReport({ entries: [E('a', '2026-11-18', 'j')], punches: [], employees, sites, shifts: shifts as any, now: Date.UTC(2026, 10, 18, 7, 30) })
eq(r3.total.unpunched, 1, 'après 10 min : non pointé')
