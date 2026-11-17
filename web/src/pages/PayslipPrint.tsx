import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, FileX, Printer } from 'lucide-react'
import { supabase, type Employee, type Site } from '../lib/supabase'
import { useCompany } from '../lib/company'
import { formatDate, formatGNF, formatPhone, sectorLabel } from '../lib/format'
import { baseLabel, DEFAULT_SETTINGS, numberToWords, periodLabel, type PayrollRun, type Payslip } from '../lib/payroll'
import { Badge, Button, Card, EmptyState, PageLoader } from '../ui'
import { LogoMark } from '../ui/Logo'

export default function PayslipPrint() {
  const { company, canManage } = useCompany()
  const { period = '' } = useParams()
  const [params] = useSearchParams()
  const only = params.get('e')
  const [state, setState] = useState<{ run: PayrollRun; slips: Payslip[]; emp: Record<string, Employee>; sites: Record<string, Site> } | null | 'none'>(null)

  useEffect(() => {
    ;(async () => {
      const { data: run } = await supabase.from('payroll_runs').select('*').eq('company_id', company.id).eq('period', period).maybeSingle()
      if (!run) return setState('none')
      let q = supabase.from('payslips').select('*').eq('run_id', run.id)
      if (only) q = q.eq('employee_id', only)
      const [{ data: slips }, { data: emps }, { data: sites }] = await Promise.all([
        q,
        supabase.from('employees').select('*').eq('company_id', company.id),
        supabase.from('sites').select('*').eq('company_id', company.id),
      ])
      const emp = Object.fromEntries(((emps ?? []) as Employee[]).map((e) => [e.id, e]))
      setState({
        run: run as PayrollRun,
        slips: ((slips ?? []) as Payslip[]).sort((a, b) => (emp[a.employee_id]?.full_name ?? '').localeCompare(emp[b.employee_id]?.full_name ?? '')),
        emp,
        sites: Object.fromEntries(((sites ?? []) as Site[]).map((s) => [s.id, s])),
      })
    })()
  }, [company.id, period, only])

  if (state === null) return <PageLoader />
  if (state === 'none' || !state.slips.length) {
    return (
      <Card>
        <EmptyState icon={FileX} title="Aucune fiche de paie" text="La paie de ce mois n’est pas encore disponible." />
      </Card>
    )
  }

  const { run, slips, emp, sites } = state
  const settings = { ...DEFAULT_SETTINGS, ...run.settings }
  const back = canManage ? `/c/${company.id}/paie` : `/c/${company.id}/moi`

  return (
    <div>
      <style>{`@page { size: A4; margin: 12mm; } @media print { main { padding: 0 !important; max-width: none !important; } }`}</style>
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link to={back}><Button variant="ghost" icon={ArrowLeft}>Retour</Button></Link>
        <div className="flex items-center gap-3">
          {run.status !== 'validated' && <Badge tone="amber" dot>Brouillon — non validé</Badge>}
          <span className="text-sm text-ink-500">{slips.length} fiche{slips.length > 1 ? 's' : ''}</span>
          <Button icon={Printer} onClick={() => window.print()}>Imprimer / PDF</Button>
        </div>
      </div>
      <p className="no-print mb-4 text-sm text-ink-500">Pour un PDF : « Imprimer / PDF », puis choisissez « Enregistrer au format PDF » comme imprimante.</p>

      <div className="space-y-8 print:space-y-0">
        {slips.map((s, i) => {
          const e = emp[s.employee_id]
          const site = e?.default_site_id ? sites[e.default_site_id] : undefined
          const gains: [string, string, number][] = [
            [baseLabel(s).label, baseLabel(s).sub, Number(s.base_salary)],
            ...(Number(s.night_bonus) ? [['Prime de nuit', `${s.night_shifts} nuit${s.night_shifts > 1 ? 's' : ''} × ${formatGNF(settings.night_bonus)}`, Number(s.night_bonus)] as [string, string, number]] : []),
            ...(Number(s.seniority_bonus) ? [['Prime d’ancienneté', `${s.seniority_years} an${s.seniority_years > 1 ? 's' : ''}`, Number(s.seniority_bonus)] as [string, string, number]] : []),
            ...(Number(s.bonus) ? [['Prime exceptionnelle', s.bonus_note ?? '', Number(s.bonus)] as [string, string, number]] : []),
          ]
          const retenues: [string, string, number][] = [
            ...(Number(s.absence_deduction) ? [['Absences injustifiées', `${s.unjustified_absences} × 1/${settings.absence_divisor}`, Number(s.absence_deduction)] as [string, string, number]] : []),
            ...(Number(s.late_deduction) ? [['Retards', `${s.late_minutes} min cumulées`, Number(s.late_deduction)] as [string, string, number]] : []),
            ...(Number(s.advance) ? [['Avance sur salaire', '', Number(s.advance)] as [string, string, number]] : []),
            ...(Number(s.other_deduction) ? [['Autre retenue', s.other_note ?? '', Number(s.other_deduction)] as [string, string, number]] : []),
          ]
          const totalRet = retenues.reduce((a, r) => a + r[2], 0)
          return (
            <article
              key={s.id}
              className="mx-auto max-w-[190mm] rounded-2xl bg-white p-8 text-[13px] text-ink-900 shadow-card ring-1 ring-ink-100 print:max-w-none print:rounded-none print:p-0 print:shadow-none print:ring-0"
              style={{ breakAfter: i < slips.length - 1 ? 'page' : 'auto' }}
            >
              <header className="flex items-start justify-between gap-6 border-b-2 border-ink-900 pb-4">
                <div>
                  <p className="text-lg font-bold">{company.name}</p>
                  <p className="text-ink-500">{sectorLabel(company.sector)}{company.phone ? ` · ${formatPhone(company.phone)}` : ''}</p>
                  <p className="text-ink-500">Conakry, Guinée</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold tracking-tight uppercase">Bulletin de paie</p>
                  <p className="font-medium capitalize">{periodLabel(run.period)}</p>
                  <p className="text-xs text-ink-500">N° {run.period.slice(0, 7).replace('-', '')}-{s.employee_id.slice(0, 6).toUpperCase()}</p>
                </div>
              </header>

              <section className="mt-5 grid grid-cols-2 gap-x-8 gap-y-1.5 rounded-xl bg-ink-50 p-4 print:bg-transparent print:ring-1 print:ring-ink-200">
                {[
                  ['Employé', e?.full_name ?? '—'],
                  ['Téléphone', formatPhone(e?.phone)],
                  ['Poste', e?.job_title ?? '—'],
                  ['Site d’affectation', site?.name ?? '—'],
                  ['Date d’embauche', formatDate(e?.hire_date)],
                  ['Gardes effectuées', `${s.shifts_worked} sur ${s.shifts_planned} prévues`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <span className="text-ink-500">{k}</span>
                    <span className="text-right font-medium">{v}</span>
                  </div>
                ))}
              </section>

              <table className="mt-6 w-full">
                <thead>
                  <tr className="border-b border-ink-300 text-left text-[11px] tracking-wide text-ink-500 uppercase">
                    <th className="py-2 font-medium">Élément</th>
                    <th className="py-2 font-medium">Détail</th>
                    <th className="py-2 text-right font-medium">Gains</th>
                    <th className="py-2 text-right font-medium">Retenues</th>
                  </tr>
                </thead>
                <tbody>
                  {gains.map(([l, d, v]) => (
                    <tr key={l} className="border-b border-ink-100">
                      <td className="py-2">{l}</td>
                      <td className="py-2 text-ink-500">{d}</td>
                      <td className="tabular py-2 text-right">{formatGNF(v)}</td>
                      <td />
                    </tr>
                  ))}
                  <tr className="border-b border-ink-300 font-semibold">
                    <td className="py-2" colSpan={2}>Salaire brut</td>
                    <td className="tabular py-2 text-right">{formatGNF(s.gross)}</td>
                    <td />
                  </tr>
                  {retenues.map(([l, d, v]) => (
                    <tr key={l} className="border-b border-ink-100">
                      <td className="py-2">{l}</td>
                      <td className="py-2 text-ink-500">{d}</td>
                      <td />
                      <td className="tabular py-2 text-right">{formatGNF(v)}</td>
                    </tr>
                  ))}
                  {retenues.length > 0 && (
                    <tr className="border-b border-ink-300 font-semibold">
                      <td className="py-2" colSpan={3}>Total des retenues</td>
                      <td className="tabular py-2 text-right">{formatGNF(totalRet)}</td>
                    </tr>
                  )}
                </tbody>
              </table>

              <section className="mt-6 flex items-center justify-between rounded-xl bg-ink-900 px-5 py-4 text-white print:bg-transparent print:text-ink-900 print:ring-2 print:ring-ink-900">
                <span className="text-sm font-medium tracking-wide uppercase">Net à payer</span>
                <span className="tabular text-2xl font-bold">{formatGNF(s.net)}</span>
              </section>
              <p className="mt-3 text-ink-600">
                Arrêté le présent bulletin à la somme de <span className="font-semibold first-letter:uppercase">{numberToWords(Number(s.net))}</span> francs guinéens.
              </p>

              <section className="mt-10 grid grid-cols-2 gap-10">
                {['L’employeur', 'L’employé(e) — « reçu pour solde »'].map((l) => (
                  <div key={l}>
                    <p className="text-ink-500">{l}</p>
                    <div className="mt-14 border-t border-ink-300 pt-1 text-xs text-ink-400">Signature</div>
                  </div>
                ))}
              </section>

              <footer className="mt-8 flex items-center justify-between border-t border-ink-100 pt-3 text-[11px] text-ink-400">
                <span className="inline-flex items-center gap-1.5"><LogoMark className="size-4" /> Généré par Équipe360</span>
                <span>{run.status === 'validated' ? `Paie validée le ${formatDate(run.validated_at)}` : 'Brouillon'}</span>
              </footer>
            </article>
          )
        })}
      </div>
    </div>
  )
}
