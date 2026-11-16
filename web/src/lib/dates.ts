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
export function today(): string {
  return iso(new Date())
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
