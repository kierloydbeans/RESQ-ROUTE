import React, { useCallback, useState } from 'react'
import { Navigate } from 'react-router-dom'
import CitizenDashboard from './CitizenDashboard'
import DispatcherDashboard from './DispatcherDashboard'
import CoordinatorDashboard from './CoordinatorDashboard'
import CenterCoordinatorDashboard from './CenterCoordinatorDashboard'
import RescuerDashboard from './RescuerDashboard'
import AdminDashboard from './AdminDashboard'
import LogoutOverlay from '../components/LogoutOverlay'
import '../styles/logout-transition.css'

const getStoredAuth = () => {
  try {
    return JSON.parse(localStorage.getItem('auth'))
  } catch {
    return null
  }
}

const normalizeRole = (role) => String(role?.value || role || '').toLowerCase().split('.').pop()

export const Dashboard = () => {
  const auth = getStoredAuth()
  const role = normalizeRole(auth?.user?.role) || 'citizen'
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const handleLogout = useCallback(() => {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    window.setTimeout(() => {
      localStorage.removeItem('auth')
      window.location.href = '/'
    }, 720)
  }, [isLoggingOut])

  let dashboard

  if (['citizen', 'public'].includes(role)) {
    dashboard = <CitizenDashboard auth={auth} onLogout={handleLogout} />
  } else if (role === 'admin') {
    dashboard = <AdminDashboard auth={auth} onLogout={handleLogout} />
  } else if (role === 'coordinator') {
    dashboard = <CoordinatorDashboard auth={auth} onLogout={handleLogout} />
  } else if (role === 'center_coordinator') {
    dashboard = <CenterCoordinatorDashboard auth={auth} onLogout={handleLogout} />
  } else if (role === 'dispatcher') {
    dashboard = <DispatcherDashboard auth={auth} onLogout={handleLogout} />
  } else if (role === 'rescuer') {
    dashboard = <Navigate to="/rescuer" replace />
  } else {
    dashboard = (
      <main className="restricted-console">
        <h1>Access denied</h1>
        <p>This dashboard is not available for the current role.</p>
        <button className="emergency-button" onClick={handleLogout}>RETURN TO LOGIN</button>
      </main>
    )
  }

  return (
    <div className={`dashboard-session ${isLoggingOut ? 'is-logging-out' : ''}`}>
      {dashboard}
      <LogoutOverlay active={isLoggingOut} />
    </div>
  )
}

export default Dashboard
