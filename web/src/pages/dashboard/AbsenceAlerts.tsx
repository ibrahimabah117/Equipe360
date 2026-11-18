import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BellRing, Check, MapPin, MessageCircle, Phone, RefreshCw } from 'lucide-react'
import { errorMessage, supabase } from '../../lib/supabase'
import { minutesLabel, timeAt } from '../../lib/dates'
import { normalizePhone } from '../../lib/format'
import { Avatar, Badge, Card, cx, IconButton, useToast } from '../../ui'

/** Délai sans pointage avant l'alerte (identique à private.check_attendance côté serveur) */
export const MISSING_ALERT_MIN = 30

interface Alert {
  id: string
  shift_start: string
  seen_at: string | null
  employees: { full_name: string; phone: string | null } | null
  sites: { name: string } | null
}

/**
 * Agents absents : garde commencée depuis plus de 30 min sans pointage d'arrivée.
 * Les alertes sont créées par le serveur toutes les 5 minutes (pg_cron), même appli fermée,
 * et disparaissent seules quand l'agent pointe ou que l'absence est saisie au planning.
 */
export default function AbsenceAlerts({ companyId, base, showLink = true }: { companyId: string; base: string; showLink?: boolean }) {
  const toast = useToast()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(false)
  const [now, setNow] = useState(Date.now())

  const load = useCallback(
    async (check: boolean) => {
      setLoading(true)
      // Vérification immédiate sans attendre la prochaine passe automatique
      if (check) await supabase.rpc('refresh_attendance_alerts', { p_company_id: companyId })
      const { data } = await supabase
        .from('attendance_alerts')
        .select('id, shift_start, seen_at, employees(full_name, phone), sites(name)')
        .eq('company_id', companyId)
        .is('resolved_at', null)
        .order('shift_start')
      setAlerts((data ?? []) as unknown as Alert[])
      setNow(Date.now())
      setLoading(false)
    },
    [companyId],
  )

  useEffect(() => {
    load(true)
    const t = setInterval(() => load(false), 60000)
    return () => clearInterval(t)
  }, [load])

  async function markSeen(id: string) {
    const { error } = await supabase.rpc('mark_attendance_alert_seen', { p_alert_id: id })
    if (error) return toast.error(errorMessage(error))
    setAlerts((list) => list.map((a) => (a.id === id ? { ...a, seen_at: new Date().toISOString() } : a)))
  }

  if (!alerts.length) return null

  const pending = alerts.filter((a) => !a.seen_at).length

  return (
    <Card className="mb-6 overflow-hidden ring-red-200">
      <div className="flex items-center gap-3 border-b border-red-100 bg-red-50 px-5 py-3.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-red-500 text-white">
          <BellRing className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-red-900">
            {alerts.length} agent{alerts.length > 1 ? 's' : ''} absent{alerts.length > 1 ? 's' : ''}
          </h2>
          <p className="text-xs text-red-800/80">
            Garde commencée depuis plus de {MISSING_ALERT_MIN} min sans pointage
            {pending < alerts.length && ` · ${alerts.length - pending} pris en charge`}
          </p>
        </div>
        <IconButton icon={RefreshCw} label="Vérifier maintenant" onClick={() => load(true)} className={cx('text-red-700', loading && 'animate-spin')} />
      </div>
      <ul className="divide-y divide-ink-100">
        {alerts.map((a) => {
          const name = a.employees?.full_name ?? 'Agent'
          const site = a.sites?.name ?? '—'
          const phone = normalizePhone(a.employees?.phone)
          const start = timeAt(a.shift_start)
          const msg = `Bonjour ${name}, tu étais prévu au site ${site} à ${start} et tu n'as pas pointé ton arrivée. Où es-tu ?`
          return (
            <li key={a.id} className={cx('flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center', a.seen_at && 'bg-ink-50/50')}>
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={name} size="sm" />
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink-900">
                    {name}
                    {a.seen_at ? <Badge tone="neutral">Pris en charge</Badge> : <Badge tone="red" dot>Absent</Badge>}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-ink-500">
                    <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{site}</span>
                    <span>Prévu à {start} · {minutesLabel((now - +new Date(a.shift_start)) / 60000)} sans pointage</span>
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                {phone && (
                  <>
                    <a href={`tel:+${phone}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50">
                      <Phone className="size-4" />Appeler
                    </a>
                    <a href={`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#25D366] px-3 text-sm font-medium text-white hover:bg-[#1ebe5b]">
                      <MessageCircle className="size-4" />WhatsApp
                    </a>
                  </>
                )}
                {!a.seen_at && (
                  <button onClick={() => markSeen(a.id)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink-900 px-3 text-sm font-medium text-white hover:bg-ink-800">
                    <Check className="size-4" />Je m’en occupe
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {showLink && (
        <div className="border-t border-ink-100 px-5 py-3 text-xs text-ink-500">
          Remplacez l’agent ou saisissez son absence dans le{' '}
          <Link to={`${base}/planning`} className="font-medium text-brand-600 hover:text-brand-700">planning</Link> : l’alerte se fermera toute seule.
        </div>
      )}
    </Card>
  )
}
