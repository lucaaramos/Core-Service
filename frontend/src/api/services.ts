import { apiFetch } from './client'
import type { Service, UpdateMyServicesRequest } from '../types/api'

/** GET /services */
export function getServices(): Promise<Service[]> {
  return apiFetch<Service[]>('/services')
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
