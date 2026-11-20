import { useVocab, type Vocab } from '../lib/sector'
import { useMemo, useRef, useState } from 'react'
import { readSheet } from 'read-excel-file/browser'
import writeExcelFile from 'write-excel-file/browser'
import { AlertTriangle, CheckCircle2, FileSpreadsheet, UploadCloud } from 'lucide-react'
import { errorMessage, supabase, type Employee, type Site } from '../lib/supabase'
import { formatGNF, formatPhone, normalizePhone } from '../lib/format'
import { Badge, Button, Callout, cx, Modal, Table, Td, Th, Toggle, useToast } from '../ui'

interface ParsedRow {
  line: number
  full_name: string
  phone: string | null
  phoneRaw: string
  job_title: string | null
  site: string | null
  base_salary: number
  pay_mode: 'monthly' | 'per_shift' | 'hourly'
  error: string | null
  update: boolean
}

const norm = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const COLS: Record<keyof Pick<ParsedRow, 'full_name' | 'phoneRaw' | 'job_title' | 'site' | 'base_salary' | 'pay_mode'>, string[]> = {
  pay_mode: ['mode de paie', 'mode', 'type de paie', 'paiement', 'mode de paiement'],
  full_name: ['nom complet', 'nom et prenom', 'nom prenom', 'prenom nom', 'nom', 'name', 'full name', 'employe', 'agent', 'ouvrier', 'personnel'],
  phoneRaw: ['telephone', 'tel', 'phone', 'numero', 'contact', 'portable'],
  job_title: ['poste', 'fonction', 'emploi', 'job', 'titre'],
  site: ['site', 'lieu', 'affectation', 'poste de garde', 'client', 'chantier', 'atelier', 'service', 'magasin', 'etablissement'],
  base_salary: ['montant gnf', 'montant', 'tarif', 'salaire de base gnf', 'salaire de base', 'salaire', 'salaire gnf', 'remuneration', 'paie'],
}

function parseMode(v: unknown): ParsedRow['pay_mode'] {
  const t = norm(v)
  if (['garde', 'vacation', 'jour', 'poste', 'creneau', 'journee', 'tache'].some((k) => t.includes(k))) return 'per_shift'
  if (t.includes('heure') || t.includes('horaire')) return 'hourly'
  return 'monthly'
}

function parseNumber(v: unknown): number {
  if (typeof v === 'number') return Math.round(v)
  const n = Number(String(v ?? '').replace(/[^\d.,-]/g, '').replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n) : 0
}

export async function downloadTemplate(v: Vocab) {
  const [a, b] = v.importExamples
  const perShift = v.Shift
  await writeExcelFile(
    [
      ['Nom complet', 'Téléphone', 'Poste', v.Site, 'Mode de paie', 'Montant (GNF)'].map((x) => ({ value: x, fontWeight: 'bold' as const })),
      [{ value: 'Ibrahima Sow' }, { value: '622 12 34 56' }, { value: a.job }, { value: a.site }, { value: 'Mois' }, { value: 1500000 }],
      [{ value: 'Mariama Camara' }, { value: '655 98 76 54' }, { value: b.job }, { value: b.site }, { value: 'Mois' }, { value: 2200000 }],
      [{ value: 'Sékou Keita' }, { value: '664 00 33 21' }, { value: a.job }, { value: b.site }, { value: perShift }, { value: 60000 }],
      [{ value: 'Hawa Soumah' }, { value: '654 40 11 88' }, { value: b.job }, { value: a.site }, { value: 'Heure' }, { value: 5000 }],
    ],
    { columns: [{ width: 28 }, { width: 18 }, { width: 20 }, { width: 28 }, { width: 14 }, { width: 16 }] },
  ).toFile('modele-personnel-equipe360.xlsx')
}

export default function ImportEmployeesModal({
  open,
  onClose,
  companyId,
  sites,
  existing,
  onDone,
}: {
  open: boolean
  onClose: () => void
  companyId: string
  sites: Site[]
  existing: Employee[]
  onDone: () => void
}) {
  const toast = useToast()
  const v = useVocab()
  const input = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<ParsedRow[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [createSites, setCreateSites] = useState(true)
  const [loading, setLoading] = useState(false)
  const [drag, setDrag] = useState(false)

  const siteByName = useMemo(() => new Map(sites.map((s) => [norm(s.name), s])), [sites])
  const existingPhones = useMemo(() => new Set(existing.map((e) => e.phone).filter(Boolean)), [existing])

  function reset() {
    setRows(null)
    setFileName('')
    setParseError(null)
  }
  function close() {
    onClose()
    setTimeout(reset, 200)
  }

  async function handleFile(file: File) {
    reset()
    setFileName(file.name)
    try {
      const data = await readSheet(file)
      // Trouver la ligne d'en-tête dans les 10 premières lignes
      let headerIdx = -1
      let map: Partial<Record<keyof typeof COLS, number>> = {}
      for (let i = 0; i < Math.min(10, data.length); i++) {
        const cells = data[i].map(norm)
        const m: typeof map = {}
        for (const [key, aliases] of Object.entries(COLS) as [keyof typeof COLS, string[]][]) {
          const idx = cells.findIndex((c) => aliases.includes(c))
          const idx2 = idx >= 0 ? idx : cells.findIndex((c) => c && aliases.some((a) => c.startsWith(a)))
          if (idx2 >= 0) m[key] = idx2
        }
        if (m.full_name !== undefined) {
          headerIdx = i
          map = m
          break
        }
      }
      if (headerIdx < 0) {
        setParseError('Colonne « Nom complet » introuvable. Utilisez le modèle Excel pour être sûr du format.')
        return
      }
      const seen = new Set<string>()
      const parsed: ParsedRow[] = []
      for (let i = headerIdx + 1; i < data.length; i++) {
        const r = data[i]
        const get = (k: keyof typeof COLS) => (map[k] !== undefined ? r[map[k]!] : null)
        const full_name = String(get('full_name') ?? '').trim().replace(/\s+/g, ' ')
        const phoneRaw = String(get('phoneRaw') ?? '').trim()
        if (!full_name && !phoneRaw) continue
        const phone = phoneRaw ? normalizePhone(phoneRaw) : null
        let error: string | null = null
        if (!full_name) error = 'Nom manquant'
        else if (phoneRaw && !phone) error = 'Téléphone invalide'
        else if (phone && seen.has(phone)) error = 'Numéro en double dans le fichier'
        if (phone) seen.add(phone)
        parsed.push({
          line: i + 1,
          full_name,
          phone,
          phoneRaw,
          job_title: String(get('job_title') ?? '').trim() || null,
          site: String(get('site') ?? '').trim() || null,
          base_salary: parseNumber(get('base_salary')),
          pay_mode: parseMode(get('pay_mode')),
          error,
          update: !!phone && existingPhones.has(phone),
        })
      }
      if (!parsed.length) setParseError('Aucune ligne trouvée sous l’en-tête.')
      setRows(parsed)
    } catch (e) {
      setParseError('Fichier illisible. Enregistrez-le au format .xlsx puis réessayez. (' + errorMessage(e) + ')')
    }
  }

  const valid = rows?.filter((r) => !r.error) ?? []
  const invalid = rows?.filter((r) => r.error) ?? []
  const newSites = [...new Set(valid.map((r) => r.site).filter((s): s is string => !!s && !siteByName.has(norm(s))))]

  async function runImport() {
    setLoading(true)
    try {
      const siteIds = new Map(Array.from(siteByName.entries(), ([k, s]) => [k, s.id]))
      if (createSites && newSites.length) {
        const { data, error } = await supabase
          .from('sites')
          .insert(newSites.map((name) => ({ company_id: companyId, name })))
          .select('id, name')
        if (error) throw error
        for (const s of data ?? []) siteIds.set(norm(s.name), s.id)
      }
      const toRow = (r: ParsedRow) => ({
        company_id: companyId,
        full_name: r.full_name,
        phone: r.phone,
        job_title: r.job_title,
        default_site_id: r.site ? siteIds.get(norm(r.site)) ?? null : null,
        base_salary: r.pay_mode === 'monthly' ? r.base_salary : 0,
        pay_mode: r.pay_mode,
        pay_rate: r.pay_mode === 'monthly' ? 0 : r.base_salary,
        active: true,
      })
      const withPhone = valid.filter((r) => r.phone).map(toRow)
      const withoutPhone = valid.filter((r) => !r.phone).map(toRow)
      if (withPhone.length) {
        const { error } = await supabase.from('employees').upsert(withPhone, { onConflict: 'company_id,phone' })
        if (error) throw error
      }
      if (withoutPhone.length) {
        const { error } = await supabase.from('employees').insert(withoutPhone)
        if (error) throw error
      }
      const updated = valid.filter((r) => r.update).length
      toast.success(
        `${valid.length - updated} employé${valid.length - updated > 1 ? 's' : ''} ajouté${valid.length - updated > 1 ? 's' : ''}` +
          (updated ? `, ${updated} mis à jour` : ''),
      )
      onDone()
      close()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      title="Importer des employés"
      description="Fichier Excel (.xlsx) avec une ligne par employé."
      footer={
        rows ? (
          <>
            <Button variant="secondary" onClick={reset}>Changer de fichier</Button>
            <Button onClick={runImport} loading={loading} disabled={!valid.length}>
              Importer {valid.length} employé{valid.length > 1 ? 's' : ''}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={close}>Annuler</Button>
        )
      }
    >
      {!rows ? (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDrag(false)
              const f = e.dataTransfer.files[0]
              if (f) handleFile(f)
            }}
            className={cx(
              'flex w-full flex-col items-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
              drag ? 'border-brand-400 bg-brand-50' : 'border-ink-200 hover:border-brand-300 hover:bg-ink-50',
            )}
          >
            <UploadCloud className="size-8 text-brand-500" />
            <p className="mt-3 text-sm font-medium text-ink-900">Cliquez ou glissez votre fichier ici</p>
            <p className="mt-1 text-xs text-ink-500">{fileName || 'Format .xlsx'}</p>
          </button>
          <input
            ref={input}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
              e.target.value = ''
            }}
          />
          {parseError && <Callout tone="danger">{parseError}</Callout>}
          <div className="flex items-center justify-between gap-4 rounded-xl bg-ink-50 p-4 ring-1 ring-ink-100">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="size-8 text-emerald-600" />
              <div>
                <p className="text-sm font-medium">Modèle Excel</p>
                <p className="text-xs text-ink-500">Nom · Téléphone · Poste · {v.Site} · Mode de paie (mois, {v.shift}, heure) · Montant</p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => downloadTemplate(v)}>Télécharger</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone="green"><CheckCircle2 className="size-3.5" /> {valid.length} prêt{valid.length > 1 ? 's' : ''}</Badge>
            {valid.some((r) => r.update) && <Badge tone="brand">{valid.filter((r) => r.update).length} mise(s) à jour</Badge>}
            {invalid.length > 0 && <Badge tone="red"><AlertTriangle className="size-3.5" /> {invalid.length} ignorée{invalid.length > 1 ? 's' : ''}</Badge>}
          </div>

          {newSites.length > 0 && (
            <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-100">
              <p className="text-sm text-amber-900">
                <span className="font-medium">{v.nSites(newSites.length)} inconnu{newSites.length > 1 ? 's' : ''} :</span>{' '}
                {newSites.slice(0, 4).join(', ')}{newSites.length > 4 ? '…' : ''}
              </p>
              <div className="mt-3">
                <Toggle checked={createSites} onChange={setCreateSites} label={`Créer ces ${v.sites} automatiquement`} />
              </div>
            </div>
          )}

          <div className="max-h-80 overflow-auto rounded-xl ring-1 ring-ink-100">
            <Table>
              <thead className="sticky top-0">
                <tr>
                  <Th>Ligne</Th>
                  <Th>Nom</Th>
                  <Th>Téléphone</Th>
                  <Th>{v.Site}</Th>
                  <Th className="text-right">Salaire</Th>
                  <Th>État</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line} className={r.error ? 'bg-red-50/50' : ''}>
                    <Td className="tabular text-ink-400">{r.line}</Td>
                    <Td className="font-medium">{r.full_name || '—'}</Td>
                    <Td className="tabular">{r.phone ? formatPhone(r.phone) : r.phoneRaw || '—'}</Td>
                    <Td className="text-ink-600">{r.site ?? '—'}</Td>
                    <Td className="tabular text-right">
                      {formatGNF(r.base_salary)}
                      <span className="text-ink-400"> {r.pay_mode === 'per_shift' ? `/ ${v.shift}` : r.pay_mode === 'hourly' ? '/ h' : '/ mois'}</span>
                    </Td>
                    <Td>
                      {r.error ? <Badge tone="red">{r.error}</Badge> : r.update ? <Badge tone="brand">Mise à jour</Badge> : <Badge tone="green">Nouveau</Badge>}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </div>
      )}
    </Modal>
  )
}
