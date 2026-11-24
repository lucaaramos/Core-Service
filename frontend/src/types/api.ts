export type Role = 'CLIENTE' | 'OPERARIO' | 'ADMIN'

export type TicketStatus =
  | 'CREADO'
  | 'ASIGNADO'
  | 'EN_CAMINO'
  | 'EN_PROGRESO'
  | 'FINALIZADO'
  | 'CANCELADO'

export type MetodoPago = 'EFECTIVO' | 'QR' | 'TRANSFERENCIA'

export interface RegisterRequest {
  nombre: string
  email: string
  password: string
  telefono?: string
  rol: 'CLIENTE' | 'OPERARIO'
}

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  token: string
}

export interface RegisterResponse {
  id: string
  nombre: string
  email: string
  rol: Role
}

export interface ErrorResponse {
  error: string
}

export interface Service {
  id: number
  nombre: string
  descripcion: string | null
  tarifa_base: number
  created_at: string
}

export interface Ticket {
  id: string
  cliente_id: string
  operario_id: string | null
  servicio_id: number
  estado: TicketStatus
  direccion: string
  descripcion_problema: string
  precio_final: number | null
  metodo_pago: MetodoPago | null
  evidencia_url: string | null
  created_at: string
  updated_at: string
}

export interface CreateTicketRequest {
  servicio_id: number
  direccion: string
  descripcion_problema: string
}

export type OperarioNextState = 'EN_CAMINO' | 'EN_PROGRESO'

export interface UpdateTicketStateRequest {
  nuevo_estado: OperarioNextState
}

export interface FinishTicketRequest {
  precio_final: number
  metodo_pago: MetodoPago
  evidencia_url?: string
}

export interface EvidenceUploadUrlRequest {
  content_type: string
}

export interface EvidenceUploadUrlResponse {
  upload_url: string
  public_url: string
}

export interface MessageResponse {
  message: string
}

export interface TicketDisponible {
  id: string
  servicio: string
  direccion: string
  descripcion_problema: string
  tarifa_base: number
  created_at: string
}

/** Payload del JWT emitido por el backend. */
export interface JwtPayload {
  user_id: string
  rol: Role
  iat: number
  exp: number
}

/** Usuario autenticado derivado del JWT. */
export interface AuthUser {
  userId: string
  rol: Role
  exp: number
}
