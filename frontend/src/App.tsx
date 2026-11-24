import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { RoleRedirect } from './components/RoleRedirect'
import { AdminDashboardPage } from './pages/AdminDashboardPage'
import { ClienteDashboardPage } from './pages/ClienteDashboardPage'
import { LoginPage } from './pages/LoginPage'
import { OperarioDashboardPage } from './pages/OperarioDashboardPage'
import { ProfilePage } from './pages/ProfilePage'
import { RegisterPage } from './pages/RegisterPage'

export default function App() {
  return (
    <Routes>
      {/* Rutas públicas */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Perfil de usuario (cualquier rol autenticado) */}
      <Route
        path="/perfil"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />

      {/* Dashboards protegidos por rol */}
      <Route
        path="/cliente"
        element={
          <ProtectedRoute roles={['CLIENTE']}>
            <ClienteDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/operario"
        element={
          <ProtectedRoute roles={['OPERARIO']}>
            <OperarioDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute roles={['ADMIN']}>
            <AdminDashboardPage />
          </ProtectedRoute>
        }
      />

      {/* Raíz: redirige según sesión y rol */}
      <Route path="/" element={<RoleRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
