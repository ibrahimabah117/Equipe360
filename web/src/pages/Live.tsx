import type { PunchKind } from '../lib/punchKinds'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Maximize2, Minimize2, Radio, UserCheck, UserX, Users } from 'lucide-react'
import { useCompany } from '../lib/company'
import { useVocab } from '../lib/sector'
import { addDays, conakryInstant, timeAt, today } from '../lib/dates'
import { computeLive, type LivePerson, type LiveSlot } from '../lib/live'
import { errorMessage, supabase, type Employee, type ScheduleEntry, type ShiftType, type Site, type SiteNeed } from '../lib/supabase'
import { Button, Card, cx, EmptyState, PageLoader, StatCard, useToast } from '../ui'

const REFRESH_MS = 60_000

interface Data {
  sites: Record<string, Site>
  shifts: Record<string, ShiftType>
  employees: Record<string, Pick<Employee, 'id' | 'full_name' | 'job_title'>>
  slots: LiveSlot[]
  at: number
}

const STATE_STYLE: Record<LivePerson['state'], string> = {
  present: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  pause: 'bg-amber-50 text-amber-800 ring-amber-300',
  attendu: 'bg-amber-50 text-amber-800 ring-amber-200',
  manquant: 'bg-red-50 text-red-700 ring-red-200',
  parti: 'bg-ink-100 text-ink-600 ring-ink-200',
  absent: 'bg-ink-50 text-ink-400 ring-ink-200 line-through',
}

/** Écran « en direct » : qui est présent sur chaque lieu en ce moment. Se met à jour toutes les minutes. */
export default function Live() {
  const { company } = useCompany()
  const v = useVocab()
  const toast = useToast()
  const toastRef = useRef(toast)
  useEffect(() => {
    toastRef.current = toast
  })
  const [data, setData] = useState<Data | null>(null)
  const [full, setFull] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const d = today()
    const from = addDays(d, -1)
    const [si, sh, ne, en, pu, em] = await Promise.all([
      supabase.from('sites').select('*').eq('company_id', company.id).eq('active', true),
      supabase.from('shift_types').select('*').eq('company_id', company.id),
      supabase.from('site_shift_needs').select('*').eq('company_id', company.id),
      supabase.from('schedule_entries').select('*').eq('company_id', company.id).gte('work_date', from).lte('work_date', d),
      supabase
        .from('punches')
        .select('employee_id, kind, punched_at')
        .eq('company_id', company.id)
        .gte('punched_at', new Date(conakryInstant(from, '00:00') - 3 * 3600e3).toISOString()),
      supabase.from('employees').select('id, full_name, job_title').eq('company_id', company.id),
    ])
    const err = si.error ?? sh.error ?? ne.error ?? en.error ?? pu.error ?? em.error
    if (err) {
      toastRef.current.error(errorMessage(err))
      return
    }
    const shifts = Object.fromEntries(((sh.data ?? []) as ShiftType[]).map((s) => [s.id, s]))
    const sites = Object.fromEntries(((si.data ?? []) as Site[]).map((s) => [s.id, s]))
    const now = Date.now()
    const slots = computeLive({
      now,
      today: d,
      entries: (en.data ?? []) as ScheduleEntry[],
      shifts,
      needs: (ne.data ?? []) as SiteNeed[],
      punches: (pu.data ?? []) as { employee_id: string; kind: PunchKind; punched_at: string }[],
    }).filter((s) => sites[s.site_id])
    setData({
      sites,
      shifts,
      employees: Object.fromEntries(((em.data ?? []) as Employee[]).map((e) => [e.id, e])),
      slots,
      at: now,
    })
  }, [company.id])

  useEffect(() => {
    load()
    const t = setInterval(load, REFRESH_MS)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    const onChange = () => setFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  function toggleFull() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else box.current?.requestFullscreen?.().catch(() => {})
  }

  const bySite = useMemo(() => {
    if (!data) return []
    const groups = new Map<string, LiveSlot[]>()
    for (const s of data.slots) groups.set(s.site_id, [...(groups.get(s.site_id) ?? []), s])
    const score = (list: LiveSlot[]) => list.reduce((n, s) => n + s.empty * 10 + s.people.filter((p) => p.state === 'manquant').length, 0)
    return [...groups.entries()].map(([site, list]) => ({ site, list, score: score(list) })).sort((a, b) => b.score - a.score || (data.sites[a.site]?.name ?? '').localeCompare(data.sites[b.site]?.name ?? ''))
  }, [data])

  const totals = useMemo(() => {
    const t = { required: 0, present: 0, missing: 0, empty: 0 }
    for (const s of data?.slots ?? []) {
      t.required += s.required
      t.present += s.present
      t.missing += s.people.filter((p) => p.state === 'manquant').length
      t.empty += s.empty
    }
    return t
  }, [data])

  if (!data) return <PageLoader />

  return (
    <div ref={box} className={cx(full && 'min-h-screen overflow-auto bg-ink-50 p-6 text-[17px]')}>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className="relative flex size-3">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex size-3 rounded-full bg-emerald-500" />
        </span>
        <div>
          <h1 className={cx('font-semibold tracking-tight text-ink-900', full ? 'text-3xl' : 'text-[22px]')}>
            En direct · {timeAt(data.at)}
          </h1>
          <p className="text-sm text-ink-500">
            {company.name} · qui est présent sur chaque {v.site} maintenant. Mise à jour toutes les minutes.
          </p>
        </div>
        <Button className="ml-auto" variant="secondary" icon={full ? Minimize2 : Maximize2} onClick={toggleFull}>
          {full ? 'Quitter le plein écran' : 'Plein écran (télé)'}
        </Button>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard icon={UserCheck} label="Présents" value={`${totals.present}${totals.required ? ` / ${totals.required}` : ''}`} tone="green" sub={totals.required ? 'sur l’effectif requis' : undefined} />
        <StatCard icon={UserX} label="Pas encore pointés" value={totals.missing} tone={totals.missing ? 'red' : 'green'} sub="retard au-delà de 10 min" />
        <StatCard icon={AlertTriangle} label="Postes vides" value={totals.empty} tone={totals.empty ? 'red' : 'green'} sub="absence non remplacée ou départ" />
        <StatCard icon={Users} label={`${v.Sites} en activité`} value={bySite.length} />
      </div>

      {bySite.length === 0 ? (
        <Card>
          <EmptyState icon={Radio} title={`${v.AucunShift} en cours`} text={`Rien n’est prévu à cette heure-ci. L’écran se remplit dès qu’${v.unShift} commence.`} />
        </Card>
      ) : (
        <div className={cx('grid gap-4', full ? 'lg:grid-cols-3' : 'lg:grid-cols-2')}>
          {bySite.map(({ site, list }) => (
            <Card key={site} className="p-5">
              <h2 className={cx('font-semibold text-ink-900', full ? 'text-xl' : 'text-base')}>{data.sites[site]?.name}</h2>
              {data.sites[site]?.zone && <p className="text-xs text-ink-500">{data.sites[site]?.zone}</p>}
              <div className="mt-4 space-y-5">
                {list.map((s) => {
                  const sh = data.shifts[s.shift_type_id]
                  const pct = s.required ? Math.min(100, Math.round((s.present / s.required) * 100)) : 100
                  return (
                    <div key={s.key}>
                      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                        <span className="font-medium text-ink-800">
                          {sh?.label} · {sh?.start_time.slice(0, 5)}–{sh?.end_time.slice(0, 5)}
                        </span>
                        <span className={cx('tabular font-semibold', s.empty || s.people.some((p) => p.state === 'manquant') ? 'text-red-600' : 'text-emerald-700')}>
                          {s.present}{s.required ? ` / ${s.required}` : ''} présent{s.present > 1 ? 's' : ''}
                        </span>
                      </div>
                      {s.required > 0 && (
                        <div className="mb-2.5 h-2 overflow-hidden rounded-full bg-ink-100">
                          <div className={cx('h-full rounded-full', pct >= 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-400' : 'bg-red-500')} style={{ width: `${pct}%` }} />
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {s.people.map((p) => {
                          const emp = data.employees[p.employee_id]
                          const extra =
                            p.state === 'present' ? `arrivé ${timeAt(p.arrivedAt!)}` :
                            p.state === 'pause' ? `en pause depuis ${timeAt(p.breakSince!)}` :
                            p.state === 'parti' ? `parti ${timeAt(p.leftAt!)}` :
                            p.state === 'attendu' ? 'attendu' :
                            p.state === 'manquant' ? 'pas pointé' : 'absent'
                          return (
                            <span key={p.entry_id} title={emp?.job_title ?? ''} className={cx('inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium ring-1 ring-inset', STATE_STYLE[p.state], full && 'text-sm')}>
                              {emp?.full_name ?? v.Worker}
                              <span className="font-normal opacity-75">· {extra}</span>
                              {p.replaces && <span className="font-normal opacity-75">(remplaçant)</span>}
                            </span>
                          )
                        })}
                        {Array.from({ length: s.empty }, (_, i) => (
                          <span key={'vide' + i} className={cx('inline-flex items-center rounded-lg border border-dashed border-red-300 px-2 py-1 text-xs font-medium text-red-600', full && 'text-sm')}>
                            Poste vide
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
