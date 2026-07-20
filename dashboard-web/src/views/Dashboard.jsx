import React from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import MapContainer from '../components/MapContainer'
import IntakeStats from '../components/IntakeStats'
import Logo from '../components/Logo'

export const Dashboard = () => {
  const { isConnected, lastMessage } = useWebSocket('ws://localhost:8000/ws')

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
    <div style={{ padding: '2rem' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: '2rem' }}>
        <div>
          <div className="flex items-center gap-4" style={{ marginBottom: '0.5rem' }}>
            <Logo size="medium" />
            <h1 className="text-gradient" style={{ fontSize: '2.5rem', margin: 0 }}>
              Central Command Panel
            </h1>
          </div>
          <p style={{ color: 'var(--color-gray-600)', fontSize: '1rem' }}>
            Real-time disaster response coordination dashboard
          </p>
        </div>
      </div>
      
      <div className="grid grid-cols-1" style={{ gap: '1.5rem' }}>
        <div className="card" style={{ padding: '1.5rem' }}>
          <div style={{ marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Live Map</h3>
            <p style={{ color: 'var(--color-gray-600)', fontSize: '0.875rem' }}>
              Real-time shelter and incident locations
            </p>
          </div>
          <MapContainer markers={mockMarkers} />
        </div>
        
        <div className="grid grid-cols-1" style={{ gap: '1.5rem' }}>
          <div className="card">
            <IntakeStats stats={mockStats} />
          </div>
          
          <div className="card" style={{ padding: '1.5rem' }}>
            <div className="flex items-center justify-between">
              <div>
                <h3 style={{ fontSize: '1.125rem', marginBottom: '0.25rem' }}>Connection Status</h3>
                <p style={{ color: 'var(--color-gray-600)', fontSize: '0.875rem' }}>
                  WebSocket: {isConnected ? 'Connected' : 'Disconnected'}
                </p>
              </div>
              <div className={`badge ${isConnected ? 'badge-secondary' : 'badge-accent'}`}>
                {isConnected ? 'Online' : 'Offline'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
