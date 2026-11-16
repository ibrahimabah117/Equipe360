import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, KeyRound, MapPin, MapPinOff, QrCode, Upload, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../lib/company'
import { formatDate, sectorLabel } from '../lib/format'
import { Badge, Card, cx, PageHeader, PageLoader, StatCard } from '../ui'

interface Stats {
  employees: number
  sites: number
  sitesNoGps: number
  accounts: number
  agentsWithAccess: number
}

export default function Dashboard() {
  const { company, role } = useCompany()
  const [s, setS] = useState<Stats | null>(null)

  useEffect(() => {
    ;(async () => {
      const [emp, sites, members] = await Promise.all([
        supabase.from('employees').select('id', { count: 'exact', head: true }).eq('company_id', company.id).eq('active', true),
        supabase.from('sites').select('latitude').eq('company_id', company.id).eq('active', true),
        supabase.from('company_members').select('role, employee_id').eq('company_id', company.id),
      ])
      const siteRows = sites.data ?? []
      const mem = members.data ?? []
      setS({
        employees: emp.count ?? 0,
        sites: siteRows.length,
        sitesNoGps: siteRows.filter((x) => x.latitude == null).length,
        accounts: mem.length,
        agentsWithAccess: mem.filter((m) => m.employee_id).length,
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
              <p className="mt-1 text-lg font-semibold">Équipe360 Pro</p>
              <p className="mt-3 text-sm text-white/70">
                {company.paid_until ? <>Valable jusqu’au <span className="font-medium text-white">{formatDate(company.paid_until)}</span></> : 'Échéance non définie'}
              </p>
            </div>
            <div className="p-5 text-sm text-ink-600">
              Pour renouveler, contactez l’équipe Équipe360 sur WhatsApp.
            </div>
          </Card>

          <Card className="p-5">
            <p className="text-xs font-medium tracking-wide text-ink-400 uppercase">Prochainement</p>
            <ul className="mt-3 space-y-3 text-sm">
              {[
                ['Planning des gardes', 'Jour / nuit, absences, remplaçants'],
                ['Pointage QR + GPS', 'Fonctionne même hors connexion'],
                ['Paie en GNF', 'Calcul automatique et fiches PDF'],
              ].map(([t, d]) => (
                <li key={t} className="flex gap-3">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" />
                  <span>
                    <span className="font-medium text-ink-900">{t}</span>
                    <span className="block text-xs text-ink-500">{d}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  )
}
