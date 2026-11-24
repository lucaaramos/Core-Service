import { apiFetch } from './client'
import type {
  ApprovalStatus,
  ChangePasswordRequest,
  MessageResponse,
  OperarioAdminItem,
  UpdateOperarioApprovalRequest,
  UpdateProfileRequest,
  UserProfile,
} from '../types/api'

/** GET /users/me */
export function getMe(): Promise<UserProfile> {
  return apiFetch<UserProfile>('/users/me')
}

/** PATCH /users/me */
export function updateMe(data: UpdateProfileRequest): Promise<UserProfile> {
  return apiFetch<UserProfile>('/users/me', {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

/** PATCH /users/me/password */
export function changePassword(
  data: ChangePasswordRequest,
): Promise<MessageResponse> {
  return apiFetch<MessageResponse>('/users/me/password', {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

/** GET /admin/operarios (con filtro opcional ?estado=PENDIENTE|APROBADO|RECHAZADO) */
export function getAdminOperarios(
  estado?: ApprovalStatus,
): Promise<OperarioAdminItem[]> {
  const query = estado ? `?estado=${encodeURIComponent(estado)}` : ''
  return apiFetch<OperarioAdminItem[]>(`/admin/operarios${query}`)
}

/** PATCH /admin/operarios/:id/aprobacion */
export function updateOperarioApproval(
  id: string,
  estado: 'APROBADO' | 'RECHAZADO',
): Promise<OperarioAdminItem> {
  const payload: UpdateOperarioApprovalRequest = { estado_aprobacion: estado }
  return apiFetch<OperarioAdminItem>(
    `/admin/operarios/${encodeURIComponent(id)}/aprobacion`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  )
}
