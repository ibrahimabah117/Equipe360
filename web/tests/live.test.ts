import { computeLive } from '../src/lib/live.ts'
const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, a, '!=', b); process.exitCode = 1 } else console.log('ok', m) }
const shifts = { m: { start_time: '06:00:00', end_time: '14:00:00' }, s: { start_time: '14:00:00', end_time: '22:00:00' }, n: { start_time: '22:00:00', end_time: '06:00:00' } }
const E = (id: string, emp: string, d: string, sh: string, status = 'planned', extra = {}) => ({ id, employee_id: emp, site_id: 'L1', work_date: d, shift_type_id: sh, status, replaces_employee_id: null, absence_kind: null, ...extra }) as any
const P = (emp: string, kind: 'in' | 'out', iso: string) => ({ employee_id: emp, kind, punched_at: iso })
const now = Date.parse('2026-11-20T09:58:00Z') // Conakry = UTC
const r = computeLive({
  now, today: '2026-11-20', shifts,
  needs: [{ site_id: 'L1', shift_type_id: 'm', headcount: 5 }, { site_id: 'L1', shift_type_id: 'n', headcount: 3 }],
  entries: [E('1', 'a', '2026-11-20', 'm'), E('2', 'b', '2026-11-20', 'm'), E('3', 'c', '2026-11-20', 'm'), E('4', 'd', '2026-11-20', 'm', 'absent', { absence_kind: 'maladie' }), E('5', 'x', '2026-11-19', 'n'), E('6', 'y', '2026-11-20', 's')],
  punches: [P('a', 'in', '2026-11-20T05:52:00Z'), P('b', 'in', '2026-11-20T06:20:00Z'), P('b', 'out', '2026-11-20T09:30:00Z'), P('x', 'in', '2026-11-19T21:55:00Z'), P('x', 'out', '2026-11-20T06:03:00Z')],
})
eq(r.length, 1, 'seul le poste du matin est en cours (nuit finie, soir pas commencé)')
const m = r[0]
eq(m.people.map((p) => [p.employee_id, p.state]), [['c', 'manquant'], ['b', 'parti'], ['a', 'present'], ['d', 'absent']], 'états triés')
eq([m.required, m.present, m.empty], [5, 1, 3], 'requis 5 : 1 présent, 1 pas pointé, 3 postes vides')
const r2 = computeLive({ now: Date.parse('2026-11-20T06:05:00Z'), today: '2026-11-20', shifts, needs: [], entries: [E('1', 'a', '2026-11-20', 'm')], punches: [] })
eq(r2[0].people[0].state, 'attendu', 'dans les 10 min de tolérance : attendu')
const r3 = computeLive({ now: Date.parse('2026-11-20T02:00:00Z'), today: '2026-11-20', shifts, needs: [{ site_id: 'L1', shift_type_id: 'n', headcount: 2 }], entries: [E('5', 'x', '2026-11-19', 'n')], punches: [P('x', 'in', '2026-11-19T21:58:00Z')] })
eq([r3.length, r3[0].work_date, r3[0].present, r3[0].empty], [1, '2026-11-19', 1, 1], 'nuit de la veille en cours à 2 h')
