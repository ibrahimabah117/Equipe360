import { useVocab } from '../../lib/sector'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Clock3, MapPin, ShieldCheck } from 'lucide-react'
import { addDays, conakryInstant, dayLong, dayNum, dayShort, today } from '../../lib/dates'
import { supabase } from '../../lib/supabase'
import { computeCoverage, coverageRate, type CoverageDay } from '../../lib/coverage'
import { Card, cx } from '../../ui'

const DAYS = 14
const PAGE = 1000

/** Supabase renvoie au plus 1000 lignes par requête : on lit page par page. */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) return out
  }
}

interface Names {
  sites: Record<string, string>
  employees: Record<string, string>
  shifts: Record<string, string>
}

export default function CoverageChart({ companyId, base }: { companyId: string; base: string }) {
  const v = useVocab()
  const [days, setDays] = useState<CoverageDay[] | null>(null)
  const [names, setNames] = useState<Names>({ sites: {}, employees: {}, shifts: {} })
  const [failed, setFailed] = useState(false)
  const [selected, setSelected] = useState<string>(today())

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const to = today()
        const from = addDays(to, -(DAYS - 1))
        const since = new Date(conakryInstant(from, '00:00') - 3 * 3600e3).toISOString()
        const [entries, punches, needs, shifts, sites, employees] = await Promise.all([
          fetchAll((a, b) =>
            supabase.from('schedule_entries').select('employee_id, site_id, work_date, shift_type_id, status')
              .eq('company_id', companyId).gte('work_date', from).lte('work_date', to).order('id').range(a, b),
          ),
          fetchAll((a, b) =>
            supabase.from('punches').select('employee_id, site_id, punched_at')
              .eq('company_id', companyId).eq('kind', 'in').gte('punched_at', since).order('id').range(a, b),
          ),
          supabase.from('site_shift_needs').select('site_id, shift_type_id, headcount').eq('company_id', companyId),
          supabase.from('shift_types').select('id, label, start_time, end_time').eq('company_id', companyId),
          supabase.from('sites').select('id, name, active').eq('company_id', companyId),
          fetchAll((a, b) => supabase.from('employees').select('id, full_name').eq('company_id', companyId).order('id').range(a, b)),
        ])
        if (needs.error || shifts.error || sites.error) throw needs.error ?? shifts.error ?? sites.error
        const activeSites = new Set((sites.data ?? []).filter((s) => s.active).map((s) => s.id))
        const result = computeCoverage({
          from,
          days: DAYS,
          entries,
          // Un site désactivé n'a plus de postes à tenir
          needs: (needs.data ?? []).filter((n) => activeSites.has(n.site_id)),
          shifts: Object.fromEntries((shifts.data ?? []).map((s) => [s.id, s])),
          punches,
        })
        if (!alive) return
        setNames({
          sites: Object.fromEntries((sites.data ?? []).map((s) => [s.id, s.name])),
          employees: Object.fromEntries(employees.map((e) => [e.id, e.full_name])),
          shifts: Object.fromEntries((shifts.data ?? []).map((s) => [s.id, s.label])),
        })
        setDays(result)
      } catch {
        if (alive) setFailed(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [companyId])

  const rate = useMemo(() => (days ? coverageRate(days) : null), [days])
  const max = useMemo(() => Math.max(1, ...(days ?? []).map((d) => d.required)), [days])
  const day = days?.find((d) => d.date === selected)
  const totals = useMemo(
    () => (days ?? []).reduce((a, d) => ({ unpunched: a.unpunched + d.unpunched, empty: a.empty + d.empty }), { unpunched: 0, empty: 0 }),
    [days],
  )

  return (
    <Card className="mb-8">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-100 px-5 py-4">
        <div>
          <h2 className="font-semibold">Couverture des postes</h2>
          <p className="text-sm text-ink-500">{DAYS} derniers jours · touchez un jour pour le détail</p>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right">
            <p className={cx('tabular text-[26px] leading-none font-semibold tracking-tight', rateTone(rate))}>
              {rate == null ? '—' : `${String(rate).replace('.', ',')} %`}
            </p>
            <p className="mt-1 text-xs text-ink-500">postes tenus</p>
          </div>
          <div className="hidden text-right text-xs text-ink-500 sm:block">
            <p><span className="tabular font-semibold text-red-600">{totals.empty}</span> postes vides</p>
            <p><span className="tabular font-semibold text-amber-600">{totals.unpunched}</span> non pointés</p>
          </div>
        </div>
      </div>

      {failed ? (
        <p className="px-5 py-8 text-center text-sm text-ink-500">Impossible de charger le graphique. Vérifiez la connexion puis rouvrez la page.</p>
      ) : !days ? (
        <div className="h-56 animate-pulse bg-ink-50/60" />
      ) : days.every((d) => d.required === 0) ? (
        <p className="px-5 py-8 text-center text-sm text-ink-500">
          Pas encore de {v.shifts} passé{v.sx(2)}. Le graphique se remplira dès que le{' '}
          <Link to={`${base}/planning`} className="font-medium text-brand-600">planning</Link> aura commencé.
        </p>
      ) : (
        <>
          <div className="px-3 pt-5 sm:px-5">
            <div className="flex h-44 items-end gap-1 sm:gap-2" role="list" aria-label="Postes par jour">
              {days.map((d) => {
                const sel = d.date === selected
                const pct = (n: number) => `${(n / max) * 100}%`
                return (
                  <button
                    key={d.date}
                    type="button"
                    role="listitem"
                    onClick={() => setSelected(d.date)}
                    title={`${dayLong(d.date)} : ${d.punched} tenus, ${d.unpunched} non pointés, ${d.empty} vides sur ${d.required}`}
                    className={cx(
                      'group flex h-full min-w-0 flex-1 flex-col justify-end rounded-md px-0.5 pt-1 outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
                      sel && 'bg-brand-50',
                    )}
                  >
                    {d.empty > 0 && <span className="mb-0.5 text-center text-[10px] leading-none font-semibold text-red-600">{d.empty}</span>}
                    <span className="flex w-full flex-col-reverse overflow-hidden rounded-t-[4px] opacity-90 group-hover:opacity-100" style={{ height: pct(d.required) }}>
                      {d.punched > 0 && <span className="w-full shrink-0 bg-emerald-500" style={{ height: share(d.punched, d.required) }} />}
                      {d.unpunched > 0 && <span className="w-full shrink-0 border-b border-white/80 bg-amber-400" style={{ height: share(d.unpunched, d.required) }} />}
                      {d.empty > 0 && <span className="w-full shrink-0 border-b border-white/80 bg-red-500" style={{ height: share(d.empty, d.required) }} />}
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="mt-1 flex gap-1 border-t border-ink-100 pt-1.5 sm:gap-2">
              {days.map((d) => (
                <span key={d.date} className={cx('min-w-0 flex-1 text-center text-[10px] leading-tight', d.date === selected ? 'font-semibold text-brand-700' : 'text-ink-500')}>
                  <span className="hidden capitalize sm:block">{dayShort(d.date)}</span>
                  {dayNum(d.date)}
                </span>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-600">
              <Legend className="bg-emerald-500" label={`${v.Worker} présent (pointé)`} />
              <Legend className="bg-amber-400" label="Prévu mais pas pointé" />
              <Legend className="bg-red-500" label="Poste vide" />
            </div>
          </div>

          {day && <DayDetail day={day} names={names} base={base} />}
        </>
      )}
    </Card>
  )
}

const share = (n: number, total: number) => `${(n / Math.max(1, total)) * 100}%`

function rateTone(rate: number | null) {
  if (rate == null) return 'text-ink-400'
  if (rate >= 95) return 'text-emerald-600'
  if (rate >= 85) return 'text-amber-600'
  return 'text-red-600'
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cx('size-2.5 rounded-sm', className)} />
      {label}
    </span>
  )
}

function DayDetail({ day, names, base }: { day: CoverageDay; names: Names; base: string }) {
  const v = useVocab()
  const site = (id: string) => names.sites[id] ?? 'Site supprimé'
  const shift = (id: string) => names.shifts[id] ?? v.Shift
  const sorted = [...day.issues].sort((a, b) => (a.kind === b.kind ? site(a.site_id).localeCompare(site(b.site_id)) : a.kind === 'vide' ? -1 : 1))

  return (
    <div className="mt-4 border-t border-ink-100">
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <p className="text-sm font-semibold first-letter:uppercase">{dayLong(day.date)}</p>
        <p className="tabular text-xs text-ink-500">{day.punched} / {day.required} postes tenus</p>
      </div>
      {day.required === 0 ? (
        <p className="px-5 pb-5 text-sm text-ink-500">{v.AucunShift} commencé{v.sx()} ce jour-là.</p>
      ) : sorted.length === 0 ? (
        <p className="flex items-center gap-2 px-5 pb-5 text-sm text-emerald-700">
          <ShieldCheck className="size-4" /> Tous les postes ont été tenus.
        </p>
      ) : (
        <ul className="divide-y divide-ink-100 pb-1 text-sm">
          {sorted.map((it, i) => (
            <li key={i} className="flex items-center gap-3 px-5 py-2.5">
              {it.kind === 'vide' ? (
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600"><AlertTriangle className="size-3.5" /></span>
              ) : (
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600"><Clock3 className="size-3.5" /></span>
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 truncate text-[15px] font-semibold text-ink-900">
                  <MapPin className="size-4 shrink-0 text-brand-500" />
                  {site(it.site_id)}
                </span>
                <span className="block truncate text-sm text-ink-600">
                  {it.kind === 'vide' ? `${it.count} poste${it.count > 1 ? 's' : ''} vide${it.count > 1 ? 's' : ''}` : names.employees[it.employee_id!] ?? v.Worker}
                  {' · '}{shift(it.shift_type_id)}
                  {it.kind === 'non_pointe' && ' · pas pointé'}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {sorted.length > 0 && (
        <div className="flex gap-4 px-5 pt-1 pb-4 text-sm">
          <Link to={`${base}/planning`} className="font-medium text-brand-600 hover:text-brand-700">Voir le planning</Link>
          <Link to={`${base}/pointages`} className="font-medium text-brand-600 hover:text-brand-700">Voir les pointages</Link>
        </div>
      )}
    </div>
  )
}
