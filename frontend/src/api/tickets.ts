import { apiFetch } from './client'
import type {
  CreateTicketRequest,
  MessageResponse,
  Ticket,
  TicketStatus,
} from '../types/api'

/** GET /tickets (con filtro opcional ?estado=...) */
export function getTickets(estado?: TicketStatus): Promise<Ticket[]> {
  const query = estado ? `?estado=${encodeURIComponent(estado)}` : ''
  return apiFetch<Ticket[]>(`/tickets${query}`)
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

/** PATCH /tickets/:id/cancelar */
export function cancelTicket(id: string): Promise<MessageResponse> {
  return apiFetch<MessageResponse>(`/tickets/${encodeURIComponent(id)}/cancelar`, {
    method: 'PATCH',
  })
}
