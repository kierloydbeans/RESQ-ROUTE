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
  const [lastUpdated, setLastUpdated] = useState(null) 
  const [fetchError, setFetchError] = useState(null) 
  const [isHovered, setIsHovered] = useState(false)
  const [showTestGps, setShowTestGps] = useState(false)
  const [testLat, setTestLat] = useState(14.6349)
  const [testLng, setTestLng] = useState(120.9722)
  const [sendingTest, setSendingTest] = useState(false)
  const { isConnected, lastMessage } = useWebSocket(`${WS_BASE_URL}/api/v1/ws`)

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/v1/gps`)
      .then((response) => {
        if (!response.ok) throw new Error('Network response was not ok')
        return response.json()
      })
      .then((data) => {
        setLatestGps(data.gps)
        setLastUpdated(new Date().toLocaleTimeString())
        setFetchError(null)
      })
      .catch((err) => {
        console.error('Failed to fetch initial GPS:', err)
        setFetchError('Failed to load initial GPS data.')
      })
  }, [API_BASE_URL])

  useEffect(() => {
    if (lastMessage?.type === 'gps_update' && lastMessage.data) {
      setLatestGps(lastMessage.data)
      setLastUpdated(new Date().toLocaleTimeString())
    }
  }, [lastMessage])

  const handleSendTestGps = async () => {
    setSendingTest(true)
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/gps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: parseFloat(testLat),
          longitude: parseFloat(testLng),
          accuracy: 10,
          device_id: 'dashboard-test'
        })
      })
      if (response.ok) {
        setShowTestGps(false)
      }
    } catch (err) {
      console.error('Failed to send test GPS:', err)
    } finally {
      setSendingTest(false)
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

  const mockIncidents = [
    { id: 1, type: 'Flood Rescue', location: 'Barangay 176', time: '10 mins ago', status: 'Dispatching' },
    { id: 2, type: 'Medical Emergency', location: 'Tala High School', time: '25 mins ago', status: 'En Route' },
    { id: 3, type: 'Supply Request', location: 'Caloocan City Hall', time: '1 hr ago', status: 'Pending' }
  ]

  return (
    <div style={{ padding: '2rem', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
      {/* HEADER SECTION */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
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
          <p style={{ color: '#6b7280', fontSize: '0.95rem', margin: '-10' }}>
            Real-time disaster response coordination and shelter monitoring
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          
          {/* SYSTEM STATUS INDICATOR */}
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

          {/* TELEMETRY MODULE (Live GPS + Button) */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1.5rem',
            backgroundColor: '#ffffff',
            padding: '0.5rem 0.5rem 0.5rem 1.25rem',
            borderRadius: '9999px', // Pill shape to match the button
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
            border: '1px solid #e5e7eb'
          }}>
            
            {/* LIVE GPS DATA FEED */}
            <div style={{ minWidth: '160px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '0.70rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6b7280', fontWeight: '600' }}>
                  Live GPS
                </div>
                {lastUpdated && (
                  <div style={{ fontSize: '0.65rem', color: '#9ca3af' }}>
                    {lastUpdated}
                  </div>
                )}
              </div>
              
              {latestGps ? (
                <div style={{ marginTop: '0.15rem', fontWeight: '700', color: '#111827', fontSize: '0.9rem' }}>
                  {latestGps.latitude.toFixed(5)}, {latestGps.longitude.toFixed(5)}
                </div>
              ) : (
                <div style={{ marginTop: '0.15rem', color: fetchError ? '#ef4444' : '#9ca3af', fontSize: '0.85rem' }}>
                  {fetchError ? fetchError : 'Waiting for telemetry...'}
                </div>
              )}
            </div>

            {/* TEST GPS BUTTON */}
            <button
              onClick={() => setShowTestGps(true)}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              style={{
                padding: '0.625rem 1.25rem',
                borderRadius: '9999px',
                border: 'none',
                backgroundColor: isHovered ? '#2563eb' : '#3b82f6',
                color: '#ffffff',
                fontSize: '0.875rem',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: isHovered 
                  ? '0 10px 15px -3px rgba(0, 0, 0, 0.1)' 
                  : '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                transform: isHovered ? 'translateY(-1px)' : 'translateY(0)',
                transition: 'all 0.2s ease-in-out',
                whiteSpace: 'nowrap'
              }}
            >
              Test GPS
            </button>
          </div>
        </div>
      </div>

      {/* TEST GPS MODAL */}
      {showTestGps && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(17, 24, 39, 0.4)', // Slightly darker, cooler overlay
          backdropFilter: 'blur(4px)', // Modern blurred background effect
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px', // Softer corners
            padding: '2rem',
            width: '90%', // Ensures it doesn't touch screen edges on mobile
            maxWidth: '400px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            border: '1px solid #f3f4f6'
          }}>
            
            {/* Modal Header with Icon */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <div style={{ backgroundColor: '#eff6ff', padding: '0.6rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {/* SVG Location Pin Icon */}
                <svg width="20" height="20" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '700', margin: 0, color: '#111827' }}>
                Send Test GPS
              </h2>
            </div>

            {/* Latitude Input with Custom Big Stepper */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#4b5563', marginBottom: '0.5rem' }}>
                Latitude
              </label>
              <div style={{ 
                display: 'flex', 
                border: '1px solid #d1d5db', 
                borderRadius: '10px', 
                overflow: 'hidden',
                backgroundColor: '#ffffff'
              }}>
                <input
                  type="number"
                  step="0.0001"
                  value={testLat}
                  /* FIX: Restrict typing length to 10 characters */
                  onChange={(e) => {
                    if (e.target.value.length <= 10) {
                      setTestLat(e.target.value)
                    }
                  }}
                  style={{ 
                    flex: 1, 
                    padding: '0.75rem 1rem', 
                    border: 'none', 
                    fontSize: '0.95rem', 
                    color: '#1f2937',
                    outline: 'none'
                  }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', width: '48px', borderLeft: '1px solid #d1d5db' }}>
                  <button 
                    type="button"
                    /* FIX: Added .toFixed(4) to round to 4 decimal places */
                    onClick={() => setTestLat(((parseFloat(testLat) || 0) + 0.00001).toFixed(5))}
                    style={{ flex: 1, border: 'none', borderBottom: '1px solid #d1d5db', backgroundColor: '#f3f4f6', cursor: 'pointer', fontSize: '0.7rem', color: '#4b5563' }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = '#e5e7eb'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = '#f3f4f6'}
                  >
                    ▲
                  </button>
                  <button 
                    type="button"
                    /* FIX: Added .toFixed(4) to round to 4 decimal places */
                    onClick={() => setTestLat(((parseFloat(testLat) || 0) - 0.00001).toFixed(5))}
                    style={{ flex: 1, border: 'none', backgroundColor: '#f3f4f6', cursor: 'pointer', fontSize: '0.7rem', color: '#4b5563' }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = '#e5e7eb'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = '#f3f4f6'}
                  >
                    ▼
                  </button>
                </div>
              </div>
            </div>

            {/* Longitude Input with Custom Big Stepper */}
            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#4b5563', marginBottom: '0.5rem' }}>
                Longitude
              </label>
              <div style={{ 
                display: 'flex', 
                border: '1px solid #d1d5db', 
                borderRadius: '10px', 
                overflow: 'hidden',
                backgroundColor: '#ffffff'
              }}>
                <input
                  type="number"
                  step="0.0001"
                  value={testLng}
                  /* FIX: Restrict typing length to 10 characters */
                  onChange={(e) => {
                    if (e.target.value.length <= 10) {
                      setTestLng(e.target.value)
                    }
                  }}
                  style={{ 
                    flex: 1, 
                    padding: '0.75rem 1rem', 
                    border: 'none', 
                    fontSize: '0.95rem', 
                    color: '#1f2937',
                    outline: 'none'
                  }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', width: '48px', borderLeft: '1px solid #d1d5db' }}>
                  <button 
                    type="button"
                    /* FIX: Added .toFixed(4) to round to 4 decimal places */
                    onClick={() => setTestLng(((parseFloat(testLng) || 0) + 0.00001).toFixed(5))}
                    style={{ flex: 1, border: 'none', borderBottom: '1px solid #d1d5db', backgroundColor: '#f3f4f6', cursor: 'pointer', fontSize: '0.7rem', color: '#4b5563' }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = '#e5e7eb'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = '#f3f4f6'}
                  >
                    ▲
                  </button>
                  <button 
                    type="button"
                    /* FIX: Added .toFixed(4) to round to 4 decimal places */
                    onClick={() => setTestLng(((parseFloat(testLng) || 0) - 0.00001).toFixed(5))}
                    style={{ flex: 1, border: 'none', backgroundColor: '#f3f4f6', cursor: 'pointer', fontSize: '0.7rem', color: '#4b5563' }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = '#e5e7eb'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = '#f3f4f6'}
                  >
                    ▼
                  </button>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                onClick={() => setShowTestGps(false)}
                style={{ 
                  flex: 1, 
                  padding: '0.75rem', 
                  borderRadius: '10px', 
                  border: '1px solid #e5e7eb', 
                  backgroundColor: '#ffffff', 
                  color: '#4b5563', 
                  fontSize: '0.9rem', 
                  fontWeight: '600', 
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#f9fafb'}
                onMouseLeave={(e) => e.target.style.backgroundColor = '#ffffff'}
              >
                Cancel
              </button>
              <button
                onClick={handleSendTestGps}
                disabled={sendingTest}
                style={{ 
                  flex: 1, 
                  padding: '0.75rem', 
                  borderRadius: '10px', 
                  border: 'none', 
                  backgroundColor: sendingTest ? '#93c5fd' : '#3b82f6', 
                  color: '#ffffff', 
                  fontSize: '0.9rem', 
                  fontWeight: '600', 
                  cursor: sendingTest ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.2)',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => !sendingTest && (e.target.style.backgroundColor = '#2563eb')}
                onMouseLeave={(e) => !sendingTest && (e.target.style.backgroundColor = '#3b82f6')}
              >
                {sendingTest ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DASHBOARD GRID CONTENT */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
        
        {/* STATS OVERVIEW */}
        <div style={{
          gridColumn: '1 / -1',
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
          <div style={{ borderRadius: '12px', overflow: 'hidden', minHeight: '400px', height: '100%' }}>
            <MapContainer markers={mockMarkers} />
          </div>
        </div>

        {/* ACTIVE INCIDENTS PANEL */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: '1.5rem',
          boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
          border: '1px solid #e5e7eb',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#111827', margin: '0 0 1rem 0' }}>
            Active Incident Reports
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
            {mockIncidents.map((incident) => (
              <div key={incident.id} style={{
                padding: '1rem',
                border: '1px solid #f3f4f6',
                borderRadius: '8px',
                backgroundColor: '#f9fafb'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: '600', color: '#1f2937', fontSize: '0.9rem' }}>{incident.type}</span>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{incident.time}</span>
                </div>
                <div style={{ fontSize: '0.85rem', color: '#4b5563', marginBottom: '0.5rem' }}>
                  📍 {incident.location}
                </div>
                <div style={{
                  display: 'inline-block',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '4px',
                  backgroundColor: incident.status === 'Dispatching' ? '#fee2e2' : incident.status === 'En Route' ? '#fef3c7' : '#e0e7ff',
                  color: incident.status === 'Dispatching' ? '#991b1b' : incident.status === 'En Route' ? '#92400e' : '#3730a3'
                }}>
                  {incident.status}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard