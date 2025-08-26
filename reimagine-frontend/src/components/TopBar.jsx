import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function TopBar() {
  const { user, logout } = useAuth()
  const nav = useNavigate()
  return (
    <div className="container" style={{paddingBottom:0}}>
      <div className="toolbar">
        <div className="header">
          <div className="logo">🏦 Automation Benefits</div>
          <span className="badge">Front-end demo</span>
        </div>
        <div style={{display:'flex', gap:10, alignItems:'center'}}>
          <Link to="/" className="badge">Home</Link>
          {user?.role === 'user' && <Link to="/request" className="badge">New Request</Link>}
          {user?.role === 'admin' && <Link to="/admin" className="badge">Admin</Link>}
          {user
            ? (<>
                <span className="badge">Signed in: {user.name} ({user.role})</span>
                <button className="ghost" onClick={()=>{logout(); nav('/login')}}>Logout</button>
               </>)
            : <Link to="/login"><button className="ghost">Login</button></Link>}
        </div>
      </div>
    </div>
  )
}
