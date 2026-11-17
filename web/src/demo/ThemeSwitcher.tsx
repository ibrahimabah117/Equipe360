import { useEffect, useState } from 'react'
import { Palette } from 'lucide-react'
import { cx } from '../ui'

export type Theme = 'actuel' | 'a' | 'b'
const KEY = 'e360.theme'

export function readTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY)
    if (t === 'actuel' || t === 'a' || t === 'b') return t
  } catch {
    /* stockage indisponible */
  }
  return 'a'
}

export function applyTheme(t: Theme) {
  const c = document.documentElement.classList
  c.remove('theme-a', 'theme-b')
  if (t !== 'actuel') c.add(`theme-${t}`)
  try {
    localStorage.setItem(KEY, t)
  } catch {
    /* stockage indisponible */
  }
}

const OPTIONS: { id: Theme; label: string }[] = [
  { id: 'actuel', label: 'Actuel' },
  { id: 'a', label: 'A · Sombre' },
  { id: 'b', label: 'B · Clair' },
]

/** Sélecteur de design, visible uniquement dans la démo. */
export default function ThemeSwitcher() {
  const [theme, setTheme] = useState<Theme>(readTheme)
  useEffect(() => applyTheme(theme), [theme])

  return (
    <div className="no-print fixed bottom-14 left-1/2 z-[70] sm:bottom-4 flex -translate-x-1/2 items-center gap-1 rounded-full bg-ink-900 p-1 text-xs text-white shadow-pop ring-1 ring-white/10">
      <Palette className="mx-2 size-4 text-white/60" />
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          onClick={() => setTheme(o.id)}
          className={cx(
            'rounded-full px-3 py-1.5 font-medium transition-colors',
            theme === o.id ? 'bg-white text-ink-900' : 'text-white/70 hover:text-white',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
