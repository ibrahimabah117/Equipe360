import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { KeyRound, Plus, RotateCcw, ShieldCheck, Smartphone, Trash2, UserCog } from 'lucide-react'
import { errorMessage, manageAccess, supabase, type Employee, type Member, type Role } from '../lib/supabase'
import { useCompany } from '../lib/company'
import { useAuth } from '../lib/auth'
import { formatDate, formatPhone, generatePin, normalizePhone, ROLE_LABELS } from '../lib/format'
import {
  Avatar,
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
  Select,
  Table,
  Td,
  Th,
  useToast,
} from '../ui'
import { CredentialsCard } from '../ui/Credentials'

const roleTone = { owner: 'brand', manager: 'amber', agent: 'neutral' } as const

export default function Access() {
  const { company, isOwnerLevel } = useCompany()
  const { session } = useAuth()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [members, setMembers] = useState<Member[] | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [creating, setCreating] = useState<string | boolean>(false)
  const [resetting, setResetting] = useState<{ m: Member; password: string } | null>(null)
  const [creds, setCreds] = useState<{ name: string; phone: string; password: string } | null>(null)
  const [removing, setRemoving] = useState<Member | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [m, e] = await Promise.all([
      supabase.from('company_members').select('*').eq('company_id', company.id).order('created_at'),
      supabase.from('employees').select('*').eq('company_id', company.id).eq('active', true).order('full_name'),
    ])
    setMembers((m.data ?? []) as Member[])
    setEmployees((e.data ?? []) as Employee[])
  }, [company.id])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const id = params.get('employe')
    if (id) {
      setCreating(id)
      params.delete('employe')
      setParams(params, { replace: true })
    }
  }, [params, setParams])

  const empById = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees])
  const linked = useMemo(() => new Set((members ?? []).map((m) => m.employee_id).filter(Boolean)), [members])
  const nameOf = (m: Member) => m.display_name || (m.employee_id && empById[m.employee_id]?.full_name) || formatPhone(m.phone)
  const canHandle = (m: Member) => isOwnerLevel || m.role === 'agent'

  async function doReset() {
    if (!resetting) return
    setBusy(true)
    try {
      await manageAccess({ action: 'reset_password', company_id: company.id, user_id: resetting.m.user_id, password: resetting.password })
      setCreds({ name: nameOf(resetting.m), phone: resetting.m.phone ?? '', password: resetting.password })
      setResetting(null)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function doRemove() {
    if (!removing) return
    setBusy(true)
    try {
      await manageAccess({ action: 'remove', company_id: company.id, user_id: removing.user_id })
      toast.success(`Accès de ${nameOf(removing)} retiré`)
      setRemoving(null)
      load()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Comptes d’accès"
        description="Qui peut se connecter à Équipe360 pour votre entreprise, et avec quels droits."
        actions={<Button icon={Plus} onClick={() => setCreating(true)}>Donner un accès</Button>}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {[
          { icon: ShieldCheck, t: 'Propriétaire', d: 'Tous les droits, gère les responsables.' },
          { icon: UserCog, t: 'Responsable', d: 'Gère employés, sites, planning et accès agents.' },
          { icon: Smartphone, t: 'Agent', d: 'Pointe et consulte son planning sur son téléphone.' },
        ].map((r) => (
          <div key={r.t} className="flex gap-3 rounded-2xl bg-white p-4 ring-1 ring-ink-100">
            <r.icon className="mt-0.5 size-5 shrink-0 text-brand-500" />
            <div>
              <p className="text-sm font-medium">{r.t}</p>
              <p className="text-xs text-ink-500">{r.d}</p>
            </div>
          </div>
        ))}
      </div>

      <Card>
        {!members ? (
          <PageLoader />
        ) : members.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="Aucun compte d’accès"
            text="Créez un accès par numéro de téléphone, puis envoyez les identifiants par WhatsApp."
            action={<Button icon={Plus} onClick={() => setCreating(true)}>Donner un accès</Button>}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Personne</Th>
                <Th className="hidden sm:table-cell">Identifiant</Th>
                <Th>Rôle</Th>
                <Th className="hidden md:table-cell">Créé le</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id} className="hover:bg-ink-50/60">
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={nameOf(m)} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {nameOf(m)} {m.user_id === session?.user.id && <span className="text-xs font-normal text-ink-400">(vous)</span>}
                        </p>
                        <p className="truncate text-xs text-ink-500">
                          {m.employee_id ? empById[m.employee_id]?.job_title ?? 'Employé' : 'Non lié à une fiche employé'}
                        </p>
                      </div>
                    </div>
                  </Td>
                  <Td className="tabular hidden text-ink-700 sm:table-cell">{m.phone ? formatPhone(m.phone) : 'E-mail'}</Td>
                  <Td><Badge tone={roleTone[m.role]}>{ROLE_LABELS[m.role]}</Badge></Td>
                  <Td className="hidden text-ink-600 md:table-cell">{formatDate(m.created_at)}</Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      {canHandle(m) && m.phone && (
                        <IconButton icon={RotateCcw} label="Nouveau mot de passe" onClick={() => setResetting({ m, password: generatePin() })} />
                      )}
                      {canHandle(m) && m.user_id !== session?.user.id && (
                        <IconButton icon={Trash2} label="Retirer l’accès" onClick={() => setRemoving(m)} className="hover:text-red-600" />
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {creating !== false && (
        <CreateAccessModal
          companyId={company.id}
          companyName={company.name}
          employees={employees.filter((e) => !linked.has(e.id))}
          preselect={typeof creating === 'string' ? creating : null}
          allowManagers={isOwnerLevel}
          onClose={() => setCreating(false)}
          onCreated={load}
        />
      )}

      <Modal
        open={!!resetting}
        onClose={() => setResetting(null)}
        title="Nouveau mot de passe"
        description={resetting ? nameOf(resetting.m) : ''}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetting(null)}>Annuler</Button>
            <Button onClick={doReset} loading={busy}>Valider</Button>
          </>
        }
      >
        {resetting && (
          <Field label="Nouveau mot de passe" hint="6 caractères minimum. L’ancien ne fonctionnera plus.">
            <Input className="font-mono" value={resetting.password} onChange={(e) => setResetting({ ...resetting, password: e.target.value })} />
          </Field>
        )}
      </Modal>

      <Modal open={!!creds} onClose={() => setCreds(null)} title="Mot de passe changé" footer={<Button onClick={() => setCreds(null)}>Terminé</Button>}>
        {creds && <CredentialsCard name={creds.name} phone={creds.phone} password={creds.password} companyName={company.name} />}
      </Modal>

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        loading={busy}
        danger
        title="Retirer cet accès ?"
        confirmLabel="Retirer"
        text={<>{removing && nameOf(removing)} ne pourra plus se connecter. Sa fiche employé et son historique sont conservés.</>}
        onConfirm={doRemove}
      />
    </>
  )
}

function CreateAccessModal({
  companyId,
  companyName,
  employees,
  preselect,
  allowManagers,
  onClose,
  onCreated,
}: {
  companyId: string
  companyName: string
  employees: Employee[]
  preselect: string | null
  allowManagers: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const pre = preselect ? employees.find((e) => e.id === preselect) : undefined
  const [role, setRole] = useState<Role>('agent')
  const [employeeId, setEmployeeId] = useState(pre?.id ?? '')
  const [name, setName] = useState(pre?.full_name ?? '')
  const [phone, setPhone] = useState(pre?.phone ? formatPhone(pre.phone).replace('+224 ', '') : '')
  const [password, setPassword] = useState(generatePin())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ name: string; phone: string; password: string } | null>(null)

  function pickEmployee(id: string) {
    setEmployeeId(id)
    const e = employees.find((x) => x.id === id)
    if (e) {
      setName(e.full_name)
      setPhone(e.phone ? formatPhone(e.phone).replace('+224 ', '') : '')
    }
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault()
    setError(null)
    if (role === 'agent' && !employeeId) return setError('Choisissez l’employé concerné.')
    if (!normalizePhone(phone)) return setError('Numéro de téléphone invalide (ex. 622 12 34 56)')
    setLoading(true)
    try {
      const res = await manageAccess({
        action: 'create',
        company_id: companyId,
        role,
        phone,
        password,
        display_name: name.trim() || null,
        employee_id: employeeId || null,
      })
      setDone({ name: name.trim() || 'cette personne', phone: res.phone!, password })
      onCreated()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  const roles: { v: Role; t: string; d: string }[] = [
    { v: 'agent', t: 'Agent', d: 'Pointage et planning' },
    ...(allowManagers
      ? [
          { v: 'manager' as Role, t: 'Responsable', d: 'Gestion quotidienne' },
          { v: 'owner' as Role, t: 'Propriétaire', d: 'Tous les droits' },
        ]
      : []),
  ]

  return (
    <Modal
      open
      onClose={onClose}
      title={done ? 'Accès créé' : 'Donner un accès'}
      description={done ? undefined : 'Connexion par numéro de téléphone et mot de passe.'}
      footer={
        done ? (
          <Button onClick={onClose}>Terminé</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>Annuler</Button>
            <Button type="submit" form="access-form" loading={loading}>Créer l’accès</Button>
          </>
        )
      }
    >
      {done ? (
        <CredentialsCard name={done.name} phone={done.phone} password={done.password} companyName={companyName} />
      ) : (
        <form id="access-form" onSubmit={submit} className="space-y-4">
          {roles.length > 1 && (
            <div className="grid grid-cols-3 gap-2">
              {roles.map((r) => (
                <button
                  key={r.v}
                  type="button"
                  onClick={() => setRole(r.v)}
                  className={cx(
                    'rounded-xl p-3 text-left ring-1 transition-all',
                    role === r.v ? 'bg-brand-50 ring-2 ring-brand-500' : 'ring-ink-200 hover:ring-ink-300',
                  )}
                >
                  <p className="text-sm font-medium">{r.t}</p>
                  <p className="text-[11px] text-ink-500">{r.d}</p>
                </button>
              ))}
            </div>
          )}

          <Field label={role === 'agent' ? 'Employé' : 'Fiche employé (facultatif)'}>
            <Select value={employeeId} onChange={(e) => pickEmployee(e.target.value)}>
              <option value="">{role === 'agent' ? 'Choisir un employé…' : 'Aucune'}</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.full_name}{e.job_title ? ` — ${e.job_title}` : ''}</option>
              ))}
            </Select>
          </Field>
          {role === 'agent' && employees.length === 0 && (
            <Callout tone="warning">Tous vos employés actifs ont déjà un accès, ou aucun employé n’est enregistré.</Callout>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nom affiché">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mamadou Diallo" required />
            </Field>
            <Field label="Téléphone (identifiant)">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="622 12 34 56" required />
            </Field>
          </div>
          <Field label="Mot de passe" hint="Généré automatiquement — modifiable. 6 caractères minimum.">
            <div className="flex gap-2">
              <Input value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" minLength={6} required />
              <Button type="button" variant="secondary" onClick={() => setPassword(generatePin())} icon={RotateCcw}>Autre</Button>
            </div>
          </Field>
          {error && <Callout tone="danger">{error}</Callout>}
        </form>
      )}
    </Modal>
  )
}
