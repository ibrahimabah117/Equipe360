import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle, type LucideIcon } from 'lucide-react'
import { initials } from '../lib/format'

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

/* ---------------------------------------------------------------- Button */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary:
    'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 shadow-sm shadow-brand-500/20 disabled:bg-brand-300',
  secondary:
    'bg-white text-ink-800 ring-1 ring-inset ring-ink-200 hover:bg-ink-50 hover:ring-ink-300 disabled:text-ink-400',
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900 disabled:text-ink-300',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
  dark: 'bg-ink-900 text-white hover:bg-ink-800 disabled:bg-ink-400',
}
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-xl',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: LucideIcon
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon: Icon, loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cx(
        'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : Icon ? (
        <Icon className={size === 'sm' ? 'size-3.5' : 'size-4'} strokeWidth={2.2} />
      ) : null}
      {children}
    </button>
  )
})

export function IconButton({
  icon: Icon,
  label,
  className,
  ...rest
}: { icon: LucideIcon; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex size-8 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900',
        className,
      )}
      {...rest}
    >
      <Icon className="size-4" />
    </button>
  )
}

/* ---------------------------------------------------------------- Form fields */

const fieldBase =
  'block w-full rounded-xl border-0 bg-white text-sm text-ink-900 ring-1 ring-inset ring-ink-200 placeholder:text-ink-400 transition-shadow focus:ring-2 focus:ring-brand-500 focus:outline-none disabled:bg-ink-50 disabled:text-ink-500'

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label?: string
  hint?: ReactNode
  error?: string | null
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="mb-1.5 block text-[13px] font-medium text-ink-700">{label}</span>}
      {children}
      {error ? (
        <span className="mt-1.5 block text-xs text-red-600">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-xs text-ink-500">{hint}</span>
      ) : null}
    </label>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { leading?: ReactNode }>(
  function Input({ className, leading, ...rest }, ref) {
    if (leading) {
      return (
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-ink-400">
            {leading}
          </span>
          <input ref={ref} className={cx(fieldBase, 'h-10 pr-3 pl-10', className)} {...rest} />
        </div>
      )
    }
    return <input ref={ref} className={cx(fieldBase, 'h-10 px-3', className)} {...rest} />
  },
)

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(fieldBase, 'h-10 pr-9 pl-3', className)} {...rest}>
      {children}
    </select>
  )
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(fieldBase, 'min-h-20 px-3 py-2.5', className)} {...rest} />
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-3 text-sm text-ink-700"
    >
      <span
        className={cx(
          'relative inline-flex h-6 w-10 items-center rounded-full transition-colors',
          checked ? 'bg-brand-500' : 'bg-ink-200',
        )}
      >
        <span
          className={cx(
            'inline-block size-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[18px]' : 'translate-x-0.5',
          )}
        />
      </span>
      {label}
    </button>
  )
}

/* ---------------------------------------------------------------- Display */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-2xl bg-white shadow-card ring-1 ring-ink-100', className)}>{children}</div>
}

type Tone = 'neutral' | 'brand' | 'green' | 'amber' | 'red'
const tones: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-700',
  brand: 'bg-brand-50 text-brand-700',
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-800',
  red: 'bg-red-50 text-red-700',
}
export function Badge({ tone = 'neutral', children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', tones[tone])}>
      {dot && <span className="size-1.5 rounded-full bg-current opacity-80" />}
      {children}
    </span>
  )
}

const avatarColors = [
  'bg-brand-100 text-brand-800',
  'bg-emerald-100 text-emerald-800',
  'bg-amber-100 text-amber-900',
  'bg-rose-100 text-rose-800',
  'bg-violet-100 text-violet-800',
  'bg-cyan-100 text-cyan-800',
]
export function Avatar({ name, size = 'md' }: { name: string | null | undefined; size?: 'sm' | 'md' | 'lg' }) {
  const n = String(name ?? '')
  let h = 0
  for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        avatarColors[h % avatarColors.length],
        size === 'sm' && 'size-7 text-[11px]',
        size === 'md' && 'size-9 text-xs',
        size === 'lg' && 'size-12 text-sm',
      )}
    >
      {initials(n)}
    </span>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('size-5 animate-spin text-ink-400', className)} />
}

export function PageLoader() {
  return (
    <div className="flex min-h-60 items-center justify-center">
      <Spinner className="size-6" />
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon
  title: string
  text?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-500 ring-8 ring-brand-50/50">
        <Icon className="size-6" />
      </div>
      <h3 className="text-[15px] font-semibold text-ink-900">{title}</h3>
      {text && <p className="mt-1 max-w-sm text-sm text-ink-500">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = 'brand',
}: {
  icon: LucideIcon
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: 'brand' | 'green' | 'amber' | 'red'
}) {
  const t = {
    brand: 'bg-brand-50 text-brand-600',
    green: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
  }[tone]
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <p className="text-[13px] font-medium text-ink-500">{label}</p>
        <span className={cx('flex size-9 items-center justify-center rounded-xl', t)}>
          <Icon className="size-[18px]" />
        </span>
      </div>
      <p className="tabular mt-2 text-[26px] font-semibold tracking-tight text-ink-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-500">{sub}</p>}
    </Card>
  )
}

/* ---------------------------------------------------------------- Modal */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-ink-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cx(
          'animate-in relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-pop sm:rounded-2xl',
          size === 'sm' && 'sm:max-w-md',
          size === 'md' && 'sm:max-w-lg',
          size === 'lg' && 'sm:max-w-2xl',
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink-900">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
          </div>
          <IconButton icon={X} label="Fermer" onClick={onClose} className="-mr-2" />
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-ink-100 bg-ink-50/60 px-6 py-3.5 sm:flex-row sm:justify-end sm:rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

export function Callout({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success'
  title?: string
  children?: ReactNode
}) {
  const cfg = {
    info: { cls: 'bg-brand-50 text-brand-900 ring-brand-100', Icon: Info },
    warning: { cls: 'bg-amber-50 text-amber-900 ring-amber-100', Icon: AlertTriangle },
    danger: { cls: 'bg-red-50 text-red-900 ring-red-100', Icon: XCircle },
    success: { cls: 'bg-emerald-50 text-emerald-900 ring-emerald-100', Icon: CheckCircle2 },
  }[tone]
  return (
    <div className={cx('flex gap-3 rounded-xl p-3.5 text-sm ring-1', cfg.cls)}>
      <cfg.Icon className="mt-0.5 size-4 shrink-0" />
      <div>
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cx(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- Toasts */

interface ToastItem {
  id: number
  tone: 'success' | 'error' | 'info'
  message: string
}
const ToastContext = createContext<(tone: ToastItem['tone'], message: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const push = useCallback((tone: ToastItem['tone'], message: string) => {
    const id = Date.now() + Math.random()
    setItems((x) => [...x, { id, tone, message }])
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), tone === 'error' ? 6000 : 3500)
  }, [])
  return (
    <ToastContext.Provider value={push}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:right-4 sm:left-auto sm:items-end">
          {items.map((t) => (
            <div
              key={t.id}
              className="animate-in pointer-events-auto flex max-w-sm items-start gap-2.5 rounded-xl bg-ink-900 px-4 py-3 text-sm text-white shadow-pop"
            >
              {t.tone === 'success' && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />}
              {t.tone === 'error' && <XCircle className="mt-0.5 size-4 shrink-0 text-red-400" />}
              {t.tone === 'info' && <Info className="mt-0.5 size-4 shrink-0 text-brand-300" />}
              <span>{t.message}</span>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const push = useContext(ToastContext)
  return {
    success: (m: string) => push('success', m),
    error: (m: string) => push('error', m),
    info: (m: string) => push('info', m),
  }
}

/* ---------------------------------------------------------------- Confirm */

export function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel = 'Confirmer',
  danger,
  loading,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  text: ReactNode
  confirmLabel?: string
  danger?: boolean
  loading?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-ink-600">{text}</div>
    </Modal>
  )
}

/* ---------------------------------------------------------------- Table */

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  )
}
export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={cx(
        'border-b border-ink-100 bg-ink-50/70 px-4 py-2.5 text-xs font-medium tracking-wide text-ink-500 uppercase first:pl-5 last:pr-5',
        className,
      )}
    >
      {children}
    </th>
  )
}
export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <td className={cx('border-b border-ink-100 px-4 py-3 align-middle first:pl-5 last:pr-5', className)}>{children}</td>
  )
}
