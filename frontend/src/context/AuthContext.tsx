import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import * as authApi from '../api/auth'
import { TOKEN_KEY } from '../api/client'
import type { AuthUser, RegisterRequest } from '../types/api'
import { userFromToken } from '../utils/auth'

interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  register: (data: RegisterRequest) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function readStoredToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY)
  if (!token) return null

  const user = userFromToken(token)
  if (!user) {
    localStorage.removeItem(TOKEN_KEY)
    return null
  }

  return token
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => readStoredToken())

  const user = useMemo<AuthUser | null>(
    () => (token ? userFromToken(token) : null),
    [token],
  )

  const persistToken = useCallback((newToken: string) => {
    localStorage.setItem(TOKEN_KEY, newToken)
    setToken(newToken)
  }, [])

  const login = useCallback(
    async (email: string, password: string) => {
      const { token: newToken } = await authApi.login({ email, password })
      persistToken(newToken)
    },
    [persistToken],
  )

  const register = useCallback(
    async (data: RegisterRequest) => {
      await authApi.register(data)
      // Auto-login tras un registro exitoso.
      const { token: newToken } = await authApi.login({
        email: data.email,
        password: data.password,
      })
      persistToken(newToken)
    },
    [persistToken],
  )

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(user && token),
      login,
      register,
      logout,
    }),
    [user, token, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  }
  return context
}
