import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { getServices } from '../api/services'
import {
  cancelTicket,
  createTicket,
  getTicketById,
  getTickets,
} from '../api/tickets'
import { Navbar } from '../components/Navbar'
import { StatusBadge } from '../components/StatusBadge'
import type { MetodoPago, Service, Ticket, TicketStatus } from '../types/api'

type StatusFilter = 'TODOS' | TicketStatus

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'TODOS', label: 'Todos' },
  { value: 'CREADO', label: 'Creado' },
  { value: 'ASIGNADO', label: 'Asignado' },
  { value: 'EN_CAMINO', label: 'En camino' },
  { value: 'EN_PROGRESO', label: 'En progreso' },
  { value: 'FINALIZADO', label: 'Finalizado' },
  { value: 'CANCELADO', label: 'Cancelado' },
]

const METODO_PAGO_LABELS: Record<MetodoPago, string> = {
  EFECTIVO: 'Efectivo',
  QR: 'QR',
  TRANSFERENCIA: 'Transferencia',
}

const currencyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
})

const dateFormatter = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount)
}

function formatDate(isoDate: string): string {
  const parsed = new Date(isoDate)
  if (Number.isNaN(parsed.getTime())) return isoDate
  return dateFormatter.format(parsed)
}

function isCancellable(estado: TicketStatus): boolean {
  return estado !== 'FINALIZADO' && estado !== 'CANCELADO'
}

function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function ClienteDashboardPage() {
  // Catálogo de servicios
  const [services, setServices] = useState<Service[]>([])
  const [servicesLoading, setServicesLoading] = useState(true)
  const [servicesError, setServicesError] = useState<string | null>(null)

  // Listado y filtro de tickets
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('TODOS')
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [ticketsLoading, setTicketsLoading] = useState(true)
  const [ticketsError, setTicketsError] = useState<string | null>(null)
  const ticketsReqIdRef = useRef(0)

  // Formulario "Nueva Solicitud"
  const [servicioId, setServicioId] = useState('')
  const [direccion, setDireccion] = useState('')
  const [descripcionProblema, setDescripcionProblema] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null)

  // Feedback global de acciones sobre la lista (ej. cancelación)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  // Modal de detalle de ticket
  const [detailTicketId, setDetailTicketId] = useState<string | null>(null)
  const [detailTicket, setDetailTicket] = useState<Ticket | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const detailReqIdRef = useRef(0)

  // Modal de confirmación de cancelación
  const [ticketToCancel, setTicketToCancel] = useState<Ticket | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  const servicesMap = useMemo(() => {
    const map = new Map<number, Service>()
    for (const service of services) {
      map.set(service.id, service)
    }
    return map
  }, [services])

  const selectedService = useMemo(() => {
    const numericId = Number(servicioId)
    if (!numericId) return undefined
    return servicesMap.get(numericId)
  }, [servicioId, servicesMap])

  const loadServices = useCallback(async () => {
    setServicesLoading(true)
    setServicesError(null)
    try {
      const data = await getServices()
      setServices(data)
    } catch (err) {
      setServicesError(
        err instanceof Error
          ? err.message
          : 'No se pudo cargar el catálogo de servicios',
      )
    } finally {
      setServicesLoading(false)
    }
  }, [])

  const loadTickets = useCallback(async (filter: StatusFilter) => {
    const requestId = ++ticketsReqIdRef.current
    setTicketsLoading(true)
    setTicketsError(null)
    try {
      const estado = filter === 'TODOS' ? undefined : filter
      const data = await getTickets(estado)
      if (requestId === ticketsReqIdRef.current) {
        setTickets(data)
      }
    } catch (err) {
      if (requestId === ticketsReqIdRef.current) {
        setTicketsError(
          err instanceof Error
            ? err.message
            : 'No se pudieron cargar tus tickets',
        )
      }
    } finally {
      if (requestId === ticketsReqIdRef.current) {
        setTicketsLoading(false)
      }
    }
  }, [])

  const loadTicketDetail = useCallback(async (id: string) => {
    const requestId = ++detailReqIdRef.current
    setDetailTicketId(id)
    setDetailTicket(null)
    setDetailLoading(true)
    setDetailError(null)
    try {
      const data = await getTicketById(id)
      if (requestId === detailReqIdRef.current) {
        setDetailTicket(data)
      }
    } catch (err) {
      if (requestId === detailReqIdRef.current) {
        setDetailError(
          err instanceof Error
            ? err.message
            : 'No se pudo obtener el detalle del ticket',
        )
      }
    } finally {
      if (requestId === detailReqIdRef.current) {
        setDetailLoading(false)
      }
    }
  }, [])

  // Carga inicial del catálogo de servicios y los tickets del cliente
  useEffect(() => {
    let cancelled = false

    getServices()
      .then((data) => {
        if (!cancelled) {
          setServices(data)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setServicesError(
            err instanceof Error
              ? err.message
              : 'No se pudo cargar el catálogo de servicios',
          )
        }
      })
      .finally(() => {
        if (!cancelled) {
          setServicesLoading(false)
        }
      })

    const requestId = ++ticketsReqIdRef.current
    getTickets()
      .then((data) => {
        if (!cancelled && requestId === ticketsReqIdRef.current) {
          setTickets(data)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled && requestId === ticketsReqIdRef.current) {
          setTicketsError(
            err instanceof Error
              ? err.message
              : 'No se pudieron cargar tus tickets',
          )
        }
      })
      .finally(() => {
        if (!cancelled && requestId === ticketsReqIdRef.current) {
          setTicketsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  function handleFilterChange(nextFilter: StatusFilter) {
    setStatusFilter(nextFilter)
    void loadTickets(nextFilter)
  }

  // Cerrar modales con la tecla Escape
  useEffect(() => {
    if (!detailTicketId && !ticketToCancel) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (ticketToCancel && !cancelling) {
        setTicketToCancel(null)
        setCancelError(null)
      } else if (detailTicketId) {
        detailReqIdRef.current += 1
        setDetailTicketId(null)
        setDetailTicket(null)
        setDetailError(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [detailTicketId, ticketToCancel, cancelling])

  function closeDetailModal() {
    detailReqIdRef.current += 1
    setDetailTicketId(null)
    setDetailTicket(null)
    setDetailError(null)
  }

  function openCancelConfirm(ticket: Ticket) {
    setCancelError(null)
    setTicketToCancel(ticket)
  }

  function closeCancelConfirm() {
    if (cancelling) return
    setTicketToCancel(null)
    setCancelError(null)
  }

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError(null)
    setSubmitSuccess(null)

    const numericServiceId = Number(servicioId)
    const trimmedDireccion = direccion.trim()
    const trimmedDescripcion = descripcionProblema.trim()

    if (!numericServiceId) {
      setSubmitError('Seleccioná un servicio del catálogo.')
      return
    }
    if (!trimmedDireccion) {
      setSubmitError('Ingresá una dirección válida.')
      return
    }
    if (!trimmedDescripcion) {
      setSubmitError('Describí brevemente el problema.')
      return
    }

    setSubmitting(true)
    try {
      await createTicket({
        servicio_id: numericServiceId,
        direccion: trimmedDireccion,
        descripcion_problema: trimmedDescripcion,
      })

      setServicioId('')
      setDireccion('')
      setDescripcionProblema('')
      setSubmitSuccess(
        '¡Solicitud creada! Un operario disponible podrá tomar tu ticket a la brevedad.',
      )

      if (statusFilter === 'TODOS' || statusFilter === 'CREADO') {
        await loadTickets(statusFilter)
      } else {
        setStatusFilter('TODOS')
        await loadTickets('TODOS')
      }
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : 'No se pudo crear la solicitud de servicio',
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleConfirmCancel() {
    if (!ticketToCancel) return

    const targetId = ticketToCancel.id
    setCancelling(true)
    setCancelError(null)
    setActionMessage(null)

    try {
      const response = await cancelTicket(targetId)
      setTicketToCancel(null)
      setActionMessage(response.message || 'Ticket cancelado exitosamente.')
      await loadTickets(statusFilter)

      if (detailTicketId === targetId) {
        await loadTicketDetail(targetId)
      }
    } catch (err) {
      setCancelError(
        err instanceof Error
          ? err.message
          : 'No se pudo cancelar el ticket',
      )
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Navbar />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Panel de Cliente
          </h1>
          <p className="mt-1.5 text-sm text-slate-400">
            Solicitá servicios de oficios y seguí el estado de tus tickets en
            tiempo real.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Formulario: Nueva Solicitud */}
          <section className="lg:col-span-5">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-black/30 lg:sticky lg:top-24">
              <div className="mb-5">
                <h2 className="text-lg font-semibold text-white">
                  Nueva Solicitud
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Elegí el oficio que necesitás e indicá los detalles del
                  problema.
                </p>
              </div>

              {servicesError && (
                <div
                  role="alert"
                  className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-300"
                >
                  <span>{servicesError}</span>
                  <button
                    type="button"
                    onClick={() => void loadServices()}
                    className="shrink-0 font-semibold text-rose-200 underline hover:text-white"
                  >
                    Reintentar
                  </button>
                </div>
              )}

              {submitSuccess && (
                <div className="mb-4 flex items-start justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-300">
                  <p>{submitSuccess}</p>
                  <button
                    type="button"
                    onClick={() => setSubmitSuccess(null)}
                    aria-label="Cerrar aviso"
                    className="shrink-0 text-xs text-emerald-200 hover:text-white"
                  >
                    ✕
                  </button>
                </div>
              )}

              {submitError && (
                <p
                  role="alert"
                  className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-300"
                >
                  {submitError}
                </p>
              )}

              <form onSubmit={handleCreateSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="servicio"
                    className="mb-1.5 block text-sm font-medium text-slate-300"
                  >
                    Servicio
                  </label>
                  <select
                    id="servicio"
                    required
                    disabled={servicesLoading || services.length === 0 || submitting}
                    value={servicioId}
                    onChange={(event) => setServicioId(event.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="">
                      {servicesLoading
                        ? 'Cargando servicios…'
                        : services.length === 0
                          ? 'No hay servicios disponibles'
                          : 'Seleccioná un oficio'}
                    </option>
                    {services.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.nombre} — {formatCurrency(service.tarifa_base)}
                      </option>
                    ))}
                  </select>
                  {selectedService?.descripcion && (
                    <p className="mt-1.5 text-xs text-slate-400">
                      {selectedService.descripcion}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="direccion"
                    className="mb-1.5 block text-sm font-medium text-slate-300"
                  >
                    Dirección
                  </label>
                  <input
                    id="direccion"
                    type="text"
                    required
                    disabled={submitting}
                    value={direccion}
                    onChange={(event) => setDireccion(event.target.value)}
                    placeholder="Ej. Av. Corrientes 1234, CABA"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label
                    htmlFor="descripcion"
                    className="mb-1.5 block text-sm font-medium text-slate-300"
                  >
                    Descripción del problema
                  </label>
                  <textarea
                    id="descripcion"
                    rows={4}
                    required
                    disabled={submitting}
                    value={descripcionProblema}
                    onChange={(event) =>
                      setDescripcionProblema(event.target.value)
                    }
                    placeholder="Contanos qué sucede, urgencia o detalles útiles para el operario…"
                    className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-60"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting || servicesLoading || services.length === 0}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting && (
                    <span
                      aria-hidden
                      className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950/40 border-t-slate-950"
                    />
                  )}
                  {submitting ? 'Enviando solicitud…' : 'Solicitar servicio'}
                </button>
              </form>
            </div>
          </section>

          {/* Listado: Mis Tickets */}
          <section className="lg:col-span-7">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Mis Tickets
                </h2>
                <p className="text-xs text-slate-400">
                  {ticketsLoading
                    ? 'Actualizando listado…'
                    : `${tickets.length} ${tickets.length === 1 ? 'solicitud encontrada' : 'solicitudes encontradas'}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadTickets(statusFilter)}
                disabled={ticketsLoading}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                Actualizar
              </button>
            </div>

            {/* Filtro por estado */}
            <div
              role="tablist"
              aria-label="Filtrar tickets por estado"
              className="mb-5 flex flex-wrap gap-2"
            >
              {STATUS_FILTERS.map((filter) => {
                const active = statusFilter === filter.value
                return (
                  <button
                    key={filter.value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => handleFilterChange(filter.value)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      active
                        ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
                        : 'border-slate-800 bg-slate-900/70 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    {filter.label}
                  </button>
                )
              })}
            </div>

            {actionMessage && (
              <div className="mb-4 flex items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-300">
                <span>{actionMessage}</span>
                <button
                  type="button"
                  onClick={() => setActionMessage(null)}
                  aria-label="Cerrar aviso"
                  className="text-xs text-emerald-200 hover:text-white"
                >
                  ✕
                </button>
              </div>
            )}

            {ticketsError && (
              <div
                role="alert"
                className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300"
              >
                <span>{ticketsError}</span>
                <button
                  type="button"
                  onClick={() => void loadTickets(statusFilter)}
                  className="shrink-0 text-xs font-semibold text-rose-200 underline hover:text-white"
                >
                  Reintentar
                </button>
              </div>
            )}

            {ticketsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className="h-36 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/50"
                  />
                ))}
              </div>
            ) : tickets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 px-6 py-12 text-center">
                <p className="text-base font-medium text-slate-200">
                  {statusFilter === 'TODOS'
                    ? 'Todavía no creaste ninguna solicitud'
                    : 'No hay tickets con este estado'}
                </p>
                <p className="mt-1.5 text-sm text-slate-400">
                  {statusFilter === 'TODOS'
                    ? 'Completá el formulario "Nueva Solicitud" para pedir tu primer servicio.'
                    : 'Probá seleccionando otro estado o volvé a "Todos".'}
                </p>
                {statusFilter !== 'TODOS' && (
                  <button
                    type="button"
                    onClick={() => handleFilterChange('TODOS')}
                    className="mt-4 rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-200 transition hover:border-emerald-500/50 hover:text-emerald-300"
                  >
                    Ver todos los tickets
                  </button>
                )}
              </div>
            ) : (
              <ul className="space-y-4">
                {tickets.map((ticket) => {
                  const service = servicesMap.get(ticket.servicio_id)
                  const canCancel = isCancellable(ticket.estado)

                  return (
                    <li
                      key={ticket.id}
                      className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg shadow-black/20 transition hover:border-slate-700"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold text-white">
                              {service
                                ? service.nombre
                                : `Servicio #${ticket.servicio_id}`}
                            </h3>
                            {service && (
                              <span className="rounded-md bg-slate-800/90 px-2 py-0.5 text-xs font-medium text-slate-300">
                                Base: {formatCurrency(service.tarifa_base)}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-slate-300">
                            {ticket.direccion}
                          </p>
                        </div>

                        <StatusBadge status={ticket.estado} />
                      </div>

                      <p className="mt-3 line-clamp-2 text-sm text-slate-400">
                        {ticket.descripcion_problema}
                      </p>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/90 pt-3.5">
                        <span className="text-xs text-slate-500">
                          Creado el {formatDate(ticket.created_at)}
                        </span>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void loadTicketDetail(ticket.id)}
                            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-emerald-500/60 hover:text-emerald-300"
                          >
                            Ver detalle
                          </button>
                          {canCancel && (
                            <button
                              type="button"
                              onClick={() => openCancelConfirm(ticket)}
                              className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:border-rose-500/60 hover:bg-rose-500/20"
                            >
                              Cancelar solicitud
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      </main>

      {/* Modal de Detalle del Ticket */}
      {detailTicketId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ticket-detail-title"
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onClick={closeDetailModal}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/60"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500">
                  Detalle del ticket
                </p>
                <h3
                  id="ticket-detail-title"
                  className="mt-1 text-lg font-semibold text-white"
                >
                  {detailTicket
                    ? (servicesMap.get(detailTicket.servicio_id)?.nombre ??
                      `Servicio #${detailTicket.servicio_id}`)
                    : 'Cargando…'}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeDetailModal}
                aria-label="Cerrar detalle"
                className="rounded-lg border border-slate-800 px-2.5 py-1 text-sm text-slate-400 transition hover:border-slate-700 hover:text-white"
              >
                ✕
              </button>
            </div>

            {detailLoading ? (
              <div className="flex items-center justify-center gap-3 py-12 text-sm text-slate-400">
                <span
                  aria-hidden
                  className="h-5 w-5 animate-spin rounded-full border-2 border-slate-600 border-t-emerald-400"
                />
                Cargando información del ticket…
              </div>
            ) : detailError ? (
              <div className="py-6 text-center">
                <p
                  role="alert"
                  className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-300"
                >
                  {detailError}
                </p>
                <button
                  type="button"
                  onClick={() => void loadTicketDetail(detailTicketId)}
                  className="mt-4 rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-xs font-medium text-slate-200 hover:border-slate-500"
                >
                  Reintentar
                </button>
              </div>
            ) : detailTicket ? (
              <div className="mt-5 space-y-5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StatusBadge status={detailTicket.estado} />
                  {servicesMap.get(detailTicket.servicio_id) && (
                    <span className="text-xs text-slate-400">
                      Tarifa base:{' '}
                      <strong className="text-slate-200">
                        {formatCurrency(
                          servicesMap.get(detailTicket.servicio_id)!.tarifa_base,
                        )}
                      </strong>
                    </span>
                  )}
                </div>

                <dl className="space-y-3.5">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Dirección
                    </dt>
                    <dd className="mt-1 text-slate-200">
                      {detailTicket.direccion}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Descripción del problema
                    </dt>
                    <dd className="mt-1 whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-slate-200">
                      {detailTicket.descripcion_problema}
                    </dd>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                      <dt className="text-xs text-slate-500">Creado</dt>
                      <dd className="mt-0.5 text-xs font-medium text-slate-200">
                        {formatDate(detailTicket.created_at)}
                      </dd>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                      <dt className="text-xs text-slate-500">
                        Última actualización
                      </dt>
                      <dd className="mt-0.5 text-xs font-medium text-slate-200">
                        {formatDate(detailTicket.updated_at)}
                      </dd>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                    <dt className="text-xs text-slate-500">ID del ticket</dt>
                    <dd className="mt-0.5 break-all font-mono text-xs text-slate-300">
                      {detailTicket.id}
                    </dd>
                  </div>

                  {detailTicket.operario_id && (
                    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                      <dt className="text-xs text-slate-500">
                        Operario asignado
                      </dt>
                      <dd className="mt-0.5 break-all font-mono text-xs text-slate-300">
                        {detailTicket.operario_id}
                      </dd>
                    </div>
                  )}
                </dl>

                {/* Información de cierre si está FINALIZADO */}
                {detailTicket.estado === 'FINALIZADO' && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-emerald-400">
                      Resumen de finalización
                    </h4>
                    <dl className="mt-3 space-y-2.5 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-slate-400">Precio final</dt>
                        <dd className="font-semibold text-white">
                          {detailTicket.precio_final !== null
                            ? formatCurrency(detailTicket.precio_final)
                            : 'No informado'}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-slate-400">Método de pago</dt>
                        <dd className="font-medium text-slate-200">
                          {detailTicket.metodo_pago
                            ? METODO_PAGO_LABELS[detailTicket.metodo_pago]
                            : 'No informado'}
                        </dd>
                      </div>
                      {detailTicket.evidencia_url && (
                        <div className="flex items-center justify-between gap-2 border-t border-emerald-500/20 pt-2.5">
                          <dt className="text-slate-400">Evidencia</dt>
                          <dd>
                            {isSafeHttpUrl(detailTicket.evidencia_url) ? (
                              <a
                                href={detailTicket.evidencia_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-emerald-400 underline hover:text-emerald-300"
                              >
                                Ver evidencia ↗
                              </a>
                            ) : (
                              <span className="break-all text-xs text-slate-300">
                                {detailTicket.evidencia_url}
                              </span>
                            )}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-800 pt-4">
                  {isCancellable(detailTicket.estado) && (
                    <button
                      type="button"
                      onClick={() => openCancelConfirm(detailTicket)}
                      className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-medium text-rose-300 transition hover:border-rose-500/60 hover:bg-rose-500/20"
                    >
                      Cancelar solicitud
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={closeDetailModal}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:text-white"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Modal de Confirmación de Cancelación */}
      {ticketToCancel && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onClick={closeCancelConfirm}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/60"
            onClick={(event) => event.stopPropagation()}
          >
            <h3
              id="cancel-dialog-title"
              className="text-lg font-semibold text-white"
            >
              ¿Cancelar esta solicitud?
            </h3>
            <p className="mt-2 text-sm text-slate-400">
              Esta acción pasará el ticket de{' '}
              <strong className="text-slate-200">
                {servicesMap.get(ticketToCancel.servicio_id)?.nombre ??
                  `Servicio #${ticketToCancel.servicio_id}`}
              </strong>{' '}
              ({ticketToCancel.direccion}) a estado{' '}
              <strong className="text-rose-300">Cancelado</strong> y no se puede
              deshacer.
            </p>

            {cancelError && (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300"
              >
                {cancelError}
              </p>
            )}

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={cancelling}
                onClick={closeCancelConfirm}
                className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-xs font-medium text-slate-200 transition hover:border-slate-500 disabled:opacity-60"
              >
                Volver
              </button>
              <button
                type="button"
                disabled={cancelling}
                onClick={() => void handleConfirmCancel()}
                className="flex items-center gap-2 rounded-lg bg-rose-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {cancelling && (
                  <span
                    aria-hidden
                    className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white"
                  />
                )}
                {cancelling ? 'Cancelando…' : 'Sí, cancelar solicitud'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
