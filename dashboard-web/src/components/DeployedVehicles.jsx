import React, { useState } from 'react'
import MapContainer from './MapContainer'

const rawApiBase = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'https://resq-route.onrender.com').replace(/\/$/, '')
const API_BASE_URL = rawApiBase.endsWith('/api/v1') ? rawApiBase.replace(/\/api\/v1$/, '') : rawApiBase

const DeployedVehicles = ({ alert, vehicles = [] }) => {
  const [route, setRoute] = useState(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeError, setRouteError] = useState('')
  let vehicleIds = []
  try {
    vehicleIds = JSON.parse(alert.assigned_vehicle_ids || '[]')
  } catch {}

  const deployedVehicles = vehicles.filter((vehicle) => vehicleIds.includes(vehicle.id))
  const showRoute = alert.status !== 'assigned' && alert.latitude != null && alert.longitude != null
  if (!deployedVehicles.length && !showRoute) return null

  const handleRoute = () => {
    if (!navigator.geolocation) {
      setRouteError('Location access is unavailable.')
      return
    }

    setRouteLoading(true)
    setRouteError('')
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/routing/walk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            origin_latitude: position.coords.latitude,
            origin_longitude: position.coords.longitude,
            destination_latitude: Number(alert.latitude),
            destination_longitude: Number(alert.longitude)
          })
        })
        const data = await response.json()
        if (!response.ok || !data.geometry?.coordinates?.length) throw new Error(data.detail || 'OSRM returned no route')
        setRoute(data.geometry)
      } catch (error) {
        setRouteError(error.message)
      } finally {
        setRouteLoading(false)
      }
    }, () => {
      setRouteError('Allow location access to calculate your route.')
      setRouteLoading(false)
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 })
  }

  return (
    <div className="rescuer-deployed-vehicles">
      {deployedVehicles.length > 0 && <small>DEPLOYED VEHICLES</small>}
      {deployedVehicles.map((vehicle) => (
        <span key={vehicle.id}>{vehicle.vehicle_type} · {vehicle.plate_number}</span>
      ))}
      {showRoute && (
        <button
          type="button"
          className="rescuer-route-link"
          onClick={handleRoute}
        >
          {routeLoading ? 'CALCULATING OSRM ROUTE...' : route ? 'REFRESH ROUTE TO INCIDENT' : 'TAKE ROUTE TO INCIDENT'}
        </button>
      )}
      {routeError && <small className="rescuer-route-error">{routeError}</small>}
      {route && <div className="rescuer-route-map"><MapContainer markers={[{ position: [Number(alert.longitude), Number(alert.latitude)], label: `${alert.sender_name} · Incident`, color: '#f23e4f', icon: '!' }]} route={route} trackDeviceLocation /></div>}
    </div>
  )
}

export default DeployedVehicles
