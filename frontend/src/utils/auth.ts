import type { AuthUser, JwtPayload, Role } from '../types/api'

const DASHBOARD_BY_ROLE: Record<Role, string> = {
  CLIENTE: '/cliente',
  OPERARIO: '/operario',
  ADMIN: '/admin',
}

/** Dashboard correspondiente a cada rol. */
export function dashboardPath(rol: Role): string {
  return DASHBOARD_BY_ROLE[rol] ?? '/login'
}

/** Etiqueta legible del rol para la UI. */
export function roleLabel(rol: Role): string {
  switch (rol) {
    case 'CLIENTE':
      return 'Cliente'
    case 'OPERARIO':
      return 'Operario'
    case 'ADMIN':
      return 'Administrador'
    default:
      return rol
  }
}

/**
 * Decodifica el payload de un JWT (base64url) sin validar la firma.
 * La firma la valida siempre el backend; acá solo leemos los claims para la UI.
 */
export function decodeJwt(token: string): JwtPayload | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      '=',
    )
    const json = decodeURIComponent(
      atob(padded)
        .split('')
        .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join(''),
    )

    const parsed = JSON.parse(json) as Partial<JwtPayload>
    if (!parsed.user_id || !parsed.rol || !parsed.exp) return null

    return parsed as JwtPayload
  } catch {
    return null
  }
}

/** Convierte el payload del JWT en el usuario de la app, o null si está expirado. */
export function userFromToken(token: string): AuthUser | null {
  const payload = decodeJwt(token)
  if (!payload) return null

  if (payload.exp * 1000 <= Date.now()) return null

  return {
    userId: payload.user_id,
    rol: payload.rol,
    exp: payload.exp,
  }
}
