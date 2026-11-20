import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Clock, Hourglass, RotateCcw, X } from 'lucide-react'
import { useCompany } from '../lib/company'
import { useVocab } from '../lib/sector'
import { addDays, dayLong, today } from '../lib/dates'
import { computePayslip, periodLabel, type OvertimeWeek, type PayrollRun } from '../lib/payroll'
import { loadMonthData, loadOvertimeApprovals, loadPayrollSettings, type OvertimeApproval } from '../lib/payrollData'
import { errorMessage, supabase, type Employee } from '../lib/supabase'
import { Avatar, Badge, Button, Callout, Card, EmptyState, IconButton, Input, PageHeader, PageLoader, StatCard, Table, Td, Th, useToast } from '../ui'

const thisMonth = () => today().slice(0, 7) + '-01'
function shiftMonth(period: string, n: number) {
  const [y, m] = period.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10)
}
const fmtH = (h: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(h) + ' h'

interface Row extends OvertimeWeek {
  employee: Employee
  decision?: OvertimeApproval
}

/** Validation des heures sup, semaine par semaine : rien n'est payé sans l'accord d'un responsable */
export default function Overtime() {
  const { company } = useCompany()
  const v = useVocab()
  const toast = useToast()
  const toastRef = useRef(toast)
  useEffect(() => {
    toastRef.current = toast
  })
  const [period, setPeriod] = useState(thisMonth())
  const [rows, setRows] = useState<Row[] | null>(null)
  const [enabled, setEnabled] = useState(true)
  const [threshold, setThreshold] = useState(40)
  const [locked, setLocked] = useState(false)
  const [hours, setHours] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [settings, month, approvals, emps, run] = await Promise.all([
        loadPayrollSettings(company.id),
        loadMonthData(company.id, period),
        loadOvertimeApprovals(company.id, period),
        supabase.from('employees').select('*').eq('company_id', company.id).order('full_name'),
        supabase.from('payroll_runs').select('status').eq('company_id', company.id).eq('period', period).maybeSingle(),
      ])
      setEnabled(settings.overtime_enabled && settings.overtime_requires_approval)
      setThreshold(Number(settings.overtime_weekly_threshold))
      setLocked((run.data as Pick<PayrollRun, 'status'> | null)?.status === 'validated')
      const decisions = Object.fromEntries(approvals.rows.map((a) => [a.employee_id + '|' + a.week_start, a]))
      const out: Row[] = []
      for (const emp of (emps.data ?? []) as Employee[]) {
        const entries = month.entries.filter((e) => e.employee_id === emp.id)
        if (!entries.length) continue
        const slip = computePayslip({
          employee: emp,
          period,
          settings: { ...settings, overtime_enabled: true, overtime_requires_approval: true },
          entries,
          shifts: month.shifts,
          punches: month.punches.filter((p) => p.employee_id === emp.id),
          approvals: approvals.byEmployee[emp.id],
        })
        for (const w of slip.details.overtime_weeks as OvertimeWeek[]) {
          out.push({ ...w, employee: emp, decision: decisions[emp.id + '|' + w.week] })
        }
      }
      out.sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || b.week.localeCompare(a.week) || a.employee.full_name.localeCompare(b.employee.full_name))
      setRows(out)
      setHours(Object.fromEntries(out.map((r) => [r.employee.id + '|' + r.week, String(r.decision?.status === 'approved' ? r.decision.approved_hours : r.hours)])))
    } catch (e) {
      toastRef.current.error(errorMessage(e))
      setRows([])
    }
  }, [company.id, period])

  useEffect(() => {
    setRows(null)
    load()
  }, [load])

  async function decide(list: Row[], status: 'approved' | 'rejected') {
    const key = list.length === 1 ? list[0].employee.id + '|' + list[0].week : 'all'
    setBusy(key)
    const payload = list.map((r) => {
      const h = Number(String(hours[r.employee.id + '|' + r.week] ?? r.hours).replace(',', '.'))
      return {
        company_id: company.id,
        employee_id: r.employee.id,
        week_start: r.week,
        status,
        approved_hours: status === 'approved' ? Math.max(0, Math.min(Number.isFinite(h) ? h : r.hours, r.hours)) : 0,
      }
    })
    const { error } = await supabase.from('overtime_approvals').upsert(payload, { onConflict: 'employee_id,week_start' })
    setBusy(null)
    if (error) return toast.error(errorMessage(error))
    toast.success(
      status === 'approved'
        ? `${payload.length > 1 ? `${payload.length} semaines validées` : 'Heures sup validées'}. Recalculez la paie pour les payer.`
        : 'Heures sup refusées',
    )
    load()
  }

  async function reset(r: Row) {
    setBusy(r.employee.id + '|' + r.week)
    const { error } = await supabase.from('overtime_approvals').delete().eq('employee_id', r.employee.id).eq('week_start', r.week)
    setBusy(null)
    if (error) return toast.error(errorMessage(error))
    load()
  }

  const stats = useMemo(() => {
    const s = { pending: 0, pendingH: 0, approvedH: 0, rejectedH: 0 }
    for (const r of rows ?? []) {
      if (r.status === 'pending') {
        s.pending++
        s.pendingH += r.hours
      } else if (r.status === 'approved') s.approvedH += r.paid
      else s.rejectedH += r.hours
    }
    return s
  }, [rows])
  const pending = (rows ?? []).filter((r) => r.status === 'pending')

  return (
    <div>
      <PageHeader
        title="Heures sup à valider"
        description={`Semaine par semaine : seules les heures validées par un responsable sont payées. Seuil : ${threshold} h par semaine.`}
        actions={
          <Link to={`/c/${company.id}/paie`}>
            <Button variant="secondary" icon={ArrowLeft}>Retour à la paie</Button>
          </Link>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <IconButton icon={ChevronLeft} label="Mois précédent" onClick={() => setPeriod(shiftMonth(period, -1))} className="ring-1 ring-ink-200" />
        <IconButton icon={ChevronRight} label="Mois suivant" onClick={() => setPeriod(shiftMonth(period, 1))} className="ring-1 ring-ink-200" />
        <span className="ml-1 text-lg font-semibold capitalize">{periodLabel(period)}</span>
        {pending.length > 1 && !locked && enabled && (
          <Button className="ml-auto" icon={Check} loading={busy === 'all'} onClick={() => decide(pending, 'approved')}>
            Tout valider ({pending.length})
          </Button>
        )}
      </div>

      {!enabled && (
        <div className="mb-5">
          <Callout tone="warning" title="La validation des heures sup n’est pas activée">
            Activez-la dans <Link to={`/c/${company.id}/parametres#paie`} className="font-medium underline">Paramètres → Paie</Link> : sans elle, les heures sup sont payées automatiquement.
          </Callout>
        </div>
      )}
      {locked && (
        <div className="mb-5">
          <Callout tone="info" title="Paie de ce mois validée">Les décisions ne changeront plus les bulletins, sauf si la paie est rouverte.</Callout>
        </div>
      )}

      {rows === null ? (
        <PageLoader />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon={Clock} title="Aucune heure sup ce mois-ci" text={`Aucun ${v.worker} n’a dépassé ${threshold} h dans une semaine, d’après les pointages.`} />
        </Card>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
            <StatCard icon={Hourglass} label="À valider" value={fmtH(stats.pendingH)} tone={stats.pending ? 'amber' : 'green'} sub={`${stats.pending} semaine${stats.pending > 1 ? 's' : ''}`} />
            <StatCard icon={Check} label="Validées (payées)" value={fmtH(stats.approvedH)} tone="green" />
            <StatCard icon={X} label="Refusées" value={fmtH(stats.rejectedH)} tone={stats.rejectedH ? 'red' : 'brand'} />
          </div>
          <Card>
            <Table>
              <thead>
                <tr>
                  <Th>{v.Worker}</Th>
                  <Th>Semaine</Th>
                  <Th className="text-right">Pointées en plus</Th>
                  <Th className="text-right">À payer</Th>
                  <Th>Décision</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const key = r.employee.id + '|' + r.week
                  const decided = r.status !== 'pending'
                  return (
                    <tr key={key}>
                      <Td>
                        <span className="flex items-center gap-3">
                          <Avatar name={r.employee.full_name} size="sm" />
                          <span>
                            <span className="block font-medium">{r.employee.full_name}</span>
                            <span className="block text-xs text-ink-500">{r.employee.job_title}</span>
                          </span>
                        </span>
                      </Td>
                      <Td className="text-sm text-ink-600">du {dayLong(r.week)} au {dayLong(addDays(r.week, 6))}</Td>
                      <Td className="tabular text-right font-medium">{fmtH(r.hours)}</Td>
                      <Td className="text-right">
                        {decided ? (
                          <span className="tabular font-medium">{fmtH(r.paid)}</span>
                        ) : (
                          <Input
                            type="number"
                            min={0}
                            max={r.hours}
                            step={0.25}
                            value={hours[key] ?? ''}
                            onChange={(e) => setHours({ ...hours, [key]: e.target.value })}
                            className="ml-auto w-24 text-right"
                            disabled={locked || !enabled}
                            aria-label="Heures à payer"
                          />
                        )}
                      </Td>
                      <Td>
                        {r.status === 'approved' && <Badge tone="green">Validée</Badge>}
                        {r.status === 'rejected' && <Badge tone="red">Refusée</Badge>}
                        {r.status === 'pending' && <Badge tone="amber" dot>En attente</Badge>}
                      </Td>
                      <Td className="text-right">
                        {!locked && enabled && (
                          decided ? (
                            <Button size="sm" variant="ghost" icon={RotateCcw} loading={busy === key} onClick={() => reset(r)}>Revoir</Button>
                          ) : (
                            <span className="inline-flex gap-1.5">
                              <Button size="sm" icon={Check} loading={busy === key} onClick={() => decide([r], 'approved')}>Valider</Button>
                              <Button size="sm" variant="secondary" icon={X} disabled={busy === key} onClick={() => decide([r], 'rejected')}>Refuser</Button>
                            </span>
                          )
                        )}
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          </Card>
          <p className="mt-3 text-xs text-ink-500">
            Après vos décisions, recalculez la paie du mois pour mettre à jour les bulletins. Vous pouvez valider moins d’heures que celles pointées.
          </p>
        </>
      )}
    </div>
  )
}
