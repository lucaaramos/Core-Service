import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { RoleRedirect } from './components/RoleRedirect'
import { ClienteDashboardPage } from './pages/ClienteDashboardPage'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { OperarioDashboardPage } from './pages/OperarioDashboardPage'
import { RegisterPage } from './pages/RegisterPage'

export default function App() {
  return (
    <Routes>
      {/* Rutas públicas */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

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
            <DashboardPage expectedRole="ADMIN" />
          </ProtectedRoute>
        }
      />

      {/* Raíz: redirige según sesión y rol */}
      <Route path="/" element={<RoleRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
