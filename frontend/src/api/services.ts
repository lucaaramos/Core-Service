import { apiFetch } from './client'
import type { Service } from '../types/api'

/** GET /services */
export function getServices(): Promise<Service[]> {
  return apiFetch<Service[]>('/services')
}
