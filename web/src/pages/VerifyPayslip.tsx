import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ShieldX } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatDate, formatGNF } from '../lib/format'
import { periodLabel } from '../lib/payroll'
import { Card, PageLoader } from '../ui'
import { Logo } from '../ui/Logo'

interface Result {
  state: 'valid' | 'reopened'
  company_name: string
  employee_name: string
  job_title: string | null
  period: string
  base_salary: number
  gross: number
  net: number
  shifts_worked: number
  validated_at: string | null
}

/**
 * Page publique ouverte par le QR code d'un bulletin de paie.
 * Sans compte : une banque, un bailleur ou une microfinance vérifie que le bulletin
 * a bien été émis par l'employeur et compare les montants avec le papier.
 */
export default function VerifyPayslip() {
  const { token = '' } = useParams()
  const [res, setRes] = useState<Result | null | 'unknown' | 'error'>(null)

  useEffect(() => {
    supabase.rpc('verify_payslip', { p_token: token }).then(({ data, error }) => {
      if (error) return setRes('error')
      const row = (data as Result[] | null)?.[0]
      setRes(row ?? 'unknown')
    })
  }, [token])

  return (
    <div className="min-h-screen bg-ink-50 px-4 py-10">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <h1 className="mb-1 text-center text-xl font-semibold text-ink-900">Vérification d’un bulletin de paie</h1>
        <p className="mb-6 text-center text-sm text-ink-500">Les informations ci-dessous viennent directement des registres de l’employeur.</p>

        {res === null ? (
          <PageLoader />
        ) : res === 'error' ? (
          <Card className="p-6 text-center">
            <AlertTriangle className="mx-auto size-10 text-amber-500" />
            <p className="mt-3 font-semibold">Vérification impossible pour le moment</p>
            <p className="mt-1 text-sm text-ink-500">Vérifiez la connexion internet et réessayez.</p>
          </Card>
        ) : res === 'unknown' ? (
          <Card className="p-6 text-center">
            <ShieldX className="mx-auto size-12 text-red-600" />
            <p className="mt-3 text-lg font-semibold text-red-700">Bulletin non reconnu</p>
            <p className="mt-2 text-sm text-ink-600">
              Ce code ne correspond à aucun bulletin valide. Le document n’a pas été émis par Équipe360, ou il a été remplacé par une version plus récente.
              Ne vous fiez pas à ce bulletin.
            </p>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            {res.state === 'valid' ? (
              <div className="flex items-center gap-3 bg-emerald-600 px-5 py-4 text-white">
                <CheckCircle2 className="size-8 shrink-0" />
                <div>
                  <p className="text-lg font-semibold">Bulletin authentique</p>
                  <p className="text-sm text-white/85">Paie validée par l’employeur le {formatDate(res.validated_at)}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 bg-amber-500 px-5 py-4 text-white">
                <AlertTriangle className="size-8 shrink-0" />
                <div>
                  <p className="text-lg font-semibold">Bulletin plus valable</p>
                  <p className="text-sm text-white/90">L’employeur a rouvert la paie de ce mois : demandez le bulletin à jour.</p>
                </div>
              </div>
            )}
            <dl className="divide-y divide-ink-100 px-5">
              {[
                ['Employeur', res.company_name],
                ['Employé(e)', res.employee_name],
                ['Poste', res.job_title ?? '—'],
                ['Période', periodLabel(res.period)],
                ['Salaire de base', formatGNF(res.base_salary)],
                ['Salaire brut', formatGNF(res.gross)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-2.5 text-sm">
                  <dt className="text-ink-500">{k}</dt>
                  <dd className="text-right font-medium first-letter:uppercase">{v}</dd>
                </div>
              ))}
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="font-semibold">Net à payer</dt>
                <dd className="tabular text-xl font-bold">{formatGNF(res.net)}</dd>
              </div>
            </dl>
            <p className="border-t border-ink-100 bg-ink-50 px-5 py-3 text-xs text-ink-600">
              Comparez ces montants avec le bulletin papier : s’ils sont différents, le bulletin a été modifié et ne doit pas être accepté.
            </p>
          </Card>
        )}
        <p className="mt-6 text-center text-xs text-ink-400">Équipe360 · gestion du personnel, pointage et paie</p>
      </div>
    </div>
  )
}
