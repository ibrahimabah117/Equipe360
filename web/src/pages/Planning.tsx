import { useVocab } from '../lib/sector'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import writeExcelFile from 'write-excel-file/browser'
import {
  AlertTriangle,
  CalendarCheck2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eraser,
  MapPin,
  MoreHorizontal,
  HeartPulse,
  Plus,
  Search,
  Settings2,
  Sparkles,
  UserX,
  Users,
} from 'lucide-react'
import {
  errorMessage,
  supabase,
  type Employee,
  type ScheduleEntry,
  type ShiftType,
  type Site,
  type SiteNeed,
} from '../lib/supabase'
import { useCompany } from '../lib/company'
import { addDays, dayLong, dayNum, dayShort, isWeekend, range, today, weekLabel, weekStart } from '../lib/dates'
import {
  Avatar,
  Button,
  Card,
  ConfirmDialog,
  cx,
  EmptyState,
  IconButton,
  Input,
  PageHeader,
  PageLoader,
  Select,
  StatCard,
  useToast,
} from '../ui'
import { EntryChip, Legend, shiftHours, shiftTone, ShiftIcon } from './planning/common'
import { DayModal, NeedsModal, SlotModal, type PlanningData } from './planning/Modals'
import GenerateModal from './planning/GenerateModal'
import SickLeaveModal from './planning/SickLeaveModal'

type View = 'agents' | 'sites'

export default function Planning() {
  const { company } = useCompany()
  const v = useVocab()
  const toast = useToast()
  const [start, setStart] = useState(() => weekStart(today()))
  const [view, setView] = useState<View>('agents')
  const [siteFilter, setSiteFilter] = useState('')
  const [q, setQ] = useState('')
  const [base, setBase] = useState<{ employees: Employee[]; sites: Site[]; shifts: ShiftType[]; needs: SiteNeed[] } | null>(null)
  const [entries, setEntries] = useState<ScheduleEntry[] | null>(null)
  const [dayCell, setDayCell] = useState<{ employeeId: string; date: string } | null>(null)
  const [slot, setSlot] = useState<{ siteId: string; shiftId: string; date: string } | null>(null)
  const [needsSite, setNeedsSite] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [sickLeave, setSickLeave] = useState(false)
  const [menu, setMenu] = useState(false)
  const [confirm, setConfirm] = useState<'copy' | 'clear' | null>(null)
  const [busy, setBusy] = useState(false)

  const days = useMemo(() => range(start, 7), [start])
  const end = days[6]

  const loadBase = useCallback(async () => {
    const [e, s, sh, n] = await Promise.all([
      supabase.from('employees').select('*').eq('company_id', company.id).eq('active', true).order('full_name'),
      supabase.from('sites').select('*').eq('company_id', company.id).eq('active', true).order('name'),
      supabase.from('shift_types').select('*').eq('company_id', company.id).order('start_time'),
      supabase.from('site_shift_needs').select('*').eq('company_id', company.id),
    ])
    setBase({
      employees: (e.data ?? []) as Employee[],
      sites: (s.data ?? []) as Site[],
      shifts: (sh.data ?? []) as ShiftType[],
      needs: (n.data ?? []) as SiteNeed[],
    })
  }, [company.id])

  const loadEntries = useCallback(async () => {
    const { data } = await supabase
      .from('schedule_entries')
      .select('*')
      .eq('company_id', company.id)
      .gte('work_date', start)
      .lte('work_date', end)
    setEntries((data ?? []) as ScheduleEntry[])
  }, [company.id, start, end])

  useEffect(() => {
    loadBase()
  }, [loadBase])
  useEffect(() => {
    setEntries(null)
    loadEntries()
  }, [loadEntries])

  const reload = useCallback(() => {
    loadEntries()
  }, [loadEntries])

  const data: PlanningData | null = useMemo(
    () => (base && entries ? { companyId: company.id, ...base, entries } : null),
    [base, entries, company.id],
  )

  const shiftById = useMemo(() => Object.fromEntries((base?.shifts ?? []).map((s) => [s.id, s])), [base])
  const siteById = useMemo(() => Object.fromEntries((base?.sites ?? []).map((s) => [s.id, s])), [base])

  // Index : employé|jour → gardes
  const cellIndex = useMemo(() => {
    const m = new Map<string, ScheduleEntry[]>()
    for (const e of entries ?? []) {
      const k = `${e.employee_id}|${e.work_date}`
      m.set(k, [...(m.get(k) ?? []), e])
    }
    for (const list of m.values()) list.sort((a, b) => (shiftById[a.shift_type_id]?.start_time ?? '').localeCompare(shiftById[b.shift_type_id]?.start_time ?? ''))
    return m
  }, [entries, shiftById])

  // Couverture : site|garde|jour → présents
  const coverage = useMemo(() => {
    const m = new Map<string, ScheduleEntry[]>()
    for (const e of entries ?? []) {
      const k = `${e.site_id}|${e.shift_type_id}|${e.work_date}`
      m.set(k, [...(m.get(k) ?? []), e])
    }
    return m
  }, [entries])

  const stats = useMemo(() => {
    const list = entries ?? []
    let uncovered = 0
    for (const n of base?.needs ?? []) {
      if (!siteById[n.site_id]) continue
      for (const d of days) {
        const present = (coverage.get(`${n.site_id}|${n.shift_type_id}|${d}`) ?? []).filter((e) => e.status !== 'absent').length
        uncovered += Math.max(0, n.headcount - present)
      }
    }
    return {
      shifts: list.filter((e) => e.status !== 'absent').length,
      absences: list.filter((e) => e.status === 'absent').length,
      unreplaced: list.filter(
        (e) =>
          e.status === 'absent' &&
          !list.some((r) => r.status === 'replacement' && r.replaces_employee_id === e.employee_id && r.work_date === e.work_date && r.shift_type_id === e.shift_type_id),
      ).length,
      uncovered,
    }
  }, [entries, base, days, coverage, siteById])

  // Lignes de la vue agents, regroupées par site habituel
  const groups = useMemo(() => {
    if (!base) return []
    const t = q.trim().toLowerCase()
    const visible = base.employees.filter((e) => {
      if (t && !e.full_name.toLowerCase().includes(t)) return false
      if (!siteFilter) return true
      if (e.default_site_id === siteFilter) return true
      return (entries ?? []).some((x) => x.employee_id === e.id && x.site_id === siteFilter)
    })
    const bySite = new Map<string, Employee[]>()
    for (const e of visible) {
      const k = e.default_site_id && siteById[e.default_site_id] ? e.default_site_id : ''
      bySite.set(k, [...(bySite.get(k) ?? []), e])
    }
    const ordered = base.sites.filter((s) => bySite.has(s.id)).map((s) => ({ id: s.id, name: s.name, people: bySite.get(s.id)! }))
    if (bySite.has('')) ordered.push({ id: '', name: `Sans ${v.site} habituel`, people: bySite.get('')! })
    return ordered
  }, [base, q, siteFilter, entries, siteById, v.site])

  async function copyPreviousWeek() {
    setBusy(true)
    const { data: prev, error } = await supabase
      .from('schedule_entries')
      .select('employee_id, site_id, work_date, shift_type_id, status')
      .eq('company_id', company.id)
      .gte('work_date', addDays(start, -7))
      .lte('work_date', addDays(start, -1))
      .in('status', ['planned', 'absent'])
    if (error) {
      setBusy(false)
      return toast.error(errorMessage(error))
    }
    const rows = (prev ?? [])
      .filter((e) => !siteFilter || e.site_id === siteFilter)
      .map((e) => ({ company_id: company.id, employee_id: e.employee_id, site_id: e.site_id, work_date: addDays(e.work_date, 7), shift_type_id: e.shift_type_id, status: 'planned' as const }))
    if (!rows.length) {
      setBusy(false)
      setConfirm(null)
      return toast.info('La semaine précédente est vide.')
    }
    const { error: e2 } = await supabase.from('schedule_entries').upsert(rows, { onConflict: 'employee_id,work_date,shift_type_id', ignoreDuplicates: true })
    setBusy(false)
    setConfirm(null)
    if (e2) return toast.error(errorMessage(e2))
    toast.success(`${v.nShifts(rows.length)} recopié${v.sx(rows.length)}`)
    reload()
  }

  async function clearWeek() {
    setBusy(true)
    let query = supabase.from('schedule_entries').delete().eq('company_id', company.id).gte('work_date', start).lte('work_date', end)
    if (siteFilter) query = query.eq('site_id', siteFilter)
    const { error } = await query
    setBusy(false)
    setConfirm(null)
    if (error) return toast.error(errorMessage(error))
    toast.success('Semaine effacée')
    reload()
  }

  async function exportWeek() {
    if (!base || !entries) return
    const header = [v.Worker, `${v.Site} habituel`, ...days.map((d) => `${dayShort(d)} ${dayNum(d)}`), v.Shifts, 'Heures']
    const rows = groups.flatMap((g) =>
      g.people.map((e) => {
        let count = 0
        let hours = 0
        const cells = days.map((d) =>
          (cellIndex.get(`${e.id}|${d}`) ?? [])
            .map((x) => {
              const s = shiftById[x.shift_type_id]
              if (!s) return ''
              if (x.status !== 'absent') {
                count++
                hours += shiftHours(s)
              }
              const where = x.site_id !== e.default_site_id ? ` @${siteById[x.site_id]?.name ?? ''}` : ''
              return x.status === 'absent' ? `ABS (${s.code})` : x.status === 'replacement' ? `${s.code} (rempl.)${where}` : `${s.code}${where}`
            })
            .filter(Boolean)
            .join(' + '),
        )
        return [e.full_name, g.name, ...cells, count, hours]
      }),
    )
    await writeExcelFile(
      [
        header.map((v) => ({ value: v, fontWeight: 'bold' as const })),
        ...rows.map((r) => r.map((v) => ({ value: v as string | number }))),
      ],
      { columns: [{ width: 26 }, { width: 22 }, ...days.map(() => ({ width: 12 })), { width: 8 }, { width: 8 }] },
    ).toFile(`planning-${start}.xlsx`)
  }

  if (!base) return <PageLoader />

  const noSetup = base.employees.length === 0 || base.sites.length === 0
  const todayIso = today()

  return (
    <>
      <PageHeader
        title="Planning"
        description={`${v.Shifts} de la semaine, absences et remplacements.`}
        actions={
          <>
            <Button variant="secondary" icon={HeartPulse} onClick={() => setSickLeave(true)} disabled={noSetup}>Arrêt maladie</Button>
            <Button variant="secondary" icon={Download} onClick={exportWeek} disabled={!entries?.length}>Exporter</Button>
            <div className="relative">
              <Button variant="secondary" icon={MoreHorizontal} onClick={() => setMenu(!menu)} aria-label="Plus d’actions">
                <span className="sr-only sm:not-sr-only">Plus</span>
              </Button>
              {menu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                  <div className="animate-in absolute right-0 z-20 mt-1 w-64 rounded-xl bg-white p-1 shadow-pop ring-1 ring-ink-100">
                    <button onClick={() => { setMenu(false); setConfirm('copy') }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink-700 hover:bg-ink-50">
                      <Copy className="size-4" /> Recopier la semaine précédente
                    </button>
                    <button onClick={() => { setMenu(false); setConfirm('clear') }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">
                      <Eraser className="size-4" /> Effacer cette semaine
                    </button>
                  </div>
                </>
              )}
            </div>
            <Button icon={Sparkles} onClick={() => setGenerating(true)} disabled={noSetup}>Générer</Button>
          </>
        }
      />

      {noSetup ? (
        <Card>
          <EmptyState
            icon={CalendarDays}
            title={`Ajoutez d’abord vos ${v.sites} et vos ${v.workers}`}
            text={`Le planning se construit à partir de vos ${v.workers} et des ${v.sites} où ils travaillent.`}
          />
        </Card>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            <StatCard icon={CalendarCheck2} label={`${v.Shifts} prévu${v.sx(2)}`} value={stats.shifts} sub="Cette semaine" />
            <StatCard icon={UserX} label="Absences" value={stats.absences} tone={stats.absences ? 'amber' : 'green'} sub={stats.unreplaced ? `${stats.unreplaced} sans remplaçant` : 'Toutes remplacées'} />
            <StatCard icon={AlertTriangle} label="Postes non couverts" value={stats.uncovered} tone={stats.uncovered ? 'red' : 'green'} sub={base.needs.length ? `Selon les besoins des ${v.sites}` : `Définissez les besoins (vue ${v.Sites})`} />
            <StatCard icon={Users} label="Agents actifs" value={base.employees.length} tone="green" />
          </div>

          <Card>
            {/* Barre d'outils */}
            <div className="flex flex-col gap-3 border-b border-ink-100 p-4 xl:flex-row xl:items-center">
              <div className="flex items-center gap-2">
                <IconButton icon={ChevronLeft} label="Semaine précédente" onClick={() => setStart(addDays(start, -7))} className="ring-1 ring-ink-200" />
                <IconButton icon={ChevronRight} label="Semaine suivante" onClick={() => setStart(addDays(start, 7))} className="ring-1 ring-ink-200" />
                <Button size="sm" variant="secondary" onClick={() => setStart(weekStart(today()))} disabled={start === weekStart(today())}>
                  Aujourd’hui
                </Button>
                <span className="ml-1 text-[15px] font-semibold text-ink-900 capitalize">{weekLabel(start)}</span>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row xl:ml-auto">
                <div className="flex rounded-xl bg-ink-100 p-1 text-[13px] font-medium">
                  {(
                    [
                      ['agents', `Par ${v.worker}`, Users],
                      ['sites', `Par ${v.site}`, MapPin],
                    ] as const
                  ).map(([k, l, I]) => (
                    <button
                      key={k}
                      onClick={() => setView(k)}
                      className={cx('flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 whitespace-nowrap transition-all', view === k ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800')}
                    >
                      <I className="size-3.5" /> {l}
                    </button>
                  ))}
                </div>
                <Select value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)} className="sm:w-52">
                  <option value="">Tous les {v.sites}</option>
                  {base.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
                {view === 'agents' && (
                  <Input leading={<Search className="size-4" />} placeholder={`${v.Worker}…`} value={q} onChange={(e) => setQ(e.target.value)} className="sm:w-44" />
                )}
              </div>
            </div>

            {!entries || !data ? (
              <PageLoader />
            ) : view === 'agents' ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 w-40 sm:w-56 border-b border-ink-100 bg-ink-50/95 px-4 py-2.5 text-left text-xs font-medium tracking-wide text-ink-500 uppercase backdrop-blur">{v.Worker}</th>
                      {days.map((d) => (
                        <th key={d} className={cx('border-b border-ink-100 px-1 py-2 text-center', d === todayIso ? 'bg-brand-50' : isWeekend(d) ? 'bg-ink-50' : 'bg-ink-50/70')}>
                          <span className={cx('block text-[11px] font-medium tracking-wide uppercase', d === todayIso ? 'text-brand-600' : 'text-ink-500')}>{dayShort(d)}</span>
                          <span className={cx('tabular mx-auto mt-0.5 flex size-7 items-center justify-center rounded-full text-sm font-semibold', d === todayIso ? 'bg-brand-500 text-white' : 'text-ink-800')}>{dayNum(d)}</span>
                        </th>
                      ))}
                      <th className="w-20 border-b border-ink-100 bg-ink-50/70 px-3 text-right text-xs font-medium tracking-wide text-ink-500 uppercase">Heures</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.length === 0 && (
                      <tr><td colSpan={9} className="py-10 text-center text-sm text-ink-500">Aucun {v.worker} pour ce filtre.</td></tr>
                    )}
                    {groups.map((g) => (
                      <Fragment key={g.id || 'none'}>
                        <tr>
                          <td colSpan={9} className="sticky left-0 border-b border-ink-100 bg-white px-4 pt-4 pb-2">
                            <span className="inline-flex items-center gap-2 text-base font-semibold text-ink-900">
                              <MapPin className="size-4 text-brand-500" /> {g.name}
                              <span className="font-normal text-ink-400 normal-case">· {v.nWorkers(g.people.length)}</span>
                            </span>
                          </td>
                        </tr>
                        {g.people.map((e) => {
                          let hours = 0
                          return (
                            <tr key={e.id} className="group">
                              <td className="sticky left-0 z-10 border-b border-ink-100 bg-white px-4 py-2 group-hover:bg-ink-50/80">
                                <div className="flex items-center gap-2.5">
                                  <Avatar name={e.full_name} size="sm" />
                                  <div className="min-w-0">
                                    <p className="truncate font-medium text-ink-900">{e.full_name}</p>
                                    <p className="truncate text-[11px] text-ink-500">{e.job_title}</p>
                                  </div>
                                </div>
                              </td>
                              {days.map((d) => {
                                const list = cellIndex.get(`${e.id}|${d}`) ?? []
                                for (const x of list) if (x.status !== 'absent' && shiftById[x.shift_type_id]) hours += shiftHours(shiftById[x.shift_type_id])
                                return (
                                  <td key={d} className={cx('border-b border-l border-ink-100 p-1 text-center', d === todayIso && 'bg-brand-50/40', isWeekend(d) && d !== todayIso && 'bg-ink-50/40')}>
                                    <button
                                      onClick={() => setDayCell({ employeeId: e.id, date: d })}
                                      className="group/cell flex min-h-11 w-full flex-wrap items-center justify-center gap-1 rounded-lg p-1 transition-colors hover:bg-brand-50 hover:ring-1 hover:ring-brand-200"
                                    >
                                      {list.length ? (
                                        list.map((x) => (
                                          <EntryChip key={x.id} entry={x} shift={shiftById[x.shift_type_id]} siteHint={x.site_id !== e.default_site_id ? siteById[x.site_id]?.name ?? '—' : null} />
                                        ))
                                      ) : (
                                        <Plus className="size-4 text-ink-200 opacity-0 transition-opacity group-hover/cell:opacity-100" />
                                      )}
                                    </button>
                                  </td>
                                )
                              })}
                              <td className="tabular border-b border-l border-ink-100 px-3 text-right font-medium text-ink-700">{hours ? `${hours} h` : '—'}</td>
                            </tr>
                          )
                        })}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 w-40 sm:w-56 border-b border-ink-100 bg-ink-50/95 px-4 py-2.5 text-left text-xs font-medium tracking-wide text-ink-500 uppercase backdrop-blur">{v.Site} · {v.shift}</th>
                      {days.map((d) => (
                        <th key={d} className={cx('border-b border-ink-100 px-1 py-2 text-center', d === todayIso ? 'bg-brand-50' : 'bg-ink-50/70')}>
                          <span className={cx('block text-[11px] font-medium tracking-wide uppercase', d === todayIso ? 'text-brand-600' : 'text-ink-500')}>{dayShort(d)}</span>
                          <span className={cx('tabular mx-auto mt-0.5 flex size-7 items-center justify-center rounded-full text-sm font-semibold', d === todayIso ? 'bg-brand-500 text-white' : 'text-ink-800')}>{dayNum(d)}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {base.sites.filter((s) => !siteFilter || s.id === siteFilter).map((site) => (
                      <Fragment key={site.id}>
                        <tr>
                          <td colSpan={8} className="sticky left-0 border-b border-ink-100 bg-white px-4 pt-4 pb-2">
                            <div className="flex items-center gap-2">
                              <MapPin className="size-4 text-brand-500" />
                              <span className="text-base font-semibold text-ink-900">{site.name}</span>
                              {site.zone && <span className="text-sm text-ink-500">· {site.zone}</span>}
                              <button onClick={() => setNeedsSite(site.id)} className="ml-2 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-brand-600 hover:bg-brand-50">
                                <Settings2 className="size-3.5" /> Effectif requis
                              </button>
                            </div>
                          </td>
                        </tr>
                        {base.shifts.map((sh) => {
                          const need = base.needs.find((n) => n.site_id === site.id && n.shift_type_id === sh.id)?.headcount ?? 0
                          const tone = shiftTone(sh)
                          return (
                            <tr key={sh.id} className="group">
                              <td className="sticky left-0 z-10 border-b border-ink-100 bg-white px-4 py-2 group-hover:bg-ink-50/80">
                                <div className="flex items-center gap-2 text-ink-700">
                                  <ShiftIcon tone={tone} className="size-4 text-ink-400" />
                                  <span className="font-medium">{sh.label}</span>
                                  <span className="text-xs text-ink-400">{need ? `${need} requis` : 'pas de besoin'}</span>
                                </div>
                              </td>
                              {days.map((d) => {
                                const list = coverage.get(`${site.id}|${sh.id}|${d}`) ?? []
                                const present = list.filter((x) => x.status !== 'absent')
                                const absents = list.length - present.length
                                const state = need === 0 ? (present.length ? 'extra' : 'none') : present.length >= need ? 'ok' : 'missing'
                                return (
                                  <td key={d} className={cx('border-b border-l border-ink-100 p-1', d === todayIso && 'bg-brand-50/40')}>
                                    <button
                                      onClick={() => setSlot({ siteId: site.id, shiftId: sh.id, date: d })}
                                      className={cx(
                                        'flex min-h-12 w-full flex-col items-center justify-center gap-1 rounded-lg p-1 ring-1 ring-inset transition-colors',
                                        state === 'ok' && 'bg-emerald-50 ring-emerald-100 hover:bg-emerald-100',
                                        state === 'missing' && 'bg-red-50 ring-red-100 hover:bg-red-100',
                                        state === 'extra' && 'bg-white ring-ink-100 hover:bg-ink-50',
                                        state === 'none' && 'ring-transparent hover:bg-ink-50 hover:ring-ink-100',
                                      )}
                                    >
                                      {state !== 'none' && (
                                        <span className={cx('tabular text-xs font-semibold', state === 'ok' ? 'text-emerald-700' : state === 'missing' ? 'text-red-700' : 'text-ink-700')}>
                                          {present.length}{need ? `/${need}` : ''}
                                        </span>
                                      )}
                                      {present.length > 0 && (
                                        <span className="flex -space-x-1.5">
                                          {present.slice(0, 3).map((x) => (
                                            <span key={x.id} className="rounded-full ring-2 ring-white">
                                              <Avatar name={base.employees.find((e) => e.id === x.employee_id)?.full_name} size="sm" />
                                            </span>
                                          ))}
                                        </span>
                                      )}
                                      {absents > 0 && <span className="text-[10px] font-medium text-red-600">{absents} abs.</span>}
                                      {state === 'none' && <Plus className="size-4 text-ink-200" />}
                                    </button>
                                  </td>
                                )
                              })}
                            </tr>
                          )
                        })}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="border-t border-ink-100 px-4 py-3">
              <Legend shifts={base.shifts} />
            </div>
          </Card>
        </>
      )}

      {dayCell && data && (
        <DayModal data={data} employeeId={dayCell.employeeId} date={dayCell.date} onClose={() => setDayCell(null)} onChanged={reload} />
      )}
      {slot && data && (
        <SlotModal data={data} siteId={slot.siteId} shiftId={slot.shiftId} date={slot.date} onClose={() => setSlot(null)} onChanged={reload} />
      )}
      {needsSite && data && <NeedsModal data={data} siteId={needsSite} onClose={() => setNeedsSite(null)} onChanged={loadBase} />}
      {generating && data && (
        <GenerateModal data={data} defaultStart={start} defaultSite={siteFilter} onClose={() => setGenerating(false)} onDone={reload} />
      )}
      {sickLeave && base && (
        <SickLeaveModal
          data={{ companyId: company.id, ...base }}
          onClose={() => setSickLeave(false)}
          onDone={(from) => {
            setSickLeave(false)
            const w = weekStart(from)
            if (w === start) reload()
            else setStart(w)
          }}
        />
      )}
      <ConfirmDialog
        open={confirm === 'copy'}
        onClose={() => setConfirm(null)}
        loading={busy}
        title="Recopier la semaine précédente ?"
        text={`Les ${v.shifts} du ${dayLong(addDays(start, -7))} au ${dayLong(addDays(start, -1))}${siteFilter ? ` (${v.site} sélectionné)` : ''} seront recopié${v.sx(2)} sur cette semaine. Les absences redeviennent des ${v.shifts} prévu${v.sx(2)}, les remplacements ne sont pas recopiés. Rien n’est écrasé.`}
        confirmLabel="Recopier"
        onConfirm={copyPreviousWeek}
      />
      <ConfirmDialog
        open={confirm === 'clear'}
        onClose={() => setConfirm(null)}
        loading={busy}
        danger
        title="Effacer cette semaine ?"
        text={`Tous les ${v.shifts}, absences et remplacements du ${weekLabel(start)}${siteFilter ? ` pour ${v.leSite} sélectionné` : ''} seront supprimés.`}
        confirmLabel="Effacer"
        onConfirm={clearWeek}
      />
    </>
  )
}
