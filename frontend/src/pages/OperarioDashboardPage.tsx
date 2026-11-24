import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { ApiError } from '../api/client'
import { getMyServices, getServices, updateMyServices } from '../api/services'
import {
  assignTicket,
  cancelTicket,
  finishTicket,
  getAvailableTickets,
  getMyRating,
  getTicketById,
  getTickets,
  requestEvidenceUploadUrl,
  updateTicketState,
  uploadFileToPresignedUrl,
} from '../api/tickets'
import { Navbar } from '../components/Navbar'
import { StarRating } from '../components/StarRating'
import { StatusBadge } from '../components/StatusBadge'
import type {
  MetodoPago,
  OperarioNextState,
  OperarioRating,
  Service,
  Ticket,
  TicketDisponible,
  TicketStatus,
} from '../types/api'
import {
  formatCurrency,
  formatDate,
  isSafeHttpUrl,
  METODO_PAGO_LABELS,
} from '../utils/format'

type MainTab = 'BOLSA' | 'MIS_TRABAJOS' | 'MIS_ESPECIALIDADES'
type OperarioStatusFilter =
  | 'TODOS'
  | 'ASIGNADO'
  | 'EN_CAMINO'
  | 'EN_PROGRESO'
  | 'FINALIZADO'
  | 'CANCELADO'

const STATUS_FILTERS: Array<{ value: OperarioStatusFilter; label: string }> = [
  { value: 'TODOS', label: 'Todos' },
  { value: 'ASIGNADO', label: 'Asignado' },
  { value: 'EN_CAMINO', label: 'En camino' },
  { value: 'EN_PROGRESO', label: 'En progreso' },
  { value: 'FINALIZADO', label: 'Finalizado' },
  { value: 'CANCELADO', label: 'Cancelado' },
]

const METODO_PAGO_OPTIONS: MetodoPago[] = ['EFECTIVO', 'QR', 'TRANSFERENCIA']
const ALLOWED_EVIDENCE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])
const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024 // 5 MB

type FinishStep = 'IDLE' | 'UPLOADING' | 'FINISHING'

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function isCancellable(estado: TicketStatus): boolean {
  return estado !== 'FINALIZADO' && estado !== 'CANCELADO'
}

export function OperarioDashboardPage() {
  const [activeTab, setActiveTab] = useState<MainTab>('BOLSA')

  // Catálogo de servicios para mapear servicio_id -> nombre y configurar especialidades
  const [services, setServices] = useState<Service[]>([])
  const [servicesLoading, setServicesLoading] = useState(true)
  const [servicesError, setServicesError] = useState<string | null>(null)

  // Especialidades del operario autenticado
  const [myServices, setMyServices] = useState<Service[]>([])
  const [myServicesLoading, setMyServicesLoading] = useState(true)
  const [myServicesError, setMyServicesError] = useState<string | null>(null)
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([])
  const [savingSpecialties, setSavingSpecialties] = useState(false)
  const [specialtiesFeedback, setSpecialtiesFeedback] = useState<string | null>(
    null,
  )
  const [specialtiesError, setSpecialtiesError] = useState<string | null>(null)

  // Reputación y reseñas del operario autenticado
  const [myRating, setMyRating] = useState<OperarioRating | null>(null)
  const [myRatingLoading, setMyRatingLoading] = useState(true)

  // Pestaña 1: Bolsa de Trabajo
  const [availableTickets, setAvailableTickets] = useState<TicketDisponible[]>(
    [],
  )
  const [availableLoading, setAvailableLoading] = useState(true)
  const [availableError, setAvailableError] = useState<string | null>(null)
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [conflictMessage, setConflictMessage] = useState<string | null>(null)
  const availableReqIdRef = useRef(0)

  // Pestaña 2: Mis Trabajos
  const [statusFilter, setStatusFilter] =
    useState<OperarioStatusFilter>('TODOS')
  const [myTickets, setMyTickets] = useState<Ticket[]>([])
  const [myTicketsLoading, setMyTicketsLoading] = useState(true)
  const [myTicketsError, setMyTicketsError] = useState<string | null>(null)
  const [updatingTicketId, setUpdatingTicketId] = useState<string | null>(null)
  const myTicketsReqIdRef = useRef(0)

  // Mensajes de feedback globales
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Modal de detalle de ticket
  const [detailTicketId, setDetailTicketId] = useState<string | null>(null)
  const [detailTicket, setDetailTicket] = useState<Ticket | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const detailReqIdRef = useRef(0)

  // Modal de finalización
  const [ticketToFinish, setTicketToFinish] = useState<Ticket | null>(null)
  const [precioFinalInput, setPrecioFinalInput] = useState('')
  const [metodoPagoInput, setMetodoPagoInput] =
    useState<MetodoPago>('EFECTIVO')
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null)
  const [evidencePreviewUrl, setEvidencePreviewUrl] = useState<string | null>(
    null,
  )
  const [finishStep, setFinishStep] = useState<FinishStep>('IDLE')
  const [finishError, setFinishError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const finishing = finishStep !== 'IDLE'

  // Modal de confirmación de cancelación
  const [ticketToCancel, setTicketToCancel] = useState<Ticket | null>(null)
  const [cancelMotivoInput, setCancelMotivoInput] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  const servicesMap = useMemo(() => {
    const map = new Map<number, Service>()
    for (const service of services) {
      map.set(service.id, service)
    }
    return map
  }, [services])

  const selectedServiceSet = useMemo(
    () => new Set(selectedServiceIds),
    [selectedServiceIds],
  )

  const hasUnsavedSpecialtyChanges = useMemo(() => {
    if (selectedServiceIds.length !== myServices.length) return true
    const savedSet = new Set(myServices.map((s) => s.id))
    return selectedServiceIds.some((id) => !savedSet.has(id))
  }, [selectedServiceIds, myServices])

  const loadSpecialtiesAndCatalog = useCallback(async () => {
    setServicesLoading(true)
    setServicesError(null)
    setMyServicesLoading(true)
    setMyServicesError(null)

    const [catalogRes, myRes] = await Promise.allSettled([
      getServices(),
      getMyServices(),
    ])

    if (catalogRes.status === 'fulfilled') {
      setServices(catalogRes.value)
    } else {
      setServicesError(
        catalogRes.reason instanceof Error
          ? catalogRes.reason.message
          : 'No se pudo cargar el catálogo de servicios',
      )
    }
    setServicesLoading(false)

    if (myRes.status === 'fulfilled') {
      setMyServices(myRes.value)
      setSelectedServiceIds(myRes.value.map((s) => s.id))
    } else {
      setMyServicesError(
        myRes.reason instanceof Error
          ? myRes.reason.message
          : 'No se pudieron cargar tus especialidades',
      )
    }
    setMyServicesLoading(false)
  }, [])

  const loadAvailableTickets = useCallback(async () => {
    const requestId = ++availableReqIdRef.current
    setAvailableLoading(true)
    setAvailableError(null)
    try {
      const data = await getAvailableTickets()
      if (requestId === availableReqIdRef.current) {
        setAvailableTickets(data)
      }
    } catch (err) {
      if (requestId === availableReqIdRef.current) {
        setAvailableError(
          err instanceof Error
            ? err.message
            : 'No se pudo cargar la bolsa de trabajo',
        )
      }
    } finally {
      if (requestId === availableReqIdRef.current) {
        setAvailableLoading(false)
      }
    }
  }, [])

  const loadMyTickets = useCallback(async (filter: OperarioStatusFilter) => {
    const requestId = ++myTicketsReqIdRef.current
    setMyTicketsLoading(true)
    setMyTicketsError(null)
    try {
      const estado = filter === 'TODOS' ? undefined : filter
      const [data, ratingData] = await Promise.all([
        getTickets(estado),
        getMyRating().catch(() => null),
      ])
      if (requestId === myTicketsReqIdRef.current) {
        setMyTickets(data)
        if (ratingData) {
          setMyRating(ratingData)
        }
      }
    } catch (err) {
      if (requestId === myTicketsReqIdRef.current) {
        setMyTicketsError(
          err instanceof Error
            ? err.message
            : 'No se pudieron cargar tus trabajos',
        )
      }
    } finally {
      if (requestId === myTicketsReqIdRef.current) {
        setMyTicketsLoading(false)
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

  // Carga inicial: catálogo de servicios, mis especialidades, bolsa de trabajo y mis trabajos
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

    getMyServices()
      .then((data) => {
        if (!cancelled) {
          setMyServices(data)
          setSelectedServiceIds(data.map((s) => s.id))
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setMyServicesError(
            err instanceof Error
              ? err.message
              : 'No se pudieron cargar tus especialidades',
          )
        }
      })
      .finally(() => {
        if (!cancelled) {
          setMyServicesLoading(false)
        }
      })

    getMyRating()
      .then((data) => {
        if (!cancelled) {
          setMyRating(data)
        }
      })
      .catch(() => {
        // Fallback visual si no se puede consultar el rating inicial
      })
      .finally(() => {
        if (!cancelled) {
          setMyRatingLoading(false)
        }
      })

    const availReqId = ++availableReqIdRef.current
    getAvailableTickets()
      .then((data) => {
        if (!cancelled && availReqId === availableReqIdRef.current) {
          setAvailableTickets(data)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled && availReqId === availableReqIdRef.current) {
          setAvailableError(
            err instanceof Error
              ? err.message
              : 'No se pudo cargar la bolsa de trabajo',
          )
        }
      })
      .finally(() => {
        if (!cancelled && availReqId === availableReqIdRef.current) {
          setAvailableLoading(false)
        }
      })

    const myReqId = ++myTicketsReqIdRef.current
    getTickets()
      .then((data) => {
        if (!cancelled && myReqId === myTicketsReqIdRef.current) {
          setMyTickets(data)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled && myReqId === myTicketsReqIdRef.current) {
          setMyTicketsError(
            err instanceof Error
              ? err.message
              : 'No se pudieron cargar tus trabajos',
          )
        }
      })
      .finally(() => {
        if (!cancelled && myReqId === myTicketsReqIdRef.current) {
          setMyTicketsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  // Limpiar Object URL de vista previa al cambiar o desmontar
  useEffect(() => {
    return () => {
      if (evidencePreviewUrl) {
        URL.revokeObjectURL(evidencePreviewUrl)
      }
    }
  }, [evidencePreviewUrl])

  // Cerrar modales con Escape
  useEffect(() => {
    if (!detailTicketId && !ticketToFinish && !ticketToCancel) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (ticketToCancel && !cancelling) {
        setTicketToCancel(null)
        setCancelError(null)
      } else if (ticketToFinish && !finishing) {
        setEvidenceFile(null)
        setEvidencePreviewUrl(null)
        setTicketToFinish(null)
        setFinishError(null)
      } else if (detailTicketId) {
        detailReqIdRef.current += 1
        setDetailTicketId(null)
        setDetailTicket(null)
        setDetailError(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [detailTicketId, ticketToFinish, ticketToCancel, finishing, cancelling])

  function openSpecialtiesSection() {
    if (!savingSpecialties) {
      setSelectedServiceIds(myServices.map((s) => s.id))
      setSpecialtiesFeedback(null)
      setSpecialtiesError(null)
    }
    setActiveTab('MIS_ESPECIALIDADES')
  }

  function handleToggleSpecialty(serviceId: number) {
    setSpecialtiesFeedback(null)
    setSpecialtiesError(null)
    setSelectedServiceIds((prev) =>
      prev.includes(serviceId)
        ? prev.filter((id) => id !== serviceId)
        : [...prev, serviceId],
    )
  }

  function handleSelectAllSpecialties() {
    setSpecialtiesFeedback(null)
    setSpecialtiesError(null)
    setSelectedServiceIds(services.map((s) => s.id))
  }

  function handleClearSpecialties() {
    setSpecialtiesFeedback(null)
    setSpecialtiesError(null)
    setSelectedServiceIds([])
  }

  async function handleSaveSpecialties(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSavingSpecialties(true)
    setSpecialtiesFeedback(null)
    setSpecialtiesError(null)

    try {
      const updated = await updateMyServices(selectedServiceIds)
      setMyServices(updated)
      setSelectedServiceIds(updated.map((s) => s.id))
      setSpecialtiesFeedback(
        updated.length === 0
          ? 'Se actualizaron tus especialidades (ningún oficio seleccionado). Elegí al menos uno para ver solicitudes en la Bolsa de Trabajo.'
          : 'Especialidades guardadas correctamente. Actualizamos tu Bolsa de Trabajo.',
      )
      await loadAvailableTickets()
    } catch (err) {
      setSpecialtiesError(
        err instanceof Error
          ? err.message
          : 'No se pudieron guardar tus especialidades',
      )
    } finally {
      setSavingSpecialties(false)
    }
  }

  function handleFilterChange(nextFilter: OperarioStatusFilter) {
    setStatusFilter(nextFilter)
    void loadMyTickets(nextFilter)
  }

  async function handleAcceptTicket(ticket: TicketDisponible) {
    setAssigningId(ticket.id)
    setConflictMessage(null)
    setFeedbackMessage(null)
    setActionError(null)

    try {
      const res = await assignTicket(ticket.id)
      setFeedbackMessage(
        res.message || `Aceptaste el trabajo de ${ticket.servicio}.`,
      )
      setActiveTab('MIS_TRABAJOS')
      await Promise.all([loadAvailableTickets(), loadMyTickets(statusFilter)])
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConflictMessage(
          'Otro operario tomó este trabajo primero. Actualizamos la bolsa de trabajo.',
        )
        await loadAvailableTickets()
      } else {
        setActionError(
          err instanceof Error ? err.message : 'No se pudo aceptar el trabajo',
        )
        if (err instanceof ApiError && err.status === 403) {
          await loadAvailableTickets()
        }
      }
    } finally {
      setAssigningId(null)
    }
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
      await loadMyTickets(statusFilter)
      if (detailTicketId === ticket.id) {
        await loadTicketDetail(ticket.id)
      }
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'No se pudo actualizar el estado del trabajo',
      )
    } finally {
      setUpdatingTicketId(null)
    }
  }

  function clearSelectedEvidence() {
    setEvidenceFile(null)
    setEvidencePreviewUrl(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  function handleEvidenceFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFinishError(null)
    const file = event.target.files?.[0] ?? null

    if (!file) {
      clearSelectedEvidence()
      return
    }

    if (!ALLOWED_EVIDENCE_TYPES.has(file.type)) {
      clearSelectedEvidence()
      setFinishError(
        'Formato inválido. Seleccioná una imagen JPG, PNG o WEBP.',
      )
      return
    }

    if (file.size > MAX_EVIDENCE_BYTES) {
      clearSelectedEvidence()
      setFinishError('La imagen supera el tamaño máximo permitido de 5 MB.')
      return
    }

    setEvidenceFile(file)
    setEvidencePreviewUrl(URL.createObjectURL(file))
  }

  function openFinishModal(ticket: Ticket) {
    const baseRate = servicesMap.get(ticket.servicio_id)?.tarifa_base
    setPrecioFinalInput(baseRate ? String(baseRate) : '')
    setMetodoPagoInput('EFECTIVO')
    clearSelectedEvidence()
    setFinishError(null)
    setTicketToFinish(ticket)
  }

  function closeFinishModal() {
    if (finishing) return
    clearSelectedEvidence()
    setTicketToFinish(null)
    setFinishError(null)
  }

  async function handleFinishSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!ticketToFinish) return

    setFinishError(null)
    const parsedPrice = Number(precioFinalInput)
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setFinishError('Ingresá un precio final válido mayor a 0.')
      return
    }

    setActionError(null)
    setFeedbackMessage(null)

    try {
      let uploadedPublicUrl: string | undefined

      if (evidenceFile) {
        setFinishStep('UPLOADING')
        const { upload_url, public_url } = await requestEvidenceUploadUrl(
          ticketToFinish.id,
          evidenceFile.type,
        )
        await uploadFileToPresignedUrl(upload_url, evidenceFile)
        uploadedPublicUrl = public_url
      }

      setFinishStep('FINISHING')
      const res = await finishTicket(ticketToFinish.id, {
        precio_final: parsedPrice,
        metodo_pago: metodoPagoInput,
        ...(uploadedPublicUrl ? { evidencia_url: uploadedPublicUrl } : {}),
      })
      const finishedId = ticketToFinish.id
      clearSelectedEvidence()
      setTicketToFinish(null)
      setFeedbackMessage(res.message || 'Trabajo finalizado exitosamente.')
      await loadMyTickets(statusFilter)
      if (detailTicketId === finishedId) {
        await loadTicketDetail(finishedId)
      }
    } catch (err) {
      setFinishError(
        err instanceof Error ? err.message : 'No se pudo finalizar el trabajo',
      )
    } finally {
      setFinishStep('IDLE')
    }
  }

  function openCancelConfirm(ticket: Ticket) {
    setCancelMotivoInput('')
    setCancelError(null)
    setTicketToCancel(ticket)
  }

  function closeCancelConfirm() {
    if (cancelling) return
    setTicketToCancel(null)
    setCancelMotivoInput('')
    setCancelError(null)
  }

  async function handleConfirmCancel() {
    if (!ticketToCancel) return
    const targetId = ticketToCancel.id

    setCancelling(true)
    setCancelError(null)
    setFeedbackMessage(null)

    try {
      const res = await cancelTicket(targetId, cancelMotivoInput)
      setTicketToCancel(null)
      setCancelMotivoInput('')
      setFeedbackMessage(res.message || 'Ticket cancelado exitosamente.')
      await loadMyTickets(statusFilter)
      if (detailTicketId === targetId) {
        await loadTicketDetail(targetId)
      }
    } catch (err) {
      setCancelError(
        err instanceof Error ? err.message : 'No se pudo cancelar el trabajo',
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Navbar />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Panel de Operario
            </h1>
            <p className="mt-1.5 text-sm text-slate-400">
              Tomá solicitudes disponibles de tus oficios y gestioná el avance
              de tus trabajos asignados.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div
              aria-label="Tu reputación promedio"
              className="inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs font-semibold text-amber-200"
            >
              <span aria-hidden className="text-sm text-amber-400">
                ★
              </span>
              {myRatingLoading ? (
                <span className="text-slate-300">Cargando reputación…</span>
              ) : !myRating || myRating.total_resenas === 0 ? (
                <span className="text-slate-300">Sin reseñas aún</span>
              ) : (
                <span>
                  {myRating.promedio.toFixed(1)}{' '}
                  <span className="font-normal text-amber-200/80">
                    ({myRating.total_resenas}{' '}
                    {myRating.total_resenas === 1 ? 'reseña' : 'reseñas'})
                  </span>
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={openSpecialtiesSection}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition ${
                !myServicesLoading && myServices.length === 0
                  ? 'border-amber-500/50 bg-amber-500/15 text-amber-200 hover:border-amber-400 hover:bg-amber-500/20'
                  : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-emerald-500/60 hover:text-emerald-300'
              }`}
            >
              <span>Mis Especialidades</span>
              {myServicesLoading ? (
                <span className="rounded-full bg-slate-950/80 px-2 py-0.5 text-[11px] font-bold text-slate-300">
                  …
                </span>
              ) : myServices.length === 0 ? (
                <span className="rounded-full bg-amber-500/25 px-2 py-0.5 text-[11px] font-bold text-amber-200">
                  Sin configurar
                </span>
              ) : (
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
                  {myServices.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Pestañas principales */}
        <div
          role="tablist"
          aria-label="Vistas del operario"
          className="mb-6 flex flex-wrap gap-2 border-b border-slate-800 pb-4"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'BOLSA'}
            onClick={() => setActiveTab('BOLSA')}
            className={`inline-flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
              activeTab === 'BOLSA'
                ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
                : 'border-slate-800 bg-slate-900/70 text-slate-400 hover:border-slate-700 hover:text-slate-200'
            }`}
          >
            <span>Bolsa de Trabajo</span>
            <span className="rounded-full bg-slate-950/80 px-2 py-0.5 text-xs font-bold text-slate-200">
              {availableLoading ? '…' : availableTickets.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'MIS_TRABAJOS'}
            onClick={() => setActiveTab('MIS_TRABAJOS')}
            className={`inline-flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
              activeTab === 'MIS_TRABAJOS'
                ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
                : 'border-slate-800 bg-slate-900/70 text-slate-400 hover:border-slate-700 hover:text-slate-200'
            }`}
          >
            <span>Mis Trabajos</span>
            <span className="rounded-full bg-slate-950/80 px-2 py-0.5 text-xs font-bold text-slate-200">
              {myTicketsLoading ? '…' : myTickets.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'MIS_ESPECIALIDADES'}
            onClick={openSpecialtiesSection}
            className={`inline-flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
              activeTab === 'MIS_ESPECIALIDADES'
                ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
                : 'border-slate-800 bg-slate-900/70 text-slate-400 hover:border-slate-700 hover:text-slate-200'
            }`}
          >
            <span>Mis Especialidades</span>
            <span className="rounded-full bg-slate-950/80 px-2 py-0.5 text-xs font-bold text-slate-200">
              {myServicesLoading ? '…' : myServices.length}
            </span>
          </button>
        </div>

        {/* Alertas globales */}
        {conflictMessage && (
          <div
            role="alert"
            className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
          >
            <span>{conflictMessage}</span>
            <button
              type="button"
              onClick={() => setConflictMessage(null)}
              aria-label="Cerrar aviso"
              className="shrink-0 text-xs text-amber-300 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}

        {feedbackMessage && (
          <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
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
            className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300"
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

        {/* Pestaña 1: Bolsa de Trabajo */}
        {activeTab === 'BOLSA' && (
          <section aria-label="Bolsa de Trabajo">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Trabajos disponibles
                </h2>
                <p className="text-xs text-slate-400">
                  Tickets en estado CREADO filtrados según tus especialidades.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadAvailableTickets()}
                disabled={availableLoading}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {availableLoading ? 'Actualizando…' : 'Actualizar'}
              </button>
            </div>

            {!myServicesLoading && myServices.length > 0 && (
              <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span>Filtrando por tus oficios:</span>
                {myServices.map((service) => (
                  <span
                    key={service.id}
                    className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 font-medium text-emerald-300"
                  >
                    {service.nombre}
                  </span>
                ))}
              </div>
            )}

            {availableError && (
              <div
                role="alert"
                className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300"
              >
                <span>{availableError}</span>
                <button
                  type="button"
                  onClick={() => void loadAvailableTickets()}
                  className="shrink-0 text-xs font-semibold text-rose-200 underline hover:text-white"
                >
                  Reintentar
                </button>
              </div>
            )}

            {availableLoading || myServicesLoading ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {[1, 2, 3, 4].map((item) => (
                  <div
                    key={item}
                    className="h-44 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/50"
                  />
                ))}
              </div>
            ) : !myServicesError && myServices.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-amber-500/40 bg-amber-500/5 px-6 py-14 text-center">
                <p className="text-base font-semibold text-amber-200">
                  Todavía no seleccionaste tus especialidades
                </p>
                <p className="mx-auto mt-2 max-w-lg text-sm text-slate-300">
                  Para ver solicitudes en la Bolsa de Trabajo, primero elegí los
                  oficios que realizás (plomería, electricidad, gas, cerrajería,
                  etc.).
                </p>
                <button
                  type="button"
                  onClick={openSpecialtiesSection}
                  className="mt-5 inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400"
                >
                  Configurar Mis Especialidades
                </button>
              </div>
            ) : availableTickets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 px-6 py-14 text-center">
                <p className="text-base font-medium text-slate-200">
                  No hay trabajos disponibles para tus especialidades en este
                  momento
                </p>
                <p className="mt-1.5 text-sm text-slate-400">
                  Cuando un cliente cree una solicitud de tus oficios, aparecerá
                  aquí automáticamente.
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => void loadAvailableTickets()}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-200 transition hover:border-emerald-500/50 hover:text-emerald-300"
                  >
                    Volver a consultar
                  </button>
                  <button
                    type="button"
                    onClick={openSpecialtiesSection}
                    className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-2 text-xs font-medium text-slate-300 transition hover:border-slate-600 hover:text-white"
                  >
                    Editar mis especialidades
                  </button>
                </div>
              </div>
            ) : (
              <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {availableTickets.map((ticket) => {
                  const isAssigning = assigningId === ticket.id
                  const disableAll = assigningId !== null

                  return (
                    <li
                      key={ticket.id}
                      className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg shadow-black/20 transition hover:border-slate-700"
                    >
                      <div>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <h3 className="text-base font-semibold text-white">
                            {ticket.servicio}
                          </h3>
                          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
                            Base: {formatCurrency(ticket.tarifa_base)}
                          </span>
                        </div>

                        <p className="mt-1.5 text-sm font-medium text-slate-300">
                          {ticket.direccion}
                        </p>
                        <p className="mt-2.5 text-sm text-slate-400">
                          {ticket.descripcion_problema}
                        </p>
                      </div>

                      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/90 pt-3.5">
                        <span className="text-xs text-slate-500">
                          Publicado el {formatDate(ticket.created_at)}
                        </span>

                        <button
                          type="button"
                          disabled={disableAll}
                          onClick={() => void handleAcceptTicket(ticket)}
                          className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isAssigning && (
                            <span
                              aria-hidden
                              className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-950/40 border-t-slate-950"
                            />
                          )}
                          {isAssigning ? 'Aceptando…' : 'Aceptar trabajo'}
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )}

        {/* Pestaña 2: Mis Trabajos */}
        {activeTab === 'MIS_TRABAJOS' && (
          <section aria-label="Mis Trabajos">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Mis trabajos asignados
                </h2>
                <p className="text-xs text-slate-400">
                  {myTicketsLoading
                    ? 'Actualizando listado…'
                    : `${myTickets.length} ${myTickets.length === 1 ? 'trabajo encontrado' : 'trabajos encontrados'}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadMyTickets(statusFilter)}
                disabled={myTicketsLoading}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                Actualizar
              </button>
            </div>

            {/* Filtro por estado */}
            <div
              role="tablist"
              aria-label="Filtrar mis trabajos por estado"
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

            {myTicketsError && (
              <div
                role="alert"
                className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300"
              >
                <span>{myTicketsError}</span>
                <button
                  type="button"
                  onClick={() => void loadMyTickets(statusFilter)}
                  className="shrink-0 text-xs font-semibold text-rose-200 underline hover:text-white"
                >
                  Reintentar
                </button>
              </div>
            )}

            {myTicketsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className="h-36 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/50"
                  />
                ))}
              </div>
            ) : myTickets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 px-6 py-14 text-center">
                <p className="text-base font-medium text-slate-200">
                  {statusFilter === 'TODOS'
                    ? 'Todavía no tenés trabajos asignados'
                    : 'No hay trabajos con este estado'}
                </p>
                <p className="mt-1.5 text-sm text-slate-400">
                  {statusFilter === 'TODOS'
                    ? 'Revisá la Bolsa de Trabajo para aceptar tu primer servicio.'
                    : 'Probá seleccionando otro filtro o volvé a "Todos".'}
                </p>
                {statusFilter === 'TODOS' ? (
                  <button
                    type="button"
                    onClick={() => setActiveTab('BOLSA')}
                    className="mt-4 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400"
                  >
                    Ir a Bolsa de Trabajo
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleFilterChange('TODOS')}
                    className="mt-4 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-200 transition hover:border-emerald-500/50 hover:text-emerald-300"
                  >
                    Ver todos
                  </button>
                )}
              </div>
            ) : (
              <ul className="space-y-4">
                {myTickets.map((ticket) => {
                  const service = servicesMap.get(ticket.servicio_id)
                  const isUpdating = updatingTicketId === ticket.id
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

                        <div className="flex flex-wrap items-center gap-2">
                          {ticket.resena && (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
                              <StarRating value={ticket.resena.puntuacion} />
                              <span>{ticket.resena.puntuacion}/5</span>
                            </span>
                          )}
                          <StatusBadge status={ticket.estado} />
                        </div>
                      </div>

                      <p className="mt-3 line-clamp-2 text-sm text-slate-400">
                        {ticket.descripcion_problema}
                      </p>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/90 pt-3.5">
                        <span className="text-xs text-slate-500">
                          Actualizado el {formatDate(ticket.updated_at)}
                        </span>

                        <div className="flex flex-wrap items-center gap-2">
                          {ticket.estado === 'ASIGNADO' && (
                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={() =>
                                void handleAdvanceState(ticket, 'EN_CAMINO')
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isUpdating ? 'Actualizando…' : 'Marcar En Camino'}
                            </button>
                          )}

                          {ticket.estado === 'EN_CAMINO' && (
                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={() =>
                                void handleAdvanceState(ticket, 'EN_PROGRESO')
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isUpdating ? 'Actualizando…' : 'Iniciar Trabajo'}
                            </button>
                          )}

                          {ticket.estado === 'EN_PROGRESO' && (
                            <button
                              type="button"
                              onClick={() => openFinishModal(ticket)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400"
                            >
                              Finalizar Trabajo
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
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )}

        {/* Pestaña 3: Mis Especialidades */}
        {activeTab === 'MIS_ESPECIALIDADES' && (
          <section aria-label="Mis Especialidades">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Mis Especialidades
                </h2>
                <p className="text-xs text-slate-400">
                  Seleccioná los oficios que realizás. Solo verás y podrás
                  aceptar solicitudes de estos servicios en la Bolsa de Trabajo.
                </p>
              </div>

              {services.length > 0 && !servicesLoading && !myServicesLoading && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={savingSpecialties}
                    onClick={handleSelectAllSpecialties}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:text-white disabled:opacity-60"
                  >
                    Seleccionar todos
                  </button>
                  <button
                    type="button"
                    disabled={savingSpecialties}
                    onClick={handleClearSpecialties}
                    className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:border-slate-700 hover:text-slate-200 disabled:opacity-60"
                  >
                    Limpiar selección
                  </button>
                </div>
              )}
            </div>

            {specialtiesFeedback && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                <span>{specialtiesFeedback}</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveTab('BOLSA')}
                    className="text-xs font-semibold text-emerald-200 underline hover:text-white"
                  >
                    Ver Bolsa de Trabajo
                  </button>
                  <button
                    type="button"
                    onClick={() => setSpecialtiesFeedback(null)}
                    aria-label="Cerrar confirmación"
                    className="text-xs text-emerald-200 hover:text-white"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            {specialtiesError && (
              <div
                role="alert"
                className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300"
              >
                <span>{specialtiesError}</span>
                <button
                  type="button"
                  onClick={() => setSpecialtiesError(null)}
                  aria-label="Cerrar error de especialidades"
                  className="shrink-0 text-xs text-rose-200 hover:text-white"
                >
                  ✕
                </button>
              </div>
            )}

            {(servicesError || myServicesError) && (
              <div
                role="alert"
                className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300"
              >
                <span>{servicesError ?? myServicesError}</span>
                <button
                  type="button"
                  onClick={() => void loadSpecialtiesAndCatalog()}
                  className="shrink-0 text-xs font-semibold text-rose-200 underline hover:text-white"
                >
                  Reintentar
                </button>
              </div>
            )}

            {servicesLoading || myServicesLoading ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[1, 2, 3, 4].map((item) => (
                  <div
                    key={item}
                    className="h-28 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/50"
                  />
                ))}
              </div>
            ) : services.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 px-6 py-12 text-center">
                <p className="text-base font-medium text-slate-200">
                  No hay servicios cargados en el catálogo todavía
                </p>
                <p className="mt-1.5 text-sm text-slate-400">
                  Cuando el catálogo tenga servicios disponibles, podrás
                  seleccionarlos aquí.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSaveSpecialties} className="space-y-5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {services.map((service) => {
                    const checked = selectedServiceSet.has(service.id)
                    return (
                      <label
                        key={service.id}
                        className={`flex cursor-pointer items-start gap-3.5 rounded-2xl border p-4 transition ${
                          checked
                            ? 'border-emerald-500/60 bg-emerald-500/10 ring-1 ring-emerald-500/20'
                            : 'border-slate-800 bg-slate-900/70 hover:border-slate-700'
                        } ${savingSpecialties ? 'cursor-not-allowed opacity-60' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={savingSpecialties}
                          onChange={() => handleToggleSpecialty(service.id)}
                          className="mt-1 h-4 w-4 shrink-0 rounded border-slate-600 bg-slate-950 text-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-white">
                              {service.nombre}
                            </span>
                            <span className="rounded-full border border-slate-700 bg-slate-950/80 px-2.5 py-0.5 text-xs font-medium text-slate-300">
                              Base: {formatCurrency(service.tarifa_base)}
                            </span>
                          </div>
                          {service.descripcion && (
                            <p className="mt-1.5 text-xs text-slate-400">
                              {service.descripcion}
                            </p>
                          )}
                        </div>
                      </label>
                    )
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span>
                      <strong className="text-slate-200">
                        {selectedServiceIds.length}
                      </strong>{' '}
                      de {services.length}{' '}
                      {services.length === 1
                        ? 'oficio seleccionado'
                        : 'oficios seleccionados'}
                    </span>
                    {hasUnsavedSpecialtyChanges && (
                      <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 font-medium text-amber-300">
                        Cambios sin guardar
                      </span>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={savingSpecialties}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingSpecialties && (
                      <span
                        aria-hidden
                        className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-950/40 border-t-slate-950"
                      />
                    )}
                    {savingSpecialties
                      ? 'Guardando…'
                      : 'Guardar especialidades'}
                  </button>
                </div>
              </form>
            )}
          </section>
        )}
      </main>

      {/* Modal de Detalle del Ticket */}
      {detailTicketId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="operario-detail-title"
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
                  Detalle del trabajo
                </p>
                <h3
                  id="operario-detail-title"
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
                Cargando información del trabajo…
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

                {detailTicket.estado === 'FINALIZADO' &&
                  detailTicket.resena && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-300">
                          Calificación del cliente
                        </h4>
                        <span className="text-xs text-slate-400">
                          {formatDate(detailTicket.resena.created_at)}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <StarRating
                          value={detailTicket.resena.puntuacion}
                          size="md"
                        />
                        <span className="text-sm font-semibold text-white">
                          {detailTicket.resena.puntuacion} de 5
                        </span>
                      </div>
                      {detailTicket.resena.comentario ? (
                        <p className="mt-2.5 whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-200">
                          {detailTicket.resena.comentario}
                        </p>
                      ) : (
                        <p className="mt-2 text-xs italic text-slate-500">
                          El cliente no dejó comentario escrito.
                        </p>
                      )}
                    </div>
                  )}

                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-800 pt-4">
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

      {/* Modal de Finalización */}
      {ticketToFinish && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="finish-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onClick={closeFinishModal}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/60"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-800 pb-4">
              <h3
                id="finish-dialog-title"
                className="text-lg font-semibold text-white"
              >
                Finalizar trabajo
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                {servicesMap.get(ticketToFinish.servicio_id)?.nombre ??
                  `Servicio #${ticketToFinish.servicio_id}`}{' '}
                — {ticketToFinish.direccion}
              </p>
            </div>

            {finishError && (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300"
              >
                {finishError}
              </p>
            )}

            <form onSubmit={handleFinishSubmit} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="precio-final"
                  className="mb-1.5 block text-sm font-medium text-slate-300"
                >
                  Precio final (ARS)
                </label>
                <input
                  id="precio-final"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  disabled={finishing}
                  value={precioFinalInput}
                  onChange={(event) => setPrecioFinalInput(event.target.value)}
                  placeholder="Ej. 25000"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-60"
                />
              </div>

              <div>
                <label
                  htmlFor="metodo-pago"
                  className="mb-1.5 block text-sm font-medium text-slate-300"
                >
                  Método de pago
                </label>
                <select
                  id="metodo-pago"
                  required
                  disabled={finishing}
                  value={metodoPagoInput}
                  onChange={(event) =>
                    setMetodoPagoInput(event.target.value as MetodoPago)
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-60"
                >
                  {METODO_PAGO_OPTIONS.map((metodo) => (
                    <option key={metodo} value={metodo}>
                      {METODO_PAGO_LABELS[metodo]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="evidencia-file"
                  className="mb-1.5 block text-sm font-medium text-slate-300"
                >
                  Foto de evidencia{' '}
                  <span className="font-normal text-slate-500">
                    (opcional · JPG, PNG o WEBP, máx. 5 MB)
                  </span>
                </label>
                <input
                  ref={fileInputRef}
                  id="evidencia-file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={finishing}
                  onChange={handleEvidenceFileChange}
                  className="block w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-950 text-xs text-slate-300 file:mr-3 file:cursor-pointer file:rounded-l-lg file:border-0 file:bg-slate-800 file:px-3.5 file:py-2.5 file:text-xs file:font-semibold file:text-emerald-300 hover:file:bg-slate-700 focus:border-emerald-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                />

                {evidenceFile && evidencePreviewUrl && (
                  <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/80 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-medium text-slate-200">
                        {evidenceFile.name}{' '}
                        <span className="text-slate-500">
                          ({formatFileSize(evidenceFile.size)})
                        </span>
                      </span>
                      <button
                        type="button"
                        disabled={finishing}
                        onClick={clearSelectedEvidence}
                        className="shrink-0 font-medium text-rose-300 hover:text-rose-200 disabled:opacity-60"
                      >
                        Quitar
                      </button>
                    </div>
                    <img
                      src={evidencePreviewUrl}
                      alt="Vista previa de evidencia"
                      className="max-h-44 w-full rounded-lg border border-slate-800 object-cover"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 border-t border-slate-800 pt-4">
                <button
                  type="button"
                  disabled={finishing}
                  onClick={closeFinishModal}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-xs font-medium text-slate-200 transition hover:border-slate-500 disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={finishing}
                  className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {finishing && (
                    <span
                      aria-hidden
                      className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-950/40 border-t-slate-950"
                    />
                  )}
                  {finishStep === 'UPLOADING'
                    ? 'Subiendo evidencia…'
                    : finishStep === 'FINISHING'
                      ? 'Finalizando…'
                      : 'Confirmar finalización'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmación de Cancelación */}
      {ticketToCancel && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="operario-cancel-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onClick={closeCancelConfirm}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/60"
            onClick={(event) => event.stopPropagation()}
          >
            <h3
              id="operario-cancel-title"
              className="text-lg font-semibold text-white"
            >
              ¿Cancelar este trabajo?
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

            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label
                  htmlFor="operario-cancel-motivo"
                  className="text-xs font-medium text-slate-300"
                >
                  Motivo de cancelación{' '}
                  <span className="font-normal text-slate-500">(opcional)</span>
                </label>
                <span className="text-xs text-slate-500">
                  {cancelMotivoInput.length}/500
                </span>
              </div>
              <textarea
                id="operario-cancel-motivo"
                rows={2}
                maxLength={500}
                disabled={cancelling}
                value={cancelMotivoInput}
                onChange={(event) => {
                  setCancelMotivoInput(event.target.value)
                  setCancelError(null)
                }}
                placeholder="Ej. No es posible acceder al domicilio…"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/30 disabled:opacity-60"
              />
            </div>

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
                {cancelling ? 'Cancelando…' : 'Sí, cancelar trabajo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
