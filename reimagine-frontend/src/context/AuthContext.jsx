import React, { createContext, useContext, useMemo, useState } from 'react'

const AuthContext = createContext(null)

/** Hard-coded demo users (front-end only!) */
const USERS = [
  { email: 'admin@example.com', password: 'admin123', role: 'admin', name: 'Admin' },
  { email: 'user@example.com', password: 'user123', role: 'user', name: 'Jane User' }
]

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('ab-auth')
    return raw ? JSON.parse(raw) : null
  })

  const login = (email, password) => {
    const match = USERS.find(u => u.email === email && u.password === password)
    if (!match) throw new Error('Invalid credentials')
    const payload = { email: match.email, role: match.role, name: match.name }
    localStorage.setItem('ab-auth', JSON.stringify(payload))
    setUser(payload)
    return payload
  }

  const logout = () => {
    localStorage.removeItem('ab-auth')
    setUser(null)
  }

  const value = useMemo(() => ({ user, login, logout }), [user])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
