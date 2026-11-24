import { apiFetch } from './client'
import type {
  ChangePasswordRequest,
  MessageResponse,
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
