import { useState, type FormEvent } from 'react'
import { Eye, EyeOff, KeyRound, LogOut } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Button, Callout, Card, Field, Input, Modal, useToast } from './index'
import { Logo } from './Logo'

export const MIN_PASSWORD = 8

/** Vérifie un nouveau mot de passe ; renvoie un message d'erreur ou null */
export function passwordProblem(pw: string, confirm: string): string | null {
  if (pw.length < MIN_PASSWORD) return `Au moins ${MIN_PASSWORD} caractères.`
  if (/^(\d)\1+$/.test(pw) || /^(0123456789|123456789|12345678|87654321|azertyui|password|motdepasse)/i.test(pw)) return 'Mot de passe trop facile à deviner.'
  if (pw !== confirm) return 'Les deux mots de passe ne sont pas identiques.'
  return null
}

function translate(msg: string) {
  if (/different from the old|same_password/i.test(msg)) return 'Choisissez un mot de passe différent de celui reçu.'
  if (/weak|should be at least/i.test(msg)) return 'Mot de passe trop faible.'
  if (/fetch|network/i.test(msg)) return 'Pas de connexion. Réessayez quand le réseau revient.'
  return msg
}

/** Formulaire commun : nouveau mot de passe + confirmation */
function PasswordForm({ onDone, submitLabel }: { onDone: () => void; submitLabel: string }) {
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const problem = passwordProblem(pw, confirm)
    if (problem) return setError(problem)
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: pw, data: { must_change_password: false } })
    setLoading(false)
    if (error) return setError(translate(error.message))
    onDone()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Nouveau mot de passe" hint={`${MIN_PASSWORD} caractères minimum. Mélangez lettres et chiffres.`}>
        <div className="relative">
          <Input type={show ? 'text' : 'password'} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required autoFocus />
          <button type="button" onClick={() => setShow(!show)} className="absolute inset-y-0 right-0 px-3 text-ink-400" aria-label={show ? 'Masquer' : 'Afficher'}>
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>
      <Field label="Confirmer le mot de passe">
        <Input type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </Field>
      {error && <Callout tone="danger">{error}</Callout>}
      <Button type="submit" className="w-full" loading={loading} icon={KeyRound}>{submitLabel}</Button>
    </form>
  )
}

/** Écran bloquant : premier accès d'un patron ou chef de poste avec le mot de passe provisoire */
export function ForcePasswordChange() {
  const { signOut, session } = useAuth()
  const name = (session?.user.user_metadata?.display_name as string | undefined) ?? null
  return (
    <div className="flex min-h-full items-center justify-center p-5">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center"><Logo /></div>
        <Card className="p-6">
          <h1 className="text-lg font-semibold">Bienvenue{name ? `, ${name}` : ''}</h1>
          <p className="mt-1 mb-5 text-sm text-ink-500">
            Le mot de passe reçu par WhatsApp est provisoire. Choisissez le vôtre : personne d’autre ne le connaîtra, pas même Équipe360.
          </p>
          {/* Le changement déclenche USER_UPDATED : la session se met à jour et l'appli s'ouvre */}
          <PasswordForm submitLabel="Enregistrer et continuer" onDone={() => {}} />
        </Card>
        <button onClick={signOut} className="mx-auto mt-4 flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-800">
          <LogOut className="size-4" /> Se déconnecter
        </button>
      </div>
    </div>
  )
}

/** Fenêtre « Changer mon mot de passe », ouverte depuis le menu */
export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  return (
    <Modal open onClose={onClose} title="Changer mon mot de passe" description="Le nouveau mot de passe servira sur tous vos appareils.">
      <PasswordForm
        submitLabel="Changer le mot de passe"
        onDone={() => {
          toast.success('Mot de passe changé')
          onClose()
        }}
      />
    </Modal>
  )
}
