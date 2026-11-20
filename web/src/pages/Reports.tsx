import { useVocab } from '../lib/sector'
import { useEffect, useMemo, useState } from 'react'
import writeExcelFile from 'write-excel-file/browser'
import { AlarmClock, ChevronLeft, ChevronRight, ClipboardList, Download, Printer, ShieldAlert, UserCheck, UserX } from 'lucide-react'
import { errorMessage, fetchAll, supabase, type Employee, type Punch, type ScheduleEntry, type ShiftType, type Site } from '../lib/supabase'
import { useCompany } from '../lib/company'
import { conakryInstant, dayLong, minutesLabel, today } from '../lib/dates'
import { monthEnd, periodLabel } from '../lib/payroll'
import {
  buildAttendanceReport,
  expected,
  presenceRate,
  punctualityRate,
  REPORT_GRACE_MIN,
  type Counts,
  type EmployeeLine,
  type Incident,
} from '../lib/attendanceReport'
import { Avatar, Badge, Button, Callout, Card, cx, EmptyState, IconButton, Modal, PageHeader, PageLoader, Select, StatCard, Table, Td, Th } from '../ui'
import { ABSENCE_LABELS } from './planning/common'

const pct = (r: number | null) => (r == null ? '—' : `${Math.round(r * 100)} %`)
const justified = (c: Counts) => c.absences.maladie + c.absences.conge + c.absences.permission + c.absences.autre

function shiftPeriod(period: string, n: number) {
  const [y, m] = period.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return d.toISOString().slice(0, 10)
}

function RateBadge({ rate }: { rate: number | null }) {
  if (rate == null) return <span className="text-ink-300">—</span>
  const tone = rate >= 0.95 ? 'green' : rate >= 0.85 ? 'amber' : 'red'
  return <Badge tone={tone}>{pct(rate)}</Badge>
}

const INCIDENT_LABEL: Record<Incident['kind'], string> = {
  retard: 'Retard',
  depart_anticipe: 'Départ anticipé',
  non_pointe: 'Non pointé',
  absence_injustifiee: 'Absence injustifiée',
  absence: 'Absence',
  suspect: 'Pointage suspect',
}

function incidentText(i: Incident) {
  if (i.kind === 'retard' || i.kind === 'depart_anticipe') return `${INCIDENT_LABEL[i.kind]} de ${minutesLabel(i.minutes ?? 0)}`
  if (i.kind === 'absence') return `Absence · ${ABSENCE_LABELS[i.detail as keyof typeof ABSENCE_LABELS] ?? 'autre'}`
  if (i.kind === 'suspect') return `Pointage suspect · ${i.detail}`
  return INCIDENT_LABEL[i.kind]
}

/** Bilan mensuel d'assiduité : par agent et par site, à exporter ou imprimer */
export default function Reports() {
  const { company } = useCompany()
  const v = useVocab()
  const [period, setPeriod] = useState(() => today().slice(0, 8) + '01')
  const [siteFilter, setSiteFilter] = useState('')
  const [sort, setSort] = useState<'worst' | 'name'>('worst')
  const [detail, setDetail] = useState<EmployeeLine | null>(null)
  const [data, setData] = useState<{ entries: ScheduleEntry[]; punches: Punch[]; employees: Employee[]; sites: Site[]; shifts: ShiftType[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setData(null)
    setError(null)
    ;(async () => {
      const end = monthEnd(period)
      const [en, pu, em, si, sh] = await Promise.all([
        fetchAll<ScheduleEntry>(() => supabase.from('schedule_entries').select('*').eq('company_id', company.id).gte('work_date', period).lte('work_date', end).order('id')),
        fetchAll<Punch>(() =>
          supabase
            .from('punches')
            .select('*')
            .eq('company_id', company.id)
            .gte('punched_at', new Date(conakryInstant(period, '00:00') - 4 * 3600e3).toISOString())
            .lte('punched_at', new Date(conakryInstant(end, '23:59') + 24 * 3600e3).toISOString())
            .order('id'),
        ),
        supabase.from('employees').select('*').eq('company_id', company.id).order('full_name'),
        supabase.from('sites').select('*').eq('company_id', company.id).order('name'),
        supabase.from('shift_types').select('*').eq('company_id', company.id),
      ])
      if (!alive) return
      const err = en.error ?? pu.error ?? em.error ?? si.error ?? sh.error
      if (err) return setError(errorMessage(err))
      setData({
        entries: en.data,
        punches: pu.data,
        employees: (em.data ?? []) as Employee[],
        sites: (si.data ?? []) as Site[],
        shifts: (sh.data ?? []) as ShiftType[],
      })
    })()
    return () => {
      alive = false
    }
  }, [company.id, period])

  const report = useMemo(() => {
    if (!data) return null
    return buildAttendanceReport({ ...data, entries: siteFilter ? data.entries.filter((e) => e.site_id === siteFilter) : data.entries })
  }, [data, siteFilter])

  const lines = useMemo(() => {
    if (!report) return []
    const list = [...report.employees]
    if (sort === 'worst') {
      const score = (l: EmployeeLine) => presenceRate(l) ?? 2
      list.sort((a, b) => score(a) - score(b) || b.late - a.late || b.suspect - a.suspect || a.employee.full_name.localeCompare(b.employee.full_name))
    }
    return list
  }, [report, sort])

  const thisMonth = today().slice(0, 8) + '01'
  const isCurrent = period === thisMonth
  const siteName = data?.sites.find((s) => s.id === siteFilter)?.name

  async function exportExcel() {
    if (!report) return
    const bold = (v: string) => ({ value: v, fontWeight: 'bold' as const })
    const row = (vals: (string | number | null)[]) => vals.map((v) => ({ value: v ?? '' }))
    const counts = (c: Counts) => [
      c.planned,
      expected(c),
      c.worked,
      presenceRate(c) == null ? null : Math.round(presenceRate(c)! * 100),
      c.late,
      Math.round(c.lateMinutes),
      c.early,
      c.unpunched,
      c.absences.injustifiee,
      justified(c),
      c.suspect,
    ]
    const head = [`${v.Shifts} prévu${v.sx(2)}`, `${v.Shifts} attendu${v.sx(2)}`, `${v.Shifts} pointé${v.sx(2)}`, 'Présence (%)', 'Retards', 'Minutes de retard', 'Départs anticipés', 'Non pointées', 'Absences injustifiées', 'Absences justifiées', 'Pointages suspects']
    const cols = (first: number) => [{ width: first }, ...head.map(() => ({ width: 13 }))]
    const title = `${company.name} — assiduité ${periodLabel(period)}${siteName ? ' — ' + siteName : ''}`
    await writeExcelFile([
      {
        sheet: `Par ${v.worker}`,
        columns: cols(26),
        data: [[bold(title)], [], [v.Worker, ...head].map(bold), ...report.employees.map((l) => row([l.employee.full_name, ...counts(l)])), row(['Total', ...counts(report.total)])],
      },
      {
        sheet: `Par ${v.site}`,
        columns: cols(26),
        data: [[bold(title)], [], ['Site', ...head].map(bold), ...report.sites.map((l) => row([l.site.name, ...counts(l)])), row(['Total', ...counts(report.total)])],
      },
      {
        sheet: 'Incidents',
        columns: [{ width: 26 }, { width: 12 }, { width: 22 }, { width: 10 }, { width: 50 }],
        data: [
          [v.Worker, 'Date', v.Site, v.Shift, 'Incident'].map(bold),
          ...report.employees.flatMap((l) => l.incidents.map((i) => row([l.employee.full_name, i.date.split('-').reverse().join('/'), i.site, i.shift, incidentText(i)]))),
        ],
      },
    ]).toFile(`assiduite-${period.slice(0, 7)}${siteName ? '-' + siteName.replace(/[^\p{L}\d]+/gu, '-') : ''}.xlsx`)
  }

  return (
    <>
      <style>{`@page { size: A4 landscape; margin: 10mm; } @media print { main { padding: 0 !important; max-width: none !important; } }`}</style>
      <div className="report-print">
      <div className="no-print">
        <PageHeader
          title="Rapport d’assiduité"
          description={`Bilan du mois par ${v.worker} et par ${v.site} : présence, retards, absences et pointages suspects.`}
          actions={
            <>
              <Button variant="secondary" icon={Download} onClick={exportExcel} disabled={!report?.employees.length}>Exporter Excel</Button>
              <Button icon={Printer} onClick={() => window.print()} disabled={!report?.employees.length}>Imprimer / PDF</Button>
            </>
          }
        />

        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <IconButton icon={ChevronLeft} label="Mois précédent" onClick={() => setPeriod(shiftPeriod(period, -1))} className="ring-1 ring-ink-200" />
            <IconButton icon={ChevronRight} label="Mois suivant" onClick={() => setPeriod(shiftPeriod(period, 1))} className="ring-1 ring-ink-200" disabled={period >= thisMonth} />
            <span className="ml-1 text-[15px] font-semibold capitalize">{periodLabel(period)}</span>
            {isCurrent && <Badge tone="brand">en cours</Badge>}
          </div>
          <div className="flex gap-2 sm:ml-auto">
            <Select value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)} className="sm:w-52">
              <option value="">Tous les {v.sites}</option>
              {data?.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Select value={sort} onChange={(e) => setSort(e.target.value as 'worst' | 'name')} className="sm:w-56">
              <option value="worst">Les moins assidus d’abord</option>
              <option value="name">Par nom</option>
            </Select>
          </div>
        </div>
      </div>

      {/* En-tête imprimé */}
      <div className="print-only mb-4 hidden">
        <h1 className="text-xl font-semibold">{company.name} — Rapport d’assiduité</h1>
        <p className="text-sm capitalize">
          {periodLabel(period)}
          {isCurrent && ` (jusqu’au ${dayLong(today())})`}
          {siteName && ` · ${v.Site} : ${siteName}`}
        </p>
      </div>

      {error ? (
        <Callout tone="danger">{error}</Callout>
      ) : !report ? (
        <PageLoader />
      ) : report.employees.length === 0 ? (
        <Card>
          <EmptyState icon={ClipboardList} title={`${v.AucunShift} ce mois-ci`} text="Le rapport se remplit à partir du planning et des pointages." />
        </Card>
      ) : (
        <div className="space-y-6">
          {isCurrent && <p className="no-print text-sm text-ink-500">Mois en cours : seul{v.sx(2)} les {v.shifts} déjà commencé{v.sx(2)} sont compté{v.sx(2)}.</p>}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5 lg:gap-4 print:grid-cols-5">
            <StatCard icon={UserCheck} label="Présence" value={pct(presenceRate(report.total))} tone={(presenceRate(report.total) ?? 1) >= 0.95 ? 'green' : 'amber'} sub={`${report.total.worked} / ${expected(report.total)} ${v.shifts} attendu${v.sx(2)}`} />
            <StatCard icon={AlarmClock} label="Retards" value={report.total.late} tone={report.total.late ? 'amber' : 'green'} sub={report.total.late ? `${minutesLabel(report.total.lateMinutes)} au total` : `Au-delà de ${REPORT_GRACE_MIN} min`} />
            <StatCard icon={UserX} label="Non pointées" value={report.total.unpunched} tone={report.total.unpunched ? 'red' : 'green'} sub={`${v.Shifts} sans arrivée`} />
            <StatCard icon={UserX} label="Absences injustifiées" value={report.total.absences.injustifiee} tone={report.total.absences.injustifiee ? 'red' : 'green'} sub={`${justified(report.total)} justifiée${justified(report.total) > 1 ? 's' : ''}`} />
            <StatCard icon={ShieldAlert} label="Pointages suspects" value={report.total.suspect} tone={report.total.suspect ? 'red' : 'green'} sub="Selfie, GPS, téléphone" />
          </div>

          <Card className="overflow-hidden">
            <div className="border-b border-ink-100 px-5 py-4">
              <h2 className="font-semibold">Par {v.worker}</h2>
              <p className="no-print text-sm text-ink-500">Touchez un {v.worker} pour voir le détail jour par jour.</p>
            </div>
            <Table>
              <thead>
                <tr>
                  <Th>{v.Worker}</Th>
                  <Th className="text-right">{v.Shifts}</Th>
                  <Th className="text-right">Présence</Th>
                  <Th className="text-right">Ponctualité</Th>
                  <Th className="text-right">Retards</Th>
                  <Th className="text-right">Départs anticipés</Th>
                  <Th className="text-right">Non pointées</Th>
                  <Th className="text-right">Abs. injust.</Th>
                  <Th className="text-right">Abs. just.</Th>
                  <Th className="text-right">Suspects</Th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.employee.id} onClick={() => setDetail(l)} className="cursor-pointer hover:bg-ink-50/60">
                    <Td>
                      <span className="flex items-center gap-2.5">
                        <span className="no-print"><Avatar name={l.employee.full_name} size="sm" /></span>
                        <span className="font-medium whitespace-nowrap">{l.employee.full_name}</span>
                      </span>
                    </Td>
                    <Td className="tabular text-right">{l.worked}/{expected(l)}</Td>
                    <Td className="text-right"><RateBadge rate={presenceRate(l)} /></Td>
                    <Td className="tabular text-right">{pct(punctualityRate(l))}</Td>
                    <Td className="tabular text-right whitespace-nowrap">{l.late ? `${l.late} · ${minutesLabel(l.lateMinutes)}` : '—'}</Td>
                    <Td className="tabular text-right">{l.early || '—'}</Td>
                    <Td className={cx('tabular text-right', l.unpunched > 0 && 'font-semibold text-red-600')}>{l.unpunched || '—'}</Td>
                    <Td className={cx('tabular text-right', l.absences.injustifiee > 0 && 'font-semibold text-red-600')}>{l.absences.injustifiee || '—'}</Td>
                    <Td className="tabular text-right">{justified(l) || '—'}</Td>
                    <Td className={cx('tabular text-right', l.suspect > 0 && 'font-semibold text-red-600')}>{l.suspect || '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          {!siteFilter && report.sites.length > 1 && (
            <Card className="overflow-hidden">
              <div className="border-b border-ink-100 px-5 py-4">
                <h2 className="font-semibold">Par {v.site}</h2>
              </div>
              <Table>
                <thead>
                  <tr>
                    <Th>{v.Site}</Th>
                    <Th className="text-right">{v.Shifts}</Th>
                    <Th className="text-right">Présence</Th>
                    <Th className="text-right">Retards</Th>
                    <Th className="text-right">Non pointées</Th>
                    <Th className="text-right">Abs. injust.</Th>
                    <Th className="text-right">Suspects</Th>
                  </tr>
                </thead>
                <tbody>
                  {report.sites.map((l) => (
                    <tr key={l.site.id}>
                      <Td className="font-medium">{l.site.name}</Td>
                      <Td className="tabular text-right">{l.worked}/{expected(l)}</Td>
                      <Td className="text-right"><RateBadge rate={presenceRate(l)} /></Td>
                      <Td className="tabular text-right">{l.late || '—'}</Td>
                      <Td className="tabular text-right">{l.unpunched || '—'}</Td>
                      <Td className="tabular text-right">{l.absences.injustifiee || '—'}</Td>
                      <Td className="tabular text-right">{l.suspect || '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}

          <p className="text-xs text-ink-500">
            Présence = {v.shifts} pointé{v.sx(2)} ÷ {v.shifts} attendu{v.sx(2)} ({v.shifts} prévu{v.sx(2)} moins les absences justifiées : maladie, congé, permission).
            Retard au-delà de {REPORT_GRACE_MIN} min. Heures de Conakry.
          </p>
        </div>
      )}

      </div>
      {detail && <IncidentsModal line={detail} period={period} onClose={() => setDetail(null)} />}
    </>
  )
}

function IncidentsModal({ line, period, onClose }: { line: EmployeeLine; period: string; onClose: () => void }) {
  const v = useVocab()
  const tone: Record<Incident['kind'], 'amber' | 'red' | 'neutral'> = {
    retard: 'amber',
    depart_anticipe: 'amber',
    non_pointe: 'red',
    absence_injustifiee: 'red',
    absence: 'neutral',
    suspect: 'red',
  }
  return (
    <Modal open onClose={onClose} title={line.employee.full_name} description={`Détail ${periodLabel(period)} · présence ${pct(presenceRate(line))}`}>
      {line.incidents.length === 0 ? (
        <p className="text-sm text-ink-500">Aucun incident : {v.TousShifts.charAt(0).toLowerCase() + v.TousShifts.slice(1)} ont été pointé{v.sx(2)} à l’heure.</p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {line.incidents.map((i, k) => (
            <li key={k} className="flex items-start gap-3 py-2.5 text-sm">
              <span className="w-28 shrink-0 text-ink-500 capitalize">{dayLong(i.date)}</span>
              <span className="min-w-0 flex-1">
                <Badge tone={tone[i.kind]}>{incidentText(i)}</Badge>
                <span className="mt-0.5 block text-xs text-ink-500">{i.shift} · {i.site}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
