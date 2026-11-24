import { apiFetch } from './client'
import type {
  CreateTicketRequest,
  FinishTicketRequest,
  MessageResponse,
  OperarioNextState,
  Ticket,
  TicketDisponible,
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

/** POST /tickets */
export function createTicket(data: CreateTicketRequest): Promise<Ticket> {
  return apiFetch<Ticket>('/tickets', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/** PATCH /tickets/:id/asignar */
export function assignTicket(id: string): Promise<MessageResponse> {
  return apiFetch<MessageResponse>(`/tickets/${encodeURIComponent(id)}/asignar`, {
    method: 'PATCH',
  })
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

/** POST /tickets/:id/finalizar */
export function finishTicket(
  id: string,
  data: FinishTicketRequest,
): Promise<MessageResponse> {
  return apiFetch<MessageResponse>(`/tickets/${encodeURIComponent(id)}/finalizar`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/** PATCH /tickets/:id/cancelar */
export function cancelTicket(id: string): Promise<MessageResponse> {
  return apiFetch<MessageResponse>(`/tickets/${encodeURIComponent(id)}/cancelar`, {
    method: 'PATCH',
  })
}
