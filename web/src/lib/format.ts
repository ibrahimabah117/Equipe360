export const PHONE_DOMAIN = 'tel.equipe360.app'

/** 622 12 34 56 / +224 622123456 / 00224… → 224622123456 (ou null si invalide) */
export function normalizePhone(raw: string | null | undefined): string | null {
  let d = String(raw ?? '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.length === 9) d = '224' + d
  if (!/^\d{11,15}$/.test(d)) return null
  return d
}

export function phoneToEmail(raw: string): string | null {
  const p = normalizePhone(raw)
  return p ? `${p}@${PHONE_DOMAIN}` : null
}

/** 224622123456 → +224 622 12 34 56 */
export function formatPhone(p: string | null | undefined): string {
  if (!p) return '—'
  const n = normalizePhone(p)
  if (!n) return p
  if (n.startsWith('224') && n.length === 12) {
    const l = n.slice(3)
    return `+224 ${l.slice(0, 3)} ${l.slice(3, 5)} ${l.slice(5, 7)} ${l.slice(7)}`
  }
  return '+' + n
}

const gnf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
export function formatGNF(v: number | null | undefined): string {
  return `${gnf.format(Number(v ?? 0))} GNF`
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function initials(name: string | null | undefined): string {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

/** Mot de passe simple à dicter au téléphone : 6 chiffres sans suite évidente */
export function generatePin(): string {
  const arr = new Uint32Array(6)
  crypto.getRandomValues(arr)
  return Array.from(arr, (n) => String(n % 10)).join('')
}

export const SECTORS: { value: string; label: string }[] = [
  { value: 'gardiennage', label: 'Gardiennage / sécurité' },
  { value: 'nettoyage', label: 'Nettoyage' },
  { value: 'btp', label: 'BTP / chantier' },
  { value: 'commerce', label: 'Commerce / distribution' },
  { value: 'sante', label: 'Santé' },
  { value: 'hotellerie', label: 'Hôtellerie / restauration' },
  { value: 'autre', label: 'Autre' },
]
export const sectorLabel = (v: string) => SECTORS.find((s) => s.value === v)?.label ?? v

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Propriétaire',
  manager: 'Responsable',
  agent: 'Agent',
}
