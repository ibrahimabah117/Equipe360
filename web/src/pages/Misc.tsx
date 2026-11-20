import { isBreak, KIND_LABEL } from '../lib/punchKinds'
import { useVocab } from '../lib/sector'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Building2, CalendarX2, CheckCircle2, ChevronRight, CloudOff, Coffee, FileText, LogIn, LogOut, MapPinOff, PauseCircle, ScanLine, ShieldX } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useCompany } from '../lib/company'
import { supabase, type Employee, type Punch, type ScheduleEntry, type ShiftType, type Site } from '../lib/supabase'
import { cacheGet, cacheSet, clearFailed, isNetworkError, syncQueue, usePunchQueue } from '../lib/offline'
import { addDays, dateAt, dayLong, timeAt, today } from '../lib/dates'
import { ABSENCE_LABELS, hhmm, ShiftIcon, shiftTone, toneClasses } from './planning/common'
import { formatDate, formatGNF, ROLE_LABELS, sectorLabel } from '../lib/format'
import { periodLabel } from '../lib/payroll'
import { Avatar, Badge, Button, Callout, Card, cx, PageHeader, PageLoader } from '../ui'
import { Logo } from '../ui/Logo'
import { SupportWhatsApp } from '../ui/SupportWhatsApp'

function CenterCard({ icon: Icon, title, text, tone = 'brand', action }: { icon: typeof ShieldX; title: string; text: string; tone?: 'brand' | 'red' | 'amber'; action?: ReactNode }) {
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
        {action && <div className="mt-5 flex justify-center">{action}</div>}
        <Button variant="secondary" icon={LogOut} className="mt-6" onClick={signOut}>Se déconnecter</Button>
      </Card>
    </div>
  )
}

interface AccessRow {
  company_id: string
  company_name: string
  role: string
  paid_until: string | null
  blocked: 'suspended' | 'expired' | null
}

/** Entreprise inaccessible : abonnement expiré (blocage automatique) ou suspension manuelle */
function Blocked() {
  const [rows, setRows] = useState<AccessRow[] | null>(null)
  useEffect(() => {
    supabase.rpc('my_access').then(({ data }) => setRows((data as AccessRow[] | null) ?? []))
  }, [])
  if (!rows) return <PageLoader />
  const expired = rows.find((r) => r.blocked === 'expired')
  if (expired) {
    const boss = expired.role === 'owner' || expired.role === 'manager'
    return (
      <CenterCard
        icon={CalendarX2}
        tone="red"
        title="Abonnement expiré"
        text={
          boss
            ? `L’abonnement de ${expired.company_name} a pris fin le ${formatDate(expired.paid_until)}. L’accès est coupé pour toute l’équipe jusqu’au paiement. Vos données sont conservées : contactez l’équipe Équipe360 sur WhatsApp pour renouveler, l’accès revient aussitôt.`
            : `L’accès de ${expired.company_name} à Équipe360 est coupé car l’abonnement n’est pas payé. Prévenez votre responsable. Vos pointages sont conservés.`
        }
        action={boss ? <SupportWhatsApp className="sm:items-center" label="Renouveler sur WhatsApp" message={`Bonjour Équipe360, je souhaite renouveler l’abonnement de ${expired.company_name}.`} /> : undefined}
      />
    )
  }
  if (rows.some((r) => r.blocked === 'suspended')) {
    return (
      <CenterCard
        icon={PauseCircle}
        tone="amber"
        title="Compte suspendu"
        text="L’accès de votre entreprise à Équipe360 est temporairement suspendu. Contactez votre responsable ou l’équipe Équipe360."
        action={<SupportWhatsApp className="sm:items-center" message="Bonjour Équipe360, l’accès de mon entreprise est suspendu. Pouvez-vous m’aider ?" />}
      />
    )
  }
  return <CenterCard icon={ShieldX} tone="red" title="Accès impossible" text="Vérifiez votre connexion Internet, puis rouvrez l’application." />
}

/** Page d'accueil après connexion : redirige vers la bonne entreprise */
export function Home() {
  const { isAdmin, memberships } = useAuth()
  if (isAdmin) return <Navigate to="/admin" replace />
  const usable = memberships.filter((m) => m.company)
  if (memberships.length && !usable.length) return <Blocked />
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
  // Membre de cette entreprise mais elle n'est plus lisible : abonnement expiré ou suspendu
  const member = memberships.some((m) => m.company_id === companyId)
  return member ? (
    <Blocked />
  ) : (
    <CenterCard icon={ShieldX} tone="red" title="Entreprise introuvable" text="Cette entreprise n’existe pas ou vous n’y avez pas accès." />
  )
}

/** Espace de l'agent : pointer, voir ses gardes et ses derniers pointages (fonctionne hors ligne) */
export function AgentHome() {
  const { company, employeeId } = useCompany()
  const v = useVocab()
  const { queue, failed, syncing } = usePunchQueue()
  const cacheKey = `agent.${company.id}.${employeeId}`
  const [d, setD] = useState<AgentData | null>(() => cacheGet<AgentData>(cacheKey))
  const [loading, setLoading] = useState(!d)

  useEffect(() => {
    ;(async () => {
      if (!employeeId) return setLoading(false)
      const since = new Date(Date.now() - 48 * 3600e3).toISOString()
      const [em, en, sh, si, pu, ps] = await Promise.all([
        supabase.from('employees').select('*').eq('id', employeeId).maybeSingle(),
        supabase.from('schedule_entries').select('*').eq('employee_id', employeeId)
          .gte('work_date', addDays(today(), -1)).lte('work_date', addDays(today(), 13)).order('work_date'),
        supabase.from('shift_types').select('*').eq('company_id', company.id),
        supabase.from('sites').select('*').eq('company_id', company.id),
        supabase.from('punches').select('*').eq('employee_id', employeeId).gte('punched_at', since).order('punched_at', { ascending: false }),
        supabase.from('payslips').select('id, net, run:payroll_runs(period, status)').eq('employee_id', employeeId),
      ])
      if (isNetworkError(em.error)) return setLoading(false) // hors ligne : on garde le cache
      const next: AgentData = {
        emp: em.data as Employee | null,
        upcoming: ((en.data ?? []) as ScheduleEntry[]).filter((e) => e.work_date >= today()),
        shifts: Object.fromEntries(((sh.data ?? []) as ShiftType[]).map((x) => [x.id, x])),
        sites: Object.fromEntries(((si.data ?? []) as Site[]).map((x) => [x.id, x])),
        punches: (pu.data ?? []) as Punch[],
        payslips: ((ps.data ?? []) as unknown as { id: string; net: number; run: { period: string; status: string } | null }[])
          .filter((x) => x.run?.status === 'validated')
          .map((x) => ({ id: x.id, net: Number(x.net), period: x.run!.period }))
          .sort((a, b) => b.period.localeCompare(a.period))
          .slice(0, 12),
      }
      // Les QR codes des sites restent reconnus sans réseau
      const byToken = cacheGet<Record<string, unknown>>('sitesByToken') ?? {}
      for (const x of (si.data ?? []) as Site[]) if (x.active) byToken[x.qr_token] = { id: x.id, company_id: x.company_id, name: x.name, zone: x.zone, latitude: x.latitude, longitude: x.longitude, radius_m: x.radius_m }
      cacheSet('sitesByToken', byToken)
      cacheSet(cacheKey, next)
      setD(next)
      setLoading(false)
    })()
  }, [employeeId, company.id, cacheKey, queue.length])

  if (loading) return <PageLoader />
  if (!employeeId) {
    return (
      <div className="mx-auto max-w-md">
        <PageHeader title="Mon espace" description={company.name} />
        <Callout tone="warning" title="Compte non lié">Votre compte n’est lié à aucune fiche employé. Demandez à votre responsable de le faire.</Callout>
      </div>
    )
  }
  const emp = d?.emp
  const site = emp?.default_site_id ? d?.sites[emp.default_site_id] : undefined
  const todayEntries = (d?.upcoming ?? []).filter((e) => e.work_date === today())

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-5 flex items-center gap-3">
        <Avatar name={emp?.full_name} size="lg" />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">{emp?.full_name ?? v.Worker}</h1>
          <p className="truncate text-sm text-ink-500">{emp?.job_title ?? ''}{site ? ` · ${site.name}` : ''}</p>
        </div>
      </div>

      <Link to="/scan" className="block">
        <div className="flex items-center gap-4 rounded-2xl bg-brand-500 p-5 text-white shadow-lg shadow-brand-500/30 transition-transform active:scale-[0.98]">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-white/15">
            <ScanLine className="size-7" />
          </span>
          <span className="flex-1">
            <span className="block text-lg font-semibold">Pointer</span>
            <span className="block text-sm text-white/80">Scanner le QR code {v.duSite}</span>
          </span>
          <ChevronRight className="size-5 text-white/70" />
        </div>
      </Link>

      {queue.length > 0 && (
        <div className="mt-3">
          <Callout tone="warning" title={`${queue.length} pointage${queue.length > 1 ? 's' : ''} en attente d’envoi`}>
            {syncing ? 'Envoi en cours…' : 'Ils partiront automatiquement dès que le réseau revient.'}{' '}
            <button className="font-medium underline" onClick={() => syncQueue()}>Réessayer</button>
          </Callout>
        </div>
      )}
      {failed.length > 0 && (
        <div className="mt-3">
          <Callout tone="danger" title="Pointage refusé par le serveur">
            {failed.map((f) => `${KIND_LABEL[f.kind]} ${timeAt(f.punched_at)} : ${f.error}`).join(' · ')}{' '}
            <button className="font-medium underline" onClick={clearFailed}>Masquer</button>
          </Callout>
        </div>
      )}

      {todayEntries.length > 0 && (
        <Card className="mt-4 p-5">
          <p className="text-xs font-medium tracking-wide text-ink-400 uppercase">Aujourd’hui</p>
          {todayEntries.map((e) => {
            const sh = d!.shifts[e.shift_type_id]
            if (!sh) return null
            const tone = shiftTone(sh)
            return (
              <div key={e.id} className="mt-3 flex items-center gap-3">
                <span className={cx('flex size-11 items-center justify-center rounded-xl ring-1 ring-inset', toneClasses[tone])}>
                  <ShiftIcon tone={tone} className="size-5" />
                </span>
                <div className="flex-1">
                  <p className="font-semibold">{sh.label} · {hhmm(sh.start_time)}–{hhmm(sh.end_time)}</p>
                  <p className="text-sm text-ink-500">{d!.sites[e.site_id]?.name ?? '—'}</p>
                </div>
                {e.status === 'absent' && <Badge tone="red">{e.absence_kind ? ABSENCE_LABELS[e.absence_kind] : 'Absent'}</Badge>}
              </div>
            )
          })}
        </Card>
      )}

      <Card className="mt-4">
        <div className="border-b border-ink-100 px-5 py-4">
          <h2 className="font-semibold">Mes derniers pointages</h2>
        </div>
        {(d?.punches.length ?? 0) + queue.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-ink-500">Aucun pointage ces 2 derniers jours.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {queue.filter((q) => !q.employee_id).map((q) => (
              <li key={q.client_id} className="flex items-center gap-3 px-5 py-3 text-sm">
                {q.kind === 'in' ? <LogIn className="size-4 text-emerald-500" /> : isBreak(q.kind) ? <Coffee className="size-4 text-amber-500" /> : <LogOut className="size-4 text-brand-500" />}
                <span className="flex-1">{KIND_LABEL[q.kind]} · {q.site_name ?? 'Site'}</span>
                <span className="tabular font-medium">{timeAt(q.punched_at)}</span>
                <CloudOff className="size-4 text-amber-500" />
              </li>
            ))}
            {d?.punches.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                {p.kind === 'in' ? <LogIn className="size-4 text-emerald-500" /> : isBreak(p.kind) ? <Coffee className="size-4 text-amber-500" /> : <LogOut className="size-4 text-brand-500" />}
                <span className="flex-1 truncate">
                  {KIND_LABEL[p.kind]} · {d.sites[p.site_id]?.name ?? 'Site'}
                  <span className="ml-1 text-xs text-ink-400">{dateAt(p.punched_at) === today() ? '' : dayLong(dateAt(p.punched_at))}</span>
                </span>
                <span className="tabular font-medium">{timeAt(p.punched_at)}</span>
                {p.gps_ok ? <CheckCircle2 className="size-4 text-emerald-500" /> : <MapPinOff className="size-4 text-amber-500" />}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {(d?.payslips?.length ?? 0) > 0 && (
        <Card className="mt-4">
          <div className="border-b border-ink-100 px-5 py-4">
            <h2 className="font-semibold">Mes fiches de paie</h2>
          </div>
          <ul className="divide-y divide-ink-100">
            {d!.payslips!.map((p) => (
              <li key={p.id}>
                <Link to={`/c/${company.id}/paie/${p.period}/fiches`} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-ink-50">
                  <FileText className="size-4 text-brand-500" />
                  <span className="flex-1 font-medium capitalize">{periodLabel(p.period)}</span>
                  <span className="tabular font-semibold">{formatGNF(p.net)}</span>
                  <ChevronRight className="size-4 text-ink-300" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mt-4">
        <div className="border-b border-ink-100 px-5 py-4">
          <h2 className="font-semibold">Mes prochain{v.sx(2)} {v.shifts}</h2>
          <p className="text-sm text-ink-500">14 prochains jours</p>
        </div>
        {!d?.upcoming.length ? (
          <p className="px-5 py-6 text-center text-sm text-ink-500">{v.AucunShift} prévu{v.sx()} pour le moment.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {d.upcoming.map((e) => {
              const sh = d.shifts[e.shift_type_id]
              if (!sh) return null
              const tone = shiftTone(sh)
              return (
                <li key={e.id} className={cx('flex items-center gap-3 px-5 py-3', e.work_date === today() && 'bg-brand-50/50')}>
                  <span className={cx('flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset', toneClasses[tone])}>
                    <ShiftIcon tone={tone} className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium capitalize">{e.work_date === today() ? 'Aujourd’hui' : dayLong(e.work_date)}</p>
                    <p className="truncate text-xs text-ink-500">
                      {sh.label} {hhmm(sh.start_time)}–{hhmm(sh.end_time)} · {d.sites[e.site_id]?.name ?? '—'}
                    </p>
                  </div>
                  {e.status === 'absent' && <Badge tone="red">{e.absence_kind ? ABSENCE_LABELS[e.absence_kind] : 'Absent'}</Badge>}
                  {e.status === 'replacement' && <Badge tone="brand">Remplacement</Badge>}
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}

interface AgentData {
  emp: Employee | null
  upcoming: ScheduleEntry[]
  shifts: Record<string, ShiftType>
  sites: Record<string, Site>
  punches: Punch[]
  payslips?: { id: string; net: number; period: string }[]
}
