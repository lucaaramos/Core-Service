import type { ErrorResponse } from '../types/api'

export const TOKEN_KEY = 'core_service_token'

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const API_URL =
  import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? 'http://localhost:8080/api/v1'

const AUTH_ENDPOINTS = ['/auth/login', '/auth/register']

/**
 * Wrapper de fetch para la API del Core-Service.
 * - Inyecta Content-Type y Authorization automáticamente.
 * - Ante un 401 de sesión expirada limpia la sesión y redirige a /login,
 *   respetando los 401 de credenciales inválidas (login o password_actual en /users/me/password).
 * - Si la respuesta no es ok, lanza un ApiError con el mensaje real del backend.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY)

  const headers = new Headers(options.headers)
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  })

  if (response.status === 204) {
    return undefined as T
  }

  const body = await response.json().catch(() => null)
  const serverError = (body as ErrorResponse | null)?.error

  const isAuthEndpoint = AUTH_ENDPOINTS.some((endpoint) =>
    path.startsWith(endpoint),
  )

  // En PATCH /users/me/password un 401 por contraseña actual incorrecta no implica sesión expirada.
  const isPasswordCheckFailure =
    path === '/users/me/password' &&
    typeof serverError === 'string' &&
    !serverError.startsWith('token') &&
    !serverError.startsWith('claim')

  if (response.status === 401 && !isAuthEndpoint && !isPasswordCheckFailure) {
    localStorage.removeItem(TOKEN_KEY)
    if (window.location.pathname !== '/login') {
      window.location.assign('/login')
    }
    throw new ApiError('Tu sesión expiró. Iniciá sesión nuevamente.', 401)
  }

  if (!response.ok) {
    const message =
      serverError ?? `Error ${response.status}: no se pudo completar la operación`
    throw new ApiError(message, response.status)
  }

  return body as T
}
