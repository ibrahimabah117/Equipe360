import { useState } from 'react'
import { Check, Copy, MessageCircle } from 'lucide-react'
import { formatPhone } from '../lib/format'
import { Button, Callout } from '.'

/** Affiche les identifiants à transmettre, avec copie et envoi WhatsApp */
export function CredentialsCard({
  name,
  phone,
  password,
  companyName,
  temporary = false,
}: {
  name: string
  phone: string
  password: string
  companyName: string
  /** Mot de passe provisoire : à changer à la première connexion */
  temporary?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const url = window.location.origin
  const text =
    `Bonjour ${name},\n\nVotre accès Équipe360 (${companyName}) est prêt.\n` +
    `• Lien : ${url}\n• Numéro : ${formatPhone(phone)}\n• Mot de passe ${temporary ? 'provisoire ' : ''}: ${password}\n\n` +
    (temporary ? `À la première connexion, vous choisirez votre propre mot de passe.\n` : '') +
    `Ouvrez le lien sur votre téléphone, puis « Ajouter à l’écran d’accueil ».`
  const wa = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`

  return (
    <div className="space-y-4">
      <Callout tone="success" title="Accès créé">
        Transmettez ces identifiants à {name}. Le mot de passe ne sera plus affiché ensuite.
        {temporary && ' Il est provisoire : à sa première connexion, la personne devra choisir le sien.'}
      </Callout>
      <dl className="divide-y divide-ink-100 rounded-xl ring-1 ring-ink-100">
        {[
          ['Lien', url],
          ['Numéro', formatPhone(phone)],
          [temporary ? 'Mot de passe provisoire' : 'Mot de passe', password],
        ].map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
            <dt className="text-ink-500">{k}</dt>
            <dd className="tabular font-mono font-medium text-ink-900">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-2 sm:grid-cols-2">
        <a href={wa} target="_blank" rel="noreferrer">
          <Button className="w-full bg-[#25D366] shadow-none hover:bg-[#1ebe5b]" icon={MessageCircle}>
            Envoyer par WhatsApp
          </Button>
        </a>
        <Button
          variant="secondary"
          icon={copied ? Check : Copy}
          onClick={async () => {
            await navigator.clipboard.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
        >
          {copied ? 'Copié' : 'Copier le message'}
        </Button>
      </div>
    </div>
  )
}
