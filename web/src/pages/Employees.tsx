import { useVocab } from '../lib/sector'
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import writeExcelFile from 'write-excel-file/browser'
import { Download, IdCard, KeyRound, RefreshCcw, MoreHorizontal, Pencil, Plus, Power, Search, Upload, UserPlus, Users } from 'lucide-react'
import { errorMessage, supabase, type Employee, type PayMode, type Site } from '../lib/supabase'
import { useCompany } from '../lib/company'
import { PAY_MODE_LABELS, PAY_MODE_UNIT } from '../lib/payroll'
import { formatGNF, formatPhone, normalizePhone } from '../lib/format'
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  cx,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  PageHeader,
  PageLoader,
  Select,
  Table,
  Td,
  Th,
  Toggle,
  useToast,
} from '../ui'
import ImportEmployeesModal from './ImportEmployees'

type StatusFilter = 'active' | 'inactive' | 'all'

export default function Employees() {
  const { company } = useCompany()
  const v = useVocab()
  const toast = useToast()
  const [employees, setEmployees] = useState<Employee[] | null>(null)
  const [sites, setSites] = useState<Site[]>([])
  const [withAccess, setWithAccess] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [siteFilter, setSiteFilter] = useState('')
  const [status, setStatus] = useState<StatusFilter>('active')
  const [editing, setEditing] = useState<Employee | 'new' | null>(null)
  const [importing, setImporting] = useState(false)
  const [menu, setMenu] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [e, s, m] = await Promise.all([
      supabase.from('employees').select('*').eq('company_id', company.id).order('full_name'),
      supabase.from('sites').select('*').eq('company_id', company.id).order('name'),
      supabase.from('company_members').select('employee_id').eq('company_id', company.id).not('employee_id', 'is', null),
    ])
    setEmployees((e.data ?? []) as Employee[])
    setSites((s.data ?? []) as Site[])
    setWithAccess(new Set((m.data ?? []).map((x) => x.employee_id as string)))
  }, [company.id])

  useEffect(() => {
    load()
  }, [load])

  const siteName = useMemo(() => Object.fromEntries(sites.map((s) => [s.id, s.name])), [sites])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    const digits = term.replace(/\D/g, '')
    return (employees ?? []).filter((e) => {
      if (status === 'active' && !e.active) return false
      if (status === 'inactive' && e.active) return false
      if (siteFilter === 'none' && e.default_site_id) return false
      if (siteFilter && siteFilter !== 'none' && e.default_site_id !== siteFilter) return false
      if (!term) return true
      return (
        e.full_name.toLowerCase().includes(term) ||
        (e.job_title ?? '').toLowerCase().includes(term) ||
        (digits.length >= 3 && (e.phone ?? '').includes(digits))
      )
    })
  }, [employees, q, status, siteFilter])

  const counts = useMemo(() => {
    const list = employees ?? []
    return { active: list.filter((e) => e.active).length, inactive: list.filter((e) => !e.active).length, all: list.length }
  }, [employees])

  async function toggleActive(e: Employee) {
    setMenu(null)
    const { error } = await supabase.from('employees').update({ active: !e.active }).eq('id', e.id)
    if (error) return toast.error(errorMessage(error))
    toast.success(e.active ? `${e.full_name} est désactivé` : `${e.full_name} est réactivé`)
    load()
  }

  async function newBadge(e: Employee) {
    setMenu(null)
    const { error } = await supabase.from('employees').update({ badge_token: crypto.randomUUID().replace(/-/g, '') }).eq('id', e.id)
    if (error) return toast.error(errorMessage(error))
    toast.success(`Nouveau badge pour ${e.full_name} : l’ancien ne fonctionne plus. Pensez à l’imprimer.`)
    load()
  }

  async function exportExcel() {
    const rows = (employees ?? []).filter((e) => e.active)
    await writeExcelFile(
      [
        ['Nom complet', 'Téléphone', 'Poste', v.Site, 'Mode de paie', 'Montant (GNF)'].map((v) => ({ value: v, fontWeight: 'bold' as const })),
        ...rows.map((e) => [
          { value: e.full_name },
          { value: e.phone ? formatPhone(e.phone) : '' },
          { value: e.job_title ?? '' },
          { value: e.default_site_id ? siteName[e.default_site_id] ?? '' : '' },
          { value: PAY_MODE_LABELS[e.pay_mode ?? 'monthly'] },
          { value: Number(e.pay_mode === 'monthly' || !e.pay_mode ? e.base_salary : e.pay_rate), format: '#,##0' },
        ]),
      ],
      { columns: [{ width: 28 }, { width: 18 }, { width: 18 }, { width: 24 }, { width: 14 }, { width: 16 }] },
    ).toFile(`employes-${company.name.toLowerCase().replace(/\W+/g, '-')}.xlsx`)
  }

  return (
    <>
      <PageHeader
        title={v.Workers}
        description={`Fiches du personnel, ${v.site} d’affectation et salaire de base.`}
        actions={
          <>
            <Button variant="secondary" icon={Download} onClick={exportExcel} disabled={!counts.active}>
              Exporter
            </Button>
            <Link to={`/c/${company.id}/badges`}>
              <Button variant="secondary" icon={IdCard} disabled={!counts.active}>Badges</Button>
            </Link>
            <Button variant="secondary" icon={Upload} onClick={() => setImporting(true)}>
              Importer Excel
            </Button>
            <Button icon={Plus} onClick={() => setEditing('new')}>
              Ajouter
            </Button>
          </>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-ink-100 p-4 lg:flex-row lg:items-center">
          <Input
            leading={<Search className="size-4" />}
            placeholder="Nom, poste ou téléphone…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="lg:max-w-xs"
          />
          <Select value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)} className="lg:max-w-52">
            <option value="">Tous les {v.sites}</option>
            <option value="none">Sans {v.site}</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
          <div className="flex rounded-xl bg-ink-100 p-1 text-[13px] font-medium lg:ml-auto">
            {(
              [
                ['active', 'Actifs'],
                ['inactive', 'Inactifs'],
                ['all', 'Tous'],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setStatus(k)}
                className={cx(
                  'flex-1 rounded-lg px-3 py-1.5 whitespace-nowrap transition-all',
                  status === k ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800',
                )}
              >
                {l} <span className="tabular text-ink-400">{counts[k]}</span>
              </button>
            ))}
          </div>
        </div>

        {!employees ? (
          <PageLoader />
        ) : employees.length === 0 ? (
          <EmptyState
            icon={Users}
            title={`Aucun ${v.worker}`}
            text={`Importez votre liste depuis Excel en une fois, ou ajoutez les ${v.workers} un par un.`}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="secondary" icon={Upload} onClick={() => setImporting(true)}>Importer Excel</Button>
                <Button icon={UserPlus} onClick={() => setEditing('new')}>Ajouter un {v.worker}</Button>
              </div>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Search} title="Aucun résultat" text="Modifiez la recherche ou les filtres." />
        ) : (
          <>
            {/* Ordinateur */}
            <div className="hidden md:block">
              <Table>
                <thead>
                  <tr>
                    <Th>{v.Worker}</Th>
                    <Th>Téléphone</Th>
                    <Th>{v.Site}</Th>
                    <Th className="text-right">Rémunération</Th>
                    <Th>Accès</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr key={e.id} className={cx('hover:bg-ink-50/60', !e.active && 'opacity-60')}>
                      <Td>
                        <div className="flex items-center gap-3">
                          <Avatar name={e.full_name} />
                          <div>
                            <p className="font-medium text-ink-900">{e.full_name}</p>
                            <p className="text-xs text-ink-500">{e.job_title || '—'}</p>
                          </div>
                        </div>
                      </Td>
                      <Td className="tabular text-ink-700">{formatPhone(e.phone)}</Td>
                      <Td className="text-ink-700">
                        {e.default_site_id ? siteName[e.default_site_id] : <span className="text-ink-400">Non affecté</span>}
                      </Td>
                      <Td className="tabular text-right text-ink-700">
                        {formatGNF(e.pay_mode === 'monthly' || !e.pay_mode ? e.base_salary : e.pay_rate)}
                        <span className="text-ink-400"> {PAY_MODE_UNIT[e.pay_mode ?? 'monthly']}</span>
                      </Td>
                      <Td>
                        {!e.active ? (
                          <Badge>Inactif</Badge>
                        ) : withAccess.has(e.id) ? (
                          <Badge tone="green" dot>Oui</Badge>
                        ) : (
                          <Link to={`/c/${company.id}/acces?employe=${e.id}`}>
                            <Badge tone="neutral">Créer</Badge>
                          </Link>
                        )}
                      </Td>
                      <Td className="w-0">
                        <RowMenu
                          open={menu === e.id}
                          onOpen={() => setMenu(menu === e.id ? null : e.id)}
                          onClose={() => setMenu(null)}
                          employee={e}
                          companyId={company.id}
                          hasAccess={withAccess.has(e.id)}
                          onEdit={() => { setMenu(null); setEditing(e) }}
                          onToggle={() => toggleActive(e)}
                          onNewBadge={() => newBadge(e)}
                        />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            {/* Mobile */}
            <ul className="divide-y divide-ink-100 md:hidden">
              {filtered.map((e) => (
                <li key={e.id} className={cx('flex items-center gap-3 px-4 py-3', !e.active && 'opacity-60')}>
                  <Avatar name={e.full_name} />
                  <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(e)}>
                    <p className="truncate font-medium">{e.full_name}</p>
                    <p className="truncate text-xs text-ink-500">
                      {[e.job_title, e.default_site_id && siteName[e.default_site_id], formatPhone(e.phone)].filter(Boolean).join(' · ')}
                    </p>
                  </button>
                  {withAccess.has(e.id) && <KeyRound className="size-4 text-emerald-500" />}
                  <IconButton icon={Pencil} label="Modifier" onClick={() => setEditing(e)} />
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {editing && (
        <EmployeeModal
          employee={editing === 'new' ? null : editing}
          sites={sites}
          companyId={company.id}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}
      <ImportEmployeesModal
        open={importing}
        onClose={() => setImporting(false)}
        companyId={company.id}
        sites={sites}
        existing={employees ?? []}
        onDone={load}
      />
    </>
  )
}

function RowMenu({
  open,
  onOpen,
  onClose,
  employee,
  companyId,
  hasAccess,
  onEdit,
  onToggle,
  onNewBadge,
}: {
  open: boolean
  onOpen: () => void
  onClose: () => void
  employee: Employee
  companyId: string
  hasAccess: boolean
  onEdit: () => void
  onToggle: () => void
  onNewBadge: () => void
}) {
  return (
    <div className="relative">
      <IconButton icon={MoreHorizontal} label="Actions" onClick={onOpen} />
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={onClose} />
          <div className="animate-in absolute right-0 z-20 mt-1 w-52 rounded-xl bg-white p-1 shadow-pop ring-1 ring-ink-100">
            <MenuItem icon={Pencil} onClick={onEdit}>Modifier</MenuItem>
            {!hasAccess && employee.active && (
              <Link to={`/c/${companyId}/acces?employe=${employee.id}`}>
                <MenuItem icon={KeyRound}>Donner un accès</MenuItem>
              </Link>
            )}
            {employee.active && (
              <Link to={`/c/${companyId}/badges?e=${employee.id}`}>
                <MenuItem icon={IdCard}>Imprimer le badge</MenuItem>
              </Link>
            )}
            {employee.active && <MenuItem icon={RefreshCcw} onClick={onNewBadge}>Nouveau badge (perte)</MenuItem>}
            <MenuItem icon={Power} onClick={onToggle} danger={employee.active}>
              {employee.active ? 'Désactiver' : 'Réactiver'}
            </MenuItem>
          </div>
        </>
      )}
    </div>
  )
}

function MenuItem({
  icon: Icon,
  children,
  onClick,
  danger,
}: {
  icon: typeof Pencil
  children: ReactNode
  onClick?: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm',
        danger ? 'text-red-600 hover:bg-red-50' : 'text-ink-700 hover:bg-ink-50',
      )}
    >
      <Icon className="size-4" />
      {children}
    </button>
  )
}

function EmployeeModal({
  employee,
  sites,
  companyId,
  onClose,
  onSaved,
}: {
  employee: Employee | null
  sites: Site[]
  companyId: string
  onClose: () => void
  onSaved: () => void
}) {
  const vc = useVocab()
  const toast = useToast()
  const [form, setForm] = useState({
    full_name: employee?.full_name ?? '',
    phone: employee?.phone ? formatPhone(employee.phone).replace('+224 ', '') : '',
    job_title: employee?.job_title ?? vc.jobTitles[0],
    default_site_id: employee?.default_site_id ?? '',
    base_salary: String(employee?.base_salary ?? ''),
    pay_mode: (employee?.pay_mode ?? 'monthly') as PayMode,
    pay_rate: String(employee?.pay_rate || ''),
    hire_date: employee?.hire_date ?? '',
    active: employee?.active ?? true,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })

  async function save(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const phone = form.phone.trim() ? normalizePhone(form.phone) : null
    if (form.phone.trim() && !phone) return setError('Numéro de téléphone invalide (ex. 622 12 34 56)')
    setLoading(true)
    const payload = {
      company_id: companyId,
      full_name: form.full_name.trim(),
      phone,
      job_title: form.job_title.trim() || null,
      default_site_id: form.default_site_id || null,
      base_salary: Number(form.base_salary || 0),
      pay_mode: form.pay_mode,
      pay_rate: Number(form.pay_rate || 0),
      hire_date: form.hire_date || null,
      active: form.active,
    }
    const { error } = employee
      ? await supabase.from('employees').update(payload).eq('id', employee.id)
      : await supabase.from('employees').insert(payload)
    setLoading(false)
    if (error) {
      return setError(error.code === '23505' ? `Un ${vc.worker} utilise déjà ce numéro de téléphone.` : errorMessage(error))
    }
    toast.success(employee ? 'Fiche mise à jour' : `${payload.full_name} est ajouté`)
    onSaved()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={employee ? `Modifier l’${vc.worker}` : `Nouvel ${vc.worker}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" form="emp-form" loading={loading}>{employee ? 'Enregistrer' : 'Ajouter'}</Button>
        </>
      }
    >
      <form id="emp-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom complet" className="sm:col-span-2">
          <Input value={form.full_name} onChange={set('full_name')} placeholder="Ex. Ibrahima Sow" required autoFocus />
        </Field>
        <Field label="Téléphone">
          <Input value={form.phone} onChange={set('phone')} inputMode="tel" placeholder="622 12 34 56" />
        </Field>
        <Field label="Poste">
          <Input value={form.job_title} onChange={set('job_title')} list="job-titles" />
          <datalist id="job-titles">
            {vc.jobTitles.map((j) => (
              <option key={j} value={j} />
            ))}
          </datalist>
        </Field>
        <Field label={`${vc.Site} d’affectation`}>
          <Select value={form.default_site_id} onChange={set('default_site_id')}>
            <option value="">Non affecté</option>
            {sites.filter((s) => s.active || s.id === form.default_site_id).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <span className="mb-1.5 block text-[13px] font-medium text-ink-700">Mode de paie</span>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['monthly', 'Au mois', 'Salaire fixe'],
                ['per_shift', vc.AuShift, `Tarif × ${vc.shifts} fait${vc.sx(2)}`],
                ['hourly', 'À l’heure', 'Tarif × heures pointées'],
              ] as const
            ).map(([v, t, d]) => (
              <button
                key={v}
                type="button"
                onClick={() => setForm({ ...form, pay_mode: v })}
                className={cx(
                  'rounded-xl p-2.5 text-left ring-1 transition-all',
                  form.pay_mode === v ? 'bg-brand-50 ring-2 ring-brand-500' : 'ring-ink-200 hover:ring-ink-300',
                )}
              >
                <span className="block text-sm font-medium">{t}</span>
                <span className="block text-[11px] text-ink-500">{d}</span>
              </button>
            ))}
          </div>
        </div>
        {form.pay_mode === 'monthly' ? (
          <Field label="Salaire mensuel (GNF)">
            <Input type="number" min={0} step={5000} inputMode="numeric" value={form.base_salary} onChange={set('base_salary')} placeholder="1 500 000" />
          </Field>
        ) : (
          <Field
            label={form.pay_mode === 'per_shift' ? `Tarif par ${vc.shift} (GNF)` : 'Tarif horaire (GNF)'}
            hint={form.pay_mode === 'per_shift' ? `Payé pour chaque ${vc.shift} effectué${vc.sx()}.` : 'Payé à la minute près, selon les pointages.'}
          >
            <Input type="number" min={0} step={form.pay_mode === 'per_shift' ? 1000 : 500} inputMode="numeric" value={form.pay_rate} onChange={set('pay_rate')} placeholder={form.pay_mode === 'per_shift' ? '60 000' : '5 000'} required />
          </Field>
        )}
        <Field label="Date d’embauche" hint="Pour la prime d’ancienneté.">
          <Input type="date" value={form.hire_date} onChange={set('hire_date')} />
        </Field>
        {employee && (
          <div className="sm:col-span-2">
            <Toggle checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label={`${vc.Worker} actif`} />
          </div>
        )}
        {error && <div className="sm:col-span-2"><Callout tone="danger">{error}</Callout></div>}
      </form>
    </Modal>
  )
}
