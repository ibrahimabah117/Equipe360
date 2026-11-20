import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { ChangePasswordModal } from '../ui/ChangePassword'
import {
  Building2,
  CalendarDays,
  ChevronsUpDown,
  ClipboardList,
  Clock,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  ScanLine,
  Settings,
  ShieldCheck,
  User,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { formatPhone, PHONE_DOMAIN, ROLE_LABELS } from '../lib/format'
import { Avatar, cx } from '../ui'
import { Logo } from '../ui/Logo'
import { vocabFor } from '../lib/sector'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  soon?: boolean
  end?: boolean
}

function NavGroup({ title, items, onNavigate }: { title?: string; items: NavItem[]; onNavigate: () => void }) {
  return (
    <div>
      {title && (
        <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-white/35 uppercase">{title}</p>
      )}
      <ul className="space-y-0.5">
        {items.map((it) =>
          it.soon ? (
            <li key={it.label}>
              <span className="flex h-9 cursor-default items-center gap-3 rounded-lg px-3 text-sm text-white/30">
                <it.icon className="size-[18px]" />
                <span className="flex-1">{it.label}</span>
                <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-white/40">
                  Bientôt
                </span>
              </span>
            </li>
          ) : (
            <li key={it.to}>
              <NavLink
                to={it.to}
                end={it.end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cx(
                    'flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors',
                    isActive
                      ? 'bg-white/10 font-medium text-white shadow-[inset_2px_0_0_0_var(--color-brand-400)]'
                      : 'text-white/65 hover:bg-white/5 hover:text-white',
                  )
                }
              >
                <it.icon className="size-[18px]" />
                {it.label}
              </NavLink>
            </li>
          ),
        )}
      </ul>
    </div>
  )
}

export function AppShell({
  companyId,
  companyName,
  companySector,
  role,
  children,
}: {
  companyId?: string
  companyName?: string
  companySector?: string
  role?: string
  children: ReactNode
}) {
  const { session, isAdmin, memberships, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [changingPw, setChangingPw] = useState(false)
  const location = useLocation()
  useEffect(() => setOpen(false), [location.pathname])

  const base = companyId ? `/c/${companyId}` : ''
  const v = vocabFor(companySector)
  const manage = role === 'admin' || role === 'owner' || role === 'manager'

  const companyNav: NavItem[] = manage
    ? [
        { to: base, label: 'Tableau de bord', icon: LayoutDashboard, end: true },
        { to: `${base}/planning`, label: 'Planning', icon: CalendarDays },
        { to: `${base}/pointages`, label: 'Pointages', icon: Clock },
        { to: `${base}/rapport`, label: 'Rapport d’assiduité', icon: ClipboardList },
        { to: `${base}/paie`, label: 'Paie', icon: Wallet },
        { to: `${base}/employes`, label: v.Workers, icon: Users },
        { to: `${base}/sites`, label: `${v.Sites} & QR codes`, icon: MapPin },
        { to: `${base}/acces`, label: 'Comptes d’accès', icon: KeyRound },
      ]
    : [
        { to: `${base}/moi`, label: 'Mon espace', icon: User },
        { to: '/scan', label: 'Pointer', icon: ScanLine },
      ]
  const soonNav: NavItem[] = []

  const email = session?.user.email ?? ''
  const isPhone = email.endsWith('@' + PHONE_DOMAIN)
  const meta = session?.user.user_metadata as { display_name?: string } | undefined
  const who = meta?.display_name || (isPhone ? formatPhone(email.split('@')[0]) : email)
  const whoSub = isAdmin ? 'Administrateur Équipe360' : role ? (role === 'agent' ? v.Worker : ROLE_LABELS[role]) : ''
  const multiCompany = isAdmin || memberships.length > 1

  const sidebar = (
    <div className="e360-sidebar flex h-full flex-col bg-ink-900 text-white">
      <div className="flex h-16 items-center justify-between px-5">
        <Link to="/">
          <Logo dark />
        </Link>
        <button className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 lg:hidden" onClick={() => setOpen(false)}>
          <X className="size-5" />
        </button>
      </div>

      {companyName && (
        <div className="px-3 pb-2">
          <Link
            to={multiCompany ? (isAdmin ? '/admin' : '/') : base}
            className={cx(
              'flex items-center gap-3 rounded-xl bg-white/5 p-2.5 ring-1 ring-white/10',
              multiCompany && 'hover:bg-white/10',
            )}
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand-500 text-xs font-bold">
              {companyName.slice(0, 2).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{companyName}</span>
              <span className="block text-[11px] text-white/45">Entreprise</span>
            </span>
            {multiCompany && <ChevronsUpDown className="size-4 text-white/40" />}
          </Link>
        </div>
      )}

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {isAdmin && (
          <NavGroup
            title="Équipe360"
            onNavigate={() => setOpen(false)}
            items={[{ to: '/admin', label: 'Clients', icon: ShieldCheck, end: true }]}
          />
        )}
        {companyId && <NavGroup title={isAdmin ? 'Entreprise' : undefined} items={companyNav} onNavigate={() => setOpen(false)} />}
        {soonNav.length > 0 && <NavGroup title="Prochainement" items={soonNav} onNavigate={() => setOpen(false)} />}
        {companyId && manage && (
          <NavGroup
            items={[{ to: `${base}/parametres`, label: 'Paramètres', icon: Settings }]}
            onNavigate={() => setOpen(false)}
          />
        )}
        {!companyId && !isAdmin && (
          <NavGroup items={[{ to: '/', label: 'Mes entreprises', icon: Building2, end: true }]} onNavigate={() => setOpen(false)} />
        )}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-xl p-2">
          <Avatar name={who} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{who}</p>
            <p className="truncate text-[11px] text-white/45">{whoSub}</p>
          </div>
          <button
            onClick={() => setChangingPw(true)}
            title="Changer mon mot de passe"
            className="rounded-lg p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <KeyRound className="size-4" />
          </button>
          <button
            onClick={signOut}
            title="Se déconnecter"
            className="rounded-lg p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-full lg:pl-64 print:pl-0">
      {/* Barre latérale fixe (ordinateur) */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>

      {/* Tiroir (mobile) */}
      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/50" onClick={() => setOpen(false)} />
          <aside className="animate-in absolute inset-y-0 left-0 w-72 max-w-[85%]">{sidebar}</aside>
        </div>
      )}

      <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-ink-100 bg-white/85 px-4 backdrop-blur lg:hidden">
        <button className="-ml-1 rounded-lg p-2 text-ink-700 hover:bg-ink-100" onClick={() => setOpen(true)}>
          <Menu className="size-5" />
        </button>
        <Logo />
        {companyName && <span className="ml-auto truncate text-sm font-medium text-ink-500">{companyName}</span>}
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10 print:p-0">{children}</main>
      {changingPw && <ChangePasswordModal onClose={() => setChangingPw(false)} />}
    </div>
  )
}
