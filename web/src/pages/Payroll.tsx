import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import writeExcelFile from 'write-excel-file/browser'
import {
  Calculator,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Lock,
  LockOpen,
  RefreshCw,
  Search,
  Settings2,
  TrendingDown,
  Users,
  Wallet,
} from 'lucide-react'
import { errorMessage, supabase, type Employee, type Punch, type ScheduleEntry, type ShiftType } from '../lib/supabase'
import { useCompany } from '../lib/company'
import { formatDate, formatGNF } from '../lib/format'
import { conakryInstant, today } from '../lib/dates'
import {
  baseLabel,
  computePayslip,
  DEFAULT_SETTINGS,
  monthEnd,
  PAY_MODE_LABELS,
  periodLabel,
  totals,
  type PayrollRun,
  type PayrollSettings,
  type Payslip,
} from '../lib/payroll'
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  ConfirmDialog,
  cx,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  PageHeader,
  PageLoader,
  StatCard,
  Table,
  Td,
  Th,
  useToast,
} from '../ui'

const thisMonth = () => today().slice(0, 7) + '-01'
function shiftMonth(period: string, n: number) {
  const [y, m] = period.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return d.toISOString().slice(0, 10)
}

export async function loadPayrollSettings(companyId: string): Promise<Omit<PayrollSettings, 'company_id'>> {
  const { data } = await supabase.from('payroll_settings').select('*').eq('company_id', companyId).maybeSingle()
  return { ...DEFAULT_SETTINGS, ...(data ?? {}) }
}

export default function Payroll() {
  const { company, isOwnerLevel } = useCompany()
  const toast = useToast()
  const [period, setPeriod] = useState(thisMonth())
  const [run, setRun] = useState<PayrollRun | null | undefined>(undefined)
  const [slips, setSlips] = useState<Payslip[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Payslip | null>(null)
  const [confirm, setConfirm] = useState<'validate' | 'reopen' | null>(null)

  const load = useCallback(async () => {
    const [r, e, s] = await Promise.all([
      supabase.from('payroll_runs').select('*').eq('company_id', company.id).eq('period', period).maybeSingle(),
      supabase.from('employees').select('*').eq('company_id', company.id).order('full_name'),
      loadPayrollSettings(company.id),
    ])
    setEmployees((e.data ?? []) as Employee[])
    setSettings(s)
    setRun((r.data as PayrollRun | null) ?? null)
    if (r.data) {
      const { data } = await supabase.from('payslips').select('*').eq('run_id', r.data.id)
      setSlips((data ?? []) as Payslip[])
    } else setSlips([])
  }, [company.id, period])

  useEffect(() => {
    setRun(undefined)
    load()
  }, [load])

  const empById = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees])

  /** Calcule (ou recalcule) tous les bulletins du mois. Les primes et retenues saisies à la main sont conservées. */
  async function compute() {
    setBusy(true)
    try {
      let current = run
      if (!current) {
        const { data, error } = await supabase
          .from('payroll_runs')
          .insert({ company_id: company.id, period, settings })
          .select('*')
          .single()
        if (error) throw error
        current = data as PayrollRun
      } else {
        const { error } = await supabase.from('payroll_runs').update({ settings }).eq('id', current.id)
        if (error) throw error
      }
      const end = monthEnd(period)
      const [en, sh, pu] = await Promise.all([
        supabase.from('schedule_entries').select('*').eq('company_id', company.id).gte('work_date', period).lte('work_date', end),
        supabase.from('shift_types').select('*').eq('company_id', company.id),
        supabase
          .from('punches')
          .select('*')
          .eq('company_id', company.id)
          .gte('punched_at', new Date(conakryInstant(period, '00:00') - 4 * 3600e3).toISOString())
          .lte('punched_at', new Date(conakryInstant(end, '23:59') + 24 * 3600e3).toISOString()),
      ])
      if (en.error) throw en.error
      const entries = (en.data ?? []) as ScheduleEntry[]
      const shifts = Object.fromEntries(((sh.data ?? []) as ShiftType[]).map((s) => [s.id, s]))
      const punches = (pu.data ?? []) as Punch[]
      const withEntries = new Set(entries.map((e) => e.employee_id))
      const people = employees.filter((e) => e.active || withEntries.has(e.id))
      const existing = Object.fromEntries(slips.map((s) => [s.employee_id, s]))

      const rows = people.map((emp) => {
        const prev = existing[emp.id]
        const r = computePayslip({
          employee: emp,
          period,
          settings,
          entries: entries.filter((e) => e.employee_id === emp.id),
          shifts,
          punches: punches.filter((p) => p.employee_id === emp.id),
          manual: prev ? { bonus: prev.bonus, bonus_note: prev.bonus_note, advance: prev.advance, other_deduction: prev.other_deduction, other_note: prev.other_note } : undefined,
        })
        return { ...r, run_id: current!.id, company_id: company.id }
      })
      if (rows.length) {
        const { error } = await supabase.from('payslips').upsert(rows, { onConflict: 'run_id,employee_id' })
        if (error) throw error
      }
      const keep = new Set(people.map((p) => p.id))
      const stale = slips.filter((s) => !keep.has(s.employee_id)).map((s) => s.id)
      if (stale.length) await supabase.from('payslips').delete().in('id', stale)
      toast.success(run ? 'Paie recalculée' : `Paie de ${periodLabel(period)} calculée`)
      await load()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function setStatus(status: 'draft' | 'validated') {
    if (!run) return
    setBusy(true)
    const { error } = await supabase.from('payroll_runs').update({ status }).eq('id', run.id)
    setBusy(false)
    setConfirm(null)
    if (error) return toast.error(errorMessage(error))
    toast.success(status === 'validated' ? 'Paie validée et verrouillée' : 'Paie rouverte')
    load()
  }

  const visible = slips
    .filter((s) => (empById[s.employee_id]?.full_name ?? '').toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (empById[a.employee_id]?.full_name ?? '').localeCompare(empById[b.employee_id]?.full_name ?? ''))

  const sum = useMemo(
    () =>
      slips.reduce(
        (a, s) => ({
          gross: a.gross + Number(s.gross),
          net: a.net + Number(s.net),
          deductions: a.deductions + Number(s.absence_deduction) + Number(s.late_deduction) + Number(s.advance) + Number(s.other_deduction),
        }),
        { gross: 0, net: 0, deductions: 0 },
      ),
    [slips],
  )

  async function exportExcel() {
    const header = ['Employé', 'Poste', 'Mode de paie', 'Tarif', 'Heures', 'Salaire de base', 'Gardes faites', 'Gardes prévues', 'Abs. injustifiées', 'Retenue absences', 'Retards (min)', 'Retenue retards', 'Prime de nuit', 'Prime ancienneté', 'Prime except.', 'Avance', 'Autres retenues', 'Brut', 'Net à payer']
    const n = (v: number) => ({ value: Number(v), format: '#,##0' })
    await writeExcelFile(
      [
        header.map((v) => ({ value: v, fontWeight: 'bold' as const })),
        ...visible.map((s) => [
          { value: empById[s.employee_id]?.full_name ?? '' },
          { value: empById[s.employee_id]?.job_title ?? '' },
          { value: PAY_MODE_LABELS[s.pay_mode ?? 'monthly'] },
          n(s.pay_rate),
          { value: Number(s.worked_hours) },
          n(s.base_salary),
          n(s.shifts_worked),
          n(s.shifts_planned),
          n(s.unjustified_absences),
          n(s.absence_deduction),
          n(s.late_minutes),
          n(s.late_deduction),
          n(s.night_bonus),
          n(s.seniority_bonus),
          n(s.bonus),
          n(s.advance),
          n(s.other_deduction),
          n(s.gross),
          n(s.net),
        ]),
        [{ value: 'TOTAL', fontWeight: 'bold' as const }, ...Array(16).fill({ value: '' }), { ...n(sum.gross), fontWeight: 'bold' as const }, { ...n(sum.net), fontWeight: 'bold' as const }],
      ],
      { columns: [{ width: 26 }, { width: 18 }, ...header.slice(2).map(() => ({ width: 14 }))] },
    ).toFile(`paie-${period.slice(0, 7)}-${company.name.toLowerCase().replace(/\W+/g, '-')}.xlsx`)
  }

  const validated = run?.status === 'validated'

  return (
    <>
      <PageHeader
        title="Paie"
        description="Salaires du mois calculés depuis le planning et les pointages. Montants en GNF."
        actions={
          run ? (
            <>
              <Button variant="secondary" icon={Download} onClick={exportExcel} disabled={!slips.length}>Exporter</Button>
              <Link to={`/c/${company.id}/paie/${period}/fiches`}>
                <Button variant="secondary" icon={FileText} disabled={!slips.length}>Fiches de paie</Button>
              </Link>
              {validated ? (
                isOwnerLevel && <Button variant="secondary" icon={LockOpen} onClick={() => setConfirm('reopen')}>Rouvrir</Button>
              ) : (
                <>
                  <Button variant="secondary" icon={RefreshCw} onClick={compute} loading={busy}>Recalculer</Button>
                  <Button icon={Lock} onClick={() => setConfirm('validate')} disabled={!slips.length}>Valider</Button>
                </>
              )}
            </>
          ) : undefined
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <IconButton icon={ChevronLeft} label="Mois précédent" onClick={() => setPeriod(shiftMonth(period, -1))} className="ring-1 ring-ink-200" />
        <IconButton icon={ChevronRight} label="Mois suivant" onClick={() => setPeriod(shiftMonth(period, 1))} className="ring-1 ring-ink-200" />
        <span className="ml-1 text-lg font-semibold capitalize">{periodLabel(period)}</span>
        {run && (validated ? <Badge tone="green"><Lock className="size-3" /> Validée le {formatDate(run.validated_at)}</Badge> : <Badge tone="amber" dot>Brouillon</Badge>)}
        <Link to={`/c/${company.id}/parametres#paie`} className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700">
          <Settings2 className="size-4" /> Règles de paie
        </Link>
      </div>

      {run === undefined ? (
        <PageLoader />
      ) : run === null ? (
        <Card>
          <EmptyState
            icon={Calculator}
            title={`Paie de ${periodLabel(period)} pas encore calculée`}
            text={
              <>
                Équipe360 reprend le salaire de base de chaque employé, retire les absences injustifiées et les retards
                au-delà de {settings.late_tolerance_min} min, et ajoute les primes. Vous pourrez ensuite ajouter primes et avances, puis valider.
              </>
            }
            action={<Button icon={Calculator} onClick={compute} loading={busy}>Calculer la paie</Button>}
          />
        </Card>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            <StatCard icon={Wallet} label="Net à payer" value={formatGNF(sum.net)} tone="green" />
            <StatCard icon={Calculator} label="Masse salariale brute" value={formatGNF(sum.gross)} />
            <StatCard icon={TrendingDown} label="Retenues et avances" value={formatGNF(sum.deductions)} tone={sum.deductions ? 'amber' : 'green'} />
            <StatCard icon={Users} label="Bulletins" value={slips.length} />
          </div>

          {!validated && period >= thisMonth() && (
            <div className="mb-4">
              <Callout tone="warning" title="Mois en cours">
                Seules les gardes déjà commencées sont comptées. Recalculez la paie en fin de mois avant de la valider.
              </Callout>
            </div>
          )}
          {!validated && (
            <div className="mb-4">
              <Callout tone="info">
                Brouillon : cliquez sur un employé pour ajouter une prime, une avance ou une retenue. Après une modification du planning ou des pointages, cliquez sur « Recalculer » (vos saisies sont conservées).
              </Callout>
            </div>
          )}

          <Card>
            <div className="border-b border-ink-100 p-4">
              <Input leading={<Search className="size-4" />} placeholder="Rechercher un employé…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
            </div>
            <Table>
              <thead>
                <tr>
                  <Th>Employé</Th>
                  <Th className="hidden text-right md:table-cell">Base</Th>
                  <Th className="hidden text-center lg:table-cell">Gardes</Th>
                  <Th className="hidden text-right lg:table-cell">Primes</Th>
                  <Th className="hidden text-right md:table-cell">Retenues</Th>
                  <Th className="text-right">Net à payer</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => {
                  const e = empById[s.employee_id]
                  const primes = Number(s.night_bonus) + Number(s.seniority_bonus) + Number(s.bonus)
                  const ret = Number(s.absence_deduction) + Number(s.late_deduction) + Number(s.advance) + Number(s.other_deduction)
                  return (
                    <tr key={s.id} onClick={() => setEditing(s)} className="cursor-pointer hover:bg-ink-50/60">
                      <Td>
                        <div className="flex items-center gap-3">
                          <Avatar name={e?.full_name} />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{e?.full_name ?? '—'}</p>
                            <p className="flex flex-wrap gap-1 text-xs text-ink-500">
                              {s.unjustified_absences > 0 && <Badge tone="red">{s.unjustified_absences} abs.</Badge>}
                              {s.late_deduction > 0 && <Badge tone="amber">{s.late_minutes} min retard</Badge>}
                              {s.shifts_unpunched > 0 && <Badge>{s.shifts_unpunched} non pointée{s.shifts_unpunched > 1 ? 's' : ''}</Badge>}
                              {Number(s.bonus) > 0 && <Badge tone="green">prime</Badge>}
                              {Number(s.advance) > 0 && <Badge tone="brand">avance</Badge>}
                            </p>
                          </div>
                        </div>
                      </Td>
                      <Td className="tabular hidden text-right text-ink-700 md:table-cell">
                        {formatGNF(s.base_salary)}
                        {s.pay_mode !== 'monthly' && <span className="block text-[11px] text-ink-400">{baseLabel(s).sub}</span>}
                      </Td>
                      <Td className="tabular hidden text-center text-ink-700 lg:table-cell">{s.shifts_worked}/{s.shifts_planned}</Td>
                      <Td className="tabular hidden text-right text-emerald-700 lg:table-cell">{primes ? '+' + formatGNF(primes) : '—'}</Td>
                      <Td className="tabular hidden text-right text-red-600 md:table-cell">{ret ? '−' + formatGNF(ret) : '—'}</Td>
                      <Td className="tabular text-right font-semibold text-ink-900">{formatGNF(s.net)}</Td>
                      <Td className="w-0">
                        <Link to={`/c/${company.id}/paie/${period}/fiches?e=${s.employee_id}`} onClick={(ev) => ev.stopPropagation()}>
                          <IconButton icon={FileText} label="Fiche de paie" />
                        </Link>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-ink-50/70 font-semibold">
                  <Td>Total · {slips.length} employé{slips.length > 1 ? 's' : ''}</Td>
                  <Td className="hidden md:table-cell" />
                  <Td className="hidden lg:table-cell" />
                  <Td className="hidden lg:table-cell" />
                  <Td className="tabular hidden text-right text-red-600 md:table-cell">−{formatGNF(sum.deductions)}</Td>
                  <Td className="tabular text-right">{formatGNF(sum.net)}</Td>
                  <Td />
                </tr>
              </tfoot>
            </Table>
          </Card>
        </>
      )}

      {editing && (
        <PayslipModal
          slip={editing}
          employee={empById[editing.employee_id]}
          locked={validated}
          settings={settings}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}
      <ConfirmDialog
        open={confirm === 'validate'}
        onClose={() => setConfirm(null)}
        loading={busy}
        title={`Valider la paie de ${periodLabel(period)} ?`}
        confirmLabel="Valider et verrouiller"
        text={`Les ${slips.length} bulletins seront verrouillés (net total : ${formatGNF(sum.net)}) et les agents pourront consulter leur fiche de paie dans l’appli.`}
        onConfirm={() => setStatus('validated')}
      />
      <ConfirmDialog
        open={confirm === 'reopen'}
        onClose={() => setConfirm(null)}
        loading={busy}
        danger
        title="Rouvrir cette paie ?"
        confirmLabel="Rouvrir"
        text="Les bulletins redeviennent modifiables et ne sont plus visibles par les agents jusqu’à la prochaine validation."
        onConfirm={() => setStatus('draft')}
      />
    </>
  )
}

function Line({ label, sub, value, tone }: { label: string; sub?: string; value: number; tone?: 'plus' | 'minus' }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <span className="text-ink-700">
        {label}
        {sub && <span className="block text-xs text-ink-400">{sub}</span>}
      </span>
      <span className={cx('tabular font-medium', tone === 'minus' && value ? 'text-red-600' : tone === 'plus' && value ? 'text-emerald-700' : 'text-ink-900')}>
        {tone === 'minus' && value ? '−' : tone === 'plus' && value ? '+' : ''}
        {formatGNF(value)}
      </span>
    </div>
  )
}

function PayslipModal({
  slip,
  employee,
  locked,
  settings,
  onClose,
  onSaved,
}: {
  slip: Payslip
  employee: Employee | undefined
  locked: boolean
  settings: Omit<PayrollSettings, 'company_id'>
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const [bonus, setBonus] = useState(String(slip.bonus || ''))
  const [bonusNote, setBonusNote] = useState(slip.bonus_note ?? '')
  const [advance, setAdvance] = useState(String(slip.advance || ''))
  const [other, setOther] = useState(String(slip.other_deduction || ''))
  const [otherNote, setOtherNote] = useState(slip.other_note ?? '')
  const [loading, setLoading] = useState(false)

  const preview = { ...slip, bonus: Number(bonus || 0), advance: Number(advance || 0), other_deduction: Number(other || 0) }
  const t = totals(preview)

  async function save(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase
      .from('payslips')
      .update({
        bonus: preview.bonus,
        bonus_note: bonusNote.trim() || null,
        advance: preview.advance,
        other_deduction: preview.other_deduction,
        other_note: otherNote.trim() || null,
        gross: t.gross,
        net: t.net,
      })
      .eq('id', slip.id)
    setLoading(false)
    if (error) return toast.error(errorMessage(error))
    toast.success('Bulletin mis à jour')
    onSaved()
    onClose()
  }

  const lateBillable = Math.max(0, slip.late_minutes - (settings.late_deduction ? settings.late_tolerance_min : slip.late_minutes))

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={employee?.full_name ?? 'Bulletin'}
      description={`${employee?.job_title ?? ''} · ${slip.shifts_worked} garde${slip.shifts_worked > 1 ? 's' : ''} effectuée${slip.shifts_worked > 1 ? 's' : ''} sur ${slip.shifts_planned} prévue${slip.shifts_planned > 1 ? 's' : ''}`}
      footer={
        locked ? (
          <Button onClick={onClose}>Fermer</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>Annuler</Button>
            <Button type="submit" form="slip-form" loading={loading}>Enregistrer</Button>
          </>
        )
      }
    >
      <form id="slip-form" onSubmit={save} className="grid gap-6 md:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-medium tracking-wide text-ink-400 uppercase">Calcul automatique</p>
          <div className="divide-y divide-ink-100 rounded-xl px-4 ring-1 ring-ink-100">
            <Line label={baseLabel(slip).label} sub={baseLabel(slip).sub} value={slip.base_salary} />
            <Line label="Prime de nuit" sub={`${slip.night_shifts} nuit${slip.night_shifts > 1 ? 's' : ''} × ${formatGNF(settings.night_bonus)}`} value={slip.night_bonus} tone="plus" />
            <Line label="Prime d’ancienneté" sub={`${slip.seniority_years} an${slip.seniority_years > 1 ? 's' : ''}${employee?.hire_date ? '' : ' (date d’embauche non renseignée)'}`} value={slip.seniority_bonus} tone="plus" />
            <Line
              label="Absences injustifiées"
              sub={slip.pay_mode === 'monthly' ? `${slip.unjustified_absences} × 1/${settings.absence_divisor} du salaire` : `${slip.unjustified_absences} garde${slip.unjustified_absences > 1 ? 's' : ''} non payée${slip.unjustified_absences > 1 ? 's' : ''}`}
              value={slip.absence_deduction}
              tone="minus"
            />
            <Line label="Retards" sub={`${slip.late_minutes} min cumulées, ${lateBillable} min retenues (tolérance ${settings.late_tolerance_min} min)`} value={slip.late_deduction} tone="minus" />
          </div>
          {slip.shifts_unpunched > 0 && (
            <p className="mt-2 text-xs text-ink-500">
              {slip.shifts_unpunched} garde{slip.shifts_unpunched > 1 ? 's' : ''} sans pointage d’arrivée
              {settings.unpunched_as_absence ? ' (comptée(s) comme absence injustifiée)' : ' (payée(s) normalement)'}.
            </p>
          )}
        </div>

        <div className="space-y-4">
          <p className="text-xs font-medium tracking-wide text-ink-400 uppercase">Saisie du responsable</p>
          <div className="grid grid-cols-[1fr_1.3fr] gap-2">
            <Field label="Prime exceptionnelle">
              <Input type="number" min={0} step={5000} value={bonus} onChange={(e) => setBonus(e.target.value)} disabled={locked} placeholder="0" />
            </Field>
            <Field label="Motif">
              <Input value={bonusNote} onChange={(e) => setBonusNote(e.target.value)} disabled={locked} placeholder="Ex. prime de fin d’année" />
            </Field>
          </div>
          <Field label="Avance sur salaire déjà versée">
            <Input type="number" min={0} step={5000} value={advance} onChange={(e) => setAdvance(e.target.value)} disabled={locked} placeholder="0" />
          </Field>
          <div className="grid grid-cols-[1fr_1.3fr] gap-2">
            <Field label="Autre retenue">
              <Input type="number" min={0} step={1000} value={other} onChange={(e) => setOther(e.target.value)} disabled={locked} placeholder="0" />
            </Field>
            <Field label="Motif">
              <Input value={otherNote} onChange={(e) => setOtherNote(e.target.value)} disabled={locked} placeholder="Ex. tenue perdue" />
            </Field>
          </div>
          <div className="rounded-xl bg-ink-900 p-4 text-white">
            <div className="flex justify-between text-sm text-white/60"><span>Brut</span><span className="tabular">{formatGNF(t.gross)}</span></div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-sm">Net à payer</span>
              <span className="tabular text-2xl font-semibold">{formatGNF(t.net)}</span>
            </div>
          </div>
          {locked && <p className="flex items-center gap-1.5 text-xs text-ink-500"><CheckCircle2 className="size-3.5 text-emerald-500" /> Paie validée : rouvrez-la pour modifier.</p>}
        </div>
      </form>
    </Modal>
  )
}
