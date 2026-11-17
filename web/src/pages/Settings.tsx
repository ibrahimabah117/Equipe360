import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Clock, Moon, Plus, Sun, Trash2 } from 'lucide-react'
import { errorMessage, supabase, type ShiftType } from '../lib/supabase'
import { useCompany } from '../lib/company'
import { formatDate, formatGNF, formatPhone, normalizePhone, sectorLabel } from '../lib/format'
import { Badge, Button, Card, ConfirmDialog, Field, IconButton, Input, Modal, PageHeader, Toggle, useToast } from '../ui'
import { DEFAULT_SETTINGS, type PayrollSettings } from '../lib/payroll'

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

          <PayrollSettingsCard companyId={company.id} />

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

function PayrollSettingsCard({ companyId }: { companyId: string }) {
  const toast = useToast()
  const [v, setV] = useState<Omit<PayrollSettings, 'company_id'> | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase
      .from('payroll_settings')
      .select('*')
      .eq('company_id', companyId)
      .maybeSingle()
      .then(({ data }) => setV({ ...DEFAULT_SETTINGS, ...(data ?? {}) }))
  }, [companyId])

  useEffect(() => {
    if (v && window.location.hash === '#paie') document.getElementById('paie')?.scrollIntoView({ behavior: 'smooth' })
  }, [v])

  if (!v) return null
  const num = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: Number(e.target.value) })

  async function save(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { company_id: _ignored, updated_at: _u, ...rest } = v as PayrollSettings & { updated_at?: string }
    void _ignored
    void _u
    const { error } = await supabase.from('payroll_settings').upsert({ ...rest, company_id: companyId })
    setSaving(false)
    if (error) return toast.error(errorMessage(error))
    toast.success('Règles de paie enregistrées — elles s’appliquent aux prochains calculs')
  }

  return (
    <Card>
      <form onSubmit={save} id="paie">
        <div className="border-b border-ink-100 px-5 py-4">
          <h2 className="font-semibold">Règles de paie</h2>
          <p className="text-sm text-ink-500">Utilisées au prochain calcul ou recalcul. Une paie déjà validée ne change pas.</p>
        </div>
        <div className="grid gap-x-4 gap-y-5 p-5 sm:grid-cols-2">
          <Field label="Retenue par absence injustifiée" hint={`1/${v.absence_divisor} du salaire de base par garde manquée`}>
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink-500">1 /</span>
              <Input type="number" min={1} max={31} value={v.absence_divisor} onChange={num('absence_divisor')} className="w-24" />
            </div>
          </Field>
          <div className="flex items-center sm:pt-6">
            <Toggle checked={v.unpunched_as_absence} onChange={(x) => setV({ ...v, unpunched_as_absence: x })} label="Garde non pointée = absence injustifiée" />
          </div>
          <div className="sm:col-span-2">
            <Toggle checked={v.late_deduction} onChange={(x) => setV({ ...v, late_deduction: x })} label="Retenir les retards" />
          </div>
          {v.late_deduction && (
            <>
              <Field label="Tolérance de retard par mois (minutes)" hint="Seules les minutes au-delà sont retenues">
                <Input type="number" min={0} value={v.late_tolerance_min} onChange={num('late_tolerance_min')} />
              </Field>
              <Field label="Durée d’une garde de référence (heures)" hint="Sert à convertir les minutes de retard en GNF">
                <Input type="number" min={1} max={24} step={0.5} value={v.reference_shift_hours} onChange={num('reference_shift_hours')} />
              </Field>
            </>
          )}
          <Field label="Prime de nuit (GNF par nuit travaillée)" hint="0 = désactivée">
            <Input type="number" min={0} step={1000} value={v.night_bonus} onChange={num('night_bonus')} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Ancienneté (% / an)" hint="0 = désactivée">
              <Input type="number" min={0} max={100} step={0.5} value={v.seniority_pct_per_year} onChange={num('seniority_pct_per_year')} />
            </Field>
            <Field label="Plafond (%)">
              <Input type="number" min={0} max={100} value={v.seniority_cap_pct} onChange={num('seniority_cap_pct')} />
            </Field>
          </div>
          <div className="border-t border-ink-100 pt-5 sm:col-span-2">
            <Toggle checked={v.overtime_enabled} onChange={(x) => setV({ ...v, overtime_enabled: x })} label="Payer les heures supplémentaires" />
            <p className="mt-1 pl-[52px] text-xs text-ink-500">
              Heures pointées au-delà du seuil de la semaine. Utile dans l’industrie ; à laisser désactivé si vos gardes de 12 h sont déjà comprises dans le salaire.
            </p>
          </div>
          {v.overtime_enabled && (
            <>
              <Field label="Seuil par semaine (heures)" hint="Au-delà, les heures sont supplémentaires">
                <Input type="number" min={0} max={168} step={0.5} value={v.overtime_weekly_threshold} onChange={num('overtime_weekly_threshold')} />
              </Field>
              <Field label="Heures par mois d’un salaire mensuel" hint="Pour trouver le taux horaire (173,33 h = 40 h × 52 / 12)">
                <Input type="number" min={1} step={0.01} value={v.monthly_hours} onChange={num('monthly_hours')} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="1er palier (heures)">
                  <Input type="number" min={0} step={0.5} value={v.overtime_tier1_hours} onChange={num('overtime_tier1_hours')} />
                </Field>
                <Field label="Majoration (%)">
                  <Input type="number" min={0} max={300} value={v.overtime_tier1_pct} onChange={num('overtime_tier1_pct')} />
                </Field>
              </div>
              <Field label="Majoration au-delà (%)" hint={`Ex. ${v.overtime_tier1_hours} premières heures à +${v.overtime_tier1_pct} %, puis +${v.overtime_tier2_pct} %`}>
                <Input type="number" min={0} max={300} value={v.overtime_tier2_pct} onChange={num('overtime_tier2_pct')} />
              </Field>
            </>
          )}
        </div>
        <div className="flex items-center justify-between gap-4 rounded-b-2xl border-t border-ink-100 bg-ink-50/60 px-5 py-3">
          <p className="text-xs text-ink-500">Cotisations sociales et impôts : non calculés (utilisez « autre retenue »).</p>
          <Button type="submit" loading={saving}>Enregistrer</Button>
        </div>
      </form>
    </Card>
  )
}
