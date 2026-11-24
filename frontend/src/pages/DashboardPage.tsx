import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { Role } from '../types/api'
import { roleLabel } from '../utils/auth'

interface DashboardPageProps {
  expectedRole: Role
}

const ACCENT_BY_ROLE: Record<Role, string> = {
  CLIENTE: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  OPERARIO: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  ADMIN: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
}

const DESCRIPTION_BY_ROLE: Record<Role, string> = {
  CLIENTE: 'Desde acá vas a poder solicitar servicios y seguir tus tickets.',
  OPERARIO: 'Desde acá vas a poder ver la bolsa de trabajo y gestionar tus servicios.',
  ADMIN: 'Desde acá vas a poder supervisar tickets, usuarios y operarios.',
}

/**
 * Dashboard placeholder por rol. Muestra el rol y el user_id del JWT,
 * y permite cerrar sesión.
 */
export function DashboardPage({ expectedRole }: DashboardPageProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  if (!user) return null

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-500">
              Core-Service · MVP
            </p>
            <h1 className="mt-1 text-2xl font-bold text-white">
              Panel de {roleLabel(expectedRole)}
            </h1>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-rose-500/50 hover:text-rose-300"
          >
            Cerrar sesión
          </button>
        </header>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-black/30">
          <span
            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${ACCENT_BY_ROLE[user.rol]}`}
          >
            Rol: {user.rol}
          </span>

          <p className="mt-4 text-sm text-slate-400">
            {DESCRIPTION_BY_ROLE[user.rol]}
          </p>

          <dl className="mt-6 space-y-3 border-t border-slate-800 pt-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-slate-500">user_id</dt>
              <dd className="font-mono text-slate-200">{user.userId}</dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-slate-500">Sesión expira</dt>
              <dd className="text-slate-200">
                {new Date(user.exp * 1000).toLocaleString()}
              </dd>
            </div>
          </dl>

          <div className="mt-6 rounded-xl border border-dashed border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-500">
            Placeholder del dashboard. La funcionalidad completa (tickets,
            servicios, asignaciones) se conectará en las próximas iteraciones.
          </div>
        </section>
      </div>
    </main>
  )
}
