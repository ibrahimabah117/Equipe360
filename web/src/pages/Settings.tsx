import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Clock, Moon, Plus, Sun, Trash2 } from 'lucide-react'
import { errorMessage, supabase, type ShiftType } from '../lib/supabase'
import { useCompany } from '../lib/company'
import { formatDate, formatGNF, formatPhone, normalizePhone, sectorLabel } from '../lib/format'
import { Badge, Button, Card, ConfirmDialog, Field, IconButton, Input, Modal, PageHeader, useToast } from '../ui'

const hhmm = (t: string) => t.slice(0, 5)
function duration(a: string, b: string) {
  const [h1, m1] = a.split(':').map(Number)
  const [h2, m2] = b.split(':').map(Number)
  let d = h2 * 60 + m2 - (h1 * 60 + m1)
  if (d <= 0) d += 24 * 60
  return `${Math.floor(d / 60)} h${d % 60 ? String(d % 60).padStart(2, '0') : ''}`
}

export default function Settings() {
  const { company, reload, isOwnerLevel } = useCompany()
  const toast = useToast()
  const [name, setName] = useState(company.name)
  const [phone, setPhone] = useState(company.phone ? formatPhone(company.phone) : '')
  const [saving, setSaving] = useState(false)
  const [shifts, setShifts] = useState<ShiftType[]>([])
  const [editing, setEditing] = useState<ShiftType | 'new' | null>(null)
  const [deleting, setDeleting] = useState<ShiftType | null>(null)

  const loadShifts = useCallback(async () => {
    const { data } = await supabase.from('shift_types').select('*').eq('company_id', company.id).order('start_time')
    setShifts((data ?? []) as ShiftType[])
  }, [company.id])
  useEffect(() => {
    loadShifts()
  }, [loadShifts])

  async function saveCompany(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase
      .from('companies')
      .update({ name: name.trim(), phone: phone.trim() ? normalizePhone(phone) ?? phone.trim() : null })
      .eq('id', company.id)
    setSaving(false)
    if (error) return toast.error(errorMessage(error))
    toast.success('Informations enregistrées')
    reload()
  }

  async function removeShift() {
    if (!deleting) return
    const { error } = await supabase.from('shift_types').delete().eq('id', deleting.id)
    setDeleting(null)
    if (error) {
      return toast.error(error.code === '23503' ? 'Cette garde est utilisée dans le planning : impossible de la supprimer.' : errorMessage(error))
    }
    toast.success('Type de garde supprimé')
    loadShifts()
  }

  return (
    <>
      <PageHeader title="Paramètres" description="Informations de l’entreprise et types de garde." />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <form onSubmit={saveCompany}>
              <div className="border-b border-ink-100 px-5 py-4">
                <h2 className="font-semibold">Entreprise</h2>
                <p className="text-sm text-ink-500">Affiché sur les QR codes et les fiches de paie.</p>
              </div>
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                <Field label="Nom">
                  <Input value={name} onChange={(e) => setName(e.target.value)} required disabled={!isOwnerLevel} />
                </Field>
                <Field label="Téléphone">
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" disabled={!isOwnerLevel} />
                </Field>
              </div>
              {isOwnerLevel && (
                <div className="flex justify-end border-t border-ink-100 bg-ink-50/60 px-5 py-3 rounded-b-2xl">
                  <Button type="submit" loading={saving}>Enregistrer</Button>
                </div>
              )}
            </form>
          </Card>

          <Card>
            <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
              <div>
                <h2 className="font-semibold">Types de garde</h2>
                <p className="text-sm text-ink-500">Utilisés pour le planning et le calcul des heures.</p>
              </div>
              <Button size="sm" variant="secondary" icon={Plus} onClick={() => setEditing('new')}>Ajouter</Button>
            </div>
            <ul className="divide-y divide-ink-100">
              {shifts.map((s) => {
                const night = Number(s.start_time.slice(0, 2)) >= 18 || Number(s.start_time.slice(0, 2)) < 5
                return (
                  <li key={s.id} className="flex items-center gap-4 px-5 py-3.5">
                    <span className={night ? 'flex size-10 items-center justify-center rounded-xl bg-ink-900 text-white' : 'flex size-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600'}>
                      {night ? <Moon className="size-5" /> : <Sun className="size-5" />}
                    </span>
                    <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(s)}>
                      <p className="font-medium">
                        {s.label} <Badge tone="neutral">{s.code}</Badge>
                      </p>
                      <p className="tabular text-sm text-ink-500">
                        {hhmm(s.start_time)} → {hhmm(s.end_time)} · {duration(s.start_time, s.end_time)}
                      </p>
                    </button>
                    <IconButton icon={Trash2} label="Supprimer" onClick={() => setDeleting(s)} className="hover:text-red-600" />
                  </li>
                )
              })}
              {shifts.length === 0 && <li className="px-5 py-6 text-center text-sm text-ink-500">Aucun type de garde.</li>}
            </ul>
          </Card>
        </div>

        <Card className="h-fit p-5">
          <p className="text-xs font-medium tracking-wide text-ink-400 uppercase">Abonnement</p>
          <dl className="mt-3 space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-ink-500">Secteur</dt><dd className="font-medium">{sectorLabel(company.sector)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Tarif</dt><dd className="tabular font-medium">{formatGNF(company.monthly_price)} / mois</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Payé jusqu’au</dt><dd className="font-medium">{formatDate(company.paid_until)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Statut</dt><dd><Badge tone="green" dot>Actif</Badge></dd></div>
          </dl>
        </Card>
      </div>

      {editing && <ShiftModal shift={editing === 'new' ? null : editing} companyId={company.id} onClose={() => setEditing(null)} onSaved={loadShifts} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        danger
        title="Supprimer ce type de garde ?"
        text={`« ${deleting?.label} » ne sera plus proposé dans le planning.`}
        confirmLabel="Supprimer"
        onConfirm={removeShift}
      />
    </>
  )
}

function ShiftModal({ shift, companyId, onClose, onSaved }: { shift: ShiftType | null; companyId: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [code, setCode] = useState(shift?.code ?? '')
  const [label, setLabel] = useState(shift?.label ?? '')
  const [start, setStart] = useState(shift ? hhmm(shift.start_time) : '07:00')
  const [end, setEnd] = useState(shift ? hhmm(shift.end_time) : '19:00')
  const [loading, setLoading] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    const payload = { company_id: companyId, code: code.trim().toUpperCase(), label: label.trim(), start_time: start, end_time: end }
    const { error } = shift ? await supabase.from('shift_types').update(payload).eq('id', shift.id) : await supabase.from('shift_types').insert(payload)
    setLoading(false)
    if (error) return toast.error(error.code === '23505' ? 'Ce code est déjà utilisé.' : errorMessage(error))
    toast.success('Type de garde enregistré')
    onSaved()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={shift ? 'Modifier la garde' : 'Nouveau type de garde'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" form="shift-form" loading={loading}>Enregistrer</Button>
        </>
      }
    >
      <form id="shift-form" onSubmit={save} className="grid grid-cols-3 gap-4">
        <Field label="Code"><Input value={code} onChange={(e) => setCode(e.target.value)} maxLength={3} placeholder="J" required /></Field>
        <Field label="Libellé" className="col-span-2"><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Jour" required /></Field>
        <Field label="Début" className="col-span-3 sm:col-span-1"><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} required /></Field>
        <Field label="Fin" className="col-span-3 sm:col-span-1"><Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} required /></Field>
        <div className="col-span-3 flex items-end text-sm text-ink-500 sm:col-span-1">
          <span className="inline-flex h-10 items-center gap-1.5"><Clock className="size-4" /> {duration(start + ':00', end + ':00')}</span>
        </div>
      </form>
    </Modal>
  )
}
