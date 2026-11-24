import type { TicketStatus } from '../types/api'

interface StatusBadgeProps {
  status: TicketStatus
  className?: string
}

const STATUS_CONFIG: Record<
  TicketStatus,
  { label: string; badgeClass: string; dotClass: string }
> = {
  CREADO: {
    label: 'Creado',
    badgeClass: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
    dotClass: 'bg-sky-400',
  },
  ASIGNADO: {
    label: 'Asignado',
    badgeClass: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300',
    dotClass: 'bg-indigo-400',
  },
  EN_CAMINO: {
    label: 'En camino',
    badgeClass: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    dotClass: 'bg-amber-400',
  },
  EN_PROGRESO: {
    label: 'En progreso',
    badgeClass: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
    dotClass: 'bg-cyan-400',
  },
  FINALIZADO: {
    label: 'Finalizado',
    badgeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    dotClass: 'bg-emerald-400',
  },
  CANCELADO: {
    label: 'Cancelado',
    badgeClass: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
    dotClass: 'bg-rose-400',
  },
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    badgeClass: 'border-slate-700 bg-slate-800 text-slate-300',
    dotClass: 'bg-slate-400',
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${config.badgeClass} ${className}`.trim()}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${config.dotClass}`}
      />
      {config.label}
    </span>
  )
}
