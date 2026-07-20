import React from 'react'
import { Menu } from 'react-admin'
import { useNavigate } from 'react-router-dom'

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
