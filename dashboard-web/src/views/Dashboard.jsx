import React from 'react'
import CitizenDashboard from './CitizenDashboard'
import DispatcherDashboard from './DispatcherDashboard'

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

  const handleLogout = () => {
    localStorage.removeItem('auth')
    window.location.href = '/login'
  }

  if (['citizen', 'public'].includes(role)) {
    return <CitizenDashboard auth={auth} onLogout={handleLogout} />
  }

  if (['dispatcher', 'coordinator', 'admin'].includes(role)) {
    return <DispatcherDashboard auth={auth} onLogout={handleLogout} />
  }

  return (
    <main className="restricted-console">
      <h1>Access denied</h1>
      <p>This dashboard is not available for the current role.</p>
      <button className="emergency-button" onClick={handleLogout}>RETURN TO LOGIN</button>
    </main>
  )
}

export default Dashboard
