import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { ArrowLeft, Printer } from 'lucide-react'
import { supabase, type Employee } from '../lib/supabase'
import { useCompany } from '../lib/company'
import { Avatar, Button, PageLoader } from '../ui'
import { LogoMark } from '../ui/Logo'

/** Contenu du QR d'un badge employé */
export const BADGE_PREFIX = 'E360-BADGE:'
export function badgeContent(token: string) {
  return BADGE_PREFIX + token
}
export function tokenFromBadge(text: string): string | null {
  const t = text.trim()
  if (t.startsWith(BADGE_PREFIX)) return t.slice(BADGE_PREFIX.length)
  const m = t.match(/\/b\/([a-f0-9]{16,64})/i)
  return m ? m[1] : null
}

/** Badges imprimables (format carte de crédit, 10 par page A4) */
export default function Badges() {
  const { company } = useCompany()
  const [params] = useSearchParams()
  const only = params.get('e')
  const [items, setItems] = useState<{ e: Employee; src: string }[] | null>(null)
  const [siteNames, setSiteNames] = useState<Record<string, string>>({})

  useEffect(() => {
    ;(async () => {
      let q = supabase.from('employees').select('*').eq('company_id', company.id).eq('active', true).order('full_name')
      if (only) q = q.eq('id', only)
      const [{ data }, { data: sites }] = await Promise.all([q, supabase.from('sites').select('id, name').eq('company_id', company.id)])
      setSiteNames(Object.fromEntries((sites ?? []).map((s) => [s.id, s.name])))
      const list = (data ?? []) as Employee[]
      setItems(
        await Promise.all(
          list.map(async (e) => ({
            e,
            src: await QRCode.toDataURL(badgeContent(e.badge_token), { width: 300, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0B1B3F', light: '#FFFFFF' } }),
          })),
        ),
      )
    })()
  }, [company.id, only])

  if (!items) return <PageLoader />

  return (
    <div>
      <style>{`@page { size: A4; margin: 10mm; }`}</style>
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link to={`/c/${company.id}/employes`}>
          <Button variant="ghost" icon={ArrowLeft}>Retour aux employés</Button>
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-sm text-ink-500">{items.length} badge{items.length > 1 ? 's' : ''} · 10 par page A4</span>
          <Button icon={Printer} onClick={() => window.print()}>Imprimer</Button>
        </div>
      </div>
      <p className="no-print mb-5 text-sm text-ink-500">
        Imprimez sur papier épais ou carte, découpez, et glissez dans un porte-badge. Un badge perdu se remplace depuis la fiche de l’employé : l’ancien ne marchera plus.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 print:grid-cols-2 print:gap-[4mm]">
        {items.map(({ e, src }) => (
          <div
            key={e.id}
            className="flex h-[54mm] w-[85.6mm] flex-col overflow-hidden rounded-[3mm] bg-white ring-1 ring-ink-300 print:break-inside-avoid"
          >
            <div className="flex items-center gap-1.5 bg-ink-900 px-3 py-1.5 text-white">
              <LogoMark className="size-4" />
              <span className="truncate text-[10px] font-semibold tracking-wide uppercase">{company.name}</span>
            </div>
            <div className="flex flex-1 items-center gap-2 px-3 py-2">
              <div className="flex min-w-0 flex-1 flex-col justify-center">
                <Avatar name={e.full_name} size="lg" />
                <p className="mt-1.5 text-[13px] leading-tight font-bold text-ink-900">{e.full_name}</p>
                <p className="text-[10px] text-ink-600">{e.job_title ?? ''}</p>
                {e.default_site_id && siteNames[e.default_site_id] && (
                  <p className="truncate text-[9px] text-ink-400">{siteNames[e.default_site_id]}</p>
                )}
              </div>
              <img src={src} alt="" className="size-[30mm] shrink-0" />
            </div>
            <div className="border-t border-ink-100 px-3 py-1 text-center text-[8px] text-ink-500">
              Badge de pointage · à présenter à l’entrée et à la sortie
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
