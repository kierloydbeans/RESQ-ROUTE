import React, { useEffect, useState } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import MapContainer from '../components/MapContainer'
import IntakeStats from '../components/IntakeStats'
import Logo from '../components/Logo'

// Convert http/https base URL to ws/wss dynamically
const rawApiBase = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'https://resq-route.onrender.com').replace(/\/$/, '')
const API_BASE_URL = rawApiBase.endsWith('/api/v1') ? rawApiBase.replace(/\/api\/v1$/, '') : rawApiBase
const WS_BASE_URL = API_BASE_URL.replace(/^http/, 'ws')

export const Dashboard = () => {
  const [latestGps, setLatestGps] = useState(null)
  const { isConnected, lastMessage } = useWebSocket(`${WS_BASE_URL}/api/v1/ws`)

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/v1/gps`)
      .then((response) => response.json())
      .then((data) => setLatestGps(data.gps))
      .catch(() => {})
  }, [API_BASE_URL])

  useEffect(() => {
    if (lastMessage?.type === 'gps_update' && lastMessage.data) {
      setLatestGps(lastMessage.data)
    }
  }, [lastMessage])

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
              Central Command Panel
            </h1>
          </div>
          <p style={{ color: '#6b7280', fontSize: '0.95rem', margin: 0 }}>
            Real-time disaster response coordination and shelter monitoring
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
            <MapContainer markers={mockMarkers} />
          </div>
        </div>

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