import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { dashboardPath } from '../utils/auth'

/** Redirige a /login o al dashboard correspondiente al rol autenticado. */
export function RoleRedirect() {
  const { user, isAuthenticated } = useAuth()

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />
  }

  return <Navigate to={dashboardPath(user.rol)} replace />
}
