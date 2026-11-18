import { computeCoverage, coverageRate } from '../src/lib/coverage.ts'
const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, a, '!=', b); process.exitCode = 1 } else console.log('ok', m) }

const shifts = { j: { start_time: '07:00:00', end_time: '19:00:00' }, n: { start_time: '19:00:00', end_time: '07:00:00' } }
const E = (emp: string, site: string, date: string, shift: string, status = 'planned') => ({ employee_id: emp, site_id: site, work_date: date, shift_type_id: shift, status }) as any
const P = (emp: string, site: string, iso: string) => ({ employee_id: emp, site_id: site, punched_at: iso })

// Site A : 2 agents de jour, 1 de nuit. Site B : pas de besoin défini.
const needs = [
  { site_id: 'A', shift_type_id: 'j', headcount: 2 },
  { site_id: 'A', shift_type_id: 'n', headcount: 1 },
]
const entries = [
  E('e1', 'A', '2026-11-10', 'j'), // pointé
  E('e2', 'A', '2026-11-10', 'j', 'absent'), // absent non remplacé → poste vide
  E('e3', 'A', '2026-11-10', 'n'), // pas pointé
  E('e4', 'B', '2026-11-10', 'j'), // pointé, mais sur le mauvais site → non pointé
  E('e1', 'A', '2026-11-11', 'j'),
  E('e5', 'A', '2026-11-11', 'j'), // pointé 2 h 30 avant : accepté
  E('e3', 'A', '2026-11-11', 'n'), // garde pas encore commencée
]
const punches = [
  P('e1', 'A', '2026-11-10T07:20:00Z'),
  P('e4', 'A', '2026-11-10T07:00:00Z'),
  P('e1', 'A', '2026-11-11T06:58:00Z'),
  P('e5', 'A', '2026-11-11T04:30:00Z'),
]
const now = Date.parse('2026-11-11T12:00:00Z')
const r = computeCoverage({ from: '2026-11-10', days: 2, entries, needs, shifts, punches, now })

const pick = (d: (typeof r)[number]) => [d.required, d.punched, d.unpunched, d.empty]
eq(pick(r[0]), [4, 1, 2, 1], 'jour 1 : 4 postes, 1 tenu, 2 non pointés, 1 vide')
eq(r[0].issues.map((i) => i.kind + ':' + (i.employee_id ?? i.count)), ['vide:1', 'non_pointe:e3', 'non_pointe:e4'], 'jour 1 détail')
eq(pick(r[1]), [2, 2, 0, 0], 'jour 2 : nuit pas commencée, jour complet')
eq(coverageRate(r), 50, 'taux 3/6')
eq(coverageRate([]), null, 'taux vide')

// Surnombre : 3 agents pointés pour 2 postes → 2 tenus, pas plus
const over = computeCoverage({
  from: '2026-11-10', days: 1, needs, shifts, now,
  entries: ['x', 'y', 'z'].map((e) => E(e, 'A', '2026-11-10', 'j')),
  punches: ['x', 'y', 'z'].map((e) => P(e, 'A', '2026-11-10T07:00:00Z')),
})
eq(pick(over[0]), [3, 2, 0, 1], 'surnombre de jour + nuit vide')
