import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Building2, ChevronRight, Clock, LogOut, MapPin, PauseCircle, QrCode, ShieldX } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useCompany } from '../lib/company'
import { supabase, type Employee, type Site } from '../lib/supabase'
import { formatPhone, ROLE_LABELS, sectorLabel } from '../lib/format'
import { Avatar, Badge, Button, Card, PageHeader, PageLoader } from '../ui'
import { Logo } from '../ui/Logo'

function CenterCard({ icon: Icon, title, text, tone = 'brand' }: { icon: typeof ShieldX; title: string; text: string; tone?: 'brand' | 'red' | 'amber' }) {
  const { signOut } = useAuth()
  const cls = { brand: 'bg-brand-50 text-brand-600', red: 'bg-red-50 text-red-600', amber: 'bg-amber-50 text-amber-600' }[tone]
  return (
    <div className="flex min-h-full flex-col items-center justify-center p-6">
      <Logo className="mb-8" />
      <Card className="w-full max-w-md p-8 text-center">
        <span className={`mx-auto flex size-12 items-center justify-center rounded-2xl ${cls}`}>
          <Icon className="size-6" />
        </span>
        <h1 className="mt-4 text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-ink-500">{text}</p>
        <Button variant="secondary" icon={LogOut} className="mt-6" onClick={signOut}>Se déconnecter</Button>
      </Card>
    </div>
  )
}

/** Page d'accueil après connexion : redirige vers la bonne entreprise */
export function Home() {
  const { isAdmin, memberships } = useAuth()
  if (isAdmin) return <Navigate to="/admin" replace />
  const usable = memberships.filter((m) => m.company)
  if (memberships.length && !usable.length) {
    return (
      <CenterCard
        icon={PauseCircle}
        tone="amber"
        title="Compte suspendu"
        text="L’accès de votre entreprise à Équipe360 est temporairement suspendu. Contactez votre responsable ou l’équipe Équipe360."
      />
    )
  }
  if (!usable.length) {
    return (
      <CenterCard
        icon={ShieldX}
        tone="red"
        title="Aucun accès"
        text="Votre compte n’est rattaché à aucune entreprise. Demandez à votre responsable de vous donner un accès."
      />
    )
  }
  if (usable.length === 1) {
    const m = usable[0]
    return <Navigate to={m.role === 'agent' ? `/c/${m.company_id}/moi` : `/c/${m.company_id}`} replace />
  }
  return (
    <div className="flex min-h-full flex-col items-center justify-center p-6">
      <Logo className="mb-8" />
      <Card className="w-full max-w-md">
        <div className="border-b border-ink-100 px-5 py-4">
          <h1 className="font-semibold">Choisir une entreprise</h1>
        </div>
        <ul className="divide-y divide-ink-100">
          {usable.map((m) => (
            <li key={m.company_id}>
              <Link to={m.role === 'agent' ? `/c/${m.company_id}/moi` : `/c/${m.company_id}`} className="flex items-center gap-3 px-5 py-4 hover:bg-ink-50">
                <Building2 className="size-5 text-ink-400" />
                <span className="flex-1">
                  <span className="block font-medium">{m.company!.name}</span>
                  <span className="block text-xs text-ink-500">{ROLE_LABELS[m.role]} · {sectorLabel(m.company!.sector)}</span>
                </span>
                <ChevronRight className="size-4 text-ink-300" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

export function CompanyNotFound() {
  const { memberships } = useAuth()
  const { companyId } = useParams()
  const suspended = memberships.some((m) => m.company_id === companyId && !m.company)
  return suspended ? (
    <CenterCard icon={PauseCircle} tone="amber" title="Compte suspendu" text="L’accès de cette entreprise est temporairement suspendu. Contactez l’équipe Équipe360." />
  ) : (
    <CenterCard icon={ShieldX} tone="red" title="Entreprise introuvable" text="Cette entreprise n’existe pas ou vous n’y avez pas accès." />
  )
}

/** Espace de l'agent (le pointage arrive à l'étape 3) */
export function AgentHome() {
  const { company, employeeId } = useCompany()
  const [emp, setEmp] = useState<Employee | null>(null)
  const [site, setSite] = useState<Site | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      if (employeeId) {
        const { data } = await supabase.from('employees').select('*').eq('id', employeeId).maybeSingle()
        setEmp(data as Employee | null)
        if (data?.default_site_id) {
          const { data: s } = await supabase.from('sites').select('*').eq('id', data.default_site_id).maybeSingle()
          setSite(s as Site | null)
        }
      }
      setLoading(false)
    })()
  }, [employeeId])

  if (loading) return <PageLoader />
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Mon espace" description={company.name} />
      <Card className="overflow-hidden">
        <div className="flex items-center gap-4 bg-ink-900 p-5 text-white">
          <Avatar name={emp?.full_name} size="lg" />
          <div>
            <p className="font-semibold">{emp?.full_name ?? 'Agent'}</p>
            <p className="text-sm text-white/60">{emp?.job_title ?? '—'} · {formatPhone(emp?.phone)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-5">
          <MapPin className="size-5 text-brand-500" />
          <div>
            <p className="text-xs text-ink-500">Site d’affectation</p>
            <p className="font-medium">{site?.name ?? 'Non affecté'}</p>
          </div>
        </div>
      </Card>
      <Card className="mt-4 p-6 text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <QrCode className="size-7" />
        </span>
        <p className="mt-4 font-semibold">Pointage par QR code</p>
        <p className="mt-1 text-sm text-ink-500">
          Bientôt disponible : scannez le QR code du site à votre arrivée et à votre départ.
        </p>
        <Badge tone="brand"><Clock className="size-3" /> Prochaine mise à jour</Badge>
      </Card>
    </div>
  )
}

/** Ouverte en scannant un QR code de site */
export function PunchLanding() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center p-6">
      <Logo className="mb-8" />
      <Card className="w-full max-w-sm p-8 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <QrCode className="size-6" />
        </span>
        <h1 className="mt-4 text-lg font-semibold">QR code Équipe360 reconnu</h1>
        <p className="mt-2 text-sm text-ink-500">
          Le pointage depuis ce QR code sera activé dans la prochaine mise à jour de l’application.
        </p>
        <Link to="/"><Button className="mt-6 w-full">Ouvrir Équipe360</Button></Link>
      </Card>
    </div>
  )
}
