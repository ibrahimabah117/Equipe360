import { useState, type FormEvent } from 'react'
import { CalendarCheck2, Lock, Mail, MapPinned, QrCode, Smartphone, Wallet } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { phoneToEmail } from '../lib/format'
import { Button, Callout, cx, Field, Input } from '../ui'
import { Logo } from '../ui/Logo'

type Tab = 'phone' | 'email'

function translateAuthError(msg: string) {
  if (/invalid login credentials/i.test(msg)) return 'Identifiants incorrects. Vérifiez le numéro et le mot de passe.'
  if (/email not confirmed/i.test(msg)) return 'Adresse e-mail pas encore confirmée : ouvrez le lien reçu par e-mail.'
  if (/already registered/i.test(msg)) return 'Un compte existe déjà avec cette adresse. Connectez-vous.'
  if (/rate limit/i.test(msg)) return 'Trop de tentatives. Patientez quelques minutes.'
  if (/password should be/i.test(msg)) return 'Le mot de passe doit faire au moins 6 caractères.'
  return msg
}

export default function Login() {
  const [tab, setTab] = useState<Tab>('phone')
  const [signup, setSignup] = useState(false)
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    let login = email.trim().toLowerCase()
    if (tab === 'phone') {
      const m = phoneToEmail(phone)
      if (!m) return setError('Numéro invalide. Exemple : 622 12 34 56')
      login = m
    }
    setLoading(true)
    if (tab === 'email' && signup) {
      const { data, error } = await supabase.auth.signUp({
        email: login,
        password,
        options: { emailRedirectTo: window.location.origin },
      })
      setLoading(false)
      if (error) return setError(translateAuthError(error.message))
      if (!data.session) setInfo('Compte créé. Ouvrez le lien de confirmation reçu par e-mail, puis connectez-vous.')
      return
    }
    const { error } = await supabase.auth.signInWithPassword({ email: login, password })
    setLoading(false)
    if (error) setError(translateAuthError(error.message))
  }

  return (
    <div className="grid min-h-full lg:grid-cols-[1.05fr_1fr]">
      {/* Panneau de marque */}
      <div className="relative hidden overflow-hidden bg-ink-900 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />
        <div className="pointer-events-none absolute -top-40 -right-40 size-[520px] rounded-full bg-brand-500/25 blur-3xl" />
        <div className="relative">
          <Logo dark />
        </div>

        <div className="relative max-w-lg">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80 ring-1 ring-white/15">
            <span className="size-1.5 rounded-full bg-emerald-400" /> Conçu pour les entreprises de Guinée
          </p>
          <h1 className="text-4xl leading-[1.15] font-semibold tracking-tight text-white">
            Vos équipes sur le terrain, <span className="text-brand-300">sous contrôle</span>.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-white/60">
            Planning des gardes, pointage par QR code avec vérification GPS, absences et remplacements, paie en
            GNF — dans une seule application, même avec un réseau faible.
          </p>

          <div className="mt-10 grid grid-cols-2 gap-3">
            {[
              { icon: CalendarCheck2, t: 'Planning', d: 'Jour, nuit, remplaçants' },
              { icon: QrCode, t: 'Pointage QR', d: 'Un code par site' },
              { icon: MapPinned, t: 'Contrôle GPS', d: 'Présence vérifiée' },
              { icon: Wallet, t: 'Paie en GNF', d: 'Fiches prêtes à imprimer' },
            ].map((f) => (
              <div key={f.t} className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/10">
                <f.icon className="size-5 text-brand-300" />
                <p className="mt-3 text-sm font-medium text-white">{f.t}</p>
                <p className="text-xs text-white/50">{f.d}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-white/35">© {new Date().getFullYear()} Équipe360 · Conakry</p>
      </div>

      {/* Formulaire */}
      <div className="flex flex-col justify-center px-5 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Logo className="mb-10 lg:hidden" />
          <h2 className="text-2xl font-semibold tracking-tight">
            {tab === 'email' && signup ? 'Créer un compte administrateur' : 'Connexion'}
          </h2>
          <p className="mt-1.5 text-sm text-ink-500">
            {tab === 'phone'
              ? 'Utilisez le numéro et le mot de passe donnés par votre responsable.'
              : 'Accès réservé à l’équipe Équipe360.'}
          </p>

          <div className="mt-8 grid grid-cols-2 rounded-xl bg-ink-100 p-1 text-sm font-medium">
            {(
              [
                ['phone', 'Téléphone', Smartphone],
                ['email', 'Administrateur', Mail],
              ] as const
            ).map(([k, label, Icon]) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setTab(k)
                  setError(null)
                  setInfo(null)
                  setSignup(false)
                }}
                className={cx(
                  'flex h-9 items-center justify-center gap-2 rounded-lg transition-all',
                  tab === k ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800',
                )}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {tab === 'phone' ? (
              <Field label="Numéro de téléphone">
                <div className="flex">
                  <span className="inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-l-xl bg-ink-50 px-3 text-sm text-ink-500 ring-1 ring-ink-200 ring-inset">
                    🇬🇳 +224
                  </span>
                  <Input
                    className="rounded-l-none"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="622 12 34 56"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                </div>
              </Field>
            ) : (
              <Field label="Adresse e-mail">
                <Input
                  type="email"
                  autoComplete="email"
                  leading={<Mail className="size-4" />}
                  placeholder="vous@exemple.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Field>
            )}
            <Field label="Mot de passe">
              <Input
                type="password"
                autoComplete={signup ? 'new-password' : 'current-password'}
                leading={<Lock className="size-4" />}
                placeholder="••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </Field>

            {error && <Callout tone="danger">{error}</Callout>}
            {info && <Callout tone="success">{info}</Callout>}

            <Button type="submit" size="lg" className="w-full" loading={loading}>
              {tab === 'email' && signup ? 'Créer mon compte' : 'Se connecter'}
            </Button>
          </form>

          {tab === 'email' && (
            <p className="mt-6 text-center text-sm text-ink-500">
              {signup ? 'Déjà un compte ?' : 'Première connexion ?'}{' '}
              <button
                className="font-medium text-brand-600 hover:text-brand-700"
                onClick={() => {
                  setSignup(!signup)
                  setError(null)
                  setInfo(null)
                }}
              >
                {signup ? 'Se connecter' : 'Créer mon compte'}
              </button>
            </p>
          )}
          {tab === 'phone' && (
            <p className="mt-6 text-center text-xs text-ink-400">
              Mot de passe oublié ? Demandez à votre responsable de vous en donner un nouveau.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
