import React, { useMemo, useState } from 'react'
import { listProjects, updateProject } from '../services/storage.js'
import { Link, useLocation } from 'react-router-dom'
import StatusPill from '../components/StatusPill.jsx'

export default function AdminDashboard() {
  const [projects, setProjects] = useState(listProjects())
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('All')
  const loc = useLocation()

  const filtered = useMemo(() => {
    return projects.filter(p => {
      const text = `${p.process?.processName} ${p.requesterName} ${p.requesterEmail}`.toLowerCase()
      const okQ = text.includes(q.toLowerCase())
      const okS = status === 'All' ? true : p.status === status
      return okQ && okS
    })
  }, [projects, q, status])

  const quicklySetStatus = (id, s) => {
    updateProject(id, { status: s })
    setProjects(listProjects())
  }

  return (
    <div className="container">
      <div className="card">
        <div className="toolbar">
          <h2>Admin Dashboard</h2>
          <div style={{display:'flex', gap:10}}>
            <input className="input" placeholder="Search projects / requester..." value={q} onChange={e=>setQ(e.target.value)} style={{width:280}}/>
            <select value={status} onChange={e=>setStatus(e.target.value)}>
              <option>All</option><option>Draft</option><option>Submitted</option><option>In Review</option><option>Approved</option>
            </select>
          </div>
        </div>

        {loc.search.includes('created=') && (
          <div className="badge">New request received ✔️</div>
        )}

        <table className="table">
          <thead>
            <tr>
              <th>Process</th>
              <th>Requester</th>
              <th>Business Unit</th>
              <th>Status</th>
              <th>Updated</th>
              <th style={{width:250}}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan="6" style={{color:'#94a3b8'}}>No projects found.</td></tr>
            )}
            {filtered.map(p => (
              <tr key={p.id}>
                <td>
                  <div style={{fontWeight:700}}>{p.process?.processName}</div>
                  <div className="badge">#{p.id.slice(0,8)}</div>
                </td>
                <td>
                  <div>{p.requesterName}</div>
                  <div className="badge">{p.requesterEmail}</div>
                </td>
                <td>{p.process?.businessUnit}</td>
                <td><StatusPill status={p.status}/></td>
                <td>{new Date(p.updatedAt).toLocaleString()}</td>
                <td style={{display:'flex', gap:8}}>
                  <Link to={`/admin/assessment/${p.id}`}><button>Open</button></Link>
                  <button className="ghost" onClick={()=>quicklySetStatus(p.id,'In Review')}>Mark In Review</button>
                  <button className="ghost" onClick={()=>quicklySetStatus(p.id,'Approved')}>Approve</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
