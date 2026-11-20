import { useVocab } from '../lib/sector'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  Crosshair,
  Download,
  ExternalLink,
  MapPin,
  MapPinOff,
  Pencil,
  Plus,
  Printer,
  QrCode,
  RefreshCcw,
  Search,
  Users,
} from 'lucide-react'
import { errorMessage, supabase, type Site } from '../lib/supabase'
import { useCompany } from '../lib/company'
import { qrDataUrl, qrPoster } from '../lib/qr'
import {
  Badge,
  Button,
  Callout,
  Card,
  ConfirmDialog,
  cx,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  PageHeader,
  PageLoader,
  Toggle,
  useToast,
} from '../ui'

const ZONES = ['Kaloum', 'Dixinn', 'Matam', 'Ratoma', 'Matoto', 'Lambanyi', 'Gbessia', 'Sonfonia', 'Kagbelen', 'Coyah', 'Dubréka']

export default function Sites() {
  const { company } = useCompany()
  const v = useVocab()
  const toast = useToast()
  const [sites, setSites] = useState<Site[] | null>(null)
  const [headcount, setHeadcount] = useState<Record<string, number>>({})
  const [q, setQ] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<Site | 'new' | null>(null)
  const [qrSite, setQrSite] = useState<Site | null>(null)

  const load = useCallback(async () => {
    const [s, e] = await Promise.all([
      supabase.from('sites').select('*').eq('company_id', company.id).order('name'),
      supabase.from('employees').select('default_site_id').eq('company_id', company.id).eq('active', true),
    ])
    setSites((s.data ?? []) as Site[])
    const c: Record<string, number> = {}
    for (const x of e.data ?? []) if (x.default_site_id) c[x.default_site_id] = (c[x.default_site_id] ?? 0) + 1
    setHeadcount(c)
  }, [company.id])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (sites ?? []).filter(
      (s) =>
        (showInactive || s.active) &&
        (!t || s.name.toLowerCase().includes(t) || (s.zone ?? '').toLowerCase().includes(t) || (s.address ?? '').toLowerCase().includes(t)),
    )
  }, [sites, q, showInactive])

  const activeCount = (sites ?? []).filter((s) => s.active).length

  return (
    <>
      <PageHeader
        title={`${v.Sites} & QR codes`}
        description={`Les lieux où travaillent vos équipes. Chaque ${v.site} a son QR code de pointage.`}
        actions={
          <>
            <Link to={`/c/${company.id}/sites/qr`}>
              <Button variant="secondary" icon={Printer} disabled={!activeCount}>Imprimer les QR</Button>
            </Link>
            <Button icon={Plus} onClick={() => setEditing('new')}>Nouveau {v.site}</Button>
          </>
        }
      />

      {sites && sites.length > 0 && (
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            leading={<Search className="size-4" />}
            placeholder={`Rechercher ${v.unSite}, une commune…`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="sm:max-w-xs"
          />
          <div className="sm:ml-auto">
            <Toggle checked={showInactive} onChange={setShowInactive} label={`Afficher les ${v.sites} fermés`} />
          </div>
        </div>
      )}

      {!sites ? (
        <PageLoader />
      ) : sites.length === 0 ? (
        <Card>
          <EmptyState
            icon={MapPin}
            title={`Aucun ${v.site}`}
            text={`Ajoutez les lieux où travaillent vos ${v.workers} : ${v.siteExamples}`}
            action={<Button icon={Plus} onClick={() => setEditing('new')}>Ajouter {v.unSite}</Button>}
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card><EmptyState icon={Search} title="Aucun résultat" /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((s) => {
            const hasGps = s.latitude != null && s.longitude != null
            return (
              <Card key={s.id} className={cx('flex flex-col', !s.active && 'opacity-60')}>
                <div className="flex items-start gap-3 p-5">
                  <span className={cx('flex size-10 shrink-0 items-center justify-center rounded-xl', hasGps ? 'bg-brand-50 text-brand-600' : 'bg-amber-50 text-amber-600')}>
                    {hasGps ? <MapPin className="size-5" /> : <MapPinOff className="size-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold text-ink-900">{s.name}</h3>
                    <p className="truncate text-sm text-ink-500">{[s.zone, s.address].filter(Boolean).join(' · ') || 'Adresse non renseignée'}</p>
                  </div>
                  {!s.active && <Badge>Fermé</Badge>}
                </div>
                <div className="flex flex-wrap gap-2 px-5 pb-4">
                  {hasGps ? (
                    <Badge tone="green" dot>GPS · rayon {s.radius_m} m</Badge>
                  ) : (
                    <Badge tone="amber" dot>Position GPS manquante</Badge>
                  )}
                  <Badge tone="neutral"><Users className="size-3" /> {v.nWorkers(headcount[s.id] ?? 0)}</Badge>
                </div>
                <div className="mt-auto flex items-center gap-1 border-t border-ink-100 px-3 py-2">
                  <Button variant="ghost" size="sm" icon={QrCode} onClick={() => setQrSite(s)} disabled={!s.active}>QR code</Button>
                  <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditing(s)}>Modifier</Button>
                  {hasGps && (
                    <a
                      className="ml-auto"
                      href={`https://www.google.com/maps?q=${s.latitude},${s.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <IconButton icon={ExternalLink} label="Voir sur la carte" />
                    </a>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {editing && (
        <SiteModal
          site={editing === 'new' ? null : editing}
          companyId={company.id}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}
      {qrSite && <QrModal site={qrSite} companyName={company.name} onClose={() => setQrSite(null)} onRegenerated={() => { load(); toast.success('Nouveau QR code généré') }} />}
    </>
  )
}

function SiteModal({ site, companyId, onClose, onSaved }: { site: Site | null; companyId: string; onClose: () => void; onSaved: () => void }) {
  const vc = useVocab()
  const toast = useToast()
  const [form, setForm] = useState({
    name: site?.name ?? '',
    zone: site?.zone ?? '',
    address: site?.address ?? '',
    latitude: site?.latitude != null ? String(site.latitude) : '',
    longitude: site?.longitude != null ? String(site.longitude) : '',
    radius_m: site?.radius_m ?? 150,
    active: site?.active ?? true,
  })
  const [loading, setLoading] = useState(false)
  const [locating, setLocating] = useState(false)
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })

  function locate() {
    if (!navigator.geolocation) return setError('La localisation n’est pas disponible sur cet appareil.')
    setLocating(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({ ...f, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) }))
        setAccuracy(Math.round(pos.coords.accuracy))
        setLocating(false)
      },
      (err) => {
        setLocating(false)
        setError(err.code === 1 ? 'Autorisez l’accès à la position dans votre navigateur.' : 'Position introuvable. Réessayez à l’extérieur.')
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    )
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const lat = form.latitude.trim() ? Number(form.latitude.replace(',', '.')) : null
    const lng = form.longitude.trim() ? Number(form.longitude.replace(',', '.')) : null
    if ((lat == null) !== (lng == null)) return setError('Renseignez la latitude et la longitude, ou aucune des deux.')
    if (lat != null && (!Number.isFinite(lat) || Math.abs(lat) > 90)) return setError('Latitude invalide')
    if (lng != null && (!Number.isFinite(lng) || Math.abs(lng) > 180)) return setError('Longitude invalide')
    setLoading(true)
    const payload = {
      company_id: companyId,
      name: form.name.trim(),
      zone: form.zone.trim() || null,
      address: form.address.trim() || null,
      latitude: lat,
      longitude: lng,
      radius_m: Number(form.radius_m),
      active: form.active,
    }
    const { error } = site ? await supabase.from('sites').update(payload).eq('id', site.id) : await supabase.from('sites').insert(payload)
    setLoading(false)
    if (error) return setError(errorMessage(error))
    toast.success(site ? `${vc.Site} mis à jour` : `${payload.name} est ajouté`)
    onSaved()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={site ? `Modifier ${vc.leSite}` : `Nouveau ${vc.site}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" form="site-form" loading={loading}>{site ? 'Enregistrer' : 'Ajouter'}</Button>
        </>
      }
    >
      <form id="site-form" onSubmit={save} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Nom ${vc.duSite}`} className="sm:col-span-2">
            <Input value={form.name} onChange={set('name')} placeholder="Ex. Banque Centrale — Kaloum" required autoFocus />
          </Field>
          <Field label="Commune / zone">
            <Input value={form.zone} onChange={set('zone')} list="zones" placeholder="Kaloum" />
            <datalist id="zones">{ZONES.map((z) => <option key={z} value={z} />)}</datalist>
          </Field>
          <Field label="Adresse ou repère">
            <Input value={form.address} onChange={set('address')} placeholder="Près du rond-point…" />
          </Field>
        </div>

        <div className="rounded-xl bg-ink-50 p-4 ring-1 ring-ink-100">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-ink-900">Position GPS</p>
              <p className="text-xs text-ink-500">Sur place, appuyez sur le bouton pour enregistrer la position exacte.</p>
            </div>
            <Button type="button" variant="secondary" size="sm" icon={Crosshair} onClick={locate} loading={locating}>
              Utiliser ma position
            </Button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="Latitude">
              <Input value={form.latitude} onChange={set('latitude')} inputMode="decimal" placeholder="9.509167" className="font-mono" />
            </Field>
            <Field label="Longitude">
              <Input value={form.longitude} onChange={set('longitude')} inputMode="decimal" placeholder="-13.712222" className="font-mono" />
            </Field>
          </div>
          {accuracy != null && (
            <p className={cx('mt-2 text-xs', accuracy > 50 ? 'text-amber-700' : 'text-emerald-700')}>
              Précision : ± {accuracy} m{accuracy > 50 ? ' — sortez à découvert pour plus de précision' : ''}
            </p>
          )}
          <div className="mt-4">
            <div className="flex items-center justify-between text-[13px]">
              <span className="font-medium text-ink-700">Rayon autorisé pour pointer</span>
              <span className="tabular font-semibold text-brand-600">{form.radius_m} m</span>
            </div>
            <input
              type="range"
              min={20}
              max={1000}
              step={10}
              value={form.radius_m}
              onChange={(e) => setForm({ ...form, radius_m: Number(e.target.value) })}
              className="mt-2 w-full accent-brand-500"
            />
            <p className="text-xs text-ink-500">150 m convient à la plupart des sites. Augmentez pour un grand terrain.</p>
          </div>
        </div>

        {site && <Toggle checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label={`${vc.Site} actif`} />}
        {error && <Callout tone="danger">{error}</Callout>}
      </form>
    </Modal>
  )
}

function QrModal({ site, companyName, onClose, onRegenerated }: { site: Site; companyName: string; onClose: () => void; onRegenerated: () => void }) {
  const vc = useVocab()
  const toast = useToast()
  const [token, setToken] = useState(site.qr_token)
  const [src, setSrc] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    qrDataUrl(token, 480).then(setSrc)
  }, [token])

  async function download() {
    const url = await qrPoster(token, site.name, companyName)
    const a = document.createElement('a')
    a.href = url
    a.download = `qr-${site.name.toLowerCase().replace(/\W+/g, '-')}.png`
    a.click()
  }

  async function regenerate() {
    setBusy(true)
    const newToken = crypto.randomUUID().replace(/-/g, '')
    const { error } = await supabase.from('sites').update({ qr_token: newToken }).eq('id', site.id)
    setBusy(false)
    setConfirm(false)
    if (error) return toast.error(errorMessage(error))
    setToken(newToken)
    onRegenerated()
  }

  return (
    <>
      <Modal open onClose={onClose} title="QR code de pointage" description={site.name} size="sm">
        <div className="flex flex-col items-center">
          <div className="rounded-2xl bg-white p-3 ring-1 ring-ink-100">
            {src ? <img src={src} alt={`QR code ${site.name}`} className="size-60" /> : <div className="size-60" />}
          </div>
          <p className="mt-3 max-w-xs text-center text-xs text-ink-500">
            À afficher à l’entrée {vc.duSite}. Les {vc.workers} le scannent à l’arrivée et au départ.
          </p>
          <div className="mt-5 grid w-full grid-cols-2 gap-2">
            <Button variant="secondary" icon={Download} onClick={download}>Télécharger</Button>
            <Link to={`/c/${site.company_id}/sites/qr?site=${site.id}`}>
              <Button className="w-full" icon={Printer}>Imprimer</Button>
            </Link>
          </div>
          <button onClick={() => setConfirm(true)} className="mt-4 inline-flex items-center gap-1.5 text-xs text-ink-500 hover:text-red-600">
            <RefreshCcw className="size-3.5" /> Générer un nouveau code (ancien code désactivé)
          </button>
        </div>
      </Modal>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        loading={busy}
        danger
        title="Remplacer le QR code ?"
        text="L’ancien QR code ne fonctionnera plus. À faire si le code a été photographié ou copié. Pensez à imprimer et afficher le nouveau."
        confirmLabel="Remplacer"
        onConfirm={regenerate}
      />
    </>
  )
}

