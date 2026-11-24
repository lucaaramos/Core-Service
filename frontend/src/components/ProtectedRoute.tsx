import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { Role } from '../types/api'
import { dashboardPath } from '../utils/auth'
import type { ReactNode } from 'react'

interface ProtectedRouteProps {
  children: ReactNode
  roles?: Role[]
}

/**
 * Protege una ruta:
 * - sin sesión → /login
 * - rol no permitido → dashboard del rol del usuario
 */
export function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
  const { isAuthenticated, user } = useAuth()

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />
  }

  if (roles && !roles.includes(user.rol)) {
    return <Navigate to={dashboardPath(user.rol)} replace />
  }

  return <>{children}</>
}
