import { computePayslip, numberToWords, seniorityYears, DEFAULT_SETTINGS } from '../src/lib/payroll.ts'
const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, a, '!=', b); process.exitCode = 1 } else console.log('ok', m) }
eq(numberToWords(0), 'zéro', '0')
eq(numberToWords(21), 'vingt et un', '21')
eq(numberToWords(71), 'soixante et onze', '71')
eq(numberToWords(80), 'quatre-vingts', '80')
eq(numberToWords(91), 'quatre-vingt-onze', '91')
eq(numberToWords(200), 'deux cents', '200')
eq(numberToWords(1000), 'mille', '1000')
eq(numberToWords(80000), 'quatre-vingt mille', '80000')
eq(numberToWords(200000), 'deux cent mille', '200000')
eq(numberToWords(1500000), 'un million cinq cent mille', '1.5M')
eq(numberToWords(2350750), 'deux millions trois cent cinquante mille sept cent cinquante', '2350750')
eq(seniorityYears('2020-12-01', '2026-11-01'), 5, 'seniority 5')
eq(seniorityYears('2020-11-30', '2026-11-01'), 6, 'seniority 6')
const shifts = { j: { id: 'j', company_id: 'c', code: 'J', label: 'Jour', start_time: '07:00:00', end_time: '19:00:00' }, n: { id: 'n', company_id: 'c', code: 'N', label: 'Nuit', start_time: '19:00:00', end_time: '07:00:00' } }
const emp = { id: 'e', company_id: 'c', full_name: 'X', phone: null, job_title: null, default_site_id: null, base_salary: 1500000, hire_date: '2023-01-15', active: true, created_at: '' }
const mk = (d: string, s: string, status = 'planned', kind: string | null = null) => ({ id: d + s, company_id: 'c', employee_id: 'e', site_id: 's', work_date: d, shift_type_id: s, status, replaces_employee_id: null, absence_kind: kind, note: null, created_at: '' }) as any
const entries = [mk('2026-11-02', 'j'), mk('2026-11-03', 'j'), mk('2026-11-04', 'n'), mk('2026-11-05', 'n'), mk('2026-11-08', 'j', 'absent', 'injustifiee'), mk('2026-11-09', 'j', 'absent', 'maladie'), mk('2026-11-10', 'j')]
const P = (iso: string) => ({ id: iso, kind: 'in', punched_at: iso } as any)
const punches = [P('2026-11-02T07:05:00Z'), P('2026-11-03T08:00:00Z'), P('2026-11-04T19:45:00Z'), P('2026-11-05T18:55:00Z')] // 11-10 non pointé
const r = computePayslip({ employee: emp as any, period: '2026-11-01', settings: { ...DEFAULT_SETTINGS, night_bonus: 20000, seniority_pct_per_year: 2 }, entries, shifts: shifts as any, punches })
eq([r.shifts_planned, r.shifts_worked, r.shifts_unpunched, r.unjustified_absences], [7, 5, 1, 1], 'counts')
eq(r.absence_deduction, 50000, 'absence 1/30')
eq(r.late_minutes, 105, 'late 60+45 (5 min toléré)')
// 105-60=45 min × (1 500 000/30)/(12×60) = 45 × 69.44 = 3125
eq(r.late_deduction, 3125, 'late deduction')
eq(r.night_shifts, 2, 'nights')
eq(r.night_bonus, 40000, 'night bonus')
eq([r.seniority_years, r.seniority_bonus], [3, 90000], 'seniority 3y × 2%')
eq(r.gross, 1630000, 'gross')
eq(r.net, 1630000 - 50000 - 3125, 'net')
const r2 = computePayslip({ employee: emp as any, period: '2026-11-01', settings: { ...DEFAULT_SETTINGS, unpunched_as_absence: true }, entries, shifts: shifts as any, punches, manual: { bonus: 100000, advance: 200000 } })
eq([r2.unjustified_absences, r2.shifts_worked, r2.absence_deduction], [2, 4, 100000], 'unpunched as absence')
eq(r2.net, 1500000 + 100000 - 100000 - 3125 - 200000, 'net with manual')
// À la garde : 5 gardes faites × 60 000 ; absence non payée (pas de retenue) ; retard 45 min × 60 000 / 720
const ps = computePayslip({ employee: { ...emp, pay_mode: 'per_shift', pay_rate: 60000 } as any, period: '2026-11-01', settings: DEFAULT_SETTINGS, entries, shifts: shifts as any, punches })
eq([ps.base_salary, ps.absence_deduction, ps.late_deduction], [300000, 0, 3750], 'per shift')
// À l'heure : heures réelles (retards déjà déduits), garde non pointée payée comme prévue
const ph = computePayslip({ employee: { ...emp, pay_mode: 'hourly', pay_rate: 10000 } as any, period: '2026-11-01', settings: DEFAULT_SETTINGS, entries, shifts: shifts as any, punches })
eq([ph.worked_hours, ph.base_salary, ph.late_deduction, ph.absence_deduction], [58.17, 581700, 0, 0], 'hourly')
const P2 = (iso: string, kind: string) => ({ id: iso + kind, kind, punched_at: iso } as any)
const ph2 = computePayslip({ employee: { ...emp, pay_mode: 'hourly', pay_rate: 10000 } as any, period: '2026-11-01', settings: DEFAULT_SETTINGS, entries: [mk('2026-11-02', 'j')], shifts: shifts as any, punches: [P2('2026-11-02T06:50:00Z', 'in'), P2('2026-11-02T17:00:00Z', 'out')] })
eq([ph2.worked_hours, ph2.base_salary], [10, 100000], 'hourly early leave')
// Gardes futures non comptées
const pf = computePayslip({ employee: { ...emp, pay_mode: 'per_shift', pay_rate: 60000 } as any, period: '2026-11-01', settings: DEFAULT_SETTINGS, entries, shifts: shifts as any, punches, now: Date.UTC(2026, 10, 6) })
eq([pf.shifts_planned, pf.shifts_worked, pf.base_salary], [4, 4, 240000], 'future shifts excluded')
// Heures supplémentaires : semaine du 2 au 8 nov = 715+660+675+720 min = 46,17 h → 6,17 h au-delà de 40 h
const otSet = { ...DEFAULT_SETTINGS, overtime_enabled: true }
const po = computePayslip({ employee: emp as any, period: '2026-11-01', settings: otSet, entries, shifts: shifts as any, punches })
const hourlyM = 1500000 / 173.33
eq([po.overtime_hours, po.overtime_pay], [6.17, Math.round((2770 / 60 - 40) * hourlyM * 1.25)], 'overtime monthly (125 %)')
// Paliers : seuil 40 h, 2 h à +25 %, le reste à +50 % ; à la garde, seule la majoration s'ajoute
const po2 = computePayslip({ employee: { ...emp, pay_mode: 'per_shift', pay_rate: 60000 } as any, period: '2026-11-01', settings: { ...otSet, overtime_tier1_hours: 2 }, entries, shifts: shifts as any, punches })
const h = 60000 / 12, x = 2770 / 60 - 40
eq(po2.overtime_pay, Math.round(h * (2 * 0.25 + (x - 2) * 0.5)), 'overtime tiers per shift (majoration seule)')
eq(computePayslip({ employee: emp as any, period: '2026-11-01', settings: DEFAULT_SETTINGS, entries, shifts: shifts as any, punches }).overtime_pay, 0, 'overtime off by default')
// Validation des heures sup : rien n'est payé tant que la semaine n'est pas validée
const otAp = { ...otSet, overtime_requires_approval: true }
const pa0 = computePayslip({ employee: emp as any, period: '2026-11-01', settings: otAp, entries, shifts: shifts as any, punches })
eq([pa0.overtime_hours, pa0.overtime_pay, (pa0.details.overtime_weeks as any)[0].status], [0, 0, 'pending'], 'overtime pending → non payé')
const pa1 = computePayslip({ employee: emp as any, period: '2026-11-01', settings: otAp, entries, shifts: shifts as any, punches, approvals: { '2026-11-02': { status: 'approved', approved_hours: 4 } } })
eq([pa1.overtime_hours, pa1.overtime_pay], [4, Math.round(4 * hourlyM * 1.25)], 'overtime validé partiellement (4 h)')
const pa2 = computePayslip({ employee: emp as any, period: '2026-11-01', settings: otAp, entries, shifts: shifts as any, punches, approvals: { '2026-11-02': { status: 'rejected', approved_hours: 0 } } })
eq(pa2.overtime_pay, 0, 'overtime refusé')
// Avec validation, le temps resté après la fin du poste compte : 06:00→16:30 sur un poste 06:00→14:00
const sh8 = { m: { id: 'm', company_id: 'c', code: 'M', label: 'Matin', start_time: '06:00:00', end_time: '14:00:00' } }
const days5 = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'].map((d) => ({ ...mk(d, 'm') }))
const pun5 = days5.flatMap((e: any) => [P2(e.work_date + 'T06:00:00Z', 'in'), P2(e.work_date + 'T16:30:00Z', 'out')])
const pst = { ...otAp, reference_shift_hours: 8 }
const pl = computePayslip({ employee: emp as any, period: '2026-11-01', settings: pst, entries: days5, shifts: sh8 as any, punches: pun5, approvals: { '2026-11-02': { status: 'approved', approved_hours: 99 } } })
eq([pl.worked_hours, pl.overtime_hours], [52.5, 12.5], 'temps après la fin du poste compté si validé')
const pl0 = computePayslip({ employee: emp as any, period: '2026-11-01', settings: { ...pst, overtime_requires_approval: false }, entries: days5, shifts: sh8 as any, punches: pun5 })
eq([pl0.worked_hours, pl0.overtime_hours], [40, 0], 'sans validation : borné aux horaires prévus (inchangé)')
// Pauses : 06:00→14:00, pause 11:00→12:10 (70 min), 30 min payées → 40 min retirées ; pause > 60 min signalée
const brk = { ...DEFAULT_SETTINGS, reference_shift_hours: 8, breaks_enabled: true, break_paid_min: 30, break_auto_min: 60, break_max_min: 60 }
const hourlyEmp = { ...emp, pay_mode: 'hourly', pay_rate: 10000 } as any
const pb = computePayslip({ employee: hourlyEmp, period: '2026-11-01', settings: brk, entries: [mk('2026-11-02', 'm')], shifts: sh8 as any,
  punches: [P2('2026-11-02T06:00:00Z', 'in'), P2('2026-11-02T11:00:00Z', 'break_start'), P2('2026-11-02T12:10:00Z', 'break_end'), P2('2026-11-02T14:00:00Z', 'out')] })
eq([pb.worked_hours, pb.base_salary, (pb.details as any).unpaid_break_minutes, (pb.details as any).long_breaks.length], [7.33, 73300, 40, 1], 'pause pointée : 40 min retirées, pause longue signalée')
// Pause oubliée : forfait 60 min − 30 payées = 30 min retirées
const pb2 = computePayslip({ employee: hourlyEmp, period: '2026-11-01', settings: brk, entries: [mk('2026-11-02', 'm')], shifts: sh8 as any,
  punches: [P2('2026-11-02T06:00:00Z', 'in'), P2('2026-11-02T14:00:00Z', 'out')] })
eq([pb2.worked_hours, (pb2.details as any).unpaid_break_minutes], [7.5, 30], 'pause oubliée : forfait')
// Option désactivée : aucun effet, même avec des pointages de pause
const pb3 = computePayslip({ employee: hourlyEmp, period: '2026-11-01', settings: { ...brk, breaks_enabled: false }, entries: [mk('2026-11-02', 'm')], shifts: sh8 as any,
  punches: [P2('2026-11-02T06:00:00Z', 'in'), P2('2026-11-02T11:00:00Z', 'break_start'), P2('2026-11-02T12:10:00Z', 'break_end'), P2('2026-11-02T14:00:00Z', 'out')] })
eq(pb3.worked_hours, 8, 'pauses désactivées : 8 h')
