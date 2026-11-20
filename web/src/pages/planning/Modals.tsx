import { useVocab } from '../../lib/sector'
import { useMemo, useState, type FormEvent } from 'react'
import { ArrowRightLeft, Plus, Trash2, UserCheck, UserX, Users } from 'lucide-react'
import {
  errorMessage,
  supabase,
  type AbsenceKind,
  type Employee,
  type ScheduleEntry,
  type ShiftType,
  type Site,
  type SiteNeed,
} from '../../lib/supabase'
import { dayLong } from '../../lib/dates'
import { Avatar, Badge, Button, Callout, cx, Field, Input, Modal, Select, useToast } from '../../ui'
import { ABSENCE_LABELS, hhmm, ShiftIcon, shiftTone, toneClasses } from './common'

export interface PlanningData {
  companyId: string
  employees: Employee[]
  sites: Site[]
  shifts: ShiftType[]
  entries: ScheduleEntry[]
  needs: SiteNeed[]
}

const byId = <T extends { id: string }>(list: T[]) => Object.fromEntries(list.map((x) => [x.id, x])) as Record<string, T>

/* ------------------------------------------------------------------ Remplaçant */

function ReplacementPicker({
  data,
  entry,
  onDone,
  onCancel,
}: {
  data: PlanningData
  entry: ScheduleEntry
  onDone: () => void
  onCancel: () => void
}) {
  const v = useVocab()
  const toast = useToast()
  const [pick, setPick] = useState('')
  const [loading, setLoading] = useState(false)
  const shiftById = byId(data.shifts)

  const candidates = useMemo(() => {
    const sameDay = data.entries.filter((e) => e.work_date === entry.work_date)
    return data.employees
      .filter((e) => e.active && e.id !== entry.employee_id)
      .filter((e) => !sameDay.some((x) => x.employee_id === e.id && x.shift_type_id === entry.shift_type_id))
      .map((e) => {
        const other = sameDay.filter((x) => x.employee_id === e.id && x.status !== 'absent')
        return { e, other: other.map((x) => shiftById[x.shift_type_id]?.code).filter(Boolean).join(', '), sameSite: e.default_site_id === entry.site_id }
      })
      .sort((a, b) => Number(!!a.other) - Number(!!b.other) || Number(b.sameSite) - Number(a.sameSite) || a.e.full_name.localeCompare(b.e.full_name))
  }, [data, entry, shiftById])

  async function save() {
    if (!pick) return
    setLoading(true)
    const { error } = await supabase.from('schedule_entries').insert({
      company_id: data.companyId,
      employee_id: pick,
      site_id: entry.site_id,
      work_date: entry.work_date,
      shift_type_id: entry.shift_type_id,
      status: 'replacement',
      replaces_employee_id: entry.employee_id,
    })
    setLoading(false)
    if (error) return toast.error(errorMessage(error))
    toast.success('Remplaçant ajouté')
    onDone()
  }

  return (
    <div className="mt-3 rounded-xl bg-emerald-50/60 p-3 ring-1 ring-emerald-100">
      <p className="mb-2 text-[13px] font-medium text-emerald-900">Choisir un remplaçant</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">{v.Workers} disponibles…</option>
          {candidates.map(({ e, other, sameSite }) => (
            <option key={e.id} value={e.id}>
              {e.full_name}
              {sameSite ? ` · même ${v.site}` : ''}
              {other ? ` · déjà en ${other} ce jour` : ''}
            </option>
          ))}
        </Select>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel}>Plus tard</Button>
          <Button onClick={save} loading={loading} disabled={!pick} icon={UserCheck}>Valider</Button>
        </div>
      </div>
      {candidates.length === 0 && <p className="mt-2 text-xs text-ink-500">Aucun {v.worker} libre sur {v.ceShift}.</p>}
    </div>
  )
}

/* ------------------------------------------------------------------ Ligne d'une garde */

function EntryRow({
  data,
  entry,
  showEmployee,
  showSite,
  onChanged,
}: {
  data: PlanningData
  entry: ScheduleEntry
  showEmployee?: boolean
  showSite?: boolean
  onChanged: () => void
}) {
  const v = useVocab()
  const toast = useToast()
  const emp = byId(data.employees)
  const site = byId(data.sites)
  const shift = byId(data.shifts)[entry.shift_type_id]
  const [mode, setMode] = useState<'idle' | 'absent' | 'replace'>('idle')
  const [kind, setKind] = useState<AbsenceKind>('maladie')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const replacement = data.entries.find(
    (e) =>
      e.status === 'replacement' &&
      e.replaces_employee_id === entry.employee_id &&
      e.work_date === entry.work_date &&
      e.shift_type_id === entry.shift_type_id &&
      e.site_id === entry.site_id,
  )

  async function update(patch: Partial<ScheduleEntry>, msg: string) {
    setBusy(true)
    const { error } = await supabase.from('schedule_entries').update(patch).eq('id', entry.id)
    setBusy(false)
    if (error) return toast.error(errorMessage(error))
    toast.success(msg)
    onChanged()
  }

  async function markAbsent(e: FormEvent) {
    e.preventDefault()
    await update({ status: 'absent', absence_kind: kind, note: note.trim() || null }, 'Absence enregistrée')
    setMode('replace')
  }

  async function remove() {
    setBusy(true)
    const { error } = await supabase.from('schedule_entries').delete().eq('id', entry.id)
    setBusy(false)
    if (error) return toast.error(errorMessage(error))
    toast.success(`${v.Shift} retiré${v.sx()}`)
    onChanged()
  }

  if (!shift) return null
  const tone = shiftTone(shift)
  const person = emp[entry.employee_id]

  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        {showEmployee ? (
          <Avatar name={person?.full_name} />
        ) : (
          <span className={cx('flex size-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset', toneClasses[tone])}>
            <ShiftIcon tone={tone} className="size-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink-900">
            {showEmployee ? person?.full_name ?? 'Employé supprimé' : `${shift.label} · ${hhmm(shift.start_time)}–${hhmm(shift.end_time)}`}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-500">
            {showSite && <span>{site[entry.site_id]?.name ?? 'Site supprimé'}</span>}
            {entry.status === 'planned' && <Badge tone="green" dot>Prévu</Badge>}
            {entry.status === 'absent' && (
              <Badge tone="red" dot>{entry.absence_kind ? ABSENCE_LABELS[entry.absence_kind] : 'Absent'}</Badge>
            )}
            {entry.status === 'replacement' && (
              <Badge tone="brand">Remplace {emp[entry.replaces_employee_id ?? '']?.full_name ?? '—'}</Badge>
            )}
            {entry.status === 'absent' && replacement && (
              <Badge tone="green">Remplacé par {emp[replacement.employee_id]?.full_name}</Badge>
            )}
            {entry.note && <span className="italic">« {entry.note} »</span>}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          {entry.status !== 'absent' && entry.status !== 'replacement' && mode === 'idle' && (
            <Button size="sm" variant="secondary" icon={UserX} onClick={() => setMode('absent')}>Absent</Button>
          )}
          {entry.status === 'absent' && !replacement && mode !== 'replace' && (
            <Button size="sm" variant="secondary" icon={ArrowRightLeft} onClick={() => setMode('replace')}>Remplacer</Button>
          )}
          {entry.status === 'absent' && (
            <Button size="sm" variant="ghost" loading={busy} onClick={() => update({ status: 'planned', absence_kind: null, note: null }, 'Absence annulée')}>
              Annuler l’absence
            </Button>
          )}
          {entry.status !== 'absent' && (
            <button
              onClick={remove}
              disabled={busy}
              title={`Retirer ${v.laShift}`}
              className="inline-flex size-8 items-center justify-center rounded-lg text-ink-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      </div>

      {mode === 'absent' && (
        <form onSubmit={markAbsent} className="mt-3 grid gap-2 rounded-xl bg-red-50/60 p-3 ring-1 ring-red-100 sm:grid-cols-[180px_1fr_auto]">
          <Select value={kind} onChange={(e) => setKind(e.target.value as AbsenceKind)}>
            {Object.entries(ABSENCE_LABELS).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </Select>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Motif (facultatif)" />
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setMode('idle')}>Annuler</Button>
            <Button type="submit" variant="danger" loading={busy}>Valider</Button>
          </div>
        </form>
      )}
      {mode === 'replace' && entry.status === 'absent' && !replacement && (
        <ReplacementPicker data={data} entry={entry} onCancel={() => setMode('idle')} onDone={() => { setMode('idle'); onChanged() }} />
      )}
    </li>
  )
}

/* ------------------------------------------------------------------ Journée d'un agent */

export function DayModal({
  data,
  employeeId,
  date,
  onClose,
  onChanged,
}: {
  data: PlanningData
  employeeId: string
  date: string
  onClose: () => void
  onChanged: () => void
}) {
  const v = useVocab()
  const toast = useToast()
  const emp = data.employees.find((e) => e.id === employeeId)
  const entries = data.entries.filter((e) => e.employee_id === employeeId && e.work_date === date)
  const usedShifts = new Set(entries.map((e) => e.shift_type_id))
  const free = data.shifts.filter((s) => !usedShifts.has(s.id))
  const [shiftId, setShiftId] = useState(free[0]?.id ?? '')
  const [siteId, setSiteId] = useState(emp?.default_site_id ?? data.sites[0]?.id ?? '')
  const [loading, setLoading] = useState(false)

  async function add() {
    if (!shiftId || !siteId) return
    setLoading(true)
    const { error } = await supabase.from('schedule_entries').insert({
      company_id: data.companyId,
      employee_id: employeeId,
      site_id: siteId,
      work_date: date,
      shift_type_id: shiftId,
      status: 'planned',
    })
    setLoading(false)
    if (error) return toast.error(error.code === '23505' ? `${v.ceShift.charAt(0).toUpperCase() + v.ceShift.slice(1)} existe déjà.` : errorMessage(error))
    toast.success(`${v.Shift} ajouté${v.sx()}`)
    onChanged()
  }

  return (
    <Modal open onClose={onClose} title={emp?.full_name ?? v.Worker} description={dayLong(date)} size="lg">
      {entries.length > 0 ? (
        <ul className="-my-3 divide-y divide-ink-100">
          {entries.map((e) => (
            <EntryRow key={e.id} data={data} entry={e} showSite onChanged={onChanged} />
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-ink-50 px-4 py-3 text-sm text-ink-500">Repos — {v.aucunShift} prévu{v.sx()} ce jour.</p>
      )}

      {free.length > 0 && (
        <div className="mt-5 border-t border-ink-100 pt-5">
          <p className="mb-3 text-sm font-medium text-ink-900">Ajouter {v.unShift}</p>
          {data.sites.length === 0 ? (
            <Callout tone="warning">Ajoutez d’abord {v.unSite}.</Callout>
          ) : (
            <div className="grid gap-2 sm:grid-cols-[210px_1fr_auto]">
              <Select value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
                {free.map((s) => (
                  <option key={s.id} value={s.id}>{s.label} ({hhmm(s.start_time)}–{hhmm(s.end_time)})</option>
                ))}
              </Select>
              <Select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                {data.sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}{s.id === emp?.default_site_id ? ' (habituel)' : ''}</option>
                ))}
              </Select>
              <Button icon={Plus} onClick={add} loading={loading}>Ajouter</Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

/* ------------------------------------------------------------------ Un poste (site × garde × jour) */

export function SlotModal({
  data,
  siteId,
  shiftId,
  date,
  onClose,
  onChanged,
}: {
  data: PlanningData
  siteId: string
  shiftId: string
  date: string
  onClose: () => void
  onChanged: () => void
}) {
  const v = useVocab()
  const toast = useToast()
  const site = data.sites.find((s) => s.id === siteId)
  const shift = data.shifts.find((s) => s.id === shiftId)
  const need = data.needs.find((n) => n.site_id === siteId && n.shift_type_id === shiftId)?.headcount ?? 0
  const entries = data.entries.filter((e) => e.site_id === siteId && e.shift_type_id === shiftId && e.work_date === date)
  const present = entries.filter((e) => e.status !== 'absent').length
  const [pick, setPick] = useState('')
  const [loading, setLoading] = useState(false)

  const candidates = useMemo(() => {
    const sameDay = data.entries.filter((e) => e.work_date === date)
    return data.employees
      .filter((e) => e.active && !sameDay.some((x) => x.employee_id === e.id && x.shift_type_id === shiftId))
      .sort((a, b) => Number(b.default_site_id === siteId) - Number(a.default_site_id === siteId) || a.full_name.localeCompare(b.full_name))
  }, [data, date, shiftId, siteId])

  async function add() {
    if (!pick) return
    setLoading(true)
    const { error } = await supabase.from('schedule_entries').insert({
      company_id: data.companyId,
      employee_id: pick,
      site_id: siteId,
      work_date: date,
      shift_type_id: shiftId,
      status: 'planned',
    })
    setLoading(false)
    if (error) return toast.error(errorMessage(error))
    setPick('')
    toast.success(`${v.Worker} ajouté`)
    onChanged()
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`${site?.name ?? v.Site} — ${shift?.label ?? ''}`}
      description={`${dayLong(date)} · ${shift ? `${hhmm(shift.start_time)}–${hhmm(shift.end_time)}` : ''}`}
    >
      <div className="mb-4 flex items-center gap-3 rounded-xl bg-ink-50 px-4 py-3 ring-1 ring-ink-100">
        <Users className="size-5 text-ink-400" />
        <p className="flex-1 text-sm text-ink-700">
          <span className="tabular font-semibold text-ink-900">{present}</span> {present > 1 ? v.workers : v.worker} présent{present > 1 ? 's' : ''}
          {need > 0 && <> sur <span className="tabular font-semibold">{need}</span> requis</>}
        </p>
        {need > 0 &&
          (present >= need ? <Badge tone="green" dot>Couvert</Badge> : <Badge tone="red" dot>Manque {need - present}</Badge>)}
      </div>

      {entries.length > 0 ? (
        <ul className="divide-y divide-ink-100">
          {entries.map((e) => (
            <EntryRow key={e.id} data={data} entry={e} showEmployee onChanged={onChanged} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-500">Personne n’est prévu sur ce poste.</p>
      )}

      <div className="mt-5 border-t border-ink-100 pt-5">
        <p className="mb-3 text-sm font-medium text-ink-900">Affecter un {v.worker}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">{v.Workers} libres sur {v.ceShift}…</option>
            {candidates.map((e) => (
              <option key={e.id} value={e.id}>{e.full_name}{e.default_site_id === siteId ? ' · site habituel' : ''}</option>
            ))}
          </Select>
          <Button icon={Plus} onClick={add} loading={loading} disabled={!pick}>Affecter</Button>
        </div>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ Besoins d'un site */

export function NeedsModal({
  data,
  siteId,
  onClose,
  onChanged,
}: {
  data: PlanningData
  siteId: string
  onClose: () => void
  onChanged: () => void
}) {
  const v = useVocab()
  const toast = useToast()
  const site = data.sites.find((s) => s.id === siteId)
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      data.shifts.map((s) => [s.id, String(data.needs.find((n) => n.site_id === siteId && n.shift_type_id === s.id)?.headcount ?? 0)]),
    ),
  )
  const [loading, setLoading] = useState(false)

  async function save() {
    setLoading(true)
    const rows = data.shifts.map((s) => ({ company_id: data.companyId, site_id: siteId, shift_type_id: s.id, headcount: Math.max(0, Number(values[s.id] || 0)) }))
    const keep = rows.filter((r) => r.headcount > 0)
    const drop = rows.filter((r) => r.headcount === 0).map((r) => r.shift_type_id)
    const r1 = keep.length ? await supabase.from('site_shift_needs').upsert(keep, { onConflict: 'site_id,shift_type_id' }) : { error: null }
    const r2 = drop.length ? await supabase.from('site_shift_needs').delete().eq('site_id', siteId).in('shift_type_id', drop) : { error: null }
    setLoading(false)
    const error = r1.error ?? r2.error
    if (error) return toast.error(errorMessage(error))
    toast.success('Besoins enregistrés')
    onChanged()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Effectif requis"
      description={site?.name}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button onClick={save} loading={loading}>Enregistrer</Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-ink-500">
        Nombre d’{v.workers} à placer sur {v.ceSite} pour chaque horaire. Le planning signale en rouge les postes non couverts.
      </p>
      <div className="space-y-3">
        {data.shifts.map((s) => {
          const tone = shiftTone(s)
          return (
            <Field key={s.id}>
              <div className="flex items-center gap-3">
                <span className={cx('flex size-9 items-center justify-center rounded-xl ring-1 ring-inset', toneClasses[tone])}>
                  <ShiftIcon tone={tone} className="size-4" />
                </span>
                <span className="flex-1 text-sm">
                  <span className="font-medium">{s.label}</span>
                  <span className="block text-xs text-ink-500">{hhmm(s.start_time)}–{hhmm(s.end_time)}</span>
                </span>
                <Input
                  type="number"
                  min={0}
                  max={50}
                  value={values[s.id]}
                  onChange={(e) => setValues({ ...values, [s.id]: e.target.value })}
                  className="w-20 text-center"
                />
              </div>
            </Field>
          )
        })}
      </div>
    </Modal>
  )
}
