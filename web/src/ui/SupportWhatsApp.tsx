import { MessageCircle } from 'lucide-react'
import { formatPhone, supportWhatsAppUrl, SUPPORT_WHATSAPP } from '../lib/format'
import { cx } from '.'

/** Bouton qui ouvre une discussion WhatsApp avec l'équipe Équipe360, message prérempli */
export function SupportWhatsApp({ message, label = 'Contacter Équipe360 sur WhatsApp', className }: { message: string; label?: string; className?: string }) {
  return (
    <div className={cx('flex flex-col items-center gap-1.5 sm:items-start', className)}>
      <a
        href={supportWhatsAppUrl(message)}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1ebe5b]"
      >
        <MessageCircle className="size-4" />
        {label}
      </a>
      <span className="tabular text-xs text-ink-500">{formatPhone(SUPPORT_WHATSAPP)}</span>
    </div>
  )
}
