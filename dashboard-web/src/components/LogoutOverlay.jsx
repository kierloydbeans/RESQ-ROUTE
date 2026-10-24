import React from 'react'
import { LogIn, LogOut } from 'lucide-react'

const LogoutOverlay = ({ active, mode = 'logout' }) => {
  const isLogin = mode === 'login'
  const Icon = isLogin ? LogIn : LogOut

  return (
  <div className={`logout-overlay ${active ? 'is-visible' : ''}`} aria-hidden={!active} aria-live="polite">
    <div className="logout-overlay-card" role="status">
      <span className="logout-overlay-icon" aria-hidden="true"><Icon size={22} /></span>
      <strong>{isLogin ? 'Signing in' : 'Signing out'}</strong>
      <span>{isLogin ? 'Preparing your dashboard…' : 'Securing your session…'}</span>
      <i className="logout-overlay-progress" aria-hidden="true" />
    </div>
  </div>
  )
}

export default LogoutOverlay
