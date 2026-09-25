import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Admin, Resource, Layout } from 'react-admin'
import { dataProvider } from './dataProvider'
import { authProvider } from './authProvider'
import { Dashboard } from './views/Dashboard'
import { InventoryHub } from './views/InventoryHub'
import { IncidentTriage } from './views/IncidentTriage'
import Login from './views/Login'
import Register from './views/Register'
import RescuerDashboard from './views/RescuerDashboard'
import ResetPassword from './views/ResetPassword'
import { theme } from './theme'
import { ThemeProvider, useTheme } from './ThemeContext'
import { Sparkles } from 'lucide-react'

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

const AppLayout = (props) => (
  <Layout {...props} sidebar={() => null} appBar={() => null} />
)

const ProtectedAdmin = () => {
  let auth = null
  try {
    auth = JSON.parse(localStorage.getItem('auth'))
  } catch {
    localStorage.removeItem('auth')
  }

  if (!auth?.token || !auth?.user?.role) {
    return <Navigate to="/login" replace />
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
        <div className="global-theme-controls">
          <GlobalGradientToggle />
          <GlobalThemeToggle />
        </div>
        <Routes>
          <Route path="/login/:role?" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/rescuer" element={<RescuerDashboard />} />
          <Route path="/*" element={<ProtectedAdmin />} />
        </Routes>
      </Router>
    </ThemeProvider>
  )
}

export default App