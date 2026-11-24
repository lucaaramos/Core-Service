import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { changePassword, getMe, updateMe } from '../api/users'
import { Navbar } from '../components/Navbar'
import { useAuth } from '../context/AuthContext'
import type { ApprovalStatus, Role, UserProfile } from '../types/api'
import { dashboardPath, roleLabel } from '../utils/auth'
import { formatDate } from '../utils/format'

const ROLE_BADGE_STYLES: Record<Role, string> = {
  CLIENTE: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  OPERARIO: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  ADMIN: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
}

const APPROVAL_BADGE_STYLES: Record<
  ApprovalStatus,
  { label: string; className: string }
> = {
  PENDIENTE: {
    label: 'Pendiente de aprobación',
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  },
  APROBADO: {
    label: 'Aprobado',
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  },
  RECHAZADO: {
    label: 'Rechazado',
    className: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  },
}

export function ProfilePage() {
  const { user } = useAuth()
  const backPath = user ? dashboardPath(user.rol) : '/'

  // Carga de perfil
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Formulario 1: Datos personales
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)

  // Formulario 2: Cambiar contraseña
  const [passwordActual, setPasswordActual] = useState('')
  const [passwordNueva, setPasswordNueva] = useState('')
  const [confirmarPassword, setConfirmarPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  const fetchProfile = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await getMe()
      setProfile(data)
      setNombre(data.nombre)
      setTelefono(data.telefono ?? '')
    } catch (err) {
      setLoadError(
        err instanceof Error
          ? err.message
          : 'No se pudo cargar la información de tu perfil',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    getMe()
      .then((data) => {
        if (!cancelled) {
          setProfile(data)
          setNombre(data.nombre)
          setTelefono(data.telefono ?? '')
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(
            err instanceof Error
              ? err.message
              : 'No se pudo cargar la información de tu perfil',
          )
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setProfileSuccess(null)
    setProfileError(null)

    const trimmedNombre = nombre.trim()
    if (!trimmedNombre) {
      setProfileError('El nombre no puede estar vacío.')
      return
    }

    setSavingProfile(true)
    try {
      const updated = await updateMe({
        nombre: trimmedNombre,
        telefono: telefono.trim(),
      })
      setProfile(updated)
      setNombre(updated.nombre)
      setTelefono(updated.telefono ?? '')
      setProfileSuccess('Datos personales actualizados correctamente.')
    } catch (err) {
      setProfileError(
        err instanceof Error
          ? err.message
          : 'No se pudieron actualizar tus datos personales',
      )
    } finally {
      setSavingProfile(false)
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPasswordSuccess(null)
    setPasswordError(null)

    if (!passwordActual) {
      setPasswordError('Ingresá tu contraseña actual.')
      return
    }

    if (passwordNueva.length < 6) {
      setPasswordError('La nueva contraseña debe tener al menos 6 caracteres.')
      return
    }

    if (passwordNueva !== confirmarPassword) {
      setPasswordError('La confirmación no coincide con la nueva contraseña.')
      return
    }

    setSavingPassword(true)
    try {
      const res = await changePassword({
        password_actual: passwordActual,
        password_nueva: passwordNueva,
      })
      setPasswordActual('')
      setPasswordNueva('')
      setConfirmarPassword('')
      setPasswordSuccess(
        res.message || 'Contraseña actualizada correctamente.',
      )
    } catch (err) {
      setPasswordError(
        err instanceof Error
          ? err.message
          : 'No se pudo actualizar la contraseña',
      )
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Navbar />

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Mi Perfil
            </h1>
            <p className="mt-1.5 text-sm text-slate-400">
              Consultá tu cuenta, actualizá tus datos de contacto o cambiá tu
              contraseña.
            </p>
          </div>

          <Link
            to={backPath}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:border-emerald-500/60 hover:text-emerald-300 sm:text-sm"
          >
            <span aria-hidden>←</span>
            <span>Volver al panel</span>
          </Link>
        </div>

        <div className="space-y-6">
          {/* Tarjeta 1: Datos personales */}
          <section
            aria-labelledby="personal-data-heading"
            className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-black/25"
          >
            <div className="border-b border-slate-800 pb-4">
              <h2
                id="personal-data-heading"
                className="text-lg font-semibold text-white"
              >
                Datos personales
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Tu correo electrónico, rol y fecha de alta son administrados por
                la plataforma.
              </p>
            </div>

            {loading ? (
              <div className="mt-5 space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {[1, 2, 3].map((item) => (
                    <div
                      key={item}
                      className="h-16 animate-pulse rounded-xl border border-slate-800 bg-slate-950/60"
                    />
                  ))}
                </div>
                <div className="h-24 animate-pulse rounded-xl border border-slate-800 bg-slate-950/60" />
              </div>
            ) : loadError ? (
              <div
                role="alert"
                className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300"
              >
                <span>{loadError}</span>
                <button
                  type="button"
                  onClick={() => void fetchProfile()}
                  className="shrink-0 text-xs font-semibold text-rose-200 underline hover:text-white"
                >
                  Reintentar
                </button>
              </div>
            ) : profile ? (
              <>
                {/* Campos de solo lectura */}
                <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Email
                    </dt>
                    <dd className="mt-1 truncate text-sm font-medium text-slate-200">
                      {profile.email}
                    </dd>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Rol en plataforma
                    </dt>
                    <dd className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ROLE_BADGE_STYLES[profile.rol]}`}
                      >
                        {roleLabel(profile.rol)}
                      </span>
                      {profile.rol === 'OPERARIO' && (
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${APPROVAL_BADGE_STYLES[profile.estado_aprobacion].className}`}
                        >
                          {APPROVAL_BADGE_STYLES[profile.estado_aprobacion].label}
                        </span>
                      )}
                    </dd>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Fecha de alta
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-slate-200">
                      {formatDate(profile.created_at)}
                    </dd>
                  </div>
                </dl>

                {profileSuccess && (
                  <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                    <span>{profileSuccess}</span>
                    <button
                      type="button"
                      onClick={() => setProfileSuccess(null)}
                      aria-label="Cerrar confirmación"
                      className="shrink-0 text-xs text-emerald-200 hover:text-white"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {profileError && (
                  <div
                    role="alert"
                    className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300"
                  >
                    <span>{profileError}</span>
                    <button
                      type="button"
                      onClick={() => setProfileError(null)}
                      aria-label="Cerrar error"
                      className="shrink-0 text-xs text-rose-200 hover:text-white"
                    >
                      ✕
                    </button>
                  </div>
                )}

                <form onSubmit={handleProfileSubmit} className="mt-5 space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="profile-nombre"
                        className="mb-1.5 block text-sm font-medium text-slate-300"
                      >
                        Nombre completo
                      </label>
                      <input
                        id="profile-nombre"
                        type="text"
                        required
                        maxLength={150}
                        disabled={savingProfile}
                        value={nombre}
                        onChange={(event) => {
                          setNombre(event.target.value)
                          setProfileSuccess(null)
                          setProfileError(null)
                        }}
                        placeholder="Tu nombre y apellido"
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-60"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="profile-telefono"
                        className="mb-1.5 block text-sm font-medium text-slate-300"
                      >
                        Teléfono{' '}
                        <span className="font-normal text-slate-500">
                          (opcional)
                        </span>
                      </label>
                      <input
                        id="profile-telefono"
                        type="tel"
                        maxLength={50}
                        disabled={savingProfile}
                        value={telefono}
                        onChange={(event) => {
                          setTelefono(event.target.value)
                          setProfileSuccess(null)
                          setProfileError(null)
                        }}
                        placeholder="Ej. +54 11 5555-1234"
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-60"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end border-t border-slate-800 pt-4">
                    <button
                      type="submit"
                      disabled={savingProfile}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
                    >
                      {savingProfile && (
                        <span
                          aria-hidden
                          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-950/40 border-t-slate-950"
                        />
                      )}
                      {savingProfile ? 'Guardando…' : 'Guardar cambios'}
                    </button>
                  </div>
                </form>
              </>
            ) : null}
          </section>

          {/* Tarjeta 2: Cambiar contraseña */}
          <section
            aria-labelledby="change-password-heading"
            className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-black/25"
          >
            <div className="border-b border-slate-800 pb-4">
              <h2
                id="change-password-heading"
                className="text-lg font-semibold text-white"
              >
                Cambiar contraseña
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Ingresá tu contraseña actual y elegí una nueva clave de al menos
                6 caracteres.
              </p>
            </div>

            {passwordSuccess && (
              <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                <span>{passwordSuccess}</span>
                <button
                  type="button"
                  onClick={() => setPasswordSuccess(null)}
                  aria-label="Cerrar confirmación de contraseña"
                  className="shrink-0 text-xs text-emerald-200 hover:text-white"
                >
                  ✕
                </button>
              </div>
            )}

            {passwordError && (
              <div
                role="alert"
                className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300"
              >
                <span>{passwordError}</span>
                <button
                  type="button"
                  onClick={() => setPasswordError(null)}
                  aria-label="Cerrar error de contraseña"
                  className="shrink-0 text-xs text-rose-200 hover:text-white"
                >
                  ✕
                </button>
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="password-actual"
                  className="mb-1.5 block text-sm font-medium text-slate-300"
                >
                  Contraseña actual
                </label>
                <input
                  id="password-actual"
                  type="password"
                  required
                  autoComplete="current-password"
                  disabled={savingPassword}
                  value={passwordActual}
                  onChange={(event) => {
                    setPasswordActual(event.target.value)
                    setPasswordSuccess(null)
                    setPasswordError(null)
                  }}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-60"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="password-nueva"
                    className="mb-1.5 block text-sm font-medium text-slate-300"
                  >
                    Nueva contraseña
                  </label>
                  <input
                    id="password-nueva"
                    type="password"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    disabled={savingPassword}
                    value={passwordNueva}
                    onChange={(event) => {
                      setPasswordNueva(event.target.value)
                      setPasswordSuccess(null)
                      setPasswordError(null)
                    }}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label
                    htmlFor="confirmar-password"
                    className="mb-1.5 block text-sm font-medium text-slate-300"
                  >
                    Confirmar nueva contraseña
                  </label>
                  <input
                    id="confirmar-password"
                    type="password"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    disabled={savingPassword}
                    value={confirmarPassword}
                    onChange={(event) => {
                      setConfirmarPassword(event.target.value)
                      setPasswordSuccess(null)
                      setPasswordError(null)
                    }}
                    placeholder="Repetí la nueva contraseña"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="flex justify-end border-t border-slate-800 pt-4">
                <button
                  type="submit"
                  disabled={savingPassword}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
                >
                  {savingPassword && (
                    <span
                      aria-hidden
                      className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-950/40 border-t-slate-950"
                    />
                  )}
                  {savingPassword
                    ? 'Actualizando…'
                    : 'Actualizar contraseña'}
                </button>
              </div>
            </form>
          </section>
        </div>
      </main>
    </div>
  )
}
