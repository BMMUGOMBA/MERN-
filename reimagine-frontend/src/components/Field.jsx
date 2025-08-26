import React from 'react'

export const Field = ({ label, error, children, description }) => (
  <div>
    <label>{label}</label>
    {description && <div style={{fontSize:12, color:'#9ca3af', marginBottom:6}}>{description}</div>}
    {children}
    {error && <div className="error">{error.message}</div>}
  </div>
)
