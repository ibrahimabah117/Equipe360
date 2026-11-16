import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  ArrowUpRight,
  Building2,
  CircleDollarSign,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react'
import { errorMessage, manageAccess, supabase, type Company } from '../lib/supabase'
import { formatDate, formatGNF, generatePin, normalizePhone, sectorLabel, SECTORS } from '../lib/format'
import {
  Badge,
  Button,
  Callout,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  PageHeader,
  PageLoader,
  Select,
  StatCard,
  Table,
  Td,
  Textarea,
  Th,
  useToast,
} from '../ui'
import { CredentialsCard } from '../ui/Credentials'

const today = () => new Date().toISOString().slice(0, 10)
const inOneMonth = () => {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 10)
}

function subscriptionBadge(c: Company) {
  if (c.status === 'suspended') return <Badge tone="red" dot>Suspendu</Badge>
  if (!c.paid_until) return <Badge tone="neutral" dot>Sans échéance</Badge>
  if (c.paid_until < today()) return <Badge tone="amber" dot>Impayé</Badge>
  return <Badge tone="green" dot>Actif</Badge>
}

export default function AdminClients() {
  const toast = useToast()
  const [companies, setCompanies] = useState<Company[] | null>(null)
  const [headcount, setHeadcount] = useState<Record<string, number>>({})
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Company | null>(null)
  const [toggling, setToggling] = useState<Company | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [{ data: cs }, { data: emps }] = await Promise.all([
      supabase.from('companies').select('*').order('created_at', { ascending: false }),
      supabase.from('employees').select('company_id').eq('active', true),
    ])
    setCompanies((cs ?? []) as Company[])
    const counts: Record<string, number> = {}
    for (const e of emps ?? []) counts[e.company_id] = (counts[e.company_id] ?? 0) + 1
    setHeadcount(counts)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const stats = useMemo(() => {
    const list = companies ?? []
    const active = list.filter((c) => c.status === 'active')
    return {
      active: active.length,
      mrr: active.reduce((s, c) => s + Number(c.monthly_price || 0), 0),
      overdue: active.filter((c) => c.paid_until && c.paid_until < today()).length,
      employees: Object.values(headcount).reduce((a, b) => a + b, 0),
    }
  }, [companies, headcount])

  const filtered = (companies ?? []).filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()))

  async function toggleStatus() {
    if (!toggling) return
    setBusy(true)
    const next = toggling.status === 'active' ? 'suspended' : 'active'
    const { error } = await supabase.rpc('admin_update_subscription', { p_company_id: toggling.id, p_status: next })
    setBusy(false)
    if (error) return toast.error(errorMessage(error))
    toast.success(next === 'suspended' ? `${toggling.name} est suspendu` : `${toggling.name} est réactivé`)
    setToggling(null)
    load()
  }

  return (
    <>
      <PageHeader
        title="Clients Équipe360"
        description="Entreprises abonnées, abonnements et suspensions."
        actions={
          <Button icon={Plus} onClick={() => setCreating(true)}>
            Nouveau client
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard icon={Building2} label="Clients actifs" value={stats.active} />
        <StatCard icon={CircleDollarSign} label="Revenu mensuel" value={formatGNF(stats.mrr)} tone="green" sub="Abonnements actifs" />
        <StatCard icon={AlertCircle} label="Impayés" value={stats.overdue} tone={stats.overdue ? 'amber' : 'green'} sub="Échéance dépassée" />
        <StatCard icon={Users} label="Employés gérés" value={stats.employees} />
      </div>

      <Card>
        <div className="flex items-center gap-3 border-b border-ink-100 p-4">
          <Input
            leading={<Search className="size-4" />}
            placeholder="Rechercher un client…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-xs"
          />
          <IconButton icon={RefreshCw} label="Actualiser" onClick={load} className="ml-auto" />
        </div>

        {!companies ? (
          <PageLoader />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Building2}
            title={companies.length ? 'Aucun résultat' : 'Aucun client pour l’instant'}
            text={companies.length ? 'Essayez un autre nom.' : 'Créez votre premier client et son accès propriétaire.'}
            action={
              !companies.length && (
                <Button icon={Plus} onClick={() => setCreating(true)}>
                  Nouveau client
                </Button>
              )
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Entreprise</Th>
                <Th className="hidden md:table-cell">Employés</Th>
                <Th>Abonnement</Th>
                <Th className="hidden sm:table-cell">Payé jusqu’au</Th>
                <Th className="hidden lg:table-cell">Statut</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="group hover:bg-ink-50/60">
                  <Td>
                    <Link to={`/c/${c.id}`} className="flex items-center gap-3">
                      <span className="flex size-9 items-center justify-center rounded-xl bg-ink-900 text-xs font-bold text-white">
                        {c.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span>
                        <span className="block font-medium text-ink-900 group-hover:text-brand-600">{c.name}</span>
                        <span className="block text-xs text-ink-500">{sectorLabel(c.sector)}</span>
                      </span>
                    </Link>
                  </Td>
                  <Td className="tabular hidden text-ink-700 md:table-cell">{headcount[c.id] ?? 0}</Td>
                  <Td className="tabular text-ink-700">{formatGNF(c.monthly_price)}<span className="text-ink-400"> /mois</span></Td>
                  <Td className="tabular hidden text-ink-700 sm:table-cell">{formatDate(c.paid_until)}</Td>
                  <Td className="hidden lg:table-cell">{subscriptionBadge(c)}</Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      <IconButton icon={Pencil} label="Modifier l’abonnement" onClick={() => setEditing(c)} />
                      <IconButton
                        icon={c.status === 'active' ? Pause : Play}
                        label={c.status === 'active' ? 'Suspendre' : 'Réactiver'}
                        onClick={() => setToggling(c)}
                      />
                      <Link to={`/c/${c.id}`}>
                        <IconButton icon={ArrowUpRight} label="Ouvrir" />
                      </Link>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <NewClientModal open={creating} onClose={() => setCreating(false)} onCreated={load} />
      {editing && <SubscriptionModal company={editing} onClose={() => setEditing(null)} onSaved={load} />}
      <ConfirmDialog
        open={!!toggling}
        onClose={() => setToggling(null)}
        loading={busy}
        danger={toggling?.status === 'active'}
        title={toggling?.status === 'active' ? 'Suspendre ce client ?' : 'Réactiver ce client ?'}
        confirmLabel={toggling?.status === 'active' ? 'Suspendre' : 'Réactiver'}
        text={
          toggling?.status === 'active'
            ? `Les utilisateurs de ${toggling?.name} ne pourront plus accéder à leurs données tant que le compte est suspendu. Rien n’est supprimé.`
            : `Les utilisateurs de ${toggling?.name} retrouveront immédiatement leur accès.`
        }
        onConfirm={toggleStatus}
      />
    </>
  )
}

function NewClientModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const toast = useToast()
  const [form, setForm] = useState({
    name: '',
    sector: 'gardiennage',
    phone: '',
    price: '400000',
    paidUntil: inOneMonth(),
    ownerName: '',
    ownerPhone: '',
    ownerPassword: generatePin(),
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ name: string; phone: string; password: string; company: string } | null>(null)
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })

  function close() {
    onClose()
    setTimeout(() => {
      setDone(null)
      setError(null)
      setForm({ name: '', sector: 'gardiennage', phone: '', price: '400000', paidUntil: inOneMonth(), ownerName: '', ownerPhone: '', ownerPassword: generatePin() })
    }, 200)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const wantsOwner = form.ownerPhone.trim() !== ''
    if (wantsOwner && !normalizePhone(form.ownerPhone)) return setError('Numéro du propriétaire invalide')
    setLoading(true)
    try {
      const { data: id, error: e1 } = await supabase.rpc('create_company', { p_name: form.name.trim(), p_sector: form.sector })
      if (e1) throw e1
      const { error: e2 } = await supabase.rpc('admin_update_subscription', {
        p_company_id: id,
        p_monthly_price: Number(form.price || 0),
        p_paid_until: form.paidUntil || null,
      })
      if (e2) throw e2
      if (form.phone.trim()) {
        await supabase.from('companies').update({ phone: normalizePhone(form.phone) ?? form.phone.trim() }).eq('id', id)
      }
      onCreated()
      if (wantsOwner) {
        const res = await manageAccess({
          action: 'create',
          company_id: id,
          role: 'owner',
          phone: form.ownerPhone,
          password: form.ownerPassword,
          display_name: form.ownerName.trim() || null,
        })
        setDone({ name: form.ownerName.trim() || 'le propriétaire', phone: res.phone!, password: form.ownerPassword, company: form.name.trim() })
      } else {
        toast.success(`${form.name} est créé`)
        close()
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={done ? 'Client créé' : 'Nouveau client'}
      description={done ? undefined : 'Créez l’entreprise, son abonnement et l’accès de son propriétaire.'}
      size="lg"
      footer={
        done ? (
          <Button onClick={close}>Terminé</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>
              Annuler
            </Button>
            <Button type="submit" form="new-client" loading={loading}>
              Créer le client
            </Button>
          </>
        )
      }
    >
      {done ? (
        <CredentialsCard name={done.name} phone={done.phone} password={done.password} companyName={done.company} />
      ) : (
        <form id="new-client" onSubmit={submit} className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-2">
            <Field label="Nom de l’entreprise" className="sm:col-span-2">
              <Input value={form.name} onChange={set('name')} placeholder="Ex. Sécurité Plus SARL" required autoFocus />
            </Field>
            <Field label="Secteur">
              <Select value={form.sector} onChange={set('sector')}>
                {SECTORS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Téléphone de l’entreprise">
              <Input value={form.phone} onChange={set('phone')} inputMode="tel" placeholder="622 00 00 00" />
            </Field>
            <Field label="Prix mensuel (GNF)">
              <Input value={form.price} onChange={set('price')} inputMode="numeric" type="number" min={0} step={1000} />
            </Field>
            <Field label="Payé jusqu’au">
              <Input type="date" value={form.paidUntil} onChange={set('paidUntil')} />
            </Field>
          </section>

          <section className="rounded-xl bg-ink-50 p-4 ring-1 ring-ink-100">
            <p className="text-sm font-medium text-ink-900">Accès du propriétaire</p>
            <p className="mb-4 text-xs text-ink-500">Facultatif — il pourra ensuite créer les accès de ses responsables et agents.</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Nom complet">
                <Input value={form.ownerName} onChange={set('ownerName')} placeholder="Mamadou Diallo" />
              </Field>
              <Field label="Téléphone">
                <Input value={form.ownerPhone} onChange={set('ownerPhone')} inputMode="tel" placeholder="622 12 34 56" />
              </Field>
              <Field label="Mot de passe">
                <Input value={form.ownerPassword} onChange={set('ownerPassword')} className="font-mono" minLength={6} />
              </Field>
            </div>
          </section>

          {error && <Callout tone="danger">{error}</Callout>}
        </form>
      )}
    </Modal>
  )
}

function SubscriptionModal({ company, onClose, onSaved }: { company: Company; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [price, setPrice] = useState(String(company.monthly_price ?? 0))
  const [paidUntil, setPaidUntil] = useState(company.paid_until ?? '')
  const [note, setNote] = useState(company.admin_note ?? '')
  const [loading, setLoading] = useState(false)

  function addMonth() {
    const base = paidUntil && paidUntil > today() ? new Date(paidUntil + 'T00:00:00') : new Date()
    base.setMonth(base.getMonth() + 1)
    setPaidUntil(base.toISOString().slice(0, 10))
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.rpc('admin_update_subscription', {
      p_company_id: company.id,
      p_monthly_price: Number(price || 0),
      p_paid_until: paidUntil || null,
      p_admin_note: note,
    })
    setLoading(false)
    if (error) return toast.error(errorMessage(error))
    toast.success('Abonnement mis à jour')
    onSaved()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Abonnement"
      description={company.name}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" form="sub-form" loading={loading}>Enregistrer</Button>
        </>
      }
    >
      <form id="sub-form" onSubmit={save} className="space-y-4">
        <Field label="Prix mensuel (GNF)">
          <Input type="number" min={0} step={1000} value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field label="Payé jusqu’au" hint="Après un paiement, ajoutez un mois en un clic.">
          <div className="flex gap-2">
            <Input type="date" value={paidUntil} onChange={(e) => setPaidUntil(e.target.value)} />
            <Button type="button" variant="secondary" onClick={addMonth}>+1 mois</Button>
          </div>
        </Field>
        <Field label="Note interne">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. paie par Orange Money le 5 du mois" />
        </Field>
      </form>
    </Modal>
  )
}
