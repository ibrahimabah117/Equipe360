/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Mode démo : une fausse base de données en mémoire qui imite Supabase.
 * Toutes les données sont fictives et générées à l'ouverture de la page.
 * Rien n'est envoyé sur Internet.
 */
import { addDays, conakryInstant, today } from '../lib/dates'
import { computePayslip, DEFAULT_SETTINGS, monthEnd } from '../lib/payroll'

type Row = Record<string, any>
export type DemoRole = 'admin' | 'owner' | 'manager' | 'agent'

const CID = 'd3m0c0de-0000-4000-8000-000000000001'
const PHONE_DOMAIN = 'tel.equipe360.app'

/* ------------------------------------------------------------------ Hasard reproductible */

function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = rng(360)
const between = (a: number, b: number) => Math.round(a + rand() * (b - a))
const uid = () => crypto.randomUUID()
const tok = () => crypto.randomUUID().replace(/-/g, '')

/* ------------------------------------------------------------------ Données */

const db: Record<string, Row[]> = {}
let currentRole: DemoRole | null = null
const now = new Date().toISOString()

const USERS: Record<DemoRole, { id: string; email: string; name: string }> = {
  admin: { id: 'd3m0-u-admin', email: 'admin@equipe360.app', name: 'Administrateur Équipe360' },
  owner: { id: 'd3m0-u-owner', email: `224622000001@${PHONE_DOMAIN}`, name: 'Thierno Bah' },
  manager: { id: 'd3m0-u-manager', email: `224655110022@${PHONE_DOMAIN}`, name: 'Fatoumata Camara' },
  agent: { id: 'd3m0-u-agent', email: `224621334455@${PHONE_DOMAIN}`, name: 'Ibrahima Sow' },
}

function seed() {
  const t = today()
  const firstPrev = (() => {
    const [y, m] = t.split('-').map(Number)
    return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10)
  })()
  const firstThis = t.slice(0, 7) + '-01'

  db.companies = [
    { id: CID, name: 'Sécurité Plus SARL', sector: 'gardiennage', phone: '224622000000', status: 'active', monthly_price: 400000, paid_until: addDays(t, 18), admin_note: 'Paie par Orange Money le 5 du mois', created_at: now },
    { id: uid(), name: 'Kaloum Gardiennage', sector: 'gardiennage', phone: null, status: 'active', monthly_price: 400000, paid_until: addDays(t, -6), admin_note: null, created_at: now },
    { id: uid(), name: 'Atlantic Sécurité', sector: 'gardiennage', phone: null, status: 'active', monthly_price: 600000, paid_until: addDays(t, 40), admin_note: null, created_at: now },
    { id: uid(), name: 'Garde d’Or Sécurité', sector: 'gardiennage', phone: null, status: 'active', monthly_price: 400000, paid_until: addDays(t, 22), admin_note: 'Mois d’essai gratuit jusqu’au ' + addDays(t, 22).split('-').reverse().join('/'), created_at: now },
    { id: uid(), name: 'Propreté Conakry', sector: 'nettoyage', phone: null, status: 'suspended', monthly_price: 300000, paid_until: addDays(t, -45), admin_note: null, created_at: now },
  ]

  // Démo : selfie obligatoire pour l'entreprise de démonstration
  for (const c of db.companies) c.punch_photo_required = c.id === CID

  db.shift_types = [
    { id: 'd3m0-sh-j', company_id: CID, code: 'J', label: 'Jour', start_time: '07:00:00', end_time: '19:00:00' },
    { id: 'd3m0-sh-n', company_id: CID, code: 'N', label: 'Nuit', start_time: '19:00:00', end_time: '07:00:00' },
  ]

  const siteDefs = [
    ['Banque Centrale — Kaloum', 'Kaloum', 'Boulevard du Commerce', 9.5092, -13.7122],
    ['Ambassade — Ratoma', 'Ratoma', 'Corniche Nord', 9.6232, -13.6203],
    ['Entrepôt Port Autonome', 'Matoto', 'Zone industrielle', 9.5741, -13.6531],
    ['Résidence Les Palmiers', 'Dixinn', 'Près de l’université', 9.5446, -13.6731],
  ] as const
  db.sites = siteDefs.map(([name, zone, address, lat, lng], i) => ({
    id: `d3m0-site-${i}`, company_id: CID, name, zone, address, latitude: lat, longitude: lng,
    radius_m: 150, qr_token: tok(), active: true, created_at: now,
  }))

  // 1 agent de jour et 1 de nuit par site : le planning de démo (3 agents par site en cycle) couvre tout,
  // seules les absences et les oublis de pointage font apparaître des trous.
  db.site_shift_needs = db.sites.flatMap((s) => [
    { company_id: CID, site_id: s.id, shift_type_id: 'd3m0-sh-j', headcount: 1 },
    { company_id: CID, site_id: s.id, shift_type_id: 'd3m0-sh-n', headcount: 1 },
  ])

  const people = [
    ['Ibrahima Sow', '224621334455', 'Agent de sécurité', 1500000, '2022-03-01'],
    ['Mamadou Diallo', '224622781203', 'Agent de sécurité', 1500000, '2023-06-15'],
    ['Alpha Condé', '224628441190', 'Maître-chien', 1800000, '2021-01-10'],
    ['Mariama Barry', '224655210987', 'Agent de sécurité', 1500000, '2024-02-01'],
    ['Ousmane Touré', '224620554412', 'Agent de sécurité', 1500000, null],
    ['Fatoumata Camara', '224655110022', 'Chef de poste', 2300000, '2019-09-01'],
    ['Sékou Keita', '224664003321', 'Agent de sécurité', 1500000, '2025-01-06'],
    ['Aissatou Bah', '224657902211', 'Agent de sécurité', 1500000, '2023-11-20'],
    ['Lansana Kouyaté', '224621908877', 'Agent de sécurité', 1600000, '2022-08-08'],
    ['Kadiatou Sylla', '224626661144', 'Superviseur', 2600000, '2018-04-02'],
    ['Moussa Cissé', '224629907766', 'Agent de sécurité', 1500000, '2024-10-01'],
    ['Hawa Soumah', '224654401188', 'Agent de sécurité', 1500000, null],
  ] as const
  db.employees = people.map(([full_name, phone, job_title, base_salary, hire_date], i) => ({
    id: `d3m0-emp-${i}`, company_id: CID, full_name, phone, job_title, base_salary, hire_date,
    default_site_id: db.sites[i % 4].id, active: true, created_at: now,
    // Quelques agents payés à la garde ou à l'heure
    pay_mode: i === 6 || i === 10 ? 'per_shift' : i === 11 ? 'hourly' : 'monthly',
    pay_rate: i === 6 || i === 10 ? 60000 : i === 11 ? 5000 : 0,
    badge_token: tok(),
  }))
  db.employees.push({ id: 'd3m0-emp-x', company_id: CID, full_name: 'Bangaly Fofana', phone: '224622119900', job_title: 'Agent de sécurité', base_salary: 1500000, pay_mode: 'monthly', pay_rate: 0, badge_token: tok(), hire_date: '2020-05-01', default_site_id: null, active: false, created_at: now })

  const memberOf = (role: DemoRole, empIdx: number | null, user_id = USERS[role].id) => {
    const e = empIdx == null ? null : db.employees[empIdx]
    return { company_id: CID, user_id, role, employee_id: e?.id ?? null, phone: e?.phone ?? '224622000001', display_name: e?.full_name ?? USERS[role].name, created_at: now }
  }
  db.company_members = [
    memberOf('owner', null),
    memberOf('manager', 5),
    memberOf('agent', 0),
    ...[1, 2, 3, 8, 9].map((i) => memberOf('agent', i, `d3m0-u-${i}`)),
  ]

  // Planning : cycle 2 jours · 2 nuits · 2 repos, 3 agents décalés par site
  const cycle = ['J', 'J', 'N', 'N', '-', '-']
  db.schedule_entries = []
  const end = addDays(t, 13)
  for (let d = firstPrev, k = 0; d <= end; d = addDays(d, 1), k++) {
    db.employees.filter((e) => e.active).forEach((e, i) => {
      const slot = Math.floor(i / 4) // 0..2 : rang dans l'équipe du site
      const code = cycle[(k + slot * 2) % 6]
      if (code === '-') return
      db.schedule_entries.push({
        id: uid(), company_id: CID, employee_id: e.id, site_id: e.default_site_id, work_date: d,
        shift_type_id: code === 'J' ? 'd3m0-sh-j' : 'd3m0-sh-n', status: 'planned',
        replaces_employee_id: null, absence_kind: null, note: null, created_at: now,
      })
    })
  }
  // Quelques absences, dont une remplacée
  const past = db.schedule_entries.filter((e) => e.work_date < t && e.work_date >= firstThis)
  const kinds = ['maladie', 'injustifiee', 'conge', 'injustifiee', 'permission']
  for (let i = 0; i < 5 && past.length; i++) {
    const e = past[between(0, past.length - 1)]
    e.status = 'absent'
    e.absence_kind = kinds[i]
    if (i === 0) e.note = 'Paludisme, certificat fourni'
  }
  const todays = db.schedule_entries.filter((e) => e.work_date === t && e.shift_type_id === 'd3m0-sh-j')
  if (todays[2]) {
    const absent = todays[2]
    absent.status = 'absent'
    absent.absence_kind = 'maladie'
    const busy = new Set(db.schedule_entries.filter((e) => e.work_date === t).map((e) => e.employee_id))
    const sub = db.employees.find((e) => e.active && !busy.has(e.id))
    if (sub) {
      db.schedule_entries.push({ ...absent, id: uid(), employee_id: sub.id, status: 'replacement', replaces_employee_id: absent.employee_id, absence_kind: null, note: null })
    }
  }

  // Pointages pour toutes les gardes déjà commencées
  db.punches = []
  const nowMs = Date.now()
  for (const e of db.schedule_entries) {
    if (e.status === 'absent') continue
    const sh = db.shift_types.find((s) => s.id === e.shift_type_id)!
    const start = conakryInstant(e.work_date, sh.start_time)
    const endMs = start + 12 * 3600e3
    if (start > nowMs) continue
    const r = rand()
    if (r < 0.04 && e.work_date !== t) continue // oubli de pointage
    const site = db.sites.find((s) => s.id === e.site_id)!
    const late = r < 0.14 ? between(15, 55) : between(-12, 8)
    const out = rand() < 0.05
    const dist = out ? between(280, 650) : between(8, 90)
    const at = start + late * 60000
    const mk = (kind: 'in' | 'out', ms: number) => ({
      id: uid(), company_id: CID, employee_id: e.employee_id, site_id: e.site_id, kind,
      punched_at: new Date(ms).toISOString(), received_at: new Date(ms + (rand() < 0.1 ? 40 * 60000 : 2000)).toISOString(),
      latitude: site.latitude + (rand() - 0.5) * 0.001, longitude: site.longitude + (rand() - 0.5) * 0.001,
      distance_m: dist, gps_ok: !out, client_id: uid(),
      recorded_by: rand() < 0.06 ? USERS.manager.id : null,
      accuracy_m: between(5, 40), device_id: 'demo-' + e.employee_id, photo_path: null, flags: [] as string[],
    })
    if (at <= nowMs) db.punches.push(mk('in', at))
    const leave = endMs + between(-5, 12) * 60000
    if (leave <= nowMs) db.punches.push(mk('out', leave))
  }

  // Aujourd'hui : un retard, un agent non pointé, un pointage hors zone (si la garde de jour a commencé)
  const dayToday = db.schedule_entries.filter((e) => e.work_date === t && e.shift_type_id === 'd3m0-sh-j' && e.status !== 'absent')
  const startToday = conakryInstant(t, '07:00')
  if (startToday < nowMs) {
    const inOf = (e: Row) => db.punches.find((p) => p.employee_id === e.employee_id && p.kind === 'in' && +new Date(p.punched_at) >= startToday - 3 * 3600e3)
    const [a, b, c] = dayToday
    const pa = a && inOf(a)
    if (pa) pa.punched_at = new Date(startToday + 34 * 60000).toISOString()
    if (b) db.punches = db.punches.filter((p) => !(p.employee_id === b.employee_id && +new Date(p.punched_at) >= startToday - 3 * 3600e3))
    const pc = c && inOf(c)
    if (pc) Object.assign(pc, { distance_m: 512, gps_ok: false, recorded_by: null })
    // Un 4e agent a pointé avec le téléphone d'un collègue
    const d = dayToday[3]
    const pd = d && inOf(d)
    if (pd && pc) {
      pd.device_id = pc.device_id
      pd.flags = ['appareil_partage']
      pc.flags = [...(pc.flags ?? []), 'appareil_partage']
    }
  }

  // Alertes des pointages générés (comme le serveur)
  for (const p of db.punches) {
    const f = new Set<string>(p.flags ?? [])
    if (p.recorded_by) f.add('saisie_responsable')
    else if (!p.gps_ok) f.add('hors_zone')
    if (+new Date(p.received_at) - +new Date(p.punched_at) > 30 * 60000) f.add('envoi_tardif')
    p.flags = [...f]
  }

  // Paie : mois précédent validé
  const settings = { ...DEFAULT_SETTINGS, night_bonus: 15000, seniority_pct_per_year: 2 }
  db.payroll_settings = [{ company_id: CID, ...settings }]
  const runId = uid()
  db.payroll_runs = [{ id: runId, company_id: CID, period: firstPrev, status: 'validated', settings, created_at: now, validated_at: new Date(conakryInstant(addDays(firstThis, 2), '10:00')).toISOString(), validated_by: USERS.owner.id }]
  const shifts = Object.fromEntries(db.shift_types.map((s) => [s.id, s])) as any
  const pend = monthEnd(firstPrev)
  db.payslips = db.employees.filter((e) => e.active).map((emp, i) => {
    const r = computePayslip({
      employee: emp as any, period: firstPrev, settings,
      entries: db.schedule_entries.filter((x) => x.employee_id === emp.id && x.work_date >= firstPrev && x.work_date <= pend) as any,
      shifts, punches: db.punches.filter((p) => p.employee_id === emp.id) as any,
      manual: i === 2 ? { bonus: 150000, bonus_note: 'Prime de fin de mois' } : i === 6 ? { advance: 300000 } : undefined,
    })
    return { id: uid(), run_id: runId, company_id: CID, ...r, created_at: now, updated_at: now }
  })
}

/* ------------------------------------------------------------------ Règles d'unicité */

const UNIQUE: Record<string, string[][]> = {
  schedule_entries: [['employee_id', 'work_date', 'shift_type_id']],
  payslips: [['run_id', 'employee_id']],
  site_shift_needs: [['site_id', 'shift_type_id']],
  payroll_settings: [['company_id']],
  payroll_runs: [['company_id', 'period']],
  employees: [['company_id', 'phone']],
  punches: [['client_id']],
}

const DEFAULTS: Record<string, () => Row> = {
  sites: () => ({ radius_m: 150, qr_token: tok(), active: true, latitude: null, longitude: null, zone: null, address: null }),
  employees: () => ({ active: true, base_salary: 0, pay_mode: 'monthly', pay_rate: 0, badge_token: tok(), hire_date: null, job_title: null, phone: null, default_site_id: null }),
  schedule_entries: () => ({ status: 'planned', replaces_employee_id: null, absence_kind: null, note: null }),
  payroll_runs: () => ({ status: 'draft', settings: {}, validated_at: null, validated_by: null }),
  payslips: () => ({ overtime_hours: 0, overtime_pay: 0, bonus: 0, advance: 0, other_deduction: 0, bonus_note: null, other_note: null, details: {} }),
}

/* ------------------------------------------------------------------ Requêtes REST (format PostgREST) */

function cmp(v: any, raw: string) {
  if (v === null || v === undefined) return raw === 'null'
  return String(v) === raw
}

function matches(row: Row, params: URLSearchParams) {
  for (const [key, expr] of params.entries()) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(key)) continue
    const neg = expr.startsWith('not.')
    const e = neg ? expr.slice(4) : expr
    const dot = e.indexOf('.')
    const op = e.slice(0, dot)
    const val = e.slice(dot + 1)
    const v = row[key]
    let ok: boolean
    switch (op) {
      case 'eq': ok = cmp(v, val); break
      case 'neq': ok = !cmp(v, val); break
      case 'gt': ok = v != null && String(v) > val; break
      case 'gte': ok = v != null && String(v) >= val; break
      case 'lt': ok = v != null && String(v) < val; break
      case 'lte': ok = v != null && String(v) <= val; break
      case 'is': ok = val === 'null' ? v == null : String(v) === val; break
      case 'in': ok = val.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, '')).includes(String(v)); break
      case 'ilike': ok = new RegExp('^' + val.replace(/[*%]/g, '.*') + '$', 'i').test(String(v ?? '')); break
      default: ok = true
    }
    if (neg) ok = !ok
    if (!ok) return false
  }
  return true
}

function embed(table: string, row: Row, select: string) {
  const out = { ...row }
  if (table === 'company_members' && /company:companies/.test(select)) {
    const c = db.companies.find((x) => x.id === row.company_id)
    out.company = c && c.status === 'active' ? c : null
  }
  if (table === 'payslips' && /run:payroll_runs/.test(select)) {
    out.run = db.payroll_runs.find((x) => x.id === row.run_id) ?? null
  }
  return out
}

/** Ce que l'utilisateur de la démo a le droit de voir (imite la sécurité RLS) */
function visible(table: string, rows: Row[]) {
  if (currentRole === 'admin' || !currentRole) return rows
  const myCompanies = new Set(db.company_members.filter((m) => m.user_id === USERS[currentRole!].id).map((m) => m.company_id))
  let list = rows.filter((r) => (table === 'companies' ? myCompanies.has(r.id) && r.status === 'active' : !('company_id' in r) || myCompanies.has(r.company_id)))
  if (currentRole === 'agent') {
    const me = db.company_members.find((m) => m.user_id === USERS.agent.id)?.employee_id
    if (table === 'payroll_settings') list = []
    if (table === 'payroll_runs') list = list.filter((r) => r.status === 'validated')
    if (table === 'payslips') list = list.filter((r) => r.employee_id === me && db.payroll_runs.find((x) => x.id === r.run_id)?.status === 'validated')
  }
  return list
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...extra },
  })
}
function pgError(message: string, code = 'P0001', status = 400) {
  return json({ code, message, details: null, hint: null }, status)
}

function keyOf(row: Row, cols: string[]) {
  return cols.map((c) => String(row[c] ?? '∅')).join('|')
}

function rest(table: string, method: string, params: URLSearchParams, headers: Headers, body: any) {
  if (!db[table]) db[table] = []
  const prefer = headers.get('prefer') ?? ''
  const wantsObject = (headers.get('accept') ?? '').includes('vnd.pgrst.object')
  const select = params.get('select') ?? '*'

  if (method === 'GET' || method === 'HEAD') {
    let rows = visible(table, db[table]).filter((r) => matches(r, params))
    const order = params.get('order')
    if (order) {
      const parts = order.split(',').map((p) => p.split('.'))
      rows = [...rows].sort((a, b) => {
        for (const [col, dir] of parts) {
          const x = a[col] ?? ''
          const y = b[col] ?? ''
          if (x < y) return dir === 'desc' ? 1 : -1
          if (x > y) return dir === 'desc' ? -1 : 1
        }
        return 0
      })
    }
    const total = rows.length
    const offset = Number(params.get('offset') ?? 0)
    const limit = params.get('limit')
    if (offset || limit) rows = rows.slice(offset, limit ? offset + Number(limit) : undefined)
    rows = rows.map((r) => embed(table, r, select))
    const range = { 'content-range': `0-${Math.max(0, rows.length - 1)}/${total}` }
    if (method === 'HEAD') return new Response(null, { status: 200, headers: range })
    if (wantsObject) return rows.length === 1 ? json(rows[0], 200, range) : pgError('JSON object requested, multiple (or no) rows returned', 'PGRST116', 406)
    return json(rows, 200, range)
  }

  if (method === 'POST') {
    const incoming: Row[] = Array.isArray(body) ? body : [body]
    const conflict = params.get('on_conflict')?.split(',')
    const merge = prefer.includes('resolution=merge-duplicates')
    const ignore = prefer.includes('resolution=ignore-duplicates')
    const out: Row[] = []
    for (const src of incoming) {
      const cols = conflict ?? UNIQUE[table]?.[0]
      const existing = cols ? db[table].find((r) => cols.every((c) => src[c] != null) && keyOf(r, cols) === keyOf(src, cols)) : undefined
      if (existing) {
        if (merge) {
          if (table === 'payslips' && db.payroll_runs.find((x) => x.id === existing.run_id)?.status === 'validated') return pgError('Paie validée : rouvrez-la pour la modifier')
          Object.assign(existing, src, { updated_at: new Date().toISOString() })
          out.push(existing)
        } else if (!ignore) {
          return pgError('duplicate key value violates unique constraint', '23505', 409)
        }
        continue
      }
      const row = { ...(DEFAULTS[table]?.() ?? {}), ...src }
      if (!['site_shift_needs', 'payroll_settings', 'company_members'].includes(table) && !row.id) row.id = uid()
      row.created_at ??= new Date().toISOString()
      db[table].push(row)
      out.push(row)
    }
    return prefer.includes('return=representation') ? (wantsObject ? json(out[0], 201) : json(out, 201)) : new Response(null, { status: 201 })
  }

  if (method === 'PATCH') {
    const rows = visible(table, db[table]).filter((r) => matches(r, params))
    for (const r of rows) {
      if (table === 'payslips' && db.payroll_runs.find((x) => x.id === r.run_id)?.status === 'validated') return pgError('Paie validée : rouvrez-la pour la modifier')
      if (table === 'payroll_runs' && body.status && body.status !== r.status) {
        body.validated_at = body.status === 'validated' ? new Date().toISOString() : null
      }
      Object.assign(r, body)
    }
    return prefer.includes('return=representation') ? json(rows) : new Response(null, { status: 204 })
  }

  if (method === 'DELETE') {
    const rows = new Set(visible(table, db[table]).filter((r) => matches(r, params)))
    if (table === 'payroll_runs' && [...rows].some((r) => r.status === 'validated')) return pgError('Paie validée : rouvrez-la avant de la supprimer')
    db[table] = db[table].filter((r) => !rows.has(r))
    return new Response(null, { status: 204 })
  }
  return pgError('Méthode non gérée')
}

/* ------------------------------------------------------------------ Fonctions serveur */

function distance(a: [number, number], b: [number, number]) {
  const R = 6371000
  const rad = (x: number) => (x * Math.PI) / 180
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(h)))
}

function rpc(name: string, p: Row) {
  const me = currentRole ? USERS[currentRole] : null
  switch (name) {
    case 'am_i_platform_admin':
      return json(currentRole === 'admin')
    case 'my_access': {
      const limit = addDays(today(), -7)
      return json(db.company_members.filter((m) => m.user_id === me?.id).map((m) => {
        const c = db.companies.find((x) => x.id === m.company_id)!
        const blocked = c.status !== 'active' ? 'suspended' : c.paid_until && c.paid_until < limit ? 'expired' : null
        return { company_id: c.id, company_name: c.name, role: m.role, paid_until: c.paid_until, blocked }
      }))
    }
    case 'create_company': {
      const id = uid()
      db.companies.push({ id, name: p.p_name, sector: p.p_sector, phone: null, status: 'active', monthly_price: 400000, paid_until: null, admin_note: null, created_at: new Date().toISOString() })
      db.shift_types.push(
        { id: uid(), company_id: id, code: 'J', label: 'Jour', start_time: '07:00:00', end_time: '19:00:00' },
        { id: uid(), company_id: id, code: 'N', label: 'Nuit', start_time: '19:00:00', end_time: '07:00:00' },
      )
      return json(id)
    }
    case 'admin_set_sector': {
      const c = db.companies.find((x) => x.id === p.p_company_id)
      if (!c) return pgError('Entreprise introuvable')
      c.sector = p.p_sector
      return json(0)
    }
    case 'admin_update_subscription': {
      const c = db.companies.find((x) => x.id === p.p_company_id)
      if (!c) return pgError('Entreprise introuvable')
      if (p.p_status != null) c.status = p.p_status
      if (p.p_monthly_price != null) c.monthly_price = p.p_monthly_price
      if (p.p_paid_until !== undefined) c.paid_until = p.p_paid_until
      if (p.p_admin_note != null) c.admin_note = p.p_admin_note
      return json(null)
    }
    case 'punch': {
      const site = db.sites.find((s) => s.qr_token === p.p_qr_token && s.active)
      if (!site) return pgError('QR code invalide')
      const member = db.company_members.find((m) => m.user_id === me?.id && m.company_id === site.company_id)
      const employee_id = p.p_employee_id ?? member?.employee_id
      if (!employee_id) return pgError('Compte non lié à un employé')
      const dup = db.punches.find((x) => x.client_id === p.p_client_id)
      const dist = p.p_latitude != null && site.latitude != null ? distance([p.p_latitude, p.p_longitude], [site.latitude, site.longitude]) : null
      const proxy = !!p.p_employee_id
      const gps_ok = dist != null && dist <= site.radius_m
      const flags: string[] = []
      if (proxy) flags.push('saisie_responsable')
      else {
        if (dist != null && !gps_ok) flags.push('hors_zone')
        else if (dist == null && site.latitude != null) flags.push('sans_gps')
        if (p.p_accuracy != null && p.p_accuracy > 100) flags.push('gps_imprecis')
        const shared = p.p_device_id && db.punches.some((x) => x.device_id === p.p_device_id && x.employee_id !== employee_id && !(x.flags ?? []).includes('saisie_responsable') && Math.abs(+new Date(x.punched_at) - +new Date(p.p_punched_at)) < 12 * 3600e3)
        if (shared) flags.push('appareil_partage')
        const company = db.companies.find((c) => c.id === site.company_id)
        if (company?.punch_photo_required && !p.p_photo_path) flags.push('sans_photo')
      }
      if (Date.now() - +new Date(p.p_punched_at) > 30 * 60000) flags.push('envoi_tardif')
      const row = dup ?? {
        id: uid(), company_id: site.company_id, employee_id, site_id: site.id, kind: p.p_kind,
        punched_at: p.p_punched_at, received_at: new Date().toISOString(), latitude: p.p_latitude, longitude: p.p_longitude,
        distance_m: dist, gps_ok, client_id: p.p_client_id,
        recorded_by: me?.id,
        accuracy_m: p.p_accuracy ?? null, device_id: p.p_device_id ?? null, photo_path: p.p_photo_path ?? null, flags,
      }
      if (!dup) db.punches.push(row)
      return json([{ punch_id: row.id, site_name: site.name, distance_m: row.distance_m, gps_ok: row.gps_ok, flags: row.flags }])
    }
  }
  return pgError('Fonction inconnue : ' + name)
}

function manageAccess(b: Row) {
  if (b.action === 'create') {
    const d = String(b.phone ?? '').replace(/\D/g, '')
    const phone = d.length === 9 ? '224' + d : d
    if (db.company_members.some((m) => m.phone === phone)) return json({ error: 'Ce numéro a déjà un compte Équipe360.' }, 400)
    const user_id = 'd3m0-u-' + uid()
    db.company_members.push({ company_id: b.company_id, user_id, role: b.role, employee_id: b.employee_id ?? null, phone, display_name: b.display_name ?? null, created_at: new Date().toISOString() })
    return json({ ok: true, user_id, phone, temporary: b.role !== 'agent' })
  }
  if (b.action === 'remove') {
    db.company_members = db.company_members.filter((m) => !(m.company_id === b.company_id && m.user_id === b.user_id))
  }
  const target = db.company_members.find((m) => m.company_id === b.company_id && m.user_id === b.user_id)
  return json({ ok: true, temporary: b.action === 'reset_password' && target?.role !== 'agent' })
}

/* ------------------------------------------------------------------ Point d'entrée */

function fakeJwt(sub: string) {
  const enc = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({ sub, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 30 * 86400 })}.demo`
}

/** Métadonnées modifiables (changement de mot de passe) */
const demoMeta: Partial<Record<DemoRole, Record<string, unknown>>> = {}

function userObject(role: DemoRole) {
  const u = USERS[role]
  return { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, user_metadata: { display_name: u.name, ...demoMeta[role] }, app_metadata: {}, created_at: now }
}

export function demoTokens(role: DemoRole) {
  currentRole = role
  return { access_token: fakeJwt(USERS[role].id), refresh_token: 'demo-' + role }
}

export const demoFetch: typeof fetch = async (input, init) => {
  if (!db.companies) seed()
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
  const raw = typeof init?.body === 'string' ? init.body : null
  const body = raw ? JSON.parse(raw) : null
  await new Promise((r) => setTimeout(r, 60)) // petite latence réaliste

  const path = url.pathname
  if (path.startsWith('/auth/v1/')) {
    if (path.endsWith('/logout')) {
      currentRole = null
      return new Response(null, { status: 204 })
    }
    const bearer = headers.get('authorization')?.split('.')[1]
    const sub = bearer ? JSON.parse(atob(bearer.replace(/-/g, '+').replace(/_/g, '/'))).sub : null
    const role = (Object.keys(USERS) as DemoRole[]).find((r) => USERS[r].id === sub) ?? currentRole
    if (path.endsWith('/user') && role) {
      currentRole = role
      if (method === 'PUT' && body?.data) demoMeta[role] = { ...demoMeta[role], ...body.data }
      return json(userObject(role))
    }
    if (path.endsWith('/token') && currentRole) {
      return json({ access_token: fakeJwt(USERS[currentRole].id), refresh_token: 'demo', expires_in: 2592000, expires_at: Math.floor(Date.now() / 1000) + 2592000, token_type: 'bearer', user: userObject(currentRole) })
    }
    return json({ error: 'not_authenticated', error_description: 'Démo : choisissez un rôle' }, 401)
  }
  if (path.startsWith('/functions/v1/manage-access')) return manageAccess(body ?? {})
  const m = path.match(/\/rest\/v1\/(rpc\/)?(\w+)/)
  if (m) return m[1] ? rpc(m[2], body ?? {}) : rest(m[2], method, url.searchParams, headers, body)
  return json({}, 404)
}

/** Stockage de session en mémoire (aucune donnée gardée dans le navigateur) */
const mem = new Map<string, string>()
export const demoStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
}

/** Sites de la démo, pour simuler le scan d'un QR code */
export function demoSites() {
  if (!db.companies) seed()
  return db.sites.filter((s) => s.active).map((s) => ({ name: s.name, zone: s.zone, token: s.qr_token as string, lat: s.latitude as number, lng: s.longitude as number }))
}

/** Position GPS simulée : sur le site dont le QR est ouvert */
export function installFakeGeolocation() {
  const where = () => {
    const tokenInUrl = location.hash.match(/\/p\/([a-f0-9]+)/)?.[1]
    const s = demoSites().find((x) => x.token === tokenInUrl) ?? demoSites()[0]
    return { coords: { latitude: s.lat + 0.0002, longitude: s.lng - 0.0001, accuracy: 9, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() } as unknown as GeolocationPosition
  }
  const geo = {
    getCurrentPosition: (ok: PositionCallback) => setTimeout(() => ok(where()), 400),
    watchPosition: (ok: PositionCallback) => {
      setTimeout(() => ok(where()), 600)
      return 1
    },
    clearWatch: () => {},
  }
  try {
    Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true })
  } catch {
    /* navigateur qui refuse : la démo fonctionne sans GPS */
  }
}
