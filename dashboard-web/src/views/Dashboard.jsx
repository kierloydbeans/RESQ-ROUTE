import React from 'react'
import CitizenDashboard from './CitizenDashboard'
import DispatcherDashboard from './DispatcherDashboard'
import RescuerDashboard from './RescuerDashboard'
import Logo from '../components/Logo'

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

  if (role === 'citizen') {
    return <CitizenDashboard auth={auth} onLogout={handleLogout} />
  }

  if (role === 'rescuer') {
    return <RescuerDashboard auth={auth} onLogout={handleLogout} />
  }

  if (role === 'dispatcher') {
    return <DispatcherDashboard auth={auth} onLogout={handleLogout} />
  }

  return (
    <main className="restricted-console">
      <Logo size="small" />
      <h1>Dispatcher access required</h1>
      <p>This operations console is available only to dispatcher accounts.</p>
      <button className="emergency-button" onClick={handleLogout}>RETURN TO LOGIN</button>
    </main>
  )
}

export default Dashboard