import { Moon, Sun, Sunset } from 'lucide-react'
import type { AbsenceKind, ScheduleEntry, ShiftType } from '../../lib/supabase'
import { cx } from '../../ui'

export const ABSENCE_LABELS: Record<AbsenceKind, string> = {
  maladie: 'Maladie',
  conge: 'Congé',
  permission: 'Permission',
  injustifiee: 'Absence injustifiée',
  autre: 'Autre',
}

export type ShiftTone = 'day' | 'night' | 'evening'

export function shiftTone(s: Pick<ShiftType, 'start_time'>): ShiftTone {
  const h = Number(s.start_time.slice(0, 2))
  if (h >= 18 || h < 5) return 'night'
  if (h >= 12) return 'evening'
  return 'day'
}

export const toneClasses: Record<ShiftTone, string> = {
  day: 'bg-amber-100 text-amber-900 ring-amber-200',
  evening: 'bg-brand-100 text-brand-800 ring-brand-200',
  night: 'bg-ink-900 text-white ring-ink-900',
}

export function ShiftIcon({ tone, className }: { tone: ShiftTone; className?: string }) {
  const I = tone === 'night' ? Moon : tone === 'evening' ? Sunset : Sun
  return <I className={className} />
}

export const hhmm = (t: string) => t.slice(0, 5)

export function shiftHours(s: Pick<ShiftType, 'start_time' | 'end_time'>): number {
  const [h1, m1] = s.start_time.split(':').map(Number)
  const [h2, m2] = s.end_time.split(':').map(Number)
  let d = h2 * 60 + m2 - (h1 * 60 + m1)
  if (d <= 0) d += 24 * 60
  return d / 60
}

/** Pastille d'une garde dans la grille */
export function EntryChip({
  entry,
  shift,
  siteHint,
}: {
  entry: ScheduleEntry
  shift: ShiftType | undefined
  siteHint?: string | null
}) {
  if (!shift) return null
  const tone = shiftTone(shift)
  const absent = entry.status === 'absent'
  const repl = entry.status === 'replacement'
  return (
    <span
      title={`${shift.label} ${hhmm(shift.start_time)}–${hhmm(shift.end_time)}${siteHint ? ' · ' + siteHint : ''}${absent ? ' · Absent' : ''}${repl ? ' · Remplacement' : ''}`}
      className={cx(
        'relative inline-flex h-7 min-w-9 items-center justify-center gap-1 rounded-lg px-1.5 text-xs font-semibold ring-1 ring-inset',
        absent ? 'bg-red-50 text-red-600 ring-red-200' : toneClasses[tone],
        repl && 'ring-2 ring-emerald-500',
      )}
    >
      {absent ? <span className="line-through decoration-2">{shift.code}</span> : shift.code}
      {absent && <span className="text-[10px] font-medium">abs</span>}
      {repl && <span className="text-[10px] font-medium">R</span>}
      {siteHint && !absent && <span className="absolute -top-1 -right-1 size-2 rounded-full bg-brand-500 ring-2 ring-white" />}
    </span>
  )
}

export function Legend({ shifts }: { shifts: ShiftType[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-500">
      {shifts.map((s) => (
        <span key={s.id} className="inline-flex items-center gap-1.5">
          <span className={cx('inline-flex h-5 min-w-6 items-center justify-center rounded-md px-1 text-[10px] font-semibold ring-1 ring-inset', toneClasses[shiftTone(s)])}>
            {s.code}
          </span>
          {s.label} {hhmm(s.start_time)}–{hhmm(s.end_time)}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex h-5 items-center rounded-md bg-red-50 px-1 text-[10px] font-semibold text-red-600 ring-1 ring-red-200 ring-inset">abs</span>
        Absent
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex h-5 items-center rounded-md bg-white px-1 text-[10px] font-semibold ring-2 ring-emerald-500 ring-inset">R</span>
        Remplaçant
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-brand-500" /> Hors site habituel
      </span>
    </div>
  )
}
