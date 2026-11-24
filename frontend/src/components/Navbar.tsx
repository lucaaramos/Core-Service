import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { Role } from '../types/api'
import { dashboardPath, roleLabel } from '../utils/auth'

const ROLE_BADGE_STYLES: Record<Role, string> = {
  CLIENTE: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  OPERARIO: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  ADMIN: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
}

export function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isProfileActive = location.pathname === '/perfil'

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
        <Link
          to={user ? dashboardPath(user.rol) : '/'}
          className="flex items-center gap-3 transition hover:opacity-90"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-sm font-bold text-emerald-400 ring-1 ring-emerald-500/30">
            CS
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight text-white">
              Core-Service
            </p>
            <p className="text-xs text-slate-400">Plataforma de Oficios</p>
          </div>
        </Link>

        <div className="flex items-center gap-2.5 sm:gap-3">
          {user && (
            <>
              <span
                className={`hidden items-center rounded-full border px-3 py-1 text-xs font-semibold sm:inline-flex ${ROLE_BADGE_STYLES[user.rol]}`}
              >
                {roleLabel(user.rol)}
              </span>

              <Link
                to="/perfil"
                className={`rounded-lg border px-3.5 py-2 text-xs font-medium transition sm:text-sm ${
                  isProfileActive
                    ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
                    : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-emerald-500/50 hover:text-emerald-300'
                }`}
              >
                Mi Perfil
              </Link>
            </>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-200 transition hover:border-rose-500/50 hover:text-rose-300 sm:text-sm"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </header>
  )
}
