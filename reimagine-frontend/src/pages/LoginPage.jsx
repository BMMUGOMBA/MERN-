import React, { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function LoginPage() {
  const { user, login } = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState('user@example.com')
  const [password, setPassword] = useState('user123')
  const [err, setErr] = useState('')

  if (user) return <Navigate to="/" replace />

  const submit = (e) => {
    e.preventDefault()
    setErr('')
    try {
      const u = login(email.trim(), password)
      nav(u.role === 'admin' ? '/admin' : '/request')
    } catch (e) { setErr(e.message) }
  }

  return (
    <div className="container">
      <div className="card" style={{maxWidth:480, margin:'40px auto'}}>
        <h2>Welcome back 👋</h2>
        <p style={{color:'#9ca3af'}}>Try <b>user@example.com / user123</b> or <b>admin@example.com / admin123</b></p>
        <form onSubmit={submit} className="grid">
          <div>
            <label>Email</label>
            <input className="input" value={email} onChange={e=>setEmail(e.target.value)} type="email" required/>
          </div>
          <div>
            <label>Password</label>
            <input className="input" value={password} onChange={e=>setPassword(e.target.value)} type="password" required/>
          </div>
          {err && <div className="error">{err}</div>}
          <button type="submit">Login</button>
        </form>
      </div>
    </div>
  )
}
