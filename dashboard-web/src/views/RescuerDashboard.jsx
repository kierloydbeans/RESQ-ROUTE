import React, { useEffect, useState } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import Logo from '../components/Logo'


const rawApiBase = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'https://resq-route.onrender.com').replace(/\/$/, '')
const API_BASE_URL = rawApiBase.endsWith('/api/v1') ? rawApiBase.replace(/\/api\/v1$/, '') : rawApiBase
const WS_BASE_URL = API_BASE_URL.replace(/^http/, 'ws')

const disasterIcons = {
  flood: '⌁',
  earthquake: '⌂',
  fire: '♨',
  medical: '+',
  trapped: '!',
  other: '•'
}

const disasterLabels = {
  flood: 'Flood',
  earthquake: 'Earthquake',
  fire: 'Fire',
  medical: 'Medical',
  trapped: 'Rescue',
  other: 'Other'
}

export const RescuerDashboard = ({ auth: propAuth, onLogout }) => {
  const auth = propAuth || (() => {
    try {
      return JSON.parse(localStorage.getItem('auth'))
    } catch {
      return null
    }
  })()

  const rescuerId = auth?.user?.id
  const displayName = auth?.user?.full_name || auth?.user?.username || 'Rescuer Unit'

  const [alerts, setAlerts] = useState([])
  const [alertStatus, setAlertStatus] = useState('')
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)

  const { isConnected, lastMessage } = useWebSocket(`${WS_BASE_URL}/api/v1/ws`)

  // Clock
  useEffect(() => {
    const clock = window.setInterval(() => setCurrentTime(new Date()), 1000)
    return () => window.clearInterval(clock)
  }, [])

  // Initial load of alerts
  const loadAlerts = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/alerts`)
      if (response.ok) {
        setAlerts(await response.json())
      }
    } catch (error) {
      console.error('Failed to load alerts', error)
    }
  }

  useEffect(() => {
    loadAlerts()
  }, [API_BASE_URL])

  // Live WebSocket updates
  useEffect(() => {
    if (lastMessage?.type === 'alert_created' && lastMessage.data) {
      setAlerts((currentAlerts) => [
        lastMessage.data,
        ...currentAlerts.filter((alert) => alert.id !== lastMessage.data.id)
      ])
    }

    if (lastMessage?.type === 'alert_updated' && lastMessage.data) {
      setAlerts((currentAlerts) =>
        currentAlerts.map((alert) =>
          alert.id === lastMessage.data.id ? lastMessage.data : alert
        )
      )
    }
  }, [lastMessage])

  // Acknowledge assignment handler
  const handleAcknowledgeAssignment = async (alertId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/alerts/${alertId}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: rescuerId })
      })
      if (!response.ok) throw new Error('Unable to acknowledge assignment')

      const refreshed = await fetch(`${API_BASE_URL}/api/v1/auth/alerts`)
      if (refreshed.ok) setAlerts(await refreshed.json())

      setAlertStatus('Assignment acknowledged. You are now in transit.')
    } catch (error) {
      setAlertStatus(error.message)
    }
  }

  const handleLogout = () => {
    if (onLogout) {
      onLogout()
    } else {
      localStorage.removeItem('auth')
      window.location.href = '/login'
    }
  }

  const formattedCurrentTime = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(currentTime)

  // Filter alerts specifically assigned to this rescuer
  const visibleAlerts = alerts.filter((alert) => alert.assigned_rescuer_id === rescuerId)

  const accountMenu = (
    <div className="account-menu">
      <button
        className="operator operator-trigger"
        onClick={() => setAccountMenuOpen((v) => !v)}
        aria-expanded={accountMenuOpen}
        aria-haspopup="menu"
      >
        <span className="operator-avatar">♟</span>
        <span>
          <b>{displayName}</b>
          <small>RESCUER</small>
        </span>
      </button>
      {accountMenuOpen && (
        <div className="account-dropdown" role="menu">
          <button onClick={handleLogout} role="menuitem">
            Logout
          </button>
        </div>
      )}
    </div>
  )

  return (
    <main className="rescuer-console">
      <header className="rescuer-header">
        <div className="brand-lockup">
          <Logo size="small" />
          <div>
            <strong>RESQ-ROUTE</strong>
            <span>RESCUE FIELD OPERATIONS</span>
          </div>
        </div>
        <div className="header-actions">
          <span className={`connection ${isConnected ? 'online' : 'offline'}`}>
            <i /> {isConnected ? 'Connected' : 'Reconnecting'}
          </span>
          <span className="header-time">{formattedCurrentTime} PHT</span>
          {accountMenu}
        </div>
      </header>

      <section className="rescuer-content">
        <div className="rescuer-heading">
          <span className="eyebrow">FIELD UNIT · {displayName.toUpperCase()}</span>
          <h1>Assignment queue</h1>
          <p>Acknowledge a dispatch to confirm that you are moving to the incident.</p>
        </div>

        {visibleAlerts.length === 0 ? (
          <div className="rescuer-empty">No assignments are waiting.</div>
        ) : (
          <div className="rescuer-assignment-grid">
            {visibleAlerts.map((alert) => (
              <article className="rescuer-assignment" key={alert.id}>
                <div className="rescuer-assignment-top">
                  <span className="rescuer-signal">
                    {disasterIcons[alert.disaster_type] || disasterIcons.other}
                  </span>
                  <div>
                    <span className="card-kicker">NEW ASSIGNMENT · #{alert.id}</span>
                    <h2>{(alert.severity || 'high').toUpperCase()}</h2>
                  </div>
                  <span className="rescuer-status">
                    {(alert.status || 'assigned').replace('_', ' ').toUpperCase()}
                  </span>
                </div>

                <div className="rescuer-assignment-body">
                  <div>
                    <small>LOCATION</small>
                    <strong>
                      {alert.latitude?.toFixed?.(5) || 'Unknown'}, {alert.longitude?.toFixed?.(5) || 'Unknown'}
                    </strong>
                  </div>
                  <div>
                    <small>INCIDENT</small>
                    <strong>
                      {disasterLabels[alert.disaster_type] || 'Emergency'} · {alert.sender_name}
                    </strong>
                  </div>
                  <div>
                    <small>INSTRUCTIONS</small>
                    <p>{alert.message || 'Proceed to the incident location and assess the situation.'}</p>
                  </div>
                </div>

                {alert.status === 'assigned' ? (
                  <button
                    className="rescuer-acknowledge"
                    onClick={() => handleAcknowledgeAssignment(alert.id)}
                  >
                    ACKNOWLEDGE ASSIGNMENT
                  </button>
                ) : (
                  <div className="rescuer-confirmed">ASSIGNMENT ACKNOWLEDGED · IN TRANSIT</div>
                )}
              </article>
            ))}
          </div>
        )}

        {alertStatus && <p className="alert-status">{alertStatus}</p>}
      </section>
    </main>
  )
}

export default RescuerDashboard