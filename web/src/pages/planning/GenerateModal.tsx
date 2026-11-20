import { useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { errorMessage, supabase } from '../../lib/supabase'
import { addDays, parseIso, today, weekStart } from '../../lib/dates'
import { Avatar, Button, Callout, cx, Field, Input, Modal, Select, Toggle, useToast } from '../../ui'
import { useCompany } from '../../lib/company'
import { useVocab } from '../../lib/sector'
import type { PlanningData } from './Modals'
import { shiftTone, toneClasses } from './common'

interface Preset {
  id: string
  label: string
  hint: string
  kind: 'cycle' | 'weekly'
  seq: string[] // codes d'horaire, '-' = repos
  /** secteurs pour lesquels ce rythme est proposé en premier */
  sectors?: string[]
}

const rep = (code: string, n: number) => Array<string>(n).fill(code)

/** Rythmes types. Ceux dont les horaires n'existent pas chez le client sont masqués. */
const FIXED_PRESETS: Preset[] = [
  { id: 'jjnnrr', label: '2 jours · 2 nuits · 2 repos', hint: 'Cycle de 6 jours, très courant en gardiennage', kind: 'cycle', seq: ['J', 'J', 'N', 'N', '-', '-'], sectors: ['gardiennage', 'sante'] },
  { id: 'jnrr', label: '1 jour · 1 nuit · 2 repos', hint: 'Cycle de 4 jours', kind: 'cycle', seq: ['J', 'N', '-', '-'] },
  { id: 'rot14', label: '14 jours · 7 repos', hint: 'Rotation minière : 2 semaines sur site, 1 semaine de repos', kind: 'cycle', seq: [...rep('J', 14), ...rep('-', 7)], sectors: ['mines'] },
  { id: 'rot777', label: '7 jours · 7 nuits · 7 repos', hint: 'Rotation minière jour/nuit sur 3 semaines', kind: 'cycle', seq: [...rep('J', 7), ...rep('N', 7), ...rep('-', 7)], sectors: ['mines'] },
  { id: 'rot21', label: '21 jours · 7 repos', hint: 'Rotation longue (sites éloignés)', kind: 'cycle', seq: [...rep('J', 21), ...rep('-', 7)] },
  { id: '3x8', label: '3×8 tournant', hint: 'Une semaine matin, une semaine soir, une semaine nuit', kind: 'cycle', seq: [...rep('M', 6), '-', ...rep('S', 6), '-', ...rep('N', 6), '-'], sectors: ['usine', 'hotellerie'] },
]

function buildPresets(shifts: { code: string; label: string }[]): Preset[] {
  const codes = new Set(shifts.map((s) => s.code.toUpperCase()))
  const ok = (p: Preset) => p.seq.every((c) => c === '-' || codes.has(c))
  const weekly: Preset[] = shifts.flatMap((s) => [
    { id: 'w6-' + s.code, label: `${s.label}, repos le dimanche`, hint: 'Du lundi au samedi', kind: 'weekly' as const, seq: [...rep(s.code.toUpperCase(), 6), '-'] },
    { id: 'w5-' + s.code, label: `${s.label}, du lundi au vendredi`, hint: 'Repos samedi et dimanche', kind: 'weekly' as const, seq: [...rep(s.code.toUpperCase(), 5), '-', '-'] },
  ])
  const daily: Preset[] = shifts.map((s) => ({ id: 'd7-' + s.code, label: `${s.label} tous les jours`, hint: '7 jours sur 7', kind: 'cycle' as const, seq: [s.code.toUpperCase()] }))
  return [
    ...FIXED_PRESETS.filter(ok),
    ...weekly,
    ...daily,
    { id: 'custom', label: 'Personnalisé', hint: 'Votre propre cycle', kind: 'cycle', seq: [] },
  ]
}

export default function GenerateModal({
  data,
  defaultStart,
  defaultSite,
  onClose,
  onDone,
}: {
  data: PlanningData
  defaultStart: string
  defaultSite: string
  onClose: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const { company } = useCompany()
  const v = useVocab()
  const presets = useMemo(() => buildPresets(data.shifts), [data.shifts])
  const [presetId, setPresetId] = useState(
    () => (presets.find((p) => p.sectors?.includes(company.sector)) ?? presets[0]).id,
  )
  const [custom, setCustom] = useState(data.shifts.map((s) => s.code).concat('-').join(' '))
  const [from, setFrom] = useState(defaultStart)
  const [to, setTo] = useState(addDays(defaultStart, 6))
  const [siteFilter, setSiteFilter] = useState(defaultSite)
  const [targetSite, setTargetSite] = useState('') // '' = site habituel de chaque agent
  const [spread, setSpread] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [loading, setLoading] = useState(false)

  const preset = presets.find((p) => p.id === presetId) ?? presets[presets.length - 1]
  const seq = preset.id === 'custom' ? custom.trim().toUpperCase().split(/[\s,;]+/).filter(Boolean) : preset.seq
  const shiftByCode = useMemo(() => Object.fromEntries(data.shifts.map((s) => [s.code.toUpperCase(), s])), [data.shifts])
  const unknown = seq.filter((c) => c !== '-' && c !== 'R' && !shiftByCode[c])

  const pool = data.employees.filter((e) => e.active && (!siteFilter || e.default_site_id === siteFilter))
  const chosen = pool.filter((e) => selected.size === 0 || selected.has(e.id))
  const missingSite = !targetSite ? chosen.filter((e) => !e.default_site_id) : []

  const days = useMemo(() => {
    const out: string[] = []
    if (!from || !to || from > to) return out
    let d = from
    while (d <= to && out.length < 62) {
      out.push(d)
      d = addDays(d, 1)
    }
    return out
  }, [from, to])

  const rows = useMemo(() => {
    if (!seq.length || unknown.length) return []
    const L = seq.length
    const people = chosen.filter((e) => targetSite || e.default_site_id)
    const step = spread && preset.kind === 'cycle' && L > 1 ? Math.max(1, Math.floor(L / Math.min(people.length || 1, L))) : 0
    const out: { company_id: string; employee_id: string; site_id: string; work_date: string; shift_type_id: string; status: 'planned' }[] = []
    people.forEach((emp, i) => {
      const offset = (i * step) % L
      days.forEach((d, k) => {
        const code = preset.kind === 'weekly' ? seq[(parseIso(d).getDay() + 6) % 7] : seq[(k + offset) % L]
        if (!code || code === '-' || code === 'R') return
        out.push({
          company_id: data.companyId,
          employee_id: emp.id,
          site_id: targetSite || emp.default_site_id!,
          work_date: d,
          shift_type_id: shiftByCode[code].id,
          status: 'planned',
        })
      })
    })
    return out
  }, [seq, unknown.length, chosen, targetSite, spread, preset.kind, days, data.companyId, shiftByCode])

  const existing = useMemo(() => {
    const keys = new Set(data.entries.map((e) => `${e.employee_id}|${e.work_date}|${e.shift_type_id}`))
    return rows.filter((r) => keys.has(`${r.employee_id}|${r.work_date}|${r.shift_type_id}`)).length
  }, [rows, data.entries])

  async function run() {
    setLoading(true)
    try {
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabase
          .from('schedule_entries')
          .upsert(rows.slice(i, i + 500), { onConflict: 'employee_id,work_date,shift_type_id', ignoreDuplicates: true })
        if (error) throw error
      }
      toast.success(`Planning généré : ${v.nShifts(rows.length)}`)
      onDone()
      onClose()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  function toggle(id: string) {
    const next = new Set(selected.size ? selected : pool.map((e) => e.id))
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next.size === pool.length ? new Set() : next)
  }

  const thisWeek = weekStart(today())

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Générer le planning"
      description={`Appliquez un rythme de travail à plusieurs ${v.workers} en une fois. Les ${v.shifts} déjà saisi${v.sx(2)} sont conservé${v.sx(2)}.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button icon={Sparkles} onClick={run} loading={loading} disabled={!rows.length}>
            Générer le planning
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <section>
          <p className="mb-2 text-[13px] font-medium text-ink-700">Rythme de travail</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPresetId(p.id)}
                className={cx(
                  'flex items-center gap-3 rounded-xl p-3 text-left ring-1 transition-all',
                  presetId === p.id ? 'bg-brand-50 ring-2 ring-brand-500' : 'ring-ink-200 hover:ring-ink-300',
                )}
              >
                <span className="flex gap-0.5">
                  {(p.id === 'custom' ? ['?'] : p.seq.slice(0, 7)).map((c, i) => {
                    const s = shiftByCode[c]
                    return (
                      <span
                        key={i}
                        className={cx(
                          'inline-flex size-5 items-center justify-center rounded text-[9px] font-bold ring-1 ring-inset',
                          s ? toneClasses[shiftTone(s)] : 'bg-ink-50 text-ink-400 ring-ink-200',
                        )}
                      >
                        {c === '-' ? '·' : c}
                      </span>
                    )
                  })}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{p.label}</span>
                  <span className="block text-[11px] text-ink-500">{p.hint}</span>
                </span>
              </button>
            ))}
          </div>
          {presetId === 'custom' && (
            <Field
              className="mt-3"
              label="Cycle"
              hint={`Codes séparés par des espaces, « - » pour un repos. Codes disponibles : ${data.shifts.map((s) => `${s.code} (${s.label})`).join(', ')}`}
            >
              <Input value={custom} onChange={(e) => setCustom(e.target.value)} className="font-mono" placeholder="J J N N - -" />
            </Field>
          )}
          {unknown.length > 0 && (
            <div className="mt-3">
              <Callout tone="danger">Code inconnu : {unknown.join(', ')}. Créez cet horaire dans Paramètres.</Callout>
            </div>
          )}
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="Du">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Au" hint={days.length >= 62 ? 'Limité à 62 jours par génération' : `${days.length} jour${days.length > 1 ? 's' : ''}`}>
            <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            {[
              ['Cette semaine', thisWeek, addDays(thisWeek, 6)],
              ['Semaine prochaine', addDays(thisWeek, 7), addDays(thisWeek, 13)],
              ['4 semaines', defaultStart, addDays(defaultStart, 27)],
            ].map(([l, a, b]) => (
              <Button key={l} size="sm" variant="secondary" onClick={() => { setFrom(a); setTo(b) }}>{l}</Button>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-end">
            <Field label="Agents du site" className="flex-1">
              <Select value={siteFilter} onChange={(e) => { setSiteFilter(e.target.value); setSelected(new Set()) }}>
                <option value="">Tous les sites</option>
                {data.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Lieu de travail" className="flex-1">
              <Select value={targetSite} onChange={(e) => setTargetSite(e.target.value)}>
                <option value="">{v.Site} habituel de chaque {v.worker}</option>
                {data.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
          </div>
          <div className="max-h-52 overflow-y-auto rounded-xl ring-1 ring-ink-100">
            {pool.length === 0 ? (
              <p className="p-4 text-sm text-ink-500">Aucun {v.worker} actif sur {v.ceSite}.</p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {pool.map((e) => {
                  const on = selected.size === 0 || selected.has(e.id)
                  return (
                    <li key={e.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-ink-50">
                        <input type="checkbox" checked={on} onChange={() => toggle(e.id)} className="size-4 rounded accent-brand-500" />
                        <Avatar name={e.full_name} size="sm" />
                        <span className="flex-1 text-sm">{e.full_name}</span>
                        {!e.default_site_id && !targetSite && <span className="text-xs text-amber-700">sans site</span>}
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          {preset.kind === 'cycle' && seq.length > 1 && (
            <div className="mt-3">
              <Toggle checked={spread} onChange={setSpread} label={`Décaler les ${v.workers} dans le cycle pour couvrir tous les horaires`} />
            </div>
          )}
        </section>

        {missingSite.length > 0 && (
          <Callout tone="warning">
            {v.nWorkers(missingSite.length)} sans {v.site} habituel {missingSite.length > 1 ? 'seront ignorés' : 'sera ignoré'}. Choisissez un lieu de travail ou affectez-les à {v.unSite}.
          </Callout>
        )}
        {rows.length > 0 && (
          <Callout tone="info">
            {v.nShifts(rows.length)} pour {v.nWorkers(chosen.length - missingSite.length)}
            {existing > 0 && ` — dont ${existing} déjà au planning (conservé${v.sx(existing)})`}. Les {v.shifts} existant{v.sx(2)} ne sont jamais écrasé{v.sx(2)}.
          </Callout>
        )}
      </div>
    </Modal>
  )
}
