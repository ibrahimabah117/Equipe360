/** Dates locales au format AAAA-MM-JJ (sans décalage de fuseau) */
export function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function parseIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export function addDays(s: string, n: number): string {
  const d = parseIso(s)
  d.setDate(d.getDate() + n)
  return iso(d)
}
/** Les gardes sont à l'heure de Conakry (GMT, sans heure d'été), même si on consulte depuis la France */
export const TZ = 'Africa/Conakry'

export function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

/** Instant (ms) correspondant à une date + heure locales de Conakry (UTC+0) */
export function conakryInstant(date: string, time: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return Date.UTC(y, m - 1, d, hh, mm)
}

/** 07:05 à l'heure de Conakry */
export function timeAt(instant: string | number | Date): string {
  return new Date(instant).toLocaleTimeString('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
}

/** Date de Conakry (AAAA-MM-JJ) d'un instant */
export function dateAt(instant: string | number | Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(instant))
}

/** Valeur pour <input type="datetime-local"> à l'heure de Conakry */
export function toLocalInput(instant: number | Date = Date.now()): string {
  return new Date(instant).toISOString().slice(0, 16) // Conakry = UTC
}
export function fromLocalInput(v: string): Date {
  return new Date(v + ':00Z')
}

export function minutesLabel(min: number): string {
  const m = Math.round(Math.abs(min))
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h${m % 60 ? String(m % 60).padStart(2, '0') : ''}`
}
/** Lundi de la semaine contenant la date */
export function weekStart(s: string): string {
  const d = parseIso(s)
  const dow = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dow)
  return iso(d)
}
export function range(start: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => addDays(start, i))
}
export function dayShort(s: string): string {
  return parseIso(s).toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '')
}
export function dayNum(s: string): string {
  return String(parseIso(s).getDate())
}
export function dayLong(s: string): string {
  return parseIso(s).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}
export function weekLabel(start: string): string {
  const a = parseIso(start)
  const b = parseIso(addDays(start, 6))
  const sameMonth = a.getMonth() === b.getMonth()
  const fa = a.toLocaleDateString('fr-FR', sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' })
  const fb = b.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  return `${fa} – ${fb}`
}
export function isWeekend(s: string): boolean {
  const d = parseIso(s).getDay()
  return d === 0 || d === 6
}
