import { createContext, useContext, useEffect, useState } from 'react'
import api from '../services/api'

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [mfaRequired, setMfaRequired] = useState(false)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true);
  const [authCheckError, setAuthCheckError] = useState('')
  const [googleEnabled, setGoogleEnabled] = useState(false)
  const login = async (credentials) => { setLoading(true); try { const { data } = await api.post('/auth/login', credentials); setUser(data.user); setMfaRequired(Boolean(data.mfaRequired)); return { ...data.user, mfaRequired: Boolean(data.mfaRequired) } } finally { setLoading(false) } }
  const signup = async (details) => { setLoading(true); try { const { data } = await api.post('/auth/register', details); setUser(data.user); setMfaRequired(Boolean(data.mfaRequired)); return { ...data.user, mfaRequired: Boolean(data.mfaRequired) } } finally { setLoading(false) } }
  const logout = async () => { await api.post('/auth/logout'); setUser(null); setMfaRequired(false) }
  const linkGoogle = async () => { const { data } = await api.post('/v1/auth/google/link'); setUser(data.user); setMfaRequired(Boolean(data.mfaRequired)); return { ...data.user, mfaRequired: Boolean(data.mfaRequired) } }
  const startGoogleLogin = () => { window.location.assign(`${api.defaults.baseURL}/v1/auth/google`) }
  const checkAuth = async () => {
    setLoading(true)
    setAuthCheckError('')
    const [meResult, googleResult] = await Promise.allSettled([api.get('/auth/session'), api.get('/auth/google/status')])
    if (meResult.status === 'fulfilled') { setUser(meResult.value.data.user); setMfaRequired(Boolean(meResult.value.data.mfaRequired)) }
    else if (meResult.reason?.response?.status === 401) setUser(null)
    else setAuthCheckError('We could not confirm your account right now.')
    if (googleResult.status === 'fulfilled') setGoogleEnabled(Boolean(googleResult.value.data.enabled))
    else setGoogleEnabled(false)
    setLoading(false)
  }
  useEffect(() => { checkAuth() }, [])
  return <AuthContext.Provider value={{ user, mfaRequired, setMfaRequired, setUser, isAuthenticated: Boolean(user), loading, authCheckError, retryAuthCheck: checkAuth, googleEnabled, startGoogleLogin, linkGoogle, login, signup, logout }}>{children}</AuthContext.Provider>
}
export const useAuth = () => useContext(AuthContext);
