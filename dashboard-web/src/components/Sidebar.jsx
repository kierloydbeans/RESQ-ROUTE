import React from 'react'
import { Menu } from 'react-admin'
import { useNavigate } from 'react-router-dom'

// 1. Import distinct, recognizable icons from Material-UI
import NightShelterIcon from '@mui/icons-material/NightShelter'
import InventoryIcon from '@mui/icons-material/Inventory'
import ReportProblemIcon from '@mui/icons-material/ReportProblem'

const Sidebar = () => {
  const navigate = useNavigate()

  const handleLogout = () => {
    localStorage.removeItem('auth')
    navigate('/login')
  }

  return (
  
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      <Menu>
        {/* Dashboard automatically gets its grid icon */}
        <Menu.DashboardItem />
        
        {/* 3. Swap Menu.ResourceItem for Menu.Item to take full control of icons and text */}
        <Menu.Item 
          to="/shelters" 
          primaryText="Shelters" 
          leftIcon={<NightShelterIcon />} 
        />
        <Menu.Item 
          to="/inventory" 
          primaryText="Inventories" 
          leftIcon={<InventoryIcon />} 
        />
        <Menu.Item 
          to="/incidents" 
          primaryText="Incidents" 
          leftIcon={<ReportProblemIcon />} 
        />
      </Menu>
    </div>
  )
}

export default Sidebar