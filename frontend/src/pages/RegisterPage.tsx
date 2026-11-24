import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { RegisterRequest } from '../types/api'

type PublicRole = RegisterRequest['rol']

const ROLE_OPTIONS: Array<{
  value: PublicRole
  title: string
  description: string
}> = [
  {
    value: 'CLIENTE',
    title: 'Cliente',
    description: 'Solicitá servicios de oficios.',
  },
  {
    value: 'OPERARIO',
    title: 'Operario',
    description: 'Tomá trabajos y gestioná servicios.',
  },
]

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()

  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [telefono, setTelefono] = useState('')
  const [rol, setRol] = useState<PublicRole>('CLIENTE')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    try {
      await register({
        nombre,
        email,
        password,
        ...(telefono.trim() ? { telefono: telefono.trim() } : {}),
        rol,
      })
      navigate('/', { replace: true })
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo completar el registro',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400 ring-1 ring-emerald-500/30">
            Core-Service · MVP
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-white">
            Crear cuenta
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Sumate a la plataforma de oficios.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-black/30 sm:p-8"
        >
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300"
            >
              {error}
            </p>
          )}

          <div>
            <label
              htmlFor="nombre"
              className="mb-1.5 block text-sm font-medium text-slate-300"
            >
              Nombre completo
            </label>
            <input
              id="nombre"
              type="text"
              autoComplete="name"
              required
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
              placeholder="Juan Pérez"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-sm font-medium text-slate-300"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="juan.perez@example.com"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-medium text-slate-300"
            >
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>

          <div>
            <label
              htmlFor="telefono"
              className="mb-1.5 block text-sm font-medium text-slate-300"
            >
              Teléfono{' '}
              <span className="font-normal text-slate-500">(opcional)</span>
            </label>
            <input
              id="telefono"
              type="tel"
              autoComplete="tel"
              value={telefono}
              onChange={(event) => setTelefono(event.target.value)}
              placeholder="+54 11 5555-1234"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-300">
              ¿Cómo vas a usar la plataforma?
            </legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {ROLE_OPTIONS.map((option) => {
                const selected = rol === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setRol(option.value)}
                    className={`rounded-xl border px-4 py-3 text-left transition ${
                      selected
                        ? 'border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/30'
                        : 'border-slate-700 bg-slate-950 hover:border-slate-600'
                    }`}
                  >
                    <span className="block text-sm font-semibold text-white">
                      {option.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-400">
                      {option.description}
                    </span>
                  </button>
                )
              })}
            </div>
          </fieldset>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading && (
              <span
                aria-hidden
                className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950/40 border-t-slate-950"
              />
            )}
            {loading ? 'Creando cuenta…' : 'Crear cuenta'}
          </button>

          <p className="text-center text-sm text-slate-400">
            ¿Ya tenés cuenta?{' '}
            <Link
              to="/login"
              className="font-medium text-emerald-400 hover:text-emerald-300"
            >
              Iniciar sesión
            </Link>
          </p>
        </form>
      </div>
    </main>
  )
}
