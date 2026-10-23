import React, { useRef, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Admin, Resource, Layout } from 'react-admin'
import { dataProvider } from './dataProvider'
import { authProvider } from './authProvider'
import { Dashboard } from './views/Dashboard'
import { InventoryHub } from './views/InventoryHub'
import { IncidentTriage } from './views/IncidentTriage'
import { CoordinatorDashboard } from './views/CoordinatorDashboard'
import Login from './views/Login'
import LandingPage from './views/LandingPage'
import Register from './views/Register'
import RescuerDashboard from './views/RescuerDashboard'
import ResetPassword from './views/ResetPassword'
import { theme } from './theme'
import { ThemeProvider, useTheme } from './ThemeContext'
import { SlidersHorizontal, Sparkles } from 'lucide-react'
import RescueErrorScreen from './components/RescueErrorScreen'

const GlobalThemeToggle = () => {
  const { isDark, toggleTheme } = useTheme()

  return (
    <button className="global-theme-toggle" onClick={toggleTheme} aria-label="Toggle light and dark mode" title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
      {isDark ? '☼' : '☾'}
    </button>
  )
}

const GlobalGradientToggle = () => {
  const { isShaderGradient, toggleShaderGradient } = useTheme()

  return (
    <button className={`global-theme-toggle ${isShaderGradient ? 'is-active' : ''}`} onClick={toggleShaderGradient} aria-label="Toggle moving shader gradient" title={isShaderGradient ? 'Use fixed gradient to save resources' : 'Enable moving shader gradient'}>
      <Sparkles size={17} strokeWidth={2} />
    </button>
  )
}

const GlobalThemeControls = () => {
  const [isOpen, setIsOpen] = useState(false)
  const swipeStartXRef = useRef(null)
  const handledSwipeRef = useRef(false)

  const handlePointerDown = (event) => {
    if (window.innerWidth > 768) return
    swipeStartXRef.current = event.clientX
    handledSwipeRef.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerUp = (event) => {
    if (swipeStartXRef.current === null) return
    const distance = event.clientX - swipeStartXRef.current
    swipeStartXRef.current = null
    if (Math.abs(distance) < 24) return
    handledSwipeRef.current = true
    setIsOpen(distance < 0)
  }

  const handleRevealClick = (event) => {
    if (handledSwipeRef.current) {
      handledSwipeRef.current = false
      return
    }
    if (window.innerWidth <= 768 && event.detail > 0) return
    setIsOpen((open) => !open)
  }

  return (
    <div
      className={`global-theme-controls ${isOpen ? 'is-open' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => { swipeStartXRef.current = null }}
    >
      <div className="global-theme-options" aria-hidden={!isOpen}>
        <GlobalGradientToggle />
        <GlobalThemeToggle />
      </div>
      <button
        type="button"
        className="global-theme-toggle global-theme-reveal"
        onClick={handleRevealClick}
        aria-label={isOpen ? 'Hide appearance controls' : 'Show appearance controls'}
        aria-expanded={isOpen}
        title={isOpen ? 'Swipe right to hide appearance controls' : 'Swipe left to show appearance controls'}
      >
        <SlidersHorizontal size={17} strokeWidth={2} />
      </button>
    </div>
  )
}

const AppLayout = (props) => (
  <Layout {...props} sidebar={() => null} appBar={() => null} error={RescueErrorScreen} />
)

const ProtectedRescuer = () => {
  let auth = null
  try {
    auth = JSON.parse(localStorage.getItem('auth'))
  } catch {
    localStorage.removeItem('auth')
  }

  const role = String(auth?.user?.role?.value || auth?.user?.role || '').toLowerCase().split('.').pop()
  if (!auth?.token) return <Navigate to="/login/rescuer" replace />
  if (role !== 'rescuer') return <Navigate to="/" replace />

  return <RescuerDashboard />
}

const ProtectedAdmin = () => {
  let auth = null
  try {
    auth = JSON.parse(localStorage.getItem('auth'))
  } catch {
    localStorage.removeItem('auth')
  }

  if (!auth?.token || !auth?.user?.role) {
    return window.location.pathname === '/'
      ? <LandingPage />
      : <Navigate to="/" replace />
  }

  return (
    <Admin
      theme={theme}
      dataProvider={dataProvider}
      /*authProvider={authProvider}*/
      layout={AppLayout}
      dashboard={Dashboard}
    >
      <Resource name="shelters" />
      <Resource name="inventory" list={InventoryHub} />
      <Resource name="incidents" list={IncidentTriage} />
    </Admin>
  )
}

function App() {
  return (
    <ThemeProvider>
      <Router>
        <GlobalThemeControls />
        <Routes>
          {import.meta.env.DEV && <Route path="/error-preview" element={<RescueErrorScreen />} />}
          <Route path="/login/:role?" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/rescuer" element={<ProtectedRescuer />} />
          <Route path="/*" element={<ProtectedAdmin />} />
        </Routes>
      </Router>
    </ThemeProvider>
  )
}

// function App() {
//   const mockAuth = {
//     user: {
//       id: 1,
//       full_name: 'Cmdr. Reyes, J.',
//       username: 'reyes_j',
//       role: 'COMMAND DIRECTOR'
//     }
//   }

//   return <CoordinatorDashboard auth={mockAuth} onLogout={() => alert('Logged out')} />
// }

export default App
