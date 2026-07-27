import React, { useEffect, useState } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import MapContainer from '../components/MapContainer'
import IntakeStats from '../components/IntakeStats'
import Logo from '../components/Logo'

const getStoredAuth = () => {
  try {
    return JSON.parse(localStorage.getItem('auth'))
  } catch {
    return null
  }
}

// Convert http/https base URL to ws/wss dynamically
const rawApiBase = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'https://resq-route.onrender.com').replace(/\/$/, '')
const API_BASE_URL = rawApiBase.endsWith('/api/v1') ? rawApiBase.replace(/\/api\/v1$/, '') : rawApiBase
const WS_BASE_URL = API_BASE_URL.replace(/^http/, 'ws')

export const Dashboard = () => {
  const auth = getStoredAuth()
  const role = auth?.user?.role?.toLowerCase?.() || 'citizen'
  const rescuerId = auth?.user?.id
  const [latestGps, setLatestGps] = useState(null)
  const [alertMessage, setAlertMessage] = useState('')
  const [alertStatus, setAlertStatus] = useState('')
  const [alerts, setAlerts] = useState([])
  const [rescuers, setRescuers] = useState([])
  const [selectedRescuerId, setSelectedRescuerId] = useState('')
  const { isConnected, lastMessage } = useWebSocket(`${WS_BASE_URL}/api/v1/ws`)

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/v1/gps`)
      .then((response) => response.json())
      .then((data) => setLatestGps(data.gps))
      .catch(() => {})
  }, [API_BASE_URL])

  useEffect(() => {
    if (!('geolocation' in navigator)) return

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const nextGps = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: Date.now()
        }
        setLatestGps(nextGps)

        fetch(`${API_BASE_URL}/api/v1/gps`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nextGps)
        }).catch(() => {})
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    )

    return () => navigator.geolocation.clearWatch(watchId)
  }, [API_BASE_URL])

  useEffect(() => {
    if (lastMessage?.type === 'gps_update' && lastMessage.data) {
      setLatestGps(lastMessage.data)
    }
  }, [lastMessage])

  useEffect(() => {
    const loadAlerts = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/auth/alerts`)
        if (response.ok) {
          const data = await response.json()
          setAlerts(data)
        }
      } catch (error) {
        console.error('Failed to load alerts', error)
      }
    }

    const loadRescuers = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/auth/rescuers`)
        if (response.ok) {
          const data = await response.json()
          setRescuers(data)
        }
      } catch (error) {
        console.error('Failed to load rescuers', error)
      }
    }

    loadAlerts()
    loadRescuers()
  }, [API_BASE_URL])

  const handleSendEmergencyAlert = async () => {
    if (!auth?.user || !latestGps) {
      setAlertStatus('Unable to send alert without your location.')
      return
    }

    setAlertStatus('Sending...')
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_id: auth.user.id,
          sender_name: auth.user.full_name || auth.user.username,
          sender_role: auth.user.role,
          latitude: latestGps.latitude,
          longitude: latestGps.longitude,
          message: alertMessage || 'Emergency alert'
        })
      })

      if (!response.ok) {
        throw new Error('Unable to send alert')
      }

      setAlertStatus('Alert sent to the response team.')
      setAlertMessage('')
      const refreshed = await fetch(`${API_BASE_URL}/api/v1/auth/alerts`)
      if (refreshed.ok) {
        setAlerts(await refreshed.json())
      }
    } catch (error) {
      setAlertStatus(error.message)
    }
  }

  const handleAssignAlert = async (alertId) => {
    if (!selectedRescuerId) {
      setAlertStatus('Choose a rescuer before assigning the alert.')
      return
    }

    try {
      const rescuer = rescuers.find((entry) => entry.id === Number(selectedRescuerId))
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/alerts/${alertId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'assigned',
          assigned_rescuer_id: rescuer?.id,
          assigned_rescuer_name: rescuer ? `${rescuer.display_name || rescuer.full_name || rescuer.username}` : 'Rescuer'
        })
      })

      if (!response.ok) {
        throw new Error('Unable to assign rescuer')
      }

      const refreshed = await fetch(`${API_BASE_URL}/api/v1/auth/alerts`)
      if (refreshed.ok) {
        setAlerts(await refreshed.json())
      }
      setAlertStatus('Alert assigned to rescuer.')
    } catch (error) {
      setAlertStatus(error.message)
    }
  }

  const handleUpdateAlertStatus = async (alertId, status) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/alerts/${alertId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      })
      if (!response.ok) {
        throw new Error('Unable to update alert status')
      }
      const refreshed = await fetch(`${API_BASE_URL}/api/v1/auth/alerts`)
      if (refreshed.ok) {
        setAlerts(await refreshed.json())
      }
    } catch (error) {
      setAlertStatus(error.message)
    }
  }

  const mockStats = {
    totalEvacuees: 1250,
    capacityUsed: 78,
    activeShelters: 12,
    criticalNeeds: 5
  }

  const mockMarkers = [
    { position: [14.65, 120.98], label: 'Caloocan City Hall Shelter' },
    { position: [14.66, 120.99], label: 'Bagong Silang Evacuation Center' },
    { position: [14.64, 120.97], label: 'Tala High School Shelter' }
  ]

  const alertMarkers = alerts.map((alert) => ({
    position: [alert.longitude, alert.latitude],
    label: `${alert.sender_name} • ${alert.status}`,
    color: alert.status === 'assigned' ? '#2563eb' : '#dc2626',
    icon: '⚠'
  }))

  return (
    <div style={{ padding: '2rem', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
      {/* HEADER SECTION */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
            <Logo size="medium" />
            <h1 style={{
              fontSize: '2rem',
              fontWeight: '800',
              margin: 0,
              background: 'linear-gradient(135deg, #c52222 0%, #a36b16 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              {role === 'citizen' ? 'Citizen Support Panel' : role === 'rescuer' ? 'Rescue Operations Panel' : 'Central Command Panel'}
            </h1>
          </div>
          <p style={{ color: '#6b7280', fontSize: '0.95rem', margin: 0 }}>
            {role === 'citizen'
              ? 'Send an emergency alert so responders can find your location and assist quickly.'
              : 'Real-time disaster response coordination and shelter monitoring'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            backgroundColor: '#ffffff',
            padding: '0.625rem 1.25rem',
            borderRadius: '9999px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
            border: '1px solid #e5e7eb'
          }}>
            <span style={{
              height: '10px',
              width: '10px',
              borderRadius: '50%',
              backgroundColor: isConnected ? '#10b981' : '#ef4444',
              display: 'inline-block'
            }}></span>
            <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>
              System {isConnected ? 'Online' : 'Offline'}
            </span>
          </div>

          <div style={{
            backgroundColor: '#ffffff',
            padding: '0.875rem 1.1rem',
            borderRadius: '14px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
            border: '1px solid #e5e7eb',
            minWidth: '220px'
          }}>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6b7280' }}>
              Live GPS
            </div>
            {latestGps ? (
              <div style={{ marginTop: '0.25rem', fontWeight: '700', color: '#111827' }}>
                {latestGps.latitude.toFixed(5)}, {latestGps.longitude.toFixed(5)}
              </div>
            ) : (
              <div style={{ marginTop: '0.25rem', color: '#9ca3af' }}>Waiting for device telemetry...</div>
            )}
          </div>
        </div>
      </div>

      {/* DASHBOARD GRID CONTENT */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
        {role === 'citizen' && (
          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', border: '1px solid #e5e7eb' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#111827', marginTop: 0 }}>Send Emergency Alert</h3>
            <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>Your account details and current location will be shared with the response team.</p>
            <textarea
              value={alertMessage}
              onChange={(e) => setAlertMessage(e.target.value)}
              placeholder="Describe the emergency"
              style={{ width: '100%', minHeight: '96px', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '0.9rem', marginBottom: '0.75rem' }}
            />
            <button onClick={handleSendEmergencyAlert} style={{ padding: '0.75rem 1rem', borderRadius: '999px', border: 'none', background: 'linear-gradient(135deg, #c52222 0%, #a36b16 100%)', color: '#fff', fontWeight: '600', cursor: 'pointer' }}>
              Send Emergency Alert
            </button>
            {alertStatus && <p style={{ marginTop: '0.75rem', color: '#374151', fontSize: '0.9rem' }}>{alertStatus}</p>}
          </div>
        )}
        {/* STATS OVERVIEW */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
          border: '1px solid #e5e7eb',
          overflow: 'hidden'
        }}>
          <IntakeStats stats={mockStats} />
        </div>

        {/* LIVE MAP CARD */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: '1.5rem',
          boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
          border: '1px solid #e5e7eb'
        }}>
          <div style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#111827', margin: 0 }}>
              Live Operations Map
            </h3>
            <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.25rem', margin: 0 }}>
              Real-time shelter status, incident dispatching, and evacuation locations
            </p>
          </div>
          <div style={{ borderRadius: '12px', overflow: 'hidden', minHeight: '400px' }}>
            <MapContainer markers={role === 'citizen' ? mockMarkers : [...mockMarkers, ...alertMarkers]} />
          </div>
        </div>

        {(role === 'rescuer' || role === 'coordinator') && (
          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '1.25rem 1.5rem', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', border: '1px solid #e5e7eb' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#374151', marginTop: 0 }}>Active Alerts</h4>
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {alerts.length === 0 ? (
                <p style={{ margin: 0, color: '#6b7280' }}>No active alerts.</p>
              ) : (role === 'rescuer' ? alerts.filter((alert) => alert.assigned_rescuer_id === rescuerId) : alerts).map((alert) => (
                <div key={alert.id} style={{ border: '1px solid #e5e7eb', borderRadius: '12px', padding: '0.9rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                    <strong>{alert.sender_name}</strong>
                    <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>{alert.status}</span>
                  </div>
                  <p style={{ margin: '0.35rem 0', color: '#4b5563' }}>{alert.message}</p>
                  <p style={{ margin: 0, color: '#6b7280', fontSize: '0.8rem' }}>{alert.latitude.toFixed(4)}, {alert.longitude.toFixed(4)}</p>
                  {role === 'rescuer' && alert.assigned_rescuer_id === rescuerId && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
                      {alert.status === 'assigned' && (
                        <button onClick={() => handleUpdateAlertStatus(alert.id, 'on_the_way')} style={{ padding: '0.6rem 0.85rem', borderRadius: '8px', border: 'none', backgroundColor: '#f59e0b', color: '#fff', cursor: 'pointer' }}>
                          On the way
                        </button>
                      )}
                      {alert.status === 'on_the_way' && (
                        <>
                          <button onClick={() => handleUpdateAlertStatus(alert.id, 'assigned')} style={{ padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#ffffff', color: '#374151', cursor: 'pointer' }}>
                            Cancel
                          </button>
                          <button onClick={() => handleUpdateAlertStatus(alert.id, 'arrived')} style={{ padding: '0.6rem 0.85rem', borderRadius: '8px', border: 'none', backgroundColor: '#10b981', color: '#fff', cursor: 'pointer' }}>
                            Arrived in area
                          </button>
                        </>
                      )}
                      {alert.status === 'arrived' && (
                        <>
                          <button onClick={() => handleUpdateAlertStatus(alert.id, 'returning')} style={{ padding: '0.6rem 0.85rem', borderRadius: '8px', border: 'none', backgroundColor: '#2563eb', color: '#fff', cursor: 'pointer' }}>
                            Return to evac center
                          </button>
                          <button onClick={() => handleUpdateAlertStatus(alert.id, 'assigned')} style={{ padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#ffffff', color: '#374151', cursor: 'pointer' }}>
                            Heading to another alert site
                          </button>
                        </>
                      )}
                      {alert.status === 'returning' && (
                        <span style={{ color: '#2563eb', fontWeight: '600' }}>Returning to evac center...</span>
                      )}
                    </div>
                  )}
                  {role === 'coordinator' && (
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
                      <select value={selectedRescuerId} onChange={(e) => setSelectedRescuerId(e.target.value)} style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                        <option value="">Select rescuer</option>
                        {rescuers.map((rescuer) => (
                          <option key={rescuer.id} value={rescuer.id}>{rescuer.display_name || rescuer.full_name || rescuer.username || `Rescuer ${rescuer.id}`} ({rescuer.status || 'available'})</option>
                        ))}
                      </select>
                      <button onClick={() => handleAssignAlert(alert.id)} style={{ padding: '0.6rem 0.85rem', borderRadius: '8px', border: 'none', backgroundColor: '#2563eb', color: '#fff', cursor: 'pointer' }}>Assign</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* WEBSOCKET LOG & DETAILS CARD */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: '1.25rem 1.5rem',
          boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
          border: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <h4 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#374151', margin: 0 }}>
              Live Telemetry Stream
            </h4>
            <p style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: '0.25rem', margin: 0 }}>
              WebSocket status: <strong style={{ color: isConnected ? '#059669' : '#dc2626' }}>{isConnected ? 'Connected to /ws' : 'Reconnecting...'}</strong>
            </p>
          </div>
          {lastMessage && (
            <div style={{
              fontSize: '0.8rem',
              color: '#4b5563',
              backgroundColor: '#f3f4f6',
              padding: '0.5rem 0.85rem',
              borderRadius: '8px',
              fontFamily: 'monospace'
            }}>
              Latest update received
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Dashboard