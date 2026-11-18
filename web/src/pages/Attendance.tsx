import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import writeExcelFile from 'write-excel-file/browser'
import {
  AlarmClock,
  ChevronLeft,
  ChevronRight,
  Clock,
  Crosshair,
  Download,
  ExternalLink,
  Hand,
  IdCard,
  LogIn,
  LogOut,
  MapPin,
  MapPinOff,
  Plus,
  RefreshCw,
  ScanLine,
  ShieldAlert,
  UserCheck,
  UserX,
} from 'lucide-react'
import {
  errorMessage,
  supabase,
  type Employee,
  type Member,
  type Punch,
  type ScheduleEntry,
  type ShiftType,
  type Site,
} from '../lib/supabase'
import { useCompany } from '../lib/company'
import { cacheGet, cacheSet } from '../lib/offline'
import { addDays, conakryInstant, dateAt, dayLong, fromLocalInput, minutesLabel, timeAt, toLocalInput, today } from '../lib/dates'
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  cx,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  PageHeader,
  PageLoader,
  Select,
  StatCard,
  useToast,
} from '../ui'
import { FLAG_INFO, isSuspect, punchFlags, suspectFlags } from '../lib/flags'
import { punchPhotoUrl } from '../lib/photos'
import { ABSENCE_LABELS, hhmm, shiftHours, ShiftIcon, shiftTone, toneClasses } from './planning/common'

const GRACE_MIN = 10

type RowState = 'upcoming' | 'expected' | 'missing' | 'ontime' | 'late' | 'absent'

interface Row {
  entry: ScheduleEntry
  employee: Employee | undefined
  shift: ShiftType
  site: Site | undefined
  start: number
  end: number
  arrival: Punch | null
  departure: Punch | null
  state: RowState
  lateMin: number
  earlyMin: number
}

export default function Attendance() {
  const { company } = useCompany()
  const [date, setDate] = useState(today())
  const [siteFilter, setSiteFilter] = useState('')
  const [filter, setFilter] = useState<'all' | 'problems' | 'late' | 'missing' | 'suspect'>('all')
  const [data, setData] = useState<{
    entries: ScheduleEntry[]
    punches: Punch[]
    employees: Employee[]
    sites: Site[]
    shifts: ShiftType[]
    members: Member[]
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [manual, setManual] = useState<{ employeeId?: string; siteId?: string; kind?: 'in' | 'out' } | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())

  const load = useCallback(async () => {
    setLoading(true)
    const from = new Date(conakryInstant(date, '00:00') - 4 * 3600e3).toISOString()
    const to = new Date(conakryInstant(addDays(date, 1), '14:00')).toISOString()
    const [en, pu, em, si, sh, me] = await Promise.all([
      // La veille aussi : les agents de nuit d'hier quittent leur poste ce matin
      supabase.from('schedule_entries').select('*').eq('company_id', company.id).gte('work_date', addDays(date, -1)).lte('work_date', date),
      supabase.from('punches').select('*').eq('company_id', company.id).gte('punched_at', from).lte('punched_at', to).order('punched_at'),
      supabase.from('employees').select('*').eq('company_id', company.id).order('full_name'),
      supabase.from('sites').select('*').eq('company_id', company.id).order('name'),
      supabase.from('shift_types').select('*').eq('company_id', company.id).order('start_time'),
      supabase.from('company_members').select('*').eq('company_id', company.id),
    ])
    setData({
      entries: (en.data ?? []) as ScheduleEntry[],
      punches: (pu.data ?? []) as Punch[],
      employees: (em.data ?? []) as Employee[],
      sites: (si.data ?? []) as Site[],
      shifts: (sh.data ?? []) as ShiftType[],
      members: (me.data ?? []) as Member[],
    })
    // Pour qu'un chef de poste puisse pointer sans réseau
    const byToken = cacheGet<Record<string, unknown>>('sitesByToken') ?? {}
    for (const x of (si.data ?? []) as Site[]) if (x.active) byToken[x.qr_token] = { id: x.id, company_id: x.company_id, name: x.name, zone: x.zone, latitude: x.latitude, longitude: x.longitude, radius_m: x.radius_m }
    cacheSet('sitesByToken', byToken)
    cacheSet('employees.' + company.id, ((em.data ?? []) as Employee[]).filter((e) => e.active))
    setNow(Date.now())
    setLoading(false)
  }, [company.id, date])

  useEffect(() => {
    setData(null)
    load()
  }, [load])

  useEffect(() => {
    if (date !== today()) return
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [date, load])

  const userByEmployee = useMemo(
    () => Object.fromEntries((data?.members ?? []).filter((m) => m.employee_id).map((m) => [m.employee_id!, m.user_id])),
    [data],
  )
  const isManual = useCallback((p: Punch) => !!p.recorded_by && p.recorded_by !== userByEmployee[p.employee_id], [userByEmployee])

  const { rows, unplanned } = useMemo(() => {
    if (!data) return { rows: [] as Row[], unplanned: [] as Punch[] }
    const emp = Object.fromEntries(data.employees.map((e) => [e.id, e]))
    const site = Object.fromEntries(data.sites.map((s) => [s.id, s]))
    const shift = Object.fromEntries(data.shifts.map((s) => [s.id, s]))
    const used = new Set<string>()
    const out: Row[] = []
    for (const entry of data.entries) {
      const sh = shift[entry.shift_type_id]
      if (!sh) continue
      const start = conakryInstant(entry.work_date, sh.start_time)
      const end = start + shiftHours(sh) * 3600e3
      const mine = data.punches.filter((p) => p.employee_id === entry.employee_id)
      const arrival = mine.find((p) => p.kind === 'in' && +new Date(p.punched_at) >= start - 3 * 3600e3 && +new Date(p.punched_at) <= end) ?? null
      const departure = [...mine].reverse().find((p) => p.kind === 'out' && +new Date(p.punched_at) >= start && +new Date(p.punched_at) <= end + 4 * 3600e3) ?? null
      if (arrival) used.add(arrival.id)
      if (departure) used.add(departure.id)
      if (entry.work_date !== date) continue // garde de la veille : sert seulement à rattacher ses pointages
      const lateMin = arrival ? (+new Date(arrival.punched_at) - start) / 60000 : 0
      const earlyMin = departure ? (end - +new Date(departure.punched_at)) / 60000 : 0
      let state: RowState
      if (entry.status === 'absent') state = 'absent'
      else if (arrival) state = lateMin > GRACE_MIN ? 'late' : 'ontime'
      else if (now < start) state = 'upcoming'
      else if (now <= start + GRACE_MIN * 60000) state = 'expected'
      else state = 'missing'
      out.push({ entry, employee: emp[entry.employee_id], shift: sh, site: site[entry.site_id], start, end, arrival, departure, state, lateMin, earlyMin })
    }
    out.sort((a, b) => a.start - b.start || (a.employee?.full_name ?? '').localeCompare(b.employee?.full_name ?? ''))
    const unplanned = data.punches.filter((p) => !used.has(p.id) && dateAt(p.punched_at) === date)
    return { rows: out, unplanned }
  }, [data, date, now])

  const visible = rows.filter((r) => {
    if (siteFilter && r.entry.site_id !== siteFilter) return false
    const suspect = isSuspect(r.arrival) || isSuspect(r.departure)
    if (filter === 'late') return r.state === 'late'
    if (filter === 'missing') return r.state === 'missing'
    if (filter === 'suspect') return suspect
    if (filter === 'problems') return r.state === 'late' || r.state === 'missing' || suspect || (r.departure && r.earlyMin > GRACE_MIN)
    return true
  })

  const stats = useMemo(() => {
    const working = rows.filter((r) => r.state !== 'absent')
    return {
      planned: working.length,
      present: working.filter((r) => r.arrival).length,
      late: rows.filter((r) => r.state === 'late').length,
      missing: rows.filter((r) => r.state === 'missing').length,
      suspect: rows.filter((r) => isSuspect(r.arrival) || isSuspect(r.departure)).length,
    }
  }, [rows])

  async function exportDay() {
    const header = ['Agent', 'Site', 'Garde', 'Début prévu', 'Arrivée', 'Retard (min)', 'Départ', 'Statut', 'GPS arrivée', 'Saisie', 'Alertes']
    const label: Record<RowState, string> = { upcoming: 'À venir', expected: 'Attendu', missing: 'Non pointé', ontime: 'À l’heure', late: 'En retard', absent: 'Absence prévue' }
    await writeExcelFile(
      [
        header.map((v) => ({ value: v, fontWeight: 'bold' as const })),
        ...rows.map((r) =>
          [
            r.employee?.full_name ?? '',
            r.site?.name ?? '',
            r.shift.label,
            hhmm(r.shift.start_time),
            r.arrival ? timeAt(r.arrival.punched_at) : '',
            r.state === 'late' ? Math.round(r.lateMin) : 0,
            r.departure ? timeAt(r.departure.punched_at) : '',
            label[r.state],
            r.arrival ? (r.arrival.distance_m == null ? 'Sans GPS' : `${r.arrival.distance_m} m${r.arrival.gps_ok ? '' : ' (hors zone)'}`) : '',
            r.arrival && isManual(r.arrival) ? 'Responsable' : '',
            [...new Set([r.arrival, r.departure].flatMap((p) => (p ? suspectFlags(p) : [])))].map((f) => FLAG_INFO[f].label).join(', '),
          ].map((v) => ({ value: v as string | number })),
        ),
      ],
      { columns: [{ width: 24 }, { width: 22 }, { width: 10 }, { width: 11 }, { width: 10 }, { width: 11 }, { width: 10 }, { width: 14 }, { width: 18 }, { width: 12 }, { width: 36 }] },
    ).toFile(`pointages-${date}.xlsx`)
  }

  if (!data) return <PageLoader />

  return (
    <>
      <PageHeader
        title="Pointages"
        description="Arrivées et départs comparés au planning. Heures de Conakry."
        actions={
          <>
            <Link to="/scan"><Button variant="secondary" icon={ScanLine}>Scanner</Button></Link>
            <Link to={`/c/${company.id}/borne`}><Button variant="secondary" icon={IdCard}>Borne (badges)</Button></Link>
            <Button variant="secondary" icon={Download} onClick={exportDay} disabled={!rows.length}>Exporter</Button>
            <Button icon={Plus} onClick={() => setManual({})}>Saisie manuelle</Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard icon={UserCheck} label="Présents" value={`${stats.present}/${stats.planned}`} tone="green" sub="Gardes du jour" />
        <StatCard icon={AlarmClock} label="Retards" value={stats.late} tone={stats.late ? 'amber' : 'green'} sub={`Au-delà de ${GRACE_MIN} min`} />
        <StatCard icon={UserX} label="Non pointés" value={stats.missing} tone={stats.missing ? 'red' : 'green'} sub="Garde commencée" />
        <StatCard icon={ShieldAlert} label="Pointages suspects" value={stats.suspect} tone={stats.suspect ? 'red' : 'green'} sub="Selfie, GPS, téléphone partagé" />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-ink-100 p-4 xl:flex-row xl:items-center">
          <div className="flex items-center gap-2">
            <IconButton icon={ChevronLeft} label="Jour précédent" onClick={() => setDate(addDays(date, -1))} className="ring-1 ring-ink-200" />
            <IconButton icon={ChevronRight} label="Jour suivant" onClick={() => setDate(addDays(date, 1))} className="ring-1 ring-ink-200" />
            <Button size="sm" variant="secondary" onClick={() => setDate(today())} disabled={date === today()}>Aujourd’hui</Button>
            <span className="ml-1 text-[15px] font-semibold capitalize">{dayLong(date)}</span>
            <IconButton icon={RefreshCw} label="Actualiser" onClick={load} className={cx(loading && 'animate-spin')} />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row xl:ml-auto">
            <div className="flex overflow-x-auto rounded-xl bg-ink-100 p-1 text-[13px] font-medium">
              {(
                [
                  ['all', 'Tous'],
                  ['problems', 'À traiter'],
                  ['late', 'Retards'],
                  ['missing', 'Non pointés'],
                  ['suspect', 'Suspects'],
                ] as const
              ).map(([k, l]) => (
                <button key={k} onClick={() => setFilter(k)} className={cx('rounded-lg px-3 py-1.5 whitespace-nowrap transition-all', filter === k ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800')}>
                  {l}
                </button>
              ))}
            </div>
            <Select value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)} className="sm:w-52">
              <option value="">Tous les sites</option>
              {data.sites.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon={Clock} title="Aucune garde prévue ce jour" text="Les pointages sont comparés au planning. Préparez le planning pour suivre les présences." />
        ) : visible.length === 0 ? (
          <EmptyState icon={UserCheck} title="Rien à signaler" text="Aucune garde ne correspond à ce filtre." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {visible.map((r) => (
              <AttendanceRow
                key={r.entry.id}
                row={r}
                isManual={isManual}
                onOpen={() => setDetail(r.entry.employee_id)}
                onManual={(kind) => setManual({ employeeId: r.entry.employee_id, siteId: r.entry.site_id, kind })}
              />
            ))}
          </ul>
        )}
      </Card>

      {unplanned.length > 0 && (
        <Card className="mt-6">
          <div className="border-b border-ink-100 px-5 py-4">
            <h2 className="font-semibold">Pointages hors planning</h2>
            <p className="text-sm text-ink-500">Agents qui ont pointé sans garde prévue ce jour.</p>
          </div>
          <ul className="divide-y divide-ink-100">
            {unplanned.map((p) => {
              const e = data.employees.find((x) => x.id === p.employee_id)
              return (
                <li key={p.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <Avatar name={e?.full_name} size="sm" />
                  <span className="flex-1 font-medium">{e?.full_name ?? '—'}</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-ink-800"><MapPin className="size-3.5 text-brand-500" />{data.sites.find((s) => s.id === p.site_id)?.name}</span>
                  <PunchBadge punch={p} manual={isManual(p)} />
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {manual && (
        <ManualPunchModal
          initial={manual}
          employees={data.employees.filter((e) => e.active)}
          sites={data.sites.filter((s) => s.active)}
          onClose={() => setManual(null)}
          onDone={load}
        />
      )}
      {detail && (
        <PunchDetailModal
          employee={data.employees.find((e) => e.id === detail)}
          punches={data.punches.filter((p) => p.employee_id === detail)}
          sites={data.sites}
          isManual={isManual}
          onClose={() => setDetail(null)}
        />
      )}
    </>
  )
}

function PunchBadge({ punch, manual }: { punch: Punch; manual: boolean }) {
  const alerts = suspectFlags(punch).filter((f) => f !== 'hors_zone' && f !== 'sans_gps')
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="tabular font-semibold text-ink-900">{timeAt(punch.punched_at)}</span>
      {alerts.length > 0 && (
        <span title={alerts.map((f) => FLAG_INFO[f].label).join(' · ')}>
          <ShieldAlert className="size-3.5 text-red-500" />
        </span>
      )}
      {manual ? (
        <span title="Saisi par un responsable"><Hand className="size-3.5 text-brand-500" /></span>
      ) : punch.distance_m == null ? (
        <span title="Sans position GPS"><Crosshair className="size-3.5 text-ink-300" /></span>
      ) : punch.gps_ok ? (
        <span title={`${punch.distance_m} m du site`}><Crosshair className="size-3.5 text-emerald-500" /></span>
      ) : (
        <span title={`Hors zone : ${punch.distance_m} m du site`} className="inline-flex items-center gap-0.5 text-[11px] font-medium text-amber-700">
          <MapPinOff className="size-3.5" /> {punch.distance_m} m
        </span>
      )}
    </span>
  )
}

function AttendanceRow({
  row: r,
  isManual,
  onOpen,
  onManual,
}: {
  row: Row
  isManual: (p: Punch) => boolean
  onOpen: () => void
  onManual: (kind: 'in' | 'out') => void
}) {
  const tone = shiftTone(r.shift)
  const badge = {
    upcoming: <Badge>À venir · {hhmm(r.shift.start_time)}</Badge>,
    expected: <Badge tone="brand" dot>Attendu</Badge>,
    missing: <Badge tone="red" dot>Non pointé</Badge>,
    ontime: <Badge tone="green" dot>À l’heure</Badge>,
    late: <Badge tone="amber" dot>Retard {minutesLabel(r.lateMin)}</Badge>,
    absent: <Badge tone="neutral">{r.entry.absence_kind ? ABSENCE_LABELS[r.entry.absence_kind] : 'Absence prévue'}</Badge>,
  }[r.state]

  return (
    <li className={cx('flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-5', r.state === 'missing' && 'bg-red-50/40')}>
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <Avatar name={r.employee?.full_name} />
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-900">
            {r.employee?.full_name ?? '—'}
            {r.entry.status === 'replacement' && <span className="ml-2 text-xs font-normal text-brand-600">remplaçant</span>}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm font-semibold text-ink-800">
            <MapPin className="size-4 shrink-0 text-brand-500" />
            {r.site?.name ?? '—'}
          </p>
          <p className="flex items-center gap-1.5 truncate text-xs text-ink-500">
            <span className={cx('inline-flex size-4 items-center justify-center rounded ring-1 ring-inset', toneClasses[tone])}>
              <ShiftIcon tone={tone} className="size-2.5" />
            </span>
            {r.shift.label} {hhmm(r.shift.start_time)}–{hhmm(r.shift.end_time)}
          </p>
        </div>
      </button>

      <div className="flex items-center gap-4 pl-12 text-sm sm:pl-0">
        <div className="w-24">
          <p className="text-[11px] text-ink-400 uppercase">Arrivée</p>
          {r.arrival ? (
            <PunchBadge punch={r.arrival} manual={isManual(r.arrival)} />
          ) : r.state === 'missing' || r.state === 'expected' ? (
            <button onClick={() => onManual('in')} className="text-xs font-medium text-brand-600 hover:underline">Saisir</button>
          ) : (
            <span className="text-ink-300">—</span>
          )}
        </div>
        <div className="w-24">
          <p className="text-[11px] text-ink-400 uppercase">Départ</p>
          {r.departure ? (
            <span className="inline-flex flex-col">
              <PunchBadge punch={r.departure} manual={isManual(r.departure)} />
              {r.earlyMin > GRACE_MIN && <span className="text-[11px] text-amber-700">−{minutesLabel(r.earlyMin)}</span>}
            </span>
          ) : r.arrival && Date.now() > r.end ? (
            <button onClick={() => onManual('out')} className="text-xs font-medium text-brand-600 hover:underline">Saisir</button>
          ) : (
            <span className="text-ink-300">—</span>
          )}
        </div>
        <div className="w-36 text-right">{badge}</div>
      </div>
    </li>
  )
}

function PunchDetailModal({
  employee,
  punches,
  sites,
  isManual,
  onClose,
}: {
  employee: Employee | undefined
  punches: Punch[]
  sites: Site[]
  isManual: (p: Punch) => boolean
  onClose: () => void
}) {
  return (
    <Modal open onClose={onClose} title={employee?.full_name ?? 'Agent'} description="Pointages de la période affichée">
      {punches.length === 0 ? (
        <p className="text-sm text-ink-500">Aucun pointage.</p>
      ) : (
        <ol className="relative space-y-4 border-l border-ink-200 pl-6">
          {punches.map((p) => {
            const site = sites.find((s) => s.id === p.site_id)
            return (
              <li key={p.id} className="relative">
                <span className={cx('absolute top-0.5 -left-[33px] flex size-5 items-center justify-center rounded-full ring-4 ring-white', p.kind === 'in' ? 'bg-emerald-500' : 'bg-brand-500')}>
                  {p.kind === 'in' ? <LogIn className="size-3 text-white" /> : <LogOut className="size-3 text-white" />}
                </span>
                <p className="text-sm font-medium">
                  {p.kind === 'in' ? 'Arrivée' : 'Départ'} · <span className="tabular">{timeAt(p.punched_at)}</span>
                  <span className="ml-2 text-xs font-normal text-ink-400">{dayLong(dateAt(p.punched_at))}</span>
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-ink-800"><MapPin className="size-3.5 text-brand-500" />{site?.name ?? '—'}</span>
                  {isManual(p) && <Badge tone="brand">Saisi par un responsable</Badge>}
                  {p.distance_m != null && (p.gps_ok ? <Badge tone="green">{p.distance_m} m · sur place</Badge> : <Badge tone="amber">{p.distance_m} m · hors zone</Badge>)}
                  {p.accuracy_m != null && <span className="text-ink-400">± {p.accuracy_m} m</span>}
                  {punchFlags(p)
                    .filter((f) => !['hors_zone', 'sans_gps', 'saisie_responsable', 'envoi_tardif'].includes(f))
                    .map((f) => (
                      <span key={f} title={FLAG_INFO[f].hint}>
                        <Badge tone="red">{FLAG_INFO[f].label}</Badge>
                      </span>
                    ))}
                  {p.latitude != null && (
                    <a href={`https://www.google.com/maps?q=${p.latitude},${p.longitude}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                      Carte <ExternalLink className="size-3" />
                    </a>
                  )}
                  {Math.abs(+new Date(p.received_at) - +new Date(p.punched_at)) > 5 * 60000 && (
                    <span className="text-ink-400">reçu à {timeAt(p.received_at)} (hors ligne)</span>
                  )}
                </p>
                {p.photo_path && <PunchPhoto path={p.photo_path} />}
              </li>
            )
          })}
        </ol>
      )}
    </Modal>
  )
}

function ManualPunchModal({
  initial,
  employees,
  sites,
  onClose,
  onDone,
}: {
  initial: { employeeId?: string; siteId?: string; kind?: 'in' | 'out' }
  employees: Employee[]
  sites: Site[]
  onClose: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const [employeeId, setEmployeeId] = useState(initial.employeeId ?? '')
  const [siteId, setSiteId] = useState(initial.siteId ?? '')
  const [kind, setKind] = useState<'in' | 'out'>(initial.kind ?? 'in')
  const [at, setAt] = useState(toLocalInput())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function pickEmployee(id: string) {
    setEmployeeId(id)
    const e = employees.find((x) => x.id === id)
    if (e?.default_site_id && !siteId) setSiteId(e.default_site_id)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const site = sites.find((s) => s.id === siteId)
    if (!employeeId || !site) return setError('Choisissez l’agent et le site.')
    setLoading(true)
    const { error } = await supabase.rpc('punch', {
      p_qr_token: site.qr_token,
      p_kind: kind,
      p_client_id: crypto.randomUUID(),
      p_punched_at: fromLocalInput(at).toISOString(),
      p_latitude: null,
      p_longitude: null,
      p_employee_id: employeeId,
    })
    setLoading(false)
    if (error) return setError(/invalide/i.test(error.message) ? 'Heure refusée : la saisie est possible jusqu’à 3 jours en arrière, pas dans le futur.' : errorMessage(error))
    toast.success('Pointage enregistré')
    onDone()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Saisie manuelle"
      description="Pour un agent sans smartphone ou un oubli. Le pointage sera marqué « saisi par un responsable »."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" form="manual-form" loading={loading}>Enregistrer</Button>
        </>
      }
    >
      <form id="manual-form" onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {(['in', 'out'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cx('flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium ring-1 transition-all', kind === k ? (k === 'in' ? 'bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500' : 'bg-brand-50 text-brand-800 ring-2 ring-brand-500') : 'ring-ink-200 hover:ring-ink-300')}
            >
              {k === 'in' ? <LogIn className="size-4" /> : <LogOut className="size-4" />}
              {k === 'in' ? 'Arrivée' : 'Départ'}
            </button>
          ))}
        </div>
        <Field label="Agent">
          <Select value={employeeId} onChange={(e) => pickEmployee(e.target.value)} required>
            <option value="">Choisir…</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </Select>
        </Field>
        <Field label="Site">
          <Select value={siteId} onChange={(e) => setSiteId(e.target.value)} required>
            <option value="">Choisir…</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Date et heure (Conakry)" hint="Jusqu’à 3 jours en arrière.">
          <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} max={toLocalInput()} required />
        </Field>
        {error && <Callout tone="danger">{error}</Callout>}
      </form>
    </Modal>
  )
}

/** Selfie du pointage (adresse temporaire, chargée à l'ouverture) */
function PunchPhoto({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null | 'loading'>('loading')
  const [big, setBig] = useState(false)
  useEffect(() => {
    punchPhotoUrl(path).then(setUrl)
  }, [path])
  if (url === 'loading') return <div className="mt-2 size-16 animate-pulse rounded-xl bg-ink-100" />
  if (!url) return <p className="mt-2 text-xs text-ink-400">Selfie indisponible</p>
  return (
    <button type="button" onClick={() => setBig(!big)} className="mt-2 block" title={big ? 'Réduire' : 'Agrandir'}>
      <img src={url} alt="Selfie du pointage" className={cx('rounded-xl object-cover ring-1 ring-ink-200 transition-all', big ? 'w-56' : 'size-16')} />
    </button>
  )
}
