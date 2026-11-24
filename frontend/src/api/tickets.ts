import { apiFetch } from './client'
import type {
  CancelTicketRequest,
  CreateReviewRequest,
  CreateTicketRequest,
  EvidenceUploadUrlRequest,
  EvidenceUploadUrlResponse,
  FinishTicketRequest,
  MessageResponse,
  OperarioNextState,
  OperarioRating,
  Ticket,
  TicketDisponible,
  TicketHistoryEntry,
  TicketReview,
  TicketStatus,
  UpdateTicketStateRequest,
} from '../types/api'

/** GET /tickets (con filtro opcional ?estado=...) */
export function getTickets(estado?: TicketStatus): Promise<Ticket[]> {
  const query = estado ? `?estado=${encodeURIComponent(estado)}` : ''
  return apiFetch<Ticket[]>(`/tickets${query}`)
}

/** GET /tickets/disponibles */
export function getAvailableTickets(): Promise<TicketDisponible[]> {
  return apiFetch<TicketDisponible[]>('/tickets/disponibles')
}

/** GET /tickets/:id */
export function getTicketById(id: string): Promise<Ticket> {
  return apiFetch<Ticket>(`/tickets/${encodeURIComponent(id)}`)
}

/** GET /tickets/:id/historial (ADMIN) */
export function getTicketHistory(
  ticketId: string,
): Promise<TicketHistoryEntry[]> {
  return apiFetch<TicketHistoryEntry[]>(
    `/tickets/${encodeURIComponent(ticketId)}/historial`,
  )
}

/** POST /tickets */
export function createTicket(data: CreateTicketRequest): Promise<Ticket> {
  return apiFetch<Ticket>('/tickets', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/** PATCH /tickets/:id/asignar */
export function assignTicket(id: string): Promise<MessageResponse> {
  return apiFetch<MessageResponse>(
    `/tickets/${encodeURIComponent(id)}/asignar`,
    {
      method: 'PATCH',
    },
  )
}

/** PATCH /tickets/:id/estado */
export function updateTicketState(
  id: string,
  nuevo_estado: OperarioNextState,
): Promise<MessageResponse> {
  const payload: UpdateTicketStateRequest = { nuevo_estado }
  return apiFetch<MessageResponse>(`/tickets/${encodeURIComponent(id)}/estado`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

/** POST /tickets/:id/evidencia/upload-url */
export function requestEvidenceUploadUrl(
  ticketId: string,
  contentType: string,
): Promise<EvidenceUploadUrlResponse> {
  const payload: EvidenceUploadUrlRequest = { content_type: contentType }
  return apiFetch<EvidenceUploadUrlResponse>(
    `/tickets/${encodeURIComponent(ticketId)}/evidencia/upload-url`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  )
}

/** Sube un archivo directamente a la Presigned PUT URL de S3 (sin Authorization). */
export async function uploadFileToPresignedUrl(
  uploadUrl: string,
  file: File,
): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type,
    },
    body: file,
  })

  if (!response.ok) {
    throw new Error(
      `No se pudo subir la imagen de evidencia (HTTP ${response.status})`,
    )
  }
}

/** POST /tickets/:id/finalizar */
export function finishTicket(
  id: string,
  data: FinishTicketRequest,
): Promise<MessageResponse> {
  return apiFetch<MessageResponse>(
    `/tickets/${encodeURIComponent(id)}/finalizar`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  )
}

/** PATCH /tickets/:id/cancelar */
export function cancelTicket(
  id: string,
  motivo?: string,
): Promise<MessageResponse> {
  const trimmed = motivo?.trim()
  const payload: CancelTicketRequest | undefined = trimmed
    ? { motivo: trimmed }
    : undefined

  return apiFetch<MessageResponse>(
    `/tickets/${encodeURIComponent(id)}/cancelar`,
    {
      method: 'PATCH',
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    },
  )
}

/** POST /tickets/:id/calificar (CLIENTE) */
export function rateTicket(
  ticketId: string,
  data: CreateReviewRequest,
): Promise<TicketReview> {
  return apiFetch<TicketReview>(
    `/tickets/${encodeURIComponent(ticketId)}/calificar`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  )
}

/** GET /operarios/me/rating (OPERARIO) */
export function getMyRating(): Promise<OperarioRating> {
  return apiFetch<OperarioRating>('/operarios/me/rating')
}
