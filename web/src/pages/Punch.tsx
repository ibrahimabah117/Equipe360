import { isBreak, KIND_HINT, KIND_LABEL, type PunchKind } from '../lib/punchKinds'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import QrScanner from 'qr-scanner'
import {
  ArrowLeft,
  CameraOff,
  CheckCircle2,
  CloudOff,
  Coffee,
  Crosshair,
  LogIn,
  LogOut,
  MapPin,
  Play,
  QrCode,
  RefreshCw,
  ScanLine,
  TriangleAlert,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { DEMO } from '../lib/supabase'
import { demoSites } from '../demo/store'
import { supabase, type Employee } from '../lib/supabase'
import { cacheGet, cacheSet, getLast, isNetworkError, submitPunch, syncQueue, useOnline, usePunchQueue, type PunchResult } from '../lib/offline'
import { timeAt, TZ } from '../lib/dates'
import { Avatar, Badge, Button, Callout, Card, cx, Select, Spinner } from '../ui'
import { Logo } from '../ui/Logo'
import { Selfie } from '../ui/Selfie'
import { deviceId } from '../lib/photos'
import type { Company } from '../lib/supabase'

interface PunchSite {
  id: string
  company_id: string
  name: string
  zone: string | null
  latitude: number | null
  longitude: number | null
  radius_m: number
}

function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(h)))
}

/** Extrait le jeton d'un QR Équipe360 (adresse …/p/<jeton> ou jeton seul) */
export function tokenFromQr(text: string): string | null {
  const m = text.match(/\/p\/([a-f0-9]{16,64})/i) ?? text.trim().match(/^([a-f0-9]{16,64})$/i)
  return m ? m[1] : null
}

/* ------------------------------------------------------------------ Barre du haut */

function PunchHeader() {
  const online = useOnline()
  const { queue, syncing } = usePunchQueue()
  return (
    <header className="flex items-center justify-between px-4 py-3">
      <Link to="/" className="flex items-center gap-2 text-ink-600">
        <ArrowLeft className="size-5" />
        <Logo />
      </Link>
      <div className="flex items-center gap-2">
        {queue.length > 0 && (
          <button onClick={() => syncQueue()} className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
            {syncing ? <RefreshCw className="size-3.5 animate-spin" /> : <CloudOff className="size-3.5" />}
            {queue.length} en attente
          </button>
        )}
        <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1', online ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-ink-100 text-ink-600 ring-ink-200')}>
          {online ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
          {online ? 'En ligne' : 'Hors ligne'}
        </span>
      </div>
    </header>
  )
}

/* ------------------------------------------------------------------ Scanner */

function DemoScan() {
  const navigate = useNavigate()
  return (
    <div className="flex min-h-full flex-col bg-ink-950 text-white">
      <div className="bg-white text-ink-900">
        <PunchHeader />
      </div>
      <div className="mx-auto w-full max-w-sm flex-1 p-5">
        <div className="relative mx-auto flex aspect-square w-full items-center justify-center overflow-hidden rounded-3xl bg-black ring-1 ring-white/10">
          <div className="absolute inset-8 rounded-2xl ring-4 ring-white/80" />
          <div className="absolute inset-x-8 top-1/2 h-0.5 animate-pulse bg-brand-400" />
          <QrCode className="size-16 text-white/20" />
        </div>
        <p className="mt-6 text-center text-sm text-white/70">
          Démo : sur un vrai téléphone, la caméra s’ouvre ici. Touchez un site pour simuler le scan de son QR code.
        </p>
        <div className="mt-4 space-y-2">
          {demoSites().map((s) => (
            <button
              key={s.token}
              onClick={() => navigate(`/p/${s.token}`)}
              className="flex w-full items-center gap-3 rounded-2xl bg-white/[0.06] px-4 py-3 text-left ring-1 ring-white/10 hover:bg-white/10"
            >
              <MapPin className="size-5 text-brand-300" />
              <span className="flex-1">
                <span className="block font-medium">{s.name}</span>
                <span className="block text-xs text-white/50">{s.zone}</span>
              </span>
              <ScanLine className="size-4 text-white/40" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function ScanPage() {
  return DEMO ? <DemoScan /> : <CameraScan />
}

function CameraScan() {
  const navigate = useNavigate()
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [wrong, setWrong] = useState(false)

  useEffect(() => {
    if (!video.current) return
    let done = false
    const scanner = new QrScanner(
      video.current,
      (res) => {
        if (done) return
        const token = tokenFromQr(res.data)
        if (token) {
          done = true
          if ('vibrate' in navigator) navigator.vibrate(80)
          scanner.stop()
          navigate(`/p/${token}`)
        } else {
          setWrong(true)
        }
      },
      { returnDetailedScanResult: true, highlightScanRegion: false, preferredCamera: 'environment', maxScansPerSecond: 8 },
    )
    scanner.start().catch((e: unknown) => {
      const msg = String(e)
      setError(/permission|denied|notallowed/i.test(msg) ? 'Autorisez l’accès à la caméra dans les réglages du navigateur.' : 'Caméra indisponible sur cet appareil.')
    })
    return () => {
      done = true
      scanner.destroy()
    }
  }, [navigate])

  return (
    <div className="flex min-h-full flex-col bg-ink-950 text-white">
      <div className="bg-white text-ink-900">
        <PunchHeader />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center p-5">
        <p className="mb-5 text-center text-lg font-semibold">Scannez le QR code du site</p>
        <div className="relative aspect-square w-full max-w-sm overflow-hidden rounded-3xl bg-black ring-1 ring-white/10">
          <video ref={video} className="size-full object-cover" muted playsInline />
          <div className="pointer-events-none absolute inset-8 rounded-2xl ring-4 ring-white/80" />
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 animate-pulse bg-brand-400" />
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink-950 p-6 text-center">
              <CameraOff className="size-8 text-white/60" />
              <p className="text-sm text-white/80">{error}</p>
            </div>
          )}
        </div>
        {wrong && <p className="mt-4 text-sm text-amber-300">Ce QR code n’est pas un code Équipe360.</p>}
        <p className="mt-6 max-w-xs text-center text-sm text-white/55">
          Vous pouvez aussi scanner le code avec l’appareil photo du téléphone : il ouvre directement Équipe360.
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ Pointage */

type Phase = 'ready' | 'sending' | 'sent' | 'queued'

export function PunchPage() {
  const { token = '' } = useParams()
  const { memberships, isAdmin } = useAuth()
  const online = useOnline()
  const [site, setSite] = useState<PunchSite | null | 'loading' | 'unknown'>('loading')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [forEmployee, setForEmployee] = useState<string>('me')
  const [pos, setPos] = useState<{ lat: number; lng: number; accuracy: number } | null>(null)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [serverLast, setServerLast] = useState<{ kind: PunchKind; at: string } | null>(null)
  const [phase, setPhase] = useState<Phase>('ready')
  const [done, setDone] = useState<{ kind: PunchKind; at: string; result?: PunchResult } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const [photoRequired, setPhotoRequired] = useState(false)
  const [breaksEnabled, setBreaksEnabled] = useState(false)
  const [photo, setPhoto] = useState<string | null>(null)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Site correspondant au QR (avec cache pour le hors-ligne)
  useEffect(() => {
    ;(async () => {
      const cached = cacheGet<Record<string, PunchSite>>('sitesByToken') ?? {}
      const { data, error } = await supabase
        .from('sites')
        .select('id, company_id, name, zone, latitude, longitude, radius_m')
        .eq('qr_token', token)
        .eq('active', true)
        .maybeSingle()
      if (isNetworkError(error)) return setSite(cached[token] ?? null)
      if (!data) return setSite('unknown')
      cacheSet('sitesByToken', { ...cached, [token]: data })
      setSite(data as PunchSite)
    })()
  }, [token])

  const companyId = site && typeof site === 'object' ? site.company_id : null
  const membership = memberships.find((m) => m.company_id === companyId)
  const canManage = isAdmin || membership?.role === 'owner' || membership?.role === 'manager'
  const myEmployeeId = membership?.employee_id ?? null

  // Liste des agents pour un responsable qui pointe pour quelqu'un d'autre
  useEffect(() => {
    if (!companyId || !canManage) return
    ;(async () => {
      const { data, error } = await supabase.from('employees').select('*').eq('company_id', companyId).eq('active', true).order('full_name')
      if (isNetworkError(error)) return setEmployees(cacheGet<Employee[]>('employees.' + companyId) ?? [])
      cacheSet('employees.' + companyId, data ?? [])
      setEmployees((data ?? []) as Employee[])
    })()
  }, [companyId, canManage])

  useEffect(() => {
    if (canManage && !myEmployeeId && forEmployee === 'me' && employees.length) setForEmployee('')
  }, [canManage, myEmployeeId, employees.length, forEmployee])

  const targetEmployeeId = forEmployee === 'me' ? myEmployeeId : forEmployee || null
  const proxy = forEmployee !== 'me'

  // Selfie obligatoire ? (réglage de l'entreprise, gardé pour le hors-ligne)
  useEffect(() => {
    if (!companyId) return
    const key = 'photoRequired.' + companyId
    const bKey = 'breaksEnabled.' + companyId
    setPhotoRequired(cacheGet<boolean>(key) ?? cacheGet<Company>('company.' + companyId)?.punch_photo_required ?? false)
    setBreaksEnabled(cacheGet<boolean>(bKey) ?? cacheGet<Company>('company.' + companyId)?.breaks_enabled ?? false)
    supabase
      .from('companies')
      .select('punch_photo_required, breaks_enabled')
      .eq('id', companyId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return
        cacheSet(key, !!data.punch_photo_required)
        cacheSet(bKey, !!data.breaks_enabled)
        setPhotoRequired(!!data.punch_photo_required)
        setBreaksEnabled(!!data.breaks_enabled)
      })
  }, [companyId])
  const needSelfie = photoRequired && !proxy

  // Dernier pointage connu sur le serveur
  useEffect(() => {
    setServerLast(null)
    if (!targetEmployeeId) return
    supabase
      .from('punches')
      .select('kind, punched_at')
      .eq('employee_id', targetEmployeeId)
      .order('punched_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => data && setServerLast({ kind: data.kind, at: data.punched_at }))
  }, [targetEmployeeId, done])

  // Position GPS en continu
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGpsError('GPS indisponible sur cet appareil')
      return
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) })
        setGpsError(null)
      },
      (e) => setGpsError(e.code === 1 ? 'Autorisez la localisation pour pointer' : 'Position introuvable — sortez à découvert'),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  const suggested: PunchKind = useMemo(() => {
    const local = getLast(proxy ? targetEmployeeId : null)
    const candidates = [local, serverLast].filter(Boolean) as { kind: PunchKind; at: string }[]
    const last = candidates.sort((a, b) => b.at.localeCompare(a.at))[0]
    const recent = last && Date.now() - new Date(last.at).getTime() < 16 * 3600 * 1000
    if (recent && last.kind === 'break_start') return 'break_end'
    if (recent && (last.kind === 'in' || last.kind === 'break_end')) return 'out'
    return 'in'
  }, [serverLast, proxy, targetEmployeeId, done]) // eslint-disable-line react-hooks/exhaustive-deps

  const s = site && typeof site === 'object' ? site : null
  const dist = s && pos && s.latitude != null && s.longitude != null ? distanceM(pos, { lat: s.latitude, lng: s.longitude }) : null
  const inZone = dist != null && s ? dist <= s.radius_m : null
  const proxyName = proxy ? employees.find((e) => e.id === forEmployee)?.full_name ?? null : null

  async function punch(kind: PunchKind) {
    setError(null)
    if (!s && site !== null) return
    if (proxy && !forEmployee) return setError('Choisissez la personne à pointer.')
    if (!proxy && !myEmployeeId && !canManage) return setError('Votre compte n’est lié à aucune fiche employé. Contactez votre responsable.')
    if (needSelfie && !photo && !isBreak(kind)) return setError('Prenez votre selfie avant de pointer.')
    setPhase('sending')
    // Laisser au GPS quelques secondes s'il n'a pas encore de position
    let p = pos
    if (!p && !gpsError) {
      p = await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (x) => resolve({ lat: x.coords.latitude, lng: x.coords.longitude, accuracy: Math.round(x.coords.accuracy) }),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 },
        )
      })
    }
    const at = new Date().toISOString()
    const res = await submitPunch({
      client_id: crypto.randomUUID(),
      qr_token: token,
      kind,
      punched_at: at,
      latitude: p?.lat ?? null,
      longitude: p?.lng ?? null,
      accuracy: p?.accuracy ?? null,
      employee_id: proxy ? forEmployee : null,
      employee_name: proxyName,
      site_name: s?.name ?? null,
      company_id: s?.company_id ?? null,
      device_id: deviceId(),
      photo: needSelfie ? photo : null,
    })
    if (res.status === 'sent') {
      setDone({ kind, at, result: res.result })
      setPhase('sent')
    } else if (res.status === 'queued') {
      setDone({ kind, at })
      setPhase('queued')
    } else {
      setPhase('ready')
      setError(res.message)
    }
    if (res.status !== 'error' && 'vibrate' in navigator) navigator.vibrate(120)
  }

  /* --------------------------------------------- Rendus */

  if (site === 'loading') {
    return (
      <div className="flex min-h-full items-center justify-center">
        <Spinner className="size-6" />
      </div>
    )
  }

  if (site === 'unknown' || (site === null && online)) {
    return (
      <div className="min-h-full">
        <PunchHeader />
        <div className="mx-auto max-w-md p-5">
          <Card className="p-8 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
              <QrCode className="size-6" />
            </span>
            <h1 className="mt-4 text-lg font-semibold">QR code non reconnu</h1>
            <p className="mt-2 text-sm text-ink-500">Ce code est désactivé, remplacé, ou appartient à une autre entreprise.</p>
            <Link to="/scan"><Button className="mt-6 w-full" icon={ScanLine}>Scanner à nouveau</Button></Link>
          </Card>
        </div>
      </div>
    )
  }

  if (done && (phase === 'sent' || phase === 'queued')) {
    const r = done.result
    return (
      <div className="min-h-full">
        <PunchHeader />
        <div className="mx-auto max-w-md p-5">
          <Card className="animate-in overflow-hidden text-center">
            <div className={cx('px-6 pt-10 pb-8', phase === 'sent' ? 'bg-emerald-500' : 'bg-amber-500')}>
              <span className="mx-auto flex size-20 items-center justify-center rounded-full bg-white/20 ring-8 ring-white/10">
                {phase === 'sent' ? <CheckCircle2 className="size-11 text-white" /> : <CloudOff className="size-10 text-white" />}
              </span>
              <p className="mt-5 text-sm font-medium tracking-wide text-white/80 uppercase">
                {/* Arrivée, Fin de pause : féminin ; Départ, Début de pause : masculin */}
                {`${KIND_LABEL[done.kind]} ${phase === 'sent' ? 'enregistré' : 'gardé'}${done.kind === 'in' || done.kind === 'break_end' ? 'e' : ''}${phase === 'sent' ? '' : ' sur le téléphone'}`}
              </p>
              <p className="tabular mt-1 text-5xl font-semibold text-white">{timeAt(done.at)}</p>
              {proxyName && <p className="mt-2 text-sm text-white/90">pour {proxyName}</p>}
            </div>
            <div className="space-y-3 p-6 text-left text-sm">
              <div className="flex items-center gap-3">
                <MapPin className="size-4 text-ink-400" />
                <span className="flex-1">{r?.site_name ?? s?.name ?? 'Site'}</span>
              </div>
              {phase === 'sent' && r && (
                <div className="flex items-center gap-3">
                  <Crosshair className="size-4 text-ink-400" />
                  <span className="flex-1">
                    {r.distance_m == null ? 'Position GPS non transmise' : `${r.distance_m} m du site`}
                  </span>
                  {r.gps_ok ? <Badge tone="green" dot>Sur place</Badge> : <Badge tone="amber" dot>À vérifier</Badge>}
                </div>
              )}
              {phase === 'queued' && (
                <Callout tone="warning">Pas de réseau : le pointage sera envoyé automatiquement dès le retour de la connexion. Vous pouvez fermer l’appli.</Callout>
              )}
            </div>
            <div className="border-t border-ink-100 p-4">
              <Link to="/"><Button variant="secondary" className="w-full">Terminé</Button></Link>
            </div>
          </Card>
        </div>
      </div>
    )
  }

  const clock = new Date(now).toLocaleTimeString('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <div className="min-h-full">
      <PunchHeader />
      <div className="mx-auto max-w-md space-y-4 p-5">
        <Card className="overflow-hidden">
          <div className="bg-ink-900 px-6 py-6 text-white">
            <p className="text-xs font-medium tracking-wide text-white/50 uppercase">Pointage</p>
            <h1 className="mt-1 text-xl font-semibold">{s?.name ?? 'Site (hors ligne)'}</h1>
            {s?.zone && <p className="text-sm text-white/60">{s.zone}</p>}
            <p className="tabular mt-5 text-4xl font-semibold tracking-tight">{clock}</p>
            <p className="text-xs text-white/50">Heure de Conakry</p>
          </div>
          <div className="flex items-center gap-3 px-6 py-4 text-sm">
            <Crosshair className={cx('size-5', inZone ? 'text-emerald-500' : gpsError ? 'text-red-500' : 'text-ink-400')} />
            <div className="flex-1">
              {gpsError ? (
                <span className="text-red-600">{gpsError}</span>
              ) : !pos ? (
                <span className="text-ink-500">Recherche de la position GPS…</span>
              ) : dist == null ? (
                <span className="text-ink-600">Position trouvée (± {pos.accuracy} m)</span>
              ) : (
                <span className={inZone ? 'text-emerald-700' : 'text-amber-700'}>
                  {inZone ? 'Vous êtes sur le site' : 'Vous semblez hors du site'} · {dist} m
                  <span className="text-ink-400"> (± {pos.accuracy} m)</span>
                </span>
              )}
            </div>
            {!pos && !gpsError && <Spinner className="size-4" />}
          </div>
        </Card>

        {canManage && (
          <Card className="p-4">
            <label className="mb-1.5 block text-[13px] font-medium text-ink-700">Pointer pour</label>
            <Select value={forEmployee} onChange={(e) => setForEmployee(e.target.value)}>
              {myEmployeeId && <option value="me">Moi-même</option>}
              {!myEmployeeId && <option value="">Choisir une personne…</option>}
              {employees.filter((e) => e.id !== myEmployeeId).map((e) => (
                <option key={e.id} value={e.id}>{e.full_name}</option>
              ))}
            </Select>
            {proxy && forEmployee && (
              <p className="mt-2 flex items-center gap-2 text-xs text-ink-500">
                <Avatar name={proxyName} size="sm" /> Pointage pour une personne sans smartphone — noté « saisi par un responsable ».
              </p>
            )}
          </Card>
        )}

        {needSelfie && (
          <Card className="p-4">
            <p className="mb-3 text-[13px] font-medium text-ink-700">Selfie obligatoire</p>
            <Selfie value={photo} onChange={(v) => { setPhoto(v); setError(null) }} />
          </Card>
        )}

        {error && <Callout tone="danger">{error}</Callout>}
        {s && inZone === false && (
          <Callout tone="warning" title="Hors de la zone du site">
            Le pointage reste possible mais sera signalé à votre responsable.
          </Callout>
        )}

        <div className="grid gap-3">
          {(['in', 'out'] as const).map((k) => {
            const primary = k === suggested
            const Icon = k === 'in' ? LogIn : LogOut
            return (
              <button
                key={k}
                disabled={phase === 'sending'}
                onClick={() => punch(k)}
                className={cx(
                  'flex h-20 items-center gap-4 rounded-2xl px-6 text-left transition-transform active:scale-[0.98] disabled:opacity-60',
                  primary
                    ? k === 'in'
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                      : 'bg-brand-500 text-white shadow-lg shadow-brand-500/30'
                    : 'bg-white text-ink-800 ring-1 ring-ink-200',
                )}
              >
                {phase === 'sending' && primary ? <Spinner className="size-7 text-current" /> : <Icon className="size-7" />}
                <span className="flex-1">
                  <span className="block text-lg font-semibold">{k === 'in' ? 'Arrivée' : 'Départ'}</span>
                  <span className={cx('block text-xs', primary ? 'text-white/80' : 'text-ink-500')}>
                    {k === 'in' ? 'Je prends mon poste' : 'Je quitte mon poste'}
                  </span>
                </span>
                {primary && <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-medium">Suggéré</span>}
              </button>
            )
          })}
        </div>

        {breaksEnabled && (
          <div className="grid grid-cols-2 gap-3">
            {(['break_start', 'break_end'] as const).map((k) => {
              const primary = k === suggested
              const Icon = k === 'break_start' ? Coffee : Play
              return (
                <button
                  key={k}
                  disabled={phase === 'sending'}
                  onClick={() => punch(k)}
                  className={cx(
                    'flex h-16 items-center gap-3 rounded-2xl px-4 text-left transition-transform active:scale-[0.98] disabled:opacity-60',
                    primary ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30' : 'bg-white text-ink-800 ring-1 ring-ink-200',
                  )}
                >
                  {phase === 'sending' && primary ? <Spinner className="size-6 text-current" /> : <Icon className="size-6" />}
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{KIND_LABEL[k]}</span>
                    <span className={cx('block text-[11px]', primary ? 'text-white/80' : 'text-ink-500')}>{KIND_HINT[k]}</span>
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {!online && (
          <p className="flex items-center justify-center gap-2 text-center text-xs text-ink-500">
            <TriangleAlert className="size-3.5" /> Hors ligne : le pointage sera gardé puis envoyé automatiquement.
          </p>
        )}
      </div>
    </div>
  )
}
