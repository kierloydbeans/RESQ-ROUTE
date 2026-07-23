import React from 'react'
import { Menu } from 'react-admin'
import { useNavigate } from 'react-router-dom'

<img src="/resq_logo_with_label.png" alt="ResQ Route Logo" />

const Sidebar = () => {
  const navigate = useNavigate()

  const handleLogout = () => {
    localStorage.removeItem('auth')
    navigate('/login')
  }

  return (
    <Menu>
      <Menu.DashboardItem />
      <Menu.ResourceItem name="shelters" />
      <Menu.ResourceItem name="inventory" />
      <Menu.ResourceItem name="incidents" />
      <Menu.Item to="#" onClick={handleLogout} label="Logout" />
    </Menu>
  )
}

export default Sidebar
