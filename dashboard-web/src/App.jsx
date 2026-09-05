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
import ResetPassword from './views/ResetPassword'
import { theme } from './theme'

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
      authProvider={authProvider}
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
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/*" element={<ProtectedAdmin />} />
        <Route path="/reset-password" element={<ResetPassword />} />
      </Routes>
    </Router>
  )
}

export default App
