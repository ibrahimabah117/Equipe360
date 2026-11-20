import { useVocab } from '../lib/sector'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import QrScanner from 'qr-scanner'
import { ArrowLeft, CameraOff, CloudOff, IdCard, LogIn, LogOut, Maximize, ShieldAlert, Users } from 'lucide-react'
import { DEMO, supabase, type Employee, type Punch, type Site } from '../lib/supabase'
import { useCompany } from '../lib/company'
import { cacheGet, cacheSet, isNetworkError, submitPunch, useOnline, usePunchQueue } from '../lib/offline'
import { timeAt } from '../lib/dates'
import { Avatar, Badge, Button, Callout, Card, cx, PageHeader, PageLoader, Select } from '../ui'
import { tokenFromBadge } from './Badges'

type Mode = 'auto' | 'in' | 'out'
interface Scan {
  id: string
  name: string
  kind: 'in' | 'out' | 'error'
  at: string
  note?: string
  queued?: boolean
}

const REPEAT_SECONDS = 30

function beep(ok: boolean) {
  try {
    const ctx = new AudioContext()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = ok ? 880 : 220
    g.gain.value = 0.15
    o.connect(g).connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + (ok ? 0.15 : 0.4))
  } catch {
    /* son indisponible */
  }
  if ('vibrate' in navigator) navigator.vibrate(ok ? 80 : [80, 60, 80])
}

/** Borne de pointage : un responsable scanne le badge de chaque employé à l'entrée du site */
export default function Borne() {
  const { company } = useCompany()
  const v = useVocab()
  const online = useOnline()
  const { queue } = usePunchQueue()
  const [sites, setSites] = useState<Site[] | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [siteId, setSiteId] = useState<string>(() => cacheGet<string>('borne.site.' + company.id) ?? '')
  const [mode, setMode] = useState<Mode>('auto')
  const [scans, setScans] = useState<Scan[]>([])
  const [flash, setFlash] = useState<Scan | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const lastKind = useRef<Map<string, { kind: 'in' | 'out'; at: number }>>(new Map())
  const lastSeen = useRef<Map<string, number>>(new Map())
  const video = useRef<HTMLVideoElement>(null)
  const pos = useRef<{ lat: number; lng: number } | null>(null)
  const busy = useRef(false)

  // Données (avec cache pour fonctionner sans réseau)
  useEffect(() => {
    ;(async () => {
      const since = new Date(Date.now() - 16 * 3600e3).toISOString()
      const [s, e, p] = await Promise.all([
        supabase.from('sites').select('*').eq('company_id', company.id).eq('active', true).order('name'),
        supabase.from('employees').select('*').eq('company_id', company.id).eq('active', true).order('full_name'),
        supabase.from('punches').select('employee_id, kind, punched_at').eq('company_id', company.id).gte('punched_at', since).order('punched_at'),
      ])
      if (isNetworkError(s.error)) {
        setSites(cacheGet<Site[]>('borne.sites.' + company.id) ?? [])
        setEmployees(cacheGet<Employee[]>('employees.' + company.id) ?? [])
        return
      }
      const siteList = (s.data ?? []) as Site[]
      const emps = (e.data ?? []) as Employee[]
      cacheSet('borne.sites.' + company.id, siteList)
      cacheSet('employees.' + company.id, emps)
      setSites(siteList)
      setEmployees(emps)
      for (const x of (p.data ?? []) as Pick<Punch, 'employee_id' | 'kind' | 'punched_at'>[]) {
        // une pause ne fait pas quitter le site : la borne la traite comme une présence
        lastKind.current.set(x.employee_id, { kind: x.kind === 'out' ? 'out' : 'in', at: +new Date(x.punched_at) })
      }
      if (!siteId && siteList.length === 1) setSiteId(siteList[0].id)
    })()
  }, [company.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (siteId) cacheSet('borne.site.' + company.id, siteId)
  }, [siteId, company.id])

  // Position de la borne (une fois suffit : elle ne bouge pas)
  useEffect(() => {
    navigator.geolocation?.watchPosition(
      (p) => (pos.current = { lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 60000 },
    )
  }, [])

  const byToken = useMemo(() => new Map(employees.map((e) => [e.badge_token, e])), [employees])
  const site = sites?.find((s) => s.id === siteId)

  const show = useCallback((s: Scan) => {
    setScans((x) => [s, ...x].slice(0, 30))
    setFlash(s)
    beep(s.kind !== 'error')
    setTimeout(() => setFlash((f) => (f === s ? null : f)), 2500)
  }, [])

  const handleToken = useCallback(
    async (token: string) => {
      if (!site || busy.current) return
      const emp = byToken.get(token)
      const now = Date.now()
      if (!emp) {
        if ((lastSeen.current.get(token) ?? 0) > now - 5000) return
        lastSeen.current.set(token, now)
        return show({ id: crypto.randomUUID(), name: 'Badge inconnu', kind: 'error', at: new Date().toISOString(), note: 'Badge désactivé, remplacé ou d’une autre entreprise' })
      }
      const seen = lastSeen.current.get(token) ?? 0
      if (now - seen < REPEAT_SECONDS * 1000) return // même badge présenté deux fois de suite
      lastSeen.current.set(token, now)

      const last = lastKind.current.get(emp.id)
      const kind: 'in' | 'out' = mode !== 'auto' ? mode : last && last.kind === 'in' && now - last.at < 16 * 3600e3 ? 'out' : 'in'
      busy.current = true
      const at = new Date().toISOString()
      const res = await submitPunch({
        client_id: crypto.randomUUID(),
        qr_token: site.qr_token,
        kind,
        punched_at: at,
        latitude: pos.current?.lat ?? null,
        longitude: pos.current?.lng ?? null,
        accuracy: null,
        employee_id: emp.id,
        employee_name: emp.full_name,
        site_name: site.name,
      })
      busy.current = false
      if (res.status === 'error') {
        return show({ id: crypto.randomUUID(), name: emp.full_name, kind: 'error', at, note: res.message })
      }
      lastKind.current.set(emp.id, { kind, at: now })
      show({ id: crypto.randomUUID(), name: emp.full_name, kind, at, queued: res.status === 'queued' })
    },
    [site, byToken, mode, show],
  )

  // Caméra : lecture en continu
  useEffect(() => {
    if (DEMO || !video.current || !site) return
    const scanner = new QrScanner(
      video.current,
      (r) => {
        const t = tokenFromBadge(r.data)
        if (t) handleToken(t)
      },
      { returnDetailedScanResult: true, preferredCamera: 'environment', maxScansPerSecond: 6, highlightScanRegion: false },
    )
    scanner.start().catch((e: unknown) => {
      setCameraError(/permission|denied|notallowed/i.test(String(e)) ? 'Autorisez la caméra dans le navigateur.' : 'Caméra indisponible sur cet appareil.')
    })
    return () => scanner.destroy()
  }, [site, handleToken])

  const presents = useMemo(() => {
    const now = Date.now()
    let n = 0
    for (const v of lastKind.current.values()) if (v.kind === 'in' && now - v.at < 16 * 3600e3) n++
    return n
  }, [scans]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!sites) return <PageLoader />

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Borne de pointage"
        description="Scannez le badge de chaque employé à l’entrée et à la sortie. Idéal pour les grandes équipes."
        actions={
          <>
            <Link to={`/c/${company.id}/pointages`}><Button variant="ghost" icon={ArrowLeft}>Pointages</Button></Link>
            <Button variant="secondary" icon={Maximize} onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}>Plein écran</Button>
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto]">
        <Select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
          <option value="">Choisir {v.leSite} de cette borne…</option>
          {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <div className="flex rounded-xl bg-ink-100 p-1 text-[13px] font-medium">
          {(
            [
              ['auto', 'Automatique'],
              ['in', 'Arrivées'],
              ['out', 'Départs'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} onClick={() => setMode(k)} className={cx('rounded-lg px-3 py-1.5 whitespace-nowrap', mode === k ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500')}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {!site ? (
        <Callout tone="info" title={`Choisissez ${v.leSite}`}>La borne enregistre tous les pointages sur {v.ceSite}. Le choix est gardé sur cet appareil.</Callout>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-ink-950 ring-1 ring-ink-200">
              {!DEMO && <video ref={video} className="size-full object-cover" muted playsInline />}
              {DEMO && (
                <div className="flex size-full flex-col items-center justify-center gap-2 text-white/60">
                  <IdCard className="size-14" />
                  <p className="max-w-xs text-center text-sm">Démo : sur une vraie borne, la caméra lit les badges ici. Touchez un employé à droite pour simuler un badge.</p>
                </div>
              )}
              {!DEMO && <div className="pointer-events-none absolute inset-[18%] rounded-2xl ring-4 ring-white/70" />}
              {cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink-950 text-white/80">
                  <CameraOff className="size-8" />
                  <p className="text-sm">{cameraError}</p>
                </div>
              )}
              {flash && (
                <div
                  className={cx(
                    'animate-in absolute inset-x-4 bottom-4 flex items-center gap-4 rounded-2xl p-4 text-white shadow-pop',
                    flash.kind === 'in' ? 'bg-emerald-500' : flash.kind === 'out' ? 'bg-brand-500' : 'bg-red-600',
                  )}
                >
                  {flash.kind === 'error' ? <ShieldAlert className="size-10" /> : flash.kind === 'in' ? <LogIn className="size-10" /> : <LogOut className="size-10" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white/80 uppercase">
                      {flash.kind === 'in' ? 'Arrivée' : flash.kind === 'out' ? 'Départ' : 'Refusé'}
                      {flash.queued && ' · gardé hors ligne'}
                    </p>
                    <p className="truncate text-2xl font-semibold">{flash.name}</p>
                    {flash.note && <p className="text-sm text-white/90">{flash.note}</p>}
                  </div>
                  <span className="tabular text-3xl font-semibold">{timeAt(flash.at)}</span>
                </div>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <Badge tone="green"><Users className="size-3.5" /> {presents} présent{presents > 1 ? 's' : ''} (16 dernières heures)</Badge>
              {!online && <Badge tone="amber"><CloudOff className="size-3.5" /> Hors ligne</Badge>}
              {queue.length > 0 && <Badge tone="amber">{queue.length} en attente d’envoi</Badge>}
              <span className="text-xs text-ink-500">Un même badge est ignoré pendant {REPEAT_SECONDS} s.</span>
            </div>
          </div>

          <div className="space-y-4">
            {DEMO && (
              <Card className="p-4">
                <p className="mb-2 text-xs font-medium tracking-wide text-ink-400 uppercase">Démo · simuler un badge</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {employees.slice(0, 10).map((e) => (
                    <button
                      key={e.id}
                      onClick={() => {
                        lastSeen.current.delete(e.badge_token)
                        handleToken(e.badge_token)
                      }}
                      className="flex items-center gap-2 rounded-lg p-1.5 text-left text-sm hover:bg-ink-50"
                    >
                      <Avatar name={e.full_name} size="sm" />
                      <span className="truncate">{e.full_name}</span>
                    </button>
                  ))}
                </div>
              </Card>
            )}
            <Card>
              <div className="border-b border-ink-100 px-4 py-3">
                <h2 className="font-semibold">Derniers passages</h2>
              </div>
              {scans.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-ink-500">Aucun badge scanné pour l’instant.</p>
              ) : (
                <ul className="max-h-96 divide-y divide-ink-100 overflow-y-auto">
                  {scans.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      {s.kind === 'in' ? <LogIn className="size-4 text-emerald-500" /> : s.kind === 'out' ? <LogOut className="size-4 text-brand-500" /> : <ShieldAlert className="size-4 text-red-500" />}
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      {s.queued && <CloudOff className="size-3.5 text-amber-500" />}
                      <span className="tabular font-medium">{timeAt(s.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
