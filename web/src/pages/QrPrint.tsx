import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { supabase, type Site } from '../lib/supabase'
import { useCompany } from '../lib/company'
import { qrDataUrl } from '../lib/qr'
import { Button, PageLoader } from '../ui'
import { LogoMark } from '../ui/Logo'

export default function QrPrint() {
  const { company } = useCompany()
  const [params] = useSearchParams()
  const only = params.get('site')
  const [items, setItems] = useState<{ site: Site; src: string }[] | null>(null)

  useEffect(() => {
    ;(async () => {
      let query = supabase.from('sites').select('*').eq('company_id', company.id).eq('active', true).order('name')
      if (only) query = query.eq('id', only)
      const { data } = await query
      const sites = (data ?? []) as Site[]
      setItems(await Promise.all(sites.map(async (site) => ({ site, src: await qrDataUrl(site.qr_token, 640) }))))
    })()
  }, [company.id, only])

  if (!items) return <PageLoader />

  return (
    <div>
      <style>{`@page { size: A4; margin: 12mm; }`}</style>
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link to={`/c/${company.id}/sites`}>
          <Button variant="ghost" icon={ArrowLeft}>Retour aux sites</Button>
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-sm text-ink-500">{items.length} QR code{items.length > 1 ? 's' : ''} · 2 par page A4</span>
          <Button icon={Printer} onClick={() => window.print()}>Imprimer</Button>
        </div>
      </div>

      <div className="grid gap-6 print:block">
        {items.map(({ site, src }, i) => (
          <div
            key={site.id}
            className="mx-auto flex w-full max-w-[180mm] flex-col items-center rounded-3xl border-2 border-ink-900 bg-white p-8 text-center print:mb-[8mm] print:h-[132mm] print:break-inside-avoid print:rounded-2xl print:p-6"
            style={{ breakAfter: i % 2 === 1 ? 'page' : 'auto' }}
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
              <LogoMark className="size-6" /> Équipe360 · Pointage
            </div>
            <p className="mt-1 text-xs text-ink-500">{company.name}</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-ink-900 print:text-xl">{site.name}</h2>
            {site.zone && <p className="text-sm text-ink-500">{site.zone}</p>}
            <img src={src} alt="" className="mt-4 size-64 print:size-[72mm]" />
            <p className="mt-4 text-sm font-medium text-ink-800">Scannez ce code à votre arrivée et à votre départ</p>
            <p className="mt-1 text-[11px] text-ink-400">Ne pas retirer · Ne pas photocopier</p>
          </div>
        ))}
      </div>
    </div>
  )
}
