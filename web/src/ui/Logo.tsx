import { cx } from '.'

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={cx('shrink-0', className)} aria-hidden>
      <rect width="512" height="512" rx="112" fill="#0B1B3F" />
      <circle
        cx="256"
        cy="256"
        r="150"
        fill="none"
        stroke="#2E5BFF"
        strokeWidth="34"
        strokeDasharray="700 242"
        strokeLinecap="round"
        transform="rotate(-60 256 256)"
      />
      <path
        d="M188 262l46 46 96-104"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="38"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Logo({ dark, className }: { dark?: boolean; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-2.5', className)}>
      <LogoMark className={cx('size-8', dark && 'rounded-lg ring-1 ring-white/10')} />
      <span className={cx('text-[17px] font-semibold tracking-tight', dark ? 'text-white' : 'text-ink-900')}>
        Équipe<span className="text-brand-500">360</span>
      </span>
    </span>
  )
}
