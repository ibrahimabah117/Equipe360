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
