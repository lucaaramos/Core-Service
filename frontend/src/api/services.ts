import { apiFetch } from './client'
import type {
  MessageResponse,
  Service,
  ServicePayload,
  UpdateMyServicesRequest,
} from '../types/api'

/** GET /services */
export function getServices(): Promise<Service[]> {
  return apiFetch<Service[]>('/services')
}

/** POST /services (ADMIN) */
export function createService(data: ServicePayload): Promise<Service> {
  return apiFetch<Service>('/services', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/** PATCH /services/:id (ADMIN) */
export function updateService(
  id: number,
  data: ServicePayload,
): Promise<Service> {
  return apiFetch<Service>(`/services/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

/** DELETE /services/:id (ADMIN) */
export function deleteService(id: number): Promise<MessageResponse> {
  return apiFetch<MessageResponse>(`/services/${id}`, {
    method: 'DELETE',
  })
}

/** GET /operarios/me/servicios */
export function getMyServices(): Promise<Service[]> {
  return apiFetch<Service[]>('/operarios/me/servicios')
}

/** PUT /operarios/me/servicios */
export function updateMyServices(servicioIds: number[]): Promise<Service[]> {
  const payload: UpdateMyServicesRequest = { servicio_ids: servicioIds }
  return apiFetch<Service[]>('/operarios/me/servicios', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}
