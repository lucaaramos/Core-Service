import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { ApiError } from '../api/client'
import {
  createService,
  deleteService,
  getServices,
  updateService,
} from '../api/services'
import {
  cancelTicket,
  getTicketById,
  getTickets,
  updateTicketState,
} from '../api/tickets'
import { Navbar } from '../components/Navbar'
import { StatusBadge } from '../components/StatusBadge'
import type {
  OperarioNextState,
  Service,
  Ticket,
  TicketStatus,
} from '../types/api'
import {
  formatCurrency,
  formatDate,
  isSafeHttpUrl,
  METODO_PAGO_LABELS,
} from '../utils/format'

type AdminTab = 'TICKETS' | 'SERVICIOS'
type StatusFilter = 'TODOS' | TicketStatus
type ServiceModalMode = 'CREATE' | 'EDIT' | null

const ALL_STATES: TicketStatus[] = [
  'CREADO',
  'ASIGNADO',
  'EN_CAMINO',
  'EN_PROGRESO',
  'FINALIZADO',
  'CANCELADO',
]

const STATUS_LABELS: Record<TicketStatus, string> = {
  CREADO: 'Creado',
  ASIGNADO: 'Asignado',
  EN_CAMINO: 'En camino',
  EN_PROGRESO: 'En progreso',
  FINALIZADO: 'Finalizado',
  CANCELADO: 'Cancelado',
}

const KPI_CARD_STYLES: Record<TicketStatus, string> = {
  CREADO: 'border-sky-500/30 hover:border-sky-400/60',
  ASIGNADO: 'border-indigo-500/30 hover:border-indigo-400/60',
  EN_CAMINO: 'border-amber-500/30 hover:border-amber-400/60',
  EN_PROGRESO: 'border-cyan-500/30 hover:border-cyan-400/60',
  FINALIZADO: 'border-emerald-500/30 hover:border-emerald-400/60',
  CANCELADO: 'border-rose-500/30 hover:border-rose-400/60',
}

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'TODOS', label: 'Todos' },
  ...ALL_STATES.map((state) => ({
    value: state,
    label: STATUS_LABELS[state],
  })),
]

function shortId(id: string): string {
  return `${id.slice(0, 8)}…`
}

function isCancellable(estado: TicketStatus): boolean {
  return estado !== 'FINALIZADO' && estado !== 'CANCELADO'
}

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    return `${err.message} (HTTP ${err.status})`
  }
  if (err instanceof Error) {
    return err.message
  }
  return fallback
}

export function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>('TICKETS')

  // Catálogo de servicios
  const [services, setServices] = useState<Service[]>([])
  const [servicesLoading, setServicesLoading] = useState(true)
  const [servicesError, setServicesError] = useState<string | null>(null)
  const [catalogFeedback, setCatalogFeedback] = useState<string | null>(null)
  const servicesReqIdRef = useRef(0)

  // Modal Crear / Editar Servicio
  const [serviceModalMode, setServiceModalMode] =
    useState<ServiceModalMode>(null)
  const [editingService, setEditingService] = useState<Service | null>(null)
  const [serviceNombreInput, setServiceNombreInput] = useState('')
  const [serviceDescripcionInput, setServiceDescripcionInput] = useState('')
  const [serviceTarifaInput, setServiceTarifaInput] = useState('')
  const [savingService, setSavingService] = useState(false)
  const [serviceModalError, setServiceModalError] = useState<string | null>(
    null,
  )

  // Modal Confirmar Eliminación de Servicio
  const [serviceToDelete, setServiceToDelete] = useState<Service | null>(null)
  const [deletingService, setDeletingService] = useState(false)
  const [deleteServiceError, setDeleteServiceError] = useState<string | null>(
    null,
  )

  // Listado global (para KPIs sincronizados) y listado filtrado actual
  const [allTickets, setAllTickets] = useState<Ticket[]>([])
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('TODOS')
  const [searchQuery, setSearchQuery] = useState('')
  const [ticketsLoading, setTicketsLoading] = useState(true)
  const [ticketsError, setTicketsError] = useState<string | null>(null)
  const ticketsReqIdRef = useRef(0)

  // Estados de acciones de supervisión
  const [updatingTicketId, setUpdatingTicketId] = useState<string | null>(null)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Modal de detalle de ticket
  const [detailTicketId, setDetailTicketId] = useState<string | null>(null)
  const [detailTicket, setDetailTicket] = useState<Ticket | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const detailReqIdRef = useRef(0)

  // Modal de confirmación de cancelación de ticket
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

  // KPIs calculados sobre el listado global
  const kpis = useMemo(() => {
    const counts: Record<TicketStatus, number> = {
      CREADO: 0,
      ASIGNADO: 0,
      EN_CAMINO: 0,
      EN_PROGRESO: 0,
      FINALIZADO: 0,
      CANCELADO: 0,
    }
    let totalFacturado = 0

    for (const ticket of allTickets) {
      counts[ticket.estado] += 1
      if (ticket.estado === 'FINALIZADO' && ticket.precio_final !== null) {
        totalFacturado += ticket.precio_final
      }
    }

    return {
      total: allTickets.length,
      counts,
      totalFacturado,
    }
  }, [allTickets])

  // Búsqueda rápida en cliente sobre los tickets filtrados por estado
  const visibleTickets = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return tickets

    return tickets.filter((ticket) => {
      const serviceName =
        servicesMap.get(ticket.servicio_id)?.nombre.toLowerCase() ?? ''
      return (
        ticket.id.toLowerCase().includes(query) ||
        ticket.direccion.toLowerCase().includes(query) ||
        ticket.descripcion_problema.toLowerCase().includes(query) ||
        serviceName.includes(query)
      )
    })
  }, [tickets, searchQuery, servicesMap])

  const loadServices = useCallback(async () => {
    const requestId = ++servicesReqIdRef.current
    setServicesLoading(true)
    setServicesError(null)
    try {
      const data = await getServices()
      if (requestId === servicesReqIdRef.current) {
        setServices(data)
      }
    } catch (err) {
      if (requestId === servicesReqIdRef.current) {
        setServicesError(
          extractErrorMessage(
            err,
            'No se pudo cargar el catálogo de servicios',
          ),
        )
      }
    } finally {
      if (requestId === servicesReqIdRef.current) {
        setServicesLoading(false)
      }
    }
  }, [])

  const loadTickets = useCallback(
    async (filter: StatusFilter, refreshGlobal = false) => {
      const requestId = ++ticketsReqIdRef.current
      setTicketsLoading(true)
      setTicketsError(null)

      try {
        if (filter === 'TODOS') {
          const data = await getTickets()
          if (requestId === ticketsReqIdRef.current) {
            setTickets(data)
            setAllTickets(data)
          }
        } else if (refreshGlobal) {
          const [filteredData, globalData] = await Promise.all([
            getTickets(filter),
            getTickets(),
          ])
          if (requestId === ticketsReqIdRef.current) {
            setTickets(filteredData)
            setAllTickets(globalData)
          }
        } else {
          const filteredData = await getTickets(filter)
          if (requestId === ticketsReqIdRef.current) {
            setTickets(filteredData)
          }
        }
      } catch (err) {
        if (requestId === ticketsReqIdRef.current) {
          setTicketsError(
            extractErrorMessage(err, 'No se pudieron cargar los tickets'),
          )
        }
      } finally {
        if (requestId === ticketsReqIdRef.current) {
          setTicketsLoading(false)
        }
      }
    },
    [],
  )

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
          extractErrorMessage(err, 'No se pudo obtener el detalle del ticket'),
        )
      }
    } finally {
      if (requestId === detailReqIdRef.current) {
        setDetailLoading(false)
      }
    }
  }, [])

  // Carga inicial: catálogo de servicios + listado global de tickets
  useEffect(() => {
    let cancelled = false

    const svcReqId = ++servicesReqIdRef.current
    getServices()
      .then((data) => {
        if (!cancelled && svcReqId === servicesReqIdRef.current) {
          setServices(data)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled && svcReqId === servicesReqIdRef.current) {
          setServicesError(
            extractErrorMessage(
              err,
              'No se pudo cargar el catálogo de servicios',
            ),
          )
        }
      })
      .finally(() => {
        if (!cancelled && svcReqId === servicesReqIdRef.current) {
          setServicesLoading(false)
        }
      })

    const requestId = ++ticketsReqIdRef.current
    getTickets()
      .then((data) => {
        if (!cancelled && requestId === ticketsReqIdRef.current) {
          setTickets(data)
          setAllTickets(data)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled && requestId === ticketsReqIdRef.current) {
          setTicketsError(
            extractErrorMessage(err, 'No se pudieron cargar los tickets'),
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

  // Cerrar modales con la tecla Escape
  useEffect(() => {
    if (
      !detailTicketId &&
      !ticketToCancel &&
      !serviceModalMode &&
      !serviceToDelete
    ) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (serviceToDelete && !deletingService) {
        setServiceToDelete(null)
        setDeleteServiceError(null)
      } else if (serviceModalMode && !savingService) {
        setServiceModalMode(null)
        setEditingService(null)
        setServiceModalError(null)
      } else if (ticketToCancel && !cancelling) {
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
  }, [
    detailTicketId,
    ticketToCancel,
    cancelling,
    serviceModalMode,
    savingService,
    serviceToDelete,
    deletingService,
  ])

  function handleFilterChange(nextFilter: StatusFilter) {
    setStatusFilter(nextFilter)
    void loadTickets(nextFilter)
  }

  async function handleAdvanceState(
    ticket: Ticket,
    nextState: OperarioNextState,
  ) {
    setUpdatingTicketId(ticket.id)
    setActionError(null)
    setFeedbackMessage(null)

    try {
      const res = await updateTicketState(ticket.id, nextState)
      setFeedbackMessage(res.message || 'Estado actualizado exitosamente.')
      await loadTickets(statusFilter, true)
      if (detailTicketId === ticket.id) {
        await loadTicketDetail(ticket.id)
      }
    } catch (err) {
      setActionError(
        extractErrorMessage(err, 'No se pudo actualizar el estado del ticket'),
      )
    } finally {
      setUpdatingTicketId(null)
    }
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

  async function handleConfirmCancel() {
    if (!ticketToCancel) return
    const targetId = ticketToCancel.id

    setCancelling(true)
    setCancelError(null)
    setActionError(null)
    setFeedbackMessage(null)

    try {
      const res = await cancelTicket(targetId)
      setTicketToCancel(null)
      setFeedbackMessage(res.message || 'Ticket cancelado exitosamente.')
      await loadTickets(statusFilter, true)
      if (detailTicketId === targetId) {
        await loadTicketDetail(targetId)
      }
    } catch (err) {
      setCancelError(
        extractErrorMessage(err, 'No se pudo cancelar el ticket'),
      )
    } finally {
      setCancelling(false)
    }
  }

  function closeDetailModal() {
    detailReqIdRef.current += 1
    setDetailTicketId(null)
    setDetailTicket(null)
    setDetailError(null)
  }

  // --- Handlers ABM de Servicios ---
  function openCreateServiceModal() {
    setEditingService(null)
    setServiceNombreInput('')
    setServiceDescripcionInput('')
    setServiceTarifaInput('')
    setServiceModalError(null)
    setServiceModalMode('CREATE')
  }

  function openEditServiceModal(service: Service) {
    setEditingService(service)
    setServiceNombreInput(service.nombre)
    setServiceDescripcionInput(service.descripcion ?? '')
    setServiceTarifaInput(String(service.tarifa_base))
    setServiceModalError(null)
    setServiceModalMode('EDIT')
  }

  function closeServiceModal() {
    if (savingService) return
    setServiceModalMode(null)
    setEditingService(null)
    setServiceModalError(null)
  }

  async function handleServiceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setServiceModalError(null)
    setCatalogFeedback(null)

    const trimmedNombre = serviceNombreInput.trim()
    if (!trimmedNombre) {
      setServiceModalError('El nombre del servicio no puede estar vacío.')
      return
    }

    const parsedTarifa = Number(serviceTarifaInput)
    if (!Number.isFinite(parsedTarifa) || parsedTarifa <= 0) {
      setServiceModalError('Ingresá una tarifa base válida mayor a 0.')
      return
    }

    const trimmedDescripcion = serviceDescripcionInput.trim()
    const payload = {
      nombre: trimmedNombre,
      descripcion: trimmedDescripcion ? trimmedDescripcion : null,
      tarifa_base: parsedTarifa,
    }

    setSavingService(true)
    try {
      if (serviceModalMode === 'EDIT' && editingService) {
        const updated = await updateService(editingService.id, payload)
        setCatalogFeedback(
          `Servicio "${updated.nombre}" actualizado correctamente.`,
        )
      } else {
        const created = await createService(payload)
        setCatalogFeedback(`Servicio "${created.nombre}" creado correctamente.`)
      }
      setServiceModalMode(null)
      setEditingService(null)
      await loadServices()
    } catch (err) {
      setServiceModalError(
        err instanceof Error ? err.message : 'No se pudo guardar el servicio',
      )
    } finally {
      setSavingService(false)
    }
  }

  function openDeleteServiceConfirm(service: Service) {
    setDeleteServiceError(null)
    setServiceToDelete(service)
  }

  function closeDeleteServiceConfirm() {
    if (deletingService) return
    setServiceToDelete(null)
    setDeleteServiceError(null)
  }

  async function handleConfirmDeleteService() {
    if (!serviceToDelete) return

    setDeletingService(true)
    setDeleteServiceError(null)
    setCatalogFeedback(null)

    try {
      const res = await deleteService(serviceToDelete.id)
      const deletedName = serviceToDelete.nombre
      setServiceToDelete(null)
      setCatalogFeedback(
        res.message || `Servicio "${deletedName}" eliminado correctamente.`,
      )
      await loadServices()
    } catch (err) {
      setDeleteServiceError(
        err instanceof Error ? err.message : 'No se pudo eliminar el servicio',
      )
    } finally {
      setDeletingService(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Navbar />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Panel de Administración
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Supervisión global de tickets, facturación y gestión del catálogo
              de servicios.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              if (activeTab === 'TICKETS') {
                void loadTickets(statusFilter, true)
                void loadServices()
              } else {
                void loadServices()
              }
            }}
            disabled={
              activeTab === 'TICKETS' ? ticketsLoading : servicesLoading
            }
            className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
          >
            {(activeTab === 'TICKETS' ? ticketsLoading : servicesLoading)
              ? 'Actualizando…'
              : 'Actualizar'}
          </button>
        </div>

        {/* Pestañas principales: Tickets | Catálogo de Servicios */}
        <div
          role="tablist"
          aria-label="Secciones de administración"
          className="mb-6 flex flex-wrap gap-2 border-b border-slate-800 pb-4"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'TICKETS'}
            onClick={() => setActiveTab('TICKETS')}
            className={`inline-flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
              activeTab === 'TICKETS'
                ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
                : 'border-slate-800 bg-slate-900/70 text-slate-400 hover:border-slate-700 hover:text-slate-200'
            }`}
          >
            <span>Tickets</span>
            <span className="rounded-full bg-slate-950/80 px-2 py-0.5 text-xs font-bold text-slate-200">
              {ticketsLoading ? '…' : kpis.total}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'SERVICIOS'}
            onClick={() => setActiveTab('SERVICIOS')}
            className={`inline-flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
              activeTab === 'SERVICIOS'
                ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
                : 'border-slate-800 bg-slate-900/70 text-slate-400 hover:border-slate-700 hover:text-slate-200'
            }`}
          >
            <span>Catálogo de Servicios</span>
            <span className="rounded-full bg-slate-950/80 px-2 py-0.5 text-xs font-bold text-slate-200">
              {servicesLoading ? '…' : services.length}
            </span>
          </button>
        </div>

        {/* Pestaña 1: Tickets */}
        {activeTab === 'TICKETS' && (
          <div aria-label="Supervisión de Tickets">
            {/* KPIs principales + Contadores por estado */}
            <section aria-label="Resumen de tickets" className="mb-8 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => handleFilterChange('TODOS')}
                  className={`rounded-2xl border bg-slate-900/70 p-4 text-left transition ${
                    statusFilter === 'TODOS'
                      ? 'border-emerald-500 ring-1 ring-emerald-500/30'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                    Total de tickets
                  </p>
                  <p className="mt-1 text-2xl font-bold text-white">
                    {kpis.total}
                  </p>
                </button>

                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-emerald-400">
                    Total facturado (Finalizados)
                  </p>
                  <p className="mt-1 text-2xl font-bold text-white">
                    {formatCurrency(kpis.totalFacturado)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {ALL_STATES.map((state) => {
                  const active = statusFilter === state
                  return (
                    <button
                      key={state}
                      type="button"
                      onClick={() => handleFilterChange(state)}
                      className={`rounded-xl border bg-slate-900/60 p-3 text-left transition ${
                        active
                          ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/30'
                          : KPI_CARD_STYLES[state]
                      }`}
                    >
                      <p className="text-xs font-medium text-slate-400">
                        {STATUS_LABELS[state]}
                      </p>
                      <p className="mt-1 text-xl font-bold text-white">
                        {kpis.counts[state]}
                      </p>
                    </button>
                  )
                })}
              </div>
            </section>

            {/* Alertas de acciones */}
            {feedbackMessage && (
              <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                <span>{feedbackMessage}</span>
                <button
                  type="button"
                  onClick={() => setFeedbackMessage(null)}
                  aria-label="Cerrar aviso"
                  className="shrink-0 text-xs text-emerald-200 hover:text-white"
                >
                  ✕
                </button>
              </div>
            )}

            {actionError && (
              <div
                role="alert"
                className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300"
              >
                <span>{actionError}</span>
                <button
                  type="button"
                  onClick={() => setActionError(null)}
                  aria-label="Cerrar error"
                  className="shrink-0 text-xs text-rose-200 hover:text-white"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Controles de filtrado y búsqueda */}
            <section aria-label="Filtros y búsqueda" className="mb-5 space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div
                  role="tablist"
                  aria-label="Filtrar tickets por estado"
                  className="flex flex-wrap gap-2"
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

                <div className="relative w-full sm:w-72">
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Buscar por dirección, problema, ID o servicio…"
                    aria-label="Buscar tickets"
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>
              </div>

              <p className="text-xs text-slate-400">
                {ticketsLoading
                  ? 'Cargando tickets…'
                  : `Mostrando ${visibleTickets.length} ${visibleTickets.length === 1 ? 'ticket' : 'tickets'}`}
              </p>
            </section>

            {ticketsError && (
              <div
                role="alert"
                className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300"
              >
                <span>{ticketsError}</span>
                <button
                  type="button"
                  onClick={() => void loadTickets(statusFilter, true)}
                  className="shrink-0 text-xs font-semibold text-rose-200 underline hover:text-white"
                >
                  Reintentar
                </button>
              </div>
            )}

            {/* Listado global */}
            {ticketsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((item) => (
                  <div
                    key={item}
                    className="h-24 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/50"
                  />
                ))}
              </div>
            ) : visibleTickets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 px-6 py-14 text-center">
                <p className="text-base font-medium text-slate-200">
                  No se encontraron tickets
                </p>
                <p className="mt-1.5 text-sm text-slate-400">
                  {searchQuery.trim()
                    ? 'Probá limpiando o ajustando tu búsqueda.'
                    : statusFilter !== 'TODOS'
                      ? 'No hay tickets registrados en este estado.'
                      : 'Todavía no hay solicitudes registradas en la plataforma.'}
                </p>
                {(searchQuery.trim() || statusFilter !== 'TODOS') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('')
                      if (statusFilter !== 'TODOS') {
                        handleFilterChange('TODOS')
                      }
                    }}
                    className="mt-4 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-200 transition hover:border-emerald-500/50 hover:text-emerald-300"
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Tabla en desktop */}
                <div className="hidden overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 shadow-xl shadow-black/20 md:block">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-900 text-xs uppercase tracking-wider text-slate-400">
                          <th className="px-4 py-3.5 font-semibold">
                            Servicio
                          </th>
                          <th className="px-4 py-3.5 font-semibold">Estado</th>
                          <th className="px-4 py-3.5 font-semibold">
                            Dirección
                          </th>
                          <th className="px-4 py-3.5 font-semibold">
                            Cliente / Operario
                          </th>
                          <th className="px-4 py-3.5 font-semibold">Creado</th>
                          <th className="px-4 py-3.5 font-semibold">Monto</th>
                          <th className="px-4 py-3.5 text-right font-semibold">
                            Acciones
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {visibleTickets.map((ticket) => {
                          const service = servicesMap.get(ticket.servicio_id)
                          const isUpdating = updatingTicketId === ticket.id
                          const canCancel = isCancellable(ticket.estado)

                          return (
                            <tr
                              key={ticket.id}
                              className="transition hover:bg-slate-800/40"
                            >
                              <td className="px-4 py-3.5 align-top">
                                <p className="font-semibold text-white">
                                  {service
                                    ? service.nombre
                                    : `Servicio #${ticket.servicio_id}`}
                                </p>
                                <p
                                  className="mt-0.5 font-mono text-xs text-slate-500"
                                  title={ticket.id}
                                >
                                  {shortId(ticket.id)}
                                </p>
                              </td>
                              <td className="px-4 py-3.5 align-top">
                                <StatusBadge status={ticket.estado} />
                              </td>
                              <td className="max-w-xs px-4 py-3.5 align-top">
                                <p className="text-slate-200">
                                  {ticket.direccion}
                                </p>
                                <p className="mt-0.5 line-clamp-1 text-xs text-slate-400">
                                  {ticket.descripcion_problema}
                                </p>
                              </td>
                              <td className="px-4 py-3.5 align-top text-xs">
                                <p className="text-slate-400">
                                  Cli:{' '}
                                  <span
                                    className="font-mono text-slate-200"
                                    title={ticket.cliente_id}
                                  >
                                    {shortId(ticket.cliente_id)}
                                  </span>
                                </p>
                                <p className="mt-0.5 text-slate-400">
                                  Op:{' '}
                                  {ticket.operario_id ? (
                                    <span
                                      className="font-mono text-slate-200"
                                      title={ticket.operario_id}
                                    >
                                      {shortId(ticket.operario_id)}
                                    </span>
                                  ) : (
                                    <span className="italic text-slate-500">
                                      Sin asignar
                                    </span>
                                  )}
                                </p>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3.5 align-top text-xs text-slate-300">
                                {formatDate(ticket.created_at)}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3.5 align-top text-xs font-semibold text-white">
                                {ticket.precio_final !== null ? (
                                  formatCurrency(ticket.precio_final)
                                ) : (
                                  <span className="font-normal text-slate-500">
                                    —
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3.5 align-top">
                                <div className="flex flex-wrap items-center justify-end gap-1.5">
                                  {ticket.estado === 'ASIGNADO' && (
                                    <button
                                      type="button"
                                      disabled={isUpdating}
                                      onClick={() =>
                                        void handleAdvanceState(
                                          ticket,
                                          'EN_CAMINO',
                                        )
                                      }
                                      className="rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-60"
                                    >
                                      {isUpdating
                                        ? 'Actualizando…'
                                        : 'Marcar En Camino'}
                                    </button>
                                  )}
                                  {ticket.estado === 'EN_CAMINO' && (
                                    <button
                                      type="button"
                                      disabled={isUpdating}
                                      onClick={() =>
                                        void handleAdvanceState(
                                          ticket,
                                          'EN_PROGRESO',
                                        )
                                      }
                                      className="rounded-lg bg-cyan-500 px-2.5 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-60"
                                    >
                                      {isUpdating
                                        ? 'Actualizando…'
                                        : 'Iniciar Trabajo'}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void loadTicketDetail(ticket.id)
                                    }
                                    className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-emerald-500/60 hover:text-emerald-300"
                                  >
                                    Ver detalle
                                  </button>
                                  {canCancel && (
                                    <button
                                      type="button"
                                      disabled={isUpdating}
                                      onClick={() => openCancelConfirm(ticket)}
                                      className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs font-medium text-rose-300 transition hover:border-rose-500/60 hover:bg-rose-500/20 disabled:opacity-60"
                                    >
                                      Cancelar
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Cards en móvil */}
                <ul className="space-y-4 md:hidden">
                  {visibleTickets.map((ticket) => {
                    const service = servicesMap.get(ticket.servicio_id)
                    const isUpdating = updatingTicketId === ticket.id
                    const canCancel = isCancellable(ticket.estado)

                    return (
                      <li
                        key={ticket.id}
                        className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-lg shadow-black/20"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-base font-semibold text-white">
                              {service
                                ? service.nombre
                                : `Servicio #${ticket.servicio_id}`}
                            </h3>
                            <p className="mt-0.5 text-sm text-slate-300">
                              {ticket.direccion}
                            </p>
                          </div>
                          <StatusBadge status={ticket.estado} />
                        </div>

                        <p className="mt-2 line-clamp-2 text-xs text-slate-400">
                          {ticket.descripcion_problema}
                        </p>

                        <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-slate-800/90 bg-slate-950/60 p-2.5 text-xs">
                          <div>
                            <span className="text-slate-500">Cliente: </span>
                            <span className="font-mono text-slate-300">
                              {shortId(ticket.cliente_id)}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500">Operario: </span>
                            {ticket.operario_id ? (
                              <span className="font-mono text-slate-300">
                                {shortId(ticket.operario_id)}
                              </span>
                            ) : (
                              <span className="italic text-slate-500">
                                Sin asignar
                              </span>
                            )}
                          </div>
                          <div>
                            <span className="text-slate-500">Creado: </span>
                            <span className="text-slate-300">
                              {formatDate(ticket.created_at)}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500">Monto: </span>
                            <span className="font-semibold text-white">
                              {ticket.precio_final !== null
                                ? formatCurrency(ticket.precio_final)
                                : '—'}
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2 pt-1">
                          {ticket.estado === 'ASIGNADO' && (
                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={() =>
                                void handleAdvanceState(ticket, 'EN_CAMINO')
                              }
                              className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-60"
                            >
                              {isUpdating
                                ? 'Actualizando…'
                                : 'Marcar En Camino'}
                            </button>
                          )}
                          {ticket.estado === 'EN_CAMINO' && (
                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={() =>
                                void handleAdvanceState(ticket, 'EN_PROGRESO')
                              }
                              className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-60"
                            >
                              {isUpdating ? 'Actualizando…' : 'Iniciar Trabajo'}
                            </button>
                          )}
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
                              disabled={isUpdating}
                              onClick={() => openCancelConfirm(ticket)}
                              className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:border-rose-500/60 hover:bg-rose-500/20 disabled:opacity-60"
                            >
                              Cancelar
                            </button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </div>
        )}

        {/* Pestaña 2: Catálogo de Servicios */}
        {activeTab === 'SERVICIOS' && (
          <section aria-label="Catálogo de Servicios">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Catálogo de Servicios
                </h2>
                <p className="text-xs text-slate-400">
                  Administrá los oficios disponibles y sus tarifas base de
                  referencia.
                </p>
              </div>

              <button
                type="button"
                onClick={openCreateServiceModal}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 sm:text-sm"
              >
                <span aria-hidden className="text-base leading-none">
                  +
                </span>
                <span>Nuevo servicio</span>
              </button>
            </div>

            {catalogFeedback && (
              <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                <span>{catalogFeedback}</span>
                <button
                  type="button"
                  onClick={() => setCatalogFeedback(null)}
                  aria-label="Cerrar confirmación"
                  className="shrink-0 text-xs text-emerald-200 hover:text-white"
                >
                  ✕
                </button>
              </div>
            )}

            {servicesError && (
              <div
                role="alert"
                className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300"
              >
                <span>{servicesError}</span>
                <button
                  type="button"
                  onClick={() => void loadServices()}
                  className="shrink-0 text-xs font-semibold text-rose-200 underline hover:text-white"
                >
                  Reintentar
                </button>
              </div>
            )}

            {servicesLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((item) => (
                  <div
                    key={item}
                    className="h-20 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/50"
                  />
                ))}
              </div>
            ) : services.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 px-6 py-14 text-center">
                <p className="text-base font-medium text-slate-200">
                  El catálogo de servicios está vacío
                </p>
                <p className="mt-1.5 text-sm text-slate-400">
                  Agregá el primer oficio para que los clientes puedan crear
                  solicitudes y los operarios elegir especialidades.
                </p>
                <button
                  type="button"
                  onClick={openCreateServiceModal}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400"
                >
                  + Crear primer servicio
                </button>
              </div>
            ) : (
              <>
                {/* Tabla responsive en desktop */}
                <div className="hidden overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 shadow-xl shadow-black/20 md:block">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-900 text-xs uppercase tracking-wider text-slate-400">
                          <th className="px-4 py-3.5 font-semibold">ID</th>
                          <th className="px-4 py-3.5 font-semibold">Nombre</th>
                          <th className="px-4 py-3.5 font-semibold">
                            Descripción
                          </th>
                          <th className="px-4 py-3.5 font-semibold">
                            Tarifa base
                          </th>
                          <th className="px-4 py-3.5 font-semibold">Alta</th>
                          <th className="px-4 py-3.5 text-right font-semibold">
                            Acciones
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {services.map((service) => (
                          <tr
                            key={service.id}
                            className="transition hover:bg-slate-800/40"
                          >
                            <td className="whitespace-nowrap px-4 py-3.5 align-top font-mono text-xs text-slate-400">
                              #{service.id}
                            </td>
                            <td className="px-4 py-3.5 align-top font-semibold text-white">
                              {service.nombre}
                            </td>
                            <td className="max-w-md px-4 py-3.5 align-top text-slate-300">
                              {service.descripcion ? (
                                <p className="text-sm text-slate-300">
                                  {service.descripcion}
                                </p>
                              ) : (
                                <span className="italic text-xs text-slate-500">
                                  Sin descripción
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3.5 align-top font-semibold text-emerald-300">
                              {formatCurrency(service.tarifa_base)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3.5 align-top text-xs text-slate-400">
                              {formatDate(service.created_at)}
                            </td>
                            <td className="px-4 py-3.5 align-top">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => openEditServiceModal(service)}
                                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-emerald-500/60 hover:text-emerald-300"
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    openDeleteServiceConfirm(service)
                                  }
                                  className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:border-rose-500/60 hover:bg-rose-500/20"
                                >
                                  Eliminar
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Cards en móvil */}
                <ul className="space-y-4 md:hidden">
                  {services.map((service) => (
                    <li
                      key={service.id}
                      className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-lg shadow-black/20"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className="font-mono text-xs text-slate-500">
                            #{service.id}
                          </span>
                          <h3 className="text-base font-semibold text-white">
                            {service.nombre}
                          </h3>
                        </div>
                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
                          {formatCurrency(service.tarifa_base)}
                        </span>
                      </div>

                      <p className="mt-2 text-xs text-slate-300">
                        {service.descripcion || (
                          <span className="italic text-slate-500">
                            Sin descripción
                          </span>
                        )}
                      </p>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/90 pt-3">
                        <span className="text-xs text-slate-500">
                          Alta: {formatDate(service.created_at)}
                        </span>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditServiceModal(service)}
                            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-emerald-500/60 hover:text-emerald-300"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => openDeleteServiceConfirm(service)}
                            className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:border-rose-500/60 hover:bg-rose-500/20"
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}
      </main>

      {/* Modal Crear / Editar Servicio */}
      {serviceModalMode && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="service-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onClick={closeServiceModal}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/60"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h3
                  id="service-modal-title"
                  className="text-lg font-semibold text-white"
                >
                  {serviceModalMode === 'EDIT'
                    ? 'Editar servicio'
                    : 'Nuevo servicio'}
                </h3>
                <p className="mt-1 text-xs text-slate-400">
                  {serviceModalMode === 'EDIT'
                    ? 'Modificá el nombre, la descripción o la tarifa base.'
                    : 'Completá los datos del nuevo oficio para el catálogo.'}
                </p>
              </div>
              <button
                type="button"
                disabled={savingService}
                onClick={closeServiceModal}
                aria-label="Cerrar modal de servicio"
                className="rounded-lg border border-slate-800 px-2.5 py-1 text-sm text-slate-400 transition hover:border-slate-700 hover:text-white disabled:opacity-60"
              >
                ✕
              </button>
            </div>

            {serviceModalError && (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300"
              >
                {serviceModalError}
              </p>
            )}

            <form onSubmit={handleServiceSubmit} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="service-nombre"
                  className="mb-1.5 block text-sm font-medium text-slate-300"
                >
                  Nombre del servicio
                </label>
                <input
                  id="service-nombre"
                  type="text"
                  required
                  maxLength={100}
                  disabled={savingService}
                  value={serviceNombreInput}
                  onChange={(event) => {
                    setServiceNombreInput(event.target.value)
                    setServiceModalError(null)
                  }}
                  placeholder="Ej. Aire Acondicionado"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-60"
                />
              </div>

              <div>
                <label
                  htmlFor="service-descripcion"
                  className="mb-1.5 block text-sm font-medium text-slate-300"
                >
                  Descripción{' '}
                  <span className="font-normal text-slate-500">(opcional)</span>
                </label>
                <textarea
                  id="service-descripcion"
                  rows={3}
                  disabled={savingService}
                  value={serviceDescripcionInput}
                  onChange={(event) => {
                    setServiceDescripcionInput(event.target.value)
                    setServiceModalError(null)
                  }}
                  placeholder="Detalle breve de los trabajos incluidos…"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-60"
                />
              </div>

              <div>
                <label
                  htmlFor="service-tarifa"
                  className="mb-1.5 block text-sm font-medium text-slate-300"
                >
                  Tarifa base (ARS)
                </label>
                <input
                  id="service-tarifa"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  disabled={savingService}
                  value={serviceTarifaInput}
                  onChange={(event) => {
                    setServiceTarifaInput(event.target.value)
                    setServiceModalError(null)
                  }}
                  placeholder="Ej. 25000"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-60"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 border-t border-slate-800 pt-4">
                <button
                  type="button"
                  disabled={savingService}
                  onClick={closeServiceModal}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-xs font-medium text-slate-200 transition hover:border-slate-500 disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingService}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingService && (
                    <span
                      aria-hidden
                      className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-950/40 border-t-slate-950"
                    />
                  )}
                  {savingService
                    ? 'Guardando…'
                    : serviceModalMode === 'EDIT'
                      ? 'Guardar cambios'
                      : 'Crear servicio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirmar Eliminación de Servicio */}
      {serviceToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-service-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onClick={closeDeleteServiceConfirm}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/60"
            onClick={(event) => event.stopPropagation()}
          >
            <h3
              id="delete-service-title"
              className="text-lg font-semibold text-white"
            >
              ¿Eliminar este servicio?
            </h3>
            <p className="mt-2 text-sm text-slate-400">
              Vas a eliminar permanentemente{' '}
              <strong className="text-slate-200">
                {serviceToDelete.nombre}
              </strong>{' '}
              ({formatCurrency(serviceToDelete.tarifa_base)}) del catálogo de la
              plataforma.
            </p>

            {deleteServiceError && (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-300"
              >
                {deleteServiceError}
              </p>
            )}

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={deletingService}
                onClick={closeDeleteServiceConfirm}
                className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-xs font-medium text-slate-200 transition hover:border-slate-500 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deletingService}
                onClick={() => void handleConfirmDeleteService()}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingService && (
                  <span
                    aria-hidden
                    className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white"
                  />
                )}
                {deletingService ? 'Eliminando…' : 'Sí, eliminar servicio'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Detalle del Ticket */}
      {detailTicketId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-detail-title"
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
                  Supervisión · Detalle del ticket
                </p>
                <h3
                  id="admin-detail-title"
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

                  <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                    <dt className="text-xs text-slate-500">Cliente ID</dt>
                    <dd className="mt-0.5 break-all font-mono text-xs text-slate-300">
                      {detailTicket.cliente_id}
                    </dd>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                    <dt className="text-xs text-slate-500">Operario ID</dt>
                    <dd className="mt-0.5 break-all font-mono text-xs text-slate-300">
                      {detailTicket.operario_id ?? 'Sin asignar'}
                    </dd>
                  </div>
                </dl>

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
                        <div className="border-t border-emerald-500/20 pt-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <dt className="text-slate-400">Evidencia</dt>
                            <dd>
                              {isSafeHttpUrl(detailTicket.evidencia_url) ? (
                                <a
                                  href={detailTicket.evidencia_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium text-emerald-400 underline hover:text-emerald-300"
                                >
                                  Abrir tamaño completo ↗
                                </a>
                              ) : (
                                <span className="break-all text-xs text-slate-300">
                                  {detailTicket.evidencia_url}
                                </span>
                              )}
                            </dd>
                          </div>
                          {isSafeHttpUrl(detailTicket.evidencia_url) && (
                            <a
                              href={detailTicket.evidencia_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2.5 block"
                            >
                              <img
                                src={detailTicket.evidencia_url}
                                alt="Evidencia del trabajo finalizado"
                                loading="lazy"
                                className="max-h-56 w-full rounded-lg border border-emerald-500/20 bg-slate-950 object-cover transition hover:opacity-90"
                              />
                            </a>
                          )}
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
                      Cancelar ticket
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
          aria-labelledby="admin-cancel-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onClick={closeCancelConfirm}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/60"
            onClick={(event) => event.stopPropagation()}
          >
            <h3
              id="admin-cancel-title"
              className="text-lg font-semibold text-white"
            >
              ¿Cancelar este ticket?
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
                {cancelling ? 'Cancelando…' : 'Sí, cancelar ticket'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
