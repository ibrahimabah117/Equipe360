import { useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { errorMessage, supabase } from '../../lib/supabase'
import { addDays, parseIso, today, weekStart } from '../../lib/dates'
import { Avatar, Button, Callout, cx, Field, Input, Modal, Select, Toggle, useToast } from '../../ui'
import type { PlanningData } from './Modals'
import { shiftTone, toneClasses } from './common'

interface Preset {
  id: string
  label: string
  hint: string
  kind: 'cycle' | 'weekly'
  seq: string[] // codes de garde, '-' = repos
}

const PRESETS: Preset[] = [
  { id: 'jjnnrr', label: '2 jours · 2 nuits · 2 repos', hint: 'Cycle de 6 jours, très courant en gardiennage', kind: 'cycle', seq: ['J', 'J', 'N', 'N', '-', '-'] },
  { id: 'jnrr', label: '1 jour · 1 nuit · 2 repos', hint: 'Cycle de 4 jours', kind: 'cycle', seq: ['J', 'N', '-', '-'] },
  { id: 'j6', label: 'Jour, repos le dimanche', hint: 'Du lundi au samedi', kind: 'weekly', seq: ['J', 'J', 'J', 'J', 'J', 'J', '-'] },
  { id: 'n6', label: 'Nuit, repos le dimanche', hint: 'Du lundi au samedi', kind: 'weekly', seq: ['N', 'N', 'N', 'N', 'N', 'N', '-'] },
  { id: 'j7', label: 'Jour tous les jours', hint: '7 jours sur 7', kind: 'cycle', seq: ['J'] },
  { id: 'n7', label: 'Nuit tous les jours', hint: '7 jours sur 7', kind: 'cycle', seq: ['N'] },
  { id: 'custom', label: 'Personnalisé', hint: 'Votre propre cycle', kind: 'cycle', seq: [] },
]

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
  const [presetId, setPresetId] = useState(data.shifts.some((s) => s.code === 'J') && data.shifts.some((s) => s.code === 'N') ? 'jjnnrr' : 'custom')
  const [custom, setCustom] = useState(data.shifts.map((s) => s.code).concat('-').join(' '))
  const [from, setFrom] = useState(defaultStart)
  const [to, setTo] = useState(addDays(defaultStart, 6))
  const [siteFilter, setSiteFilter] = useState(defaultSite)
  const [targetSite, setTargetSite] = useState('') // '' = site habituel de chaque agent
  const [spread, setSpread] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [loading, setLoading] = useState(false)

  const preset = PRESETS.find((p) => p.id === presetId)!
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
      toast.success(`Planning généré : ${rows.length} garde${rows.length > 1 ? 's' : ''}`)
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
      description="Appliquez un rythme de travail à plusieurs agents en une fois. Les gardes déjà saisies sont conservées."
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
            {PRESETS.map((p) => (
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
              <Callout tone="danger">Code inconnu : {unknown.join(', ')}. Créez ce type de garde dans Paramètres.</Callout>
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
            <Field label="Lieu des gardes" className="flex-1">
              <Select value={targetSite} onChange={(e) => setTargetSite(e.target.value)}>
                <option value="">Site habituel de chaque agent</option>
                {data.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
          </div>
          <div className="max-h-52 overflow-y-auto rounded-xl ring-1 ring-ink-100">
            {pool.length === 0 ? (
              <p className="p-4 text-sm text-ink-500">Aucun agent actif sur ce site.</p>
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
              <Toggle checked={spread} onChange={setSpread} label="Décaler les agents dans le cycle pour couvrir jour et nuit" />
            </div>
          )}
        </section>

        {missingSite.length > 0 && (
          <Callout tone="warning">
            {missingSite.length} agent{missingSite.length > 1 ? 's' : ''} sans site habituel {missingSite.length > 1 ? 'seront ignorés' : 'sera ignoré'}. Choisissez un lieu des gardes ou affectez-les à un site.
          </Callout>
        )}
        {rows.length > 0 && (
          <Callout tone="info">
            {rows.length} garde{rows.length > 1 ? 's' : ''} pour {chosen.length - missingSite.length} agent{chosen.length - missingSite.length > 1 ? 's' : ''}
            {existing > 0 && ` — dont ${existing} déjà au planning (conservée${existing > 1 ? 's' : ''})`}. Les gardes existantes ne sont jamais écrasées.
          </Callout>
        )}
      </div>
    </Modal>
  )
}
