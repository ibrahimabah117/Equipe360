import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, CalendarCheck2, CalendarDays, Check, KeyRound, MapPin, MapPinOff, QrCode, Upload, UserCheck, UserX, Users } from 'lucide-react'
import { addDays, conakryInstant, dayLong, today } from '../lib/dates'
import { supabase } from '../lib/supabase'
import { useCompany } from '../lib/company'
import { formatDate, formatGNF, isTrial, sectorLabel } from '../lib/format'
import { Badge, Card, cx, PageHeader, PageLoader, StatCard } from '../ui'

interface Stats {
  employees: number
  sites: number
  sitesNoGps: number
  accounts: number
  agentsWithAccess: number
  todayShifts: number
  todayAbsent: number
  todayUncovered: number
  todayPresent: number
  upcomingEntries: number
}

export default function Dashboard() {
  const { company, role } = useCompany()
  const [s, setS] = useState<Stats | null>(null)

  useEffect(() => {
    ;(async () => {
      const d = today()
      const [emp, sites, members, todayEntries, needs, upcoming, punches] = await Promise.all([
        supabase.from('employees').select('id', { count: 'exact', head: true }).eq('company_id', company.id).eq('active', true),
        supabase.from('sites').select('latitude').eq('company_id', company.id).eq('active', true),
        supabase.from('company_members').select('role, employee_id').eq('company_id', company.id),
        supabase.from('schedule_entries').select('site_id, shift_type_id, status').eq('company_id', company.id).eq('work_date', d),
        supabase.from('site_shift_needs').select('site_id, shift_type_id, headcount').eq('company_id', company.id),
        supabase.from('schedule_entries').select('id', { count: 'exact', head: true }).eq('company_id', company.id).gte('work_date', d).lte('work_date', addDays(d, 13)),
        supabase.from('punches').select('employee_id').eq('company_id', company.id).eq('kind', 'in').gte('punched_at', new Date(conakryInstant(d, '00:00')).toISOString()),
      ])
      const te = todayEntries.data ?? []
      let uncovered = 0
      for (const n of needs.data ?? []) {
        const present = te.filter((e) => e.site_id === n.site_id && e.shift_type_id === n.shift_type_id && e.status !== 'absent').length
        uncovered += Math.max(0, n.headcount - present)
      }
      const siteRows = sites.data ?? []
      const mem = members.data ?? []
      setS({
        employees: emp.count ?? 0,
        sites: siteRows.length,
        sitesNoGps: siteRows.filter((x) => x.latitude == null).length,
        accounts: mem.length,
        agentsWithAccess: mem.filter((m) => m.employee_id).length,
        todayShifts: te.filter((e) => e.status !== 'absent').length,
        todayAbsent: te.filter((e) => e.status === 'absent').length,
        todayUncovered: uncovered,
        upcomingEntries: upcoming.count ?? 0,
        todayPresent: new Set((punches.data ?? []).map((p) => p.employee_id)).size,
      })
    })()
  }, [company.id])

  const base = `/c/${company.id}`
  const hour = new Date().getHours()
  const hello = hour < 18 ? 'Bonjour' : 'Bonsoir'

  if (!s) return <PageLoader />

  const steps = [
    { done: s.sites > 0, title: 'Ajouter vos sites', text: 'Les lieux gardés : banque, ambassade, entrepôt…', to: `${base}/sites`, icon: MapPin },
    { done: s.sitesNoGps === 0 && s.sites > 0, title: 'Enregistrer la position GPS', text: 'Pour vérifier que l’agent pointe bien sur place.', to: `${base}/sites`, icon: MapPinOff },
    { done: s.employees > 0, title: 'Importer vos employés', text: 'Depuis un fichier Excel ou un par un.', to: `${base}/employes`, icon: Upload },
    { done: false, title: 'Imprimer les QR codes', text: 'Un code à afficher dans chaque site.', to: `${base}/sites/qr`, icon: QrCode },
    { done: s.upcomingEntries > 0, title: 'Préparer le planning', text: 'Générez les gardes en un clic avec un cycle jour/nuit.', to: `${base}/planning`, icon: CalendarDays },
    { done: s.agentsWithAccess > 0, title: 'Donner les accès', text: 'Numéro + mot de passe, envoyés par WhatsApp.', to: `${base}/acces`, icon: KeyRound },
  ]
  const progress = steps.filter((x) => x.done).length

  return (
    <>
      <PageHeader
        title={`${hello} 👋`}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {company.name} · {sectorLabel(company.sector)}
            {role === 'admin' && <Badge tone="brand">Vue administrateur</Badge>}
          </span>
        }
      />

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard icon={Users} label="Employés actifs" value={s.employees} />
        <StatCard icon={MapPin} label="Sites actifs" value={s.sites} tone="green" />
        <StatCard
          icon={MapPinOff}
          label="Sites sans GPS"
          value={s.sitesNoGps}
          tone={s.sitesNoGps ? 'amber' : 'green'}
          sub={s.sitesNoGps ? 'À compléter' : 'Tout est en ordre'}
        />
        <StatCard icon={KeyRound} label="Comptes d’accès" value={s.accounts} sub={`${s.agentsWithAccess} liés à un employé`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
            <div>
              <h2 className="font-semibold">Mise en route</h2>
              <p className="text-sm text-ink-500">{progress} étape{progress > 1 ? 's' : ''} sur {steps.length}</p>
            </div>
            <div className="h-2 w-32 overflow-hidden rounded-full bg-ink-100">
              <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${(progress / steps.length) * 100}%` }} />
            </div>
          </div>
          <ul className="divide-y divide-ink-100">
            {steps.map((st) => (
              <li key={st.title}>
                <Link to={st.to} className="group flex items-center gap-4 px-5 py-4 hover:bg-ink-50/60">
                  <span
                    className={cx(
                      'flex size-9 shrink-0 items-center justify-center rounded-full',
                      st.done ? 'bg-emerald-500 text-white' : 'bg-ink-100 text-ink-500',
                    )}
                  >
                    {st.done ? <Check className="size-4" strokeWidth={3} /> : <st.icon className="size-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cx('block text-sm font-medium', st.done ? 'text-ink-500 line-through decoration-ink-300' : 'text-ink-900')}>
                      {st.title}
                    </span>
                    <span className="block text-xs text-ink-500">{st.text}</span>
                  </span>
                  <ArrowRight className="size-4 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-500" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="bg-ink-900 p-5 text-white">
              <p className="text-xs font-medium tracking-wide text-white/50 uppercase">Abonnement</p>
              <p className="mt-1 text-lg font-semibold">{isTrial(company) ? 'Mois d’essai gratuit' : 'Équipe360 Pro'}</p>
              <p className="mt-3 text-sm text-white/70">
                {company.paid_until ? <>Valable jusqu’au <span className="font-medium text-white">{formatDate(company.paid_until)}</span></> : 'Échéance non définie'}
              </p>
            </div>
            <div className="p-5 text-sm text-ink-600">
              {isTrial(company)
                ? `Ensuite ${formatGNF(company.monthly_price)} par mois. Pour continuer, contactez l’équipe Équipe360 sur WhatsApp.`
                : 'Pour renouveler, contactez l’équipe Équipe360 sur WhatsApp.'}
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
              <div>
                <h2 className="font-semibold">Aujourd’hui</h2>
                <p className="text-sm text-ink-500 capitalize">{dayLong(today())}</p>
              </div>
              <Link to={`${base}/pointages`} className="text-sm font-medium text-brand-600 hover:text-brand-700">Pointages</Link>
            </div>
            <ul className="divide-y divide-ink-100 text-sm">
              {[
                { icon: CalendarCheck2, label: 'Gardes prévues', value: s.todayShifts, tone: 'text-brand-600 bg-brand-50' },
                { icon: UserCheck, label: 'Agents arrivés (pointage)', value: s.todayPresent, tone: 'text-emerald-600 bg-emerald-50' },
                { icon: UserX, label: 'Absences', value: s.todayAbsent, tone: s.todayAbsent ? 'text-amber-600 bg-amber-50' : 'text-emerald-600 bg-emerald-50' },
                { icon: AlertTriangle, label: 'Postes non couverts', value: s.todayUncovered, tone: s.todayUncovered ? 'text-red-600 bg-red-50' : 'text-emerald-600 bg-emerald-50' },
              ].map((r) => (
                <li key={r.label} className="flex items-center gap-3 px-5 py-3">
                  <span className={cx('flex size-8 items-center justify-center rounded-lg', r.tone)}><r.icon className="size-4" /></span>
                  <span className="flex-1 text-ink-700">{r.label}</span>
                  <span className="tabular text-base font-semibold">{r.value}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  )
}
