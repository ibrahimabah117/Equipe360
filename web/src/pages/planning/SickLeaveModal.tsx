import { useEffect, useMemo, useState } from 'react'
import { HeartPulse } from 'lucide-react'
import { errorMessage, supabase, type AbsenceKind, type ScheduleEntry } from '../../lib/supabase'
import { addDays, dayLong, today } from '../../lib/dates'
import { Button, Callout, Field, Input, Modal, Select, useToast } from '../../ui'
import { ABSENCE_LABELS, hhmm } from './common'
import type { PlanningData } from './Modals'

/**
 * Arrêt maladie (ou congé) sur une période : toutes les gardes prévues de
 * l'agent entre deux dates passent en « absent » avec le motif choisi.
 */
export default function SickLeaveModal({
  data,
  onClose,
  onDone,
}: {
  data: Omit<PlanningData, 'entries'>
  onClose: () => void
  onDone: (from: string) => void
}) {
  const toast = useToast()
  const employees = useMemo(
    () => data.employees.filter((e) => e.active).sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [data.employees],
  )
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? '')
  const [from, setFrom] = useState(today())
  const [to, setTo] = useState(addDays(today(), 2))
  const [kind, setKind] = useState<AbsenceKind>('maladie')
  const [note, setNote] = useState('')
  const [found, setFound] = useState<ScheduleEntry[] | null>(null)
  const [busy, setBusy] = useState(false)

  const invalid = !employeeId || !from || !to || to < from
  const site = useMemo(() => Object.fromEntries(data.sites.map((s) => [s.id, s.name])), [data.sites])
  const shift = useMemo(() => Object.fromEntries(data.shifts.map((s) => [s.id, s])), [data.shifts])

  // Gardes concernées (aperçu)
  useEffect(() => {
    if (invalid) return setFound(null)
    let alive = true
    setFound(null)
    supabase
      .from('schedule_entries')
      .select('*')
      .eq('company_id', data.companyId)
      .eq('employee_id', employeeId)
      .gte('work_date', from)
      .lte('work_date', to)
      .order('work_date')
      .then(({ data: rows, error }) => {
        if (!alive) return
        if (error) toast.error(errorMessage(error))
        setFound((rows as ScheduleEntry[] | null) ?? [])
      })
    return () => {
      alive = false
    }
    // toast n'est pas stable d'un rendu à l'autre : volontairement hors dépendances
  }, [employeeId, from, to, invalid, data.companyId])

  const planned = (found ?? []).filter((e) => e.status === 'planned')
  const asReplacement = (found ?? []).filter((e) => e.status === 'replacement').length

  async function save() {
    if (!planned.length) return
    setBusy(true)
    const { error } = await supabase
      .from('schedule_entries')
      .update({ status: 'absent', absence_kind: kind, note: note.trim() || null })
      .in('id', planned.map((e) => e.id))
    setBusy(false)
    if (error) return toast.error(errorMessage(error))
    toast.success(`${planned.length} garde${planned.length > 1 ? 's' : ''} en « ${ABSENCE_LABELS[kind]} ». Cliquez sur chacune pour choisir un remplaçant.`)
    onDone(from)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Déclarer un arrêt"
      description="Toutes les gardes de l’agent sur la période passent en absence, en une seule fois."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button icon={HeartPulse} loading={busy} disabled={invalid || !planned.length} onClick={save}>
            {planned.length ? `Déclarer ${planned.length} garde${planned.length > 1 ? 's' : ''}` : 'Déclarer'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Agent">
          <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.full_name}</option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Du">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Au (inclus)" error={to && from && to < from ? 'La date de fin est avant le début.' : undefined}>
            <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Motif">
            <Select value={kind} onChange={(e) => setKind(e.target.value as AbsenceKind)}>
              {(Object.keys(ABSENCE_LABELS) as AbsenceKind[]).map((k) => (
                <option key={k} value={k}>{ABSENCE_LABELS[k]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Note (facultatif)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Certificat reçu…" />
          </Field>
        </div>

        {!invalid && found && (
          planned.length ? (
            <div className="rounded-xl ring-1 ring-ink-100">
              <p className="border-b border-ink-100 px-4 py-2.5 text-[13px] font-medium text-ink-700">
                Gardes concernées ({planned.length})
              </p>
              <ul className="max-h-48 divide-y divide-ink-100 overflow-y-auto">
                {planned.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                    <span className="text-ink-900 first-letter:uppercase">{dayLong(e.work_date)}</span>
                    <span className="truncate text-right text-ink-500">
                      {shift[e.shift_type_id]?.label} {shift[e.shift_type_id] && `${hhmm(shift[e.shift_type_id].start_time)}–${hhmm(shift[e.shift_type_id].end_time)}`} · {site[e.site_id] ?? '—'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <Callout tone="info">Aucune garde prévue pour cet agent sur cette période.</Callout>
          )
        )}

        {asReplacement > 0 && (
          <Callout tone="warning">
            L’agent devait aussi faire {asReplacement} remplacement{asReplacement > 1 ? 's' : ''} sur la période : retirez-le{asReplacement > 1 ? 's' : ''} à la main dans le planning.
          </Callout>
        )}

        {kind === 'maladie' && (
          <p className="text-xs text-ink-500">
            Paie au mois : pas de retenue pour maladie. Paie à la garde ou à l’heure : les gardes non faites ne sont pas payées.
          </p>
        )}
      </div>
    </Modal>
  )
}
