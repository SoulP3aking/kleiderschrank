import { useEffect, useRef, type ReactNode } from 'react'

/* Kleine, wiederverwendbare Bausteine – bewusst schlicht gehalten. */

export function Button({
  children,
  onClick,
  variant = 'default',
  size = 'md',
  disabled,
  className = '',
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'default' | 'primary' | 'ghost' | 'danger' | 'subtle'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  className?: string
  type?: 'button' | 'submit'
}) {
  const variants = {
    primary: 'bg-sand-300 text-ink-950 hover:bg-sand-200 active:bg-sand-400 font-semibold',
    default: 'bg-ink-700 text-white hover:bg-ink-600 active:bg-ink-800',
    subtle: 'bg-ink-800 text-white/80 hover:bg-ink-700',
    ghost: 'bg-transparent text-white/70 hover:bg-white/5',
    danger: 'bg-rose-500/15 text-rose-300 hover:bg-rose-500/25',
  }
  const sizes = {
    sm: 'px-3 py-1.5 text-[13px] rounded-lg gap-1.5',
    md: 'px-4 py-2.5 text-sm rounded-xl gap-2',
    lg: 'px-5 py-3.5 text-[15px] rounded-2xl gap-2',
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-40 ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  )
}

export function Chip({
  children,
  active,
  onClick,
  color,
}: {
  children: ReactNode
  active?: boolean
  onClick?: () => void
  color?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors ${
        active
          ? 'border-sand-300 bg-sand-300 text-ink-950 font-medium'
          : 'border-ink-600 bg-ink-800 text-white/70 hover:border-ink-500'
      }`}
    >
      {color && (
        <span
          className="h-3 w-3 rounded-full border border-white/25"
          style={{ background: color }}
        />
      )}
      {children}
    </button>
  )
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-white/55">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-white/35">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'w-full rounded-xl border border-ink-600 bg-ink-850 px-3.5 py-2.5 text-[15px] text-white outline-none placeholder:text-white/25 focus:border-sand-400'

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  display,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  display?: string
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="text-white/55">{label}</span>
        <span className="tabular-nums text-white/40">{display ?? value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        className="w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

/** Von unten einfahrendes Blatt – auf dem Handy angenehmer als ein Dialog. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  full,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  full?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
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
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={ref}
        className={`animate-sheet relative flex w-full flex-col overflow-hidden rounded-t-3xl border border-ink-700 bg-ink-900 shadow-2xl sm:max-w-lg sm:rounded-3xl ${
          full ? 'h-[94vh] sm:h-[90vh]' : 'max-h-[88vh]'
        }`}
      >
        {title && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-ink-800 px-5 py-3.5">
            <div className="min-w-0 text-[15px] font-semibold">{title}</div>
            <button
              onClick={onClose}
              className="-mr-2 shrink-0 rounded-full p-2 text-white/45 hover:bg-white/5 hover:text-white"
              aria-label="Schließen"
            >
              <Icon name="x" />
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-ink-800 bg-ink-900 px-5 pb-[calc(var(--safe-b)+1rem)] pt-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

export function Empty({
  title,
  text,
  action,
}: {
  title: string
  text: string
  action?: ReactNode
}) {
  return (
    <div className="mx-auto max-w-sm px-6 py-16 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-800 text-white/30">
        <Icon name="hanger" size={26} />
      </div>
      <h3 className="text-[15px] font-semibold">{title}</h3>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/45">{text}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  )
}

export function Toast({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-28 z-[60] flex justify-center px-6">
      <div className="animate-fade-up max-w-full rounded-full border border-ink-600 bg-ink-800/95 px-4 py-2.5 text-[13.5px] shadow-xl backdrop-blur">
        {text}
      </div>
    </div>
  )
}

/* Minimales Icon-Set (Strichzeichnungen), damit keine Icon-Bibliothek nötig ist. */
const PATHS: Record<string, string> = {
  x: 'M18 6 6 18M6 6l12 12',
  camera:
    'M3 8.5A2.5 2.5 0 0 1 5.5 6h1.8l1.2-2h6.9l1.2 2h1.9A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7',
  hanger: 'M12 6.5a2 2 0 1 1 2 2c-1.2 0-2 .8-2 2M12 10.5 3.5 16.4c-1 .7-.5 2.1.7 2.1h15.6c1.2 0 1.7-1.4.7-2.1z',
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  sparkles: 'M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6zM18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8zM5 14l.6 1.6L7.2 16l-1.6.6L5 18.2l-.6-1.6L2.8 16l1.6-.4z',
  person: 'M12 3.2a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2M7.5 9.6h9l1 5.2h-2.6l.6 6h-7l.6-6H6.5z',
  calendar: 'M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5zM4 10h16M8.5 3v4M15.5 3v4',
  settings:
    'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4M19.4 14a1.5 1.5 0 0 0 .3 1.7l.1.1a1.8 1.8 0 1 1-2.6 2.6l-.1-.1a1.5 1.5 0 0 0-2.5 1v.2a1.8 1.8 0 1 1-3.6 0v-.1a1.5 1.5 0 0 0-2.6-1l-.1.1a1.8 1.8 0 1 1-2.6-2.6l.1-.1a1.5 1.5 0 0 0-1-2.5H4.6a1.8 1.8 0 1 1 0-3.6h.2a1.5 1.5 0 0 0 1-2.6l-.1-.1A1.8 1.8 0 1 1 8.3 4.4l.1.1a1.5 1.5 0 0 0 2.5-1V3.4a1.8 1.8 0 1 1 3.6 0v.2a1.5 1.5 0 0 0 2.5 1l.1-.1a1.8 1.8 0 1 1 2.6 2.6l-.1.1a1.5 1.5 0 0 0 1 2.5h.2a1.8 1.8 0 1 1 0 3.6h-.2a1.5 1.5 0 0 0-1.2.7z',
  plus: 'M12 5v14M5 12h14',
  check: 'M4.5 12.5 9 17l10.5-10.5',
  trash: 'M4 7h16M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7M6.5 7l.8 12.1A1.5 1.5 0 0 0 8.8 20.5h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7',
  undo: 'M9 10H5V6M5.5 10.5A7 7 0 1 1 6 15.5',
  brush: 'M15.5 3.5 20.5 8.5 11 18l-5 1 1-5zM13 6l5 5',
  wand: 'M5 19 19 5M14 4.5l1.5 1.5M18 9l1.5 1.5M4.8 10.2 6.3 8.7M9 15l1.5-1.5',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  flip: 'M12 3v18M8 7 4 12l4 5zM16 7l4 5-4 5',
  layers: 'M12 3.5 21 8l-9 4.5L3 8zM3 12.5 12 17l9-4.5M3 16.5 12 21l9-4.5',
  share: 'M12 15.5V4m0 0L8 8m4-4 4 4M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14',
  download: 'M12 4v11.5m0 0L8 11.5m4 4 4-4M5 19h14',
  star: 'M12 3.8 14.5 9l5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9L9.5 9z',
  back: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  image: 'M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5zM4 15.5 8.5 11l4 4L16 12l4 3.5M9 9.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0',
  shuffle: 'M4 6h3.5l9 12H20M4 18h3.5l2.2-3M14.3 9l2.2-3H20M17 3l3 3-3 3M17 15l3 3-3 3',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 11v5M12 7.6v.2',
}

export function Icon({
  name,
  size = 20,
  className = '',
}: {
  name: keyof typeof PATHS | string
  size?: number
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d={PATHS[name] ?? ''} />
    </svg>
  )
}
