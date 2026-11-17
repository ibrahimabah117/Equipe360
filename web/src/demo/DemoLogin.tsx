import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Building2, ShieldCheck, Smartphone, UserCog } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { cx, Spinner } from '../ui'
import { Logo } from '../ui/Logo'
import { demoTokens, type DemoRole } from './store'

const ROLES: { role: DemoRole; icon: typeof ShieldCheck; title: string; who: string; text: string }[] = [
  { role: 'owner', icon: Building2, title: 'Patron de la société', who: 'Thierno Bah · Sécurité Plus SARL', text: 'Tableau de bord, planning des gardes, pointages, paie et fiches de paie.' },
  { role: 'manager', icon: UserCog, title: 'Chef de poste', who: 'Fatoumata Camara', text: 'Suivre les arrivées du jour, gérer absences et remplaçants, pointer pour un agent.' },
  { role: 'agent', icon: Smartphone, title: 'Agent de sécurité', who: 'Ibrahima Sow · sur téléphone', text: 'Pointer avec le QR code du site, voir ses gardes et ses fiches de paie.' },
  { role: 'admin', icon: ShieldCheck, title: 'Vous — Équipe360', who: 'Administrateur de la plateforme', text: 'Vos clients, leurs abonnements, les impayés et le revenu mensuel.' },
]

export default function DemoLogin(_props: { hint?: string }) {
  void _props
  const navigate = useNavigate()
  const [busy, setBusy] = useState<DemoRole | null>(null)

  async function enter(role: DemoRole) {
    setBusy(role)
    navigate('/')
    await supabase.auth.setSession(demoTokens(role))
  }

  return (
    <div className="min-h-full bg-ink-900">
      <div className="relative mx-auto flex min-h-full max-w-5xl flex-col px-5 py-10 sm:px-8">
        <div className="pointer-events-none absolute -top-20 right-0 size-[420px] rounded-full bg-brand-500/25 blur-3xl" />
        <Logo dark className="relative" />
        <div className="relative mt-12 max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80 ring-1 ring-white/15">
            <span className="size-1.5 rounded-full bg-amber-400" /> Démonstration · données fictives
          </p>
          <h1 className="mt-4 text-3xl leading-tight font-semibold tracking-tight text-white sm:text-4xl">
            Planning, pointage QR + GPS et paie en GNF pour les sociétés de gardiennage.
          </h1>
          <p className="mt-3 text-[15px] text-white/60">
            Découvrez Équipe360 avec une société fictive de 12 agents sur 4 sites à Conakry. Choisissez un rôle :
            vous pouvez tout essayer, rien n’est enregistré.
          </p>
        </div>

        <div className="relative mt-10 grid gap-3 sm:grid-cols-2">
          {ROLES.map((r) => (
            <button
              key={r.role}
              onClick={() => enter(r.role)}
              disabled={!!busy}
              className={cx(
                'group flex items-start gap-4 rounded-2xl bg-white p-5 text-left shadow-pop transition-transform hover:-translate-y-0.5 disabled:opacity-70',
                r.role === 'admin' && 'bg-white/[0.06] text-white ring-1 ring-white/15',
              )}
            >
              <span className={cx('flex size-11 shrink-0 items-center justify-center rounded-xl', r.role === 'admin' ? 'bg-white/10 text-brand-300' : 'bg-brand-50 text-brand-600')}>
                <r.icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cx('block font-semibold', r.role === 'admin' ? 'text-white' : 'text-ink-900')}>{r.title}</span>
                <span className={cx('block text-xs', r.role === 'admin' ? 'text-white/50' : 'text-ink-500')}>{r.who}</span>
                <span className={cx('mt-2 block text-sm', r.role === 'admin' ? 'text-white/70' : 'text-ink-600')}>{r.text}</span>
              </span>
              {busy === r.role ? <Spinner className="mt-1" /> : <ArrowRight className={cx('mt-1 size-5 transition-transform group-hover:translate-x-0.5', r.role === 'admin' ? 'text-white/40' : 'text-ink-300')} />}
            </button>
          ))}
        </div>
        <p className="relative mt-8 text-xs text-white/40">Astuce : ouvrez le rôle « Agent » sur un téléphone pour voir l’écran de pointage tel que vos agents l’utiliseront.</p>
      </div>
    </div>
  )
}

export function DemoBar() {
  return (
    <div className="no-print fixed right-3 bottom-3 z-[55] flex items-center gap-2 rounded-full bg-amber-400 py-1 pr-1 pl-3 text-xs font-medium text-amber-950 shadow-pop">
      Démo · données fictives
      <button onClick={() => supabase.auth.signOut()} className="rounded-full bg-amber-950 px-2.5 py-1 text-[11px] font-semibold text-amber-50 hover:bg-amber-900">
        Changer de rôle
      </button>
    </div>
  )
}
