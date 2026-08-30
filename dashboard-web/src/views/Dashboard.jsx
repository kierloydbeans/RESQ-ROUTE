import React, { useEffect, useState } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import MapContainer from '../components/MapContainer'
import Logo from '../components/Logo'

const getStoredAuth = () => {
  try {
    return JSON.parse(localStorage.getItem('auth'))
  } catch {
    return null
  }
}

const normalizeRole = (role) => String(role?.value || role || '').toLowerCase().split('.').pop()
const statusLabel = (status) => String(status || 'unknown').replace(/_/g, ' ').toUpperCase()
const alertMarkerColors = { pending: '#dc2626', assigned: '#f59e0b', resolving: '#2563eb', closed: '#dc2626' }
const rescuerMarkerColors = { available: '#00d6a0', recovering: '#f59e0b', in_transit: '#2563eb' }
const vehicleMarkerColors = { available: '#00d6a0', in_transit: '#2563eb', maintenance: '#dc2626' }

// Convert http/https base URL to ws/wss dynamically
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

const distanceBetween = (firstLatitude, firstLongitude, secondLatitude, secondLongitude) => {
  if ([firstLatitude, firstLongitude, secondLatitude, secondLongitude].some((value) => typeof value !== 'number')) return null
  const earthRadiusKm = 6371
  const latitudeDelta = (secondLatitude - firstLatitude) * Math.PI / 180
  const longitudeDelta = (secondLongitude - firstLongitude) * Math.PI / 180
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude * Math.PI / 180) * Math.cos(secondLatitude * Math.PI / 180) * Math.sin(longitudeDelta / 2) ** 2
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export const Dashboard = () => {
  const auth = getStoredAuth()
  const role = normalizeRole(auth?.user?.role) || 'citizen'
  const rescuerId = auth?.user?.id
  const [latestGps, setLatestGps] = useState(null)
  const [alertMessage, setAlertMessage] = useState('')
  const [alertStatus, setAlertStatus] = useState('')
  const [alerts, setAlerts] = useState([])
  const [centers, setCenters] = useState([])
  const [rescuers, setRescuers] = useState([])
  const [selectedRescuerId, setSelectedRescuerId] = useState('')
  const [selectedIncident, setSelectedIncident] = useState('')
  const [selectedSeverity, setSelectedSeverity] = useState('high')
  const [activeModal, setActiveModal] = useState(null)
  const [rescueUnits, setRescueUnits] = useState({ rescuers: [], vehicles: [] })
  const [unitSort, setUnitSort] = useState('status')
  const [modalLoading, setModalLoading] = useState(false)
  const [selectedMergeIds, setSelectedMergeIds] = useState([])
  const [verifiedAlertState, setVerifiedAlertState] = useState(null)
  const [assigningAlert, setAssigningAlert] = useState(null)
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const [mapHeight, setMapHeight] = useState(375)
  const verifiedAlert = verifiedAlertState
  const setVerifiedAlert = (alert) => setVerifiedAlertState((current) => current?.id === alert?.id ? null : alert)
  const { isConnected, lastMessage } = useWebSocket(`${WS_BASE_URL}/api/v1/ws`)

  useEffect(() => {
    const clock = window.setInterval(() => setCurrentTime(new Date()), 1000)
    return () => window.clearInterval(clock)
  }, [])

  const openModal = async (modal) => {
    setActiveModal(modal)
    setModalLoading(true)
    try {
      if (modal === 'alerts') {
        const response = await fetch(`${API_BASE_URL}/api/v1/auth/alerts`)
        if (response.ok) setAlerts(await response.json())
      }
      if (modal === 'units') {
        const response = await fetch(`${API_BASE_URL}/api/v1/auth/rescue-units`)
        if (response.ok) setRescueUnits(await response.json())
      }
    } catch (error) {
      console.error(`Failed to load ${modal}`, error)
    } finally {
      setModalLoading(false)
    }
  }

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

    if (lastMessage?.type === 'alert_created' && lastMessage.data) {
      setAlerts((currentAlerts) => [lastMessage.data, ...currentAlerts.filter((alert) => alert.id !== lastMessage.data.id)])
    }

    if (lastMessage?.type === 'alert_updated' && lastMessage.data) {
      setAlerts((currentAlerts) => currentAlerts.map((alert) => alert.id === lastMessage.data.id ? lastMessage.data : alert))
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

    const loadRescueUnits = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/auth/rescue-units`)
        if (response.ok) setRescueUnits(await response.json())
      } catch (error) {
        console.error('Failed to load rescue units', error)
      }
    }

    const loadCenters = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/shelters/?limit=100`)
        if (response.ok) setCenters(await response.json())
      } catch (error) {
        console.error('Failed to load evacuation centers', error)
      }
    }

    loadAlerts()
    loadRescuers()
    loadRescueUnits()
    loadCenters()
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
          disaster_type: selectedIncident || 'other',
          severity: selectedSeverity,
          message: alertMessage || ''
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

  const handleAssignAlert = async (alertId, rescuerSelection = selectedRescuerId) => {
    if (!rescuerSelection) {
      const alert = alerts.find((entry) => entry.id === alertId)
      if (alert) setAssigningAlert(alert)
      return
    }

    try {
      const rescuer = rescuers.find((entry) => entry.id === Number(rescuerSelection))
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

  const openAssignmentModal = (alert) => {
    setSelectedRescuerId('')
    setAssigningAlert(alert)
  }

  useEffect(() => {
    if (assigningAlert && selectedRescuerId) {
      handleAssignAlert(assigningAlert.id, selectedRescuerId)
      setAssigningAlert(null)
    }
  }, [assigningAlert, selectedRescuerId])

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
      const units = await fetch(`${API_BASE_URL}/api/v1/auth/rescue-units`)
      if (units.ok) setRescueUnits(await units.json())
      setAlertStatus('Assignment acknowledged. You are now in transit.')
    } catch (error) {
      setAlertStatus(error.message)
    }
  }

  const toggleMergeAlert = (alertId) => {
    setSelectedMergeIds((currentIds) => currentIds.includes(alertId)
      ? currentIds.filter((id) => id !== alertId)
      : [...currentIds, alertId])
  }

  const handleMergeAlerts = async () => {
    if (selectedMergeIds.length < 2) return
    const duplicateIds = selectedMergeIds.slice(1)
    try {
      await Promise.all(duplicateIds.map((alertId) => fetch(`${API_BASE_URL}/api/v1/auth/alerts/${alertId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'closed' })
      })))
      setSelectedMergeIds([])
      const refreshed = await fetch(`${API_BASE_URL}/api/v1/auth/alerts`)
      if (refreshed.ok) setAlerts(await refreshed.json())
      setAlertStatus(`Merged ${duplicateIds.length} duplicate alert${duplicateIds.length === 1 ? '' : 's'}.`)
    } catch (error) {
      setAlertStatus('Unable to merge selected alerts.')
    }
  }

  const centerMarkers = centers.filter((center) => center.is_active !== false).map((center) => {
    const occupancy = center.capacity > 0 ? Math.round((center.current_occupancy / center.capacity) * 100) : 0
    return {
      position: [center.longitude, center.latitude],
      label: `${center.name} · ${occupancy}% occupied`,
      color: occupancy >= 90 ? '#dc2626' : occupancy >= 75 ? '#f59e0b' : '#00d6a0',
      icon: '⌂'
    }
  })

  const alertMarkers = alerts.map((alert) => ({
    position: [alert.longitude, alert.latitude],
    label: `${alert.sender_name} · ${statusLabel(alert.status)}`,
    color: alertMarkerColors[alert.status] || '#dc2626',
    icon: '⚠'
  }))

  const rescuerMarkers = rescueUnits.rescuers.filter((rescuer) => rescuer.current_latitude !== null && rescuer.current_longitude !== null).map((rescuer) => ({
    position: [rescuer.current_longitude, rescuer.current_latitude],
    label: `${rescuer.full_name || rescuer.username} · ${statusLabel(rescuer.status)}`,
    color: rescuerMarkerColors[rescuer.status] || '#00d6a0',
    icon: '♟'
  }))

  const vehicleMarkers = rescueUnits.vehicles.filter((vehicle) => vehicle.current_location_lat !== null && vehicle.current_location_lng !== null).map((vehicle) => ({
    position: [vehicle.current_location_lng, vehicle.current_location_lat],
    label: `${vehicle.vehicle_type} ${vehicle.plate_number} · ${statusLabel(vehicle.status)}`,
    color: vehicleMarkerColors[vehicle.status] || '#64748b',
    icon: '▣'
  }))

  const mapMarkers = [...centerMarkers, ...alertMarkers, ...rescuerMarkers, ...vehicleMarkers]
  const primaryCenter = centers.find((center) => center.is_active !== false) || centers[0]
  const primaryOccupancy = primaryCenter?.capacity > 0 ? Math.round((primaryCenter.current_occupancy / primaryCenter.capacity) * 100) : 0

  const displayName = auth?.user?.full_name || auth?.user?.username || 'Cmdr. Reyes'
  const visibleAlerts = role === 'rescuer' ? alerts.filter((alert) => alert.assigned_rescuer_id === rescuerId) : alerts
  const alertCount = alerts.length
  const [isDark, setIsDark] = useState(() => localStorage.getItem('resq-theme') !== 'light')
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)

  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light'
    localStorage.setItem('resq-theme', isDark ? 'dark' : 'light')
  }, [isDark])

  const formatTime = (value) => value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '14:32'
  const formattedCurrentTime = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(currentTime)

  const handleMapResize = (clientY, mapTop) => {
    const nextHeight = Math.min(720, Math.max(280, clientY - mapTop))
    setMapHeight(nextHeight)
  }

  const startMapResize = (event) => {
    event.preventDefault()
    const mapTop = event.currentTarget.parentElement.getBoundingClientRect().top
    const handleMouseMove = (moveEvent) => handleMapResize(moveEvent.clientY, mapTop)
    const stopResize = () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', stopResize)
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', stopResize)
  }
  const sortedRescuers = [...rescueUnits.rescuers].sort((first, second) => {
    if (unitSort === 'name') return (first.full_name || first.username || '').localeCompare(second.full_name || second.username || '')
    return (first.status || '').localeCompare(second.status || '')
  })
  const rankedAssignmentRescuers = assigningAlert
    ? [...rescueUnits.rescuers].sort((first, second) => {
      const firstAvailable = first.status === 'available' ? 0 : 1
      const secondAvailable = second.status === 'available' ? 0 : 1
      if (firstAvailable !== secondAvailable) return firstAvailable - secondAvailable
      const firstDistance = distanceBetween(assigningAlert.latitude, assigningAlert.longitude, first.current_latitude, first.current_longitude) ?? Number.POSITIVE_INFINITY
      const secondDistance = distanceBetween(assigningAlert.latitude, assigningAlert.longitude, second.current_latitude, second.current_longitude) ?? Number.POSITIVE_INFINITY
      return firstDistance - secondDistance
    })
    : []
  const sortedVehicles = [...rescueUnits.vehicles].sort((first, second) => {
    if (unitSort === 'type') return (first.vehicle_type || '').localeCompare(second.vehicle_type || '')
    if (unitSort === 'name') return (first.driver_name || '').localeCompare(second.driver_name || '')
    return (first.status || '').localeCompare(second.status || '')
  })
  const handleLogout = () => {
    localStorage.removeItem('auth')
    window.location.href = '/login'
  }

  const accountMenu = <div className="account-menu"><button className="operator operator-trigger" onClick={() => setAccountMenuOpen((value) => !value)} aria-expanded={accountMenuOpen} aria-haspopup="menu"><span className="operator-avatar">♟</span><span><b>{displayName}</b><small>{role.toUpperCase()}</small></span></button>{accountMenuOpen && <div className="account-dropdown" role="menu"><button onClick={handleLogout} role="menuitem">Logout</button></div>}</div>

  if (role === 'citizen') {
    return (
      <main className="citizen-console">
        <header className="citizen-header"><div className="brand-lockup"><Logo size="small" /><div><strong>RESQ-ROUTE</strong><span>CITIZEN SAFETY NETWORK</span></div></div><div className="header-actions"><span className={`connection ${isConnected ? 'online' : 'offline'}`}><i /> {isConnected ? 'Connected' : 'Reconnecting'}</span><button className="icon-button" onClick={() => setIsDark((value) => !value)} aria-label="Toggle light and dark mode">{isDark ? '☼' : '☾'}</button>{accountMenu}</div></header>
        <section className="citizen-hero"><div><span className="eyebrow">CITIZEN EMERGENCY CHANNEL</span><h1>Get help when every second counts.</h1><p>Your alert shares your current location with the response team so dispatchers can coordinate assistance.</p></div><div className={`signal-card ${isConnected ? 'signal-live' : ''}`}><i /><b>{isConnected ? 'RESPONSE NETWORK ONLINE' : 'CONNECTING TO RESPONSE NETWORK'}</b><small>Last checked just now</small></div></section>
        <section className="citizen-grid"><div className="alert-composer"><div className="panel-title"><h2>SEND EMERGENCY ALERT</h2><span>PRIORITY CHANNEL</span></div><div className="composer-body"><label>Choose what is happening</label><div className="quick-alerts">{[['flood', '⌁', 'Stranded by flood'], ['earthquake', '⌂', 'Stranded by earthquake'], ['fire', '♨', 'Fire'], ['medical', '+', 'Medical emergency'], ['trapped', '!', 'Trapped / rescue']].map(([value, icon, label]) => <button className={`quick-alert ${value} ${selectedIncident === value ? 'selected' : ''}`} key={value} onClick={() => setSelectedIncident(value)}><span>{icon}</span>{label}</button>)}</div><label>How serious is it?</label><div className="severity-options">{['low', 'medium', 'high', 'critical'].map((severity) => <button className={`severity-option ${severity} ${selectedSeverity === severity ? 'selected' : ''}`} key={severity} onClick={() => setSelectedSeverity(severity)}>{severity}</button>)}</div><label htmlFor="citizen-alert-message">Additional details <small>(optional)</small></label><textarea id="citizen-alert-message" value={alertMessage} onChange={(event) => setAlertMessage(event.target.value)} placeholder="Add injuries, landmarks, or other details if useful" /><div className="location-confirm"><span>⌖</span><div><b>Location attached</b><small>{latestGps ? `${latestGps.latitude.toFixed(5)}° N, ${latestGps.longitude.toFixed(5)}° E` : 'Waiting for device location...'}</small></div><i /></div><button className="emergency-button" onClick={handleSendEmergencyAlert}>SEND ALERT TO DISPATCH</button>{alertStatus && <p className="alert-status">{alertStatus}</p>}</div></div><div className="citizen-side"><div className="citizen-card"><span className="card-kicker">YOUR SAFETY STATUS</span><strong>Ready to respond</strong><p>Keep this page open after sending an alert. Dispatchers may use it to share updates.</p><div className="status-line"><i className="status-dot green" /> GPS telemetry active</div><div className="status-line"><i className={`status-dot ${isConnected ? 'green' : 'red'}`} /> Dispatch connection {isConnected ? 'stable' : 'offline'}</div></div><div className="citizen-card quiet-card"><span className="card-kicker">EMERGENCY TIP</span><strong>Move to a safe, visible area</strong><p>Stay away from floodwater, live wires, and unstable structures. Signal responders if it is safe to do so.</p></div></div></section>
      </main>
    )
  }

  if (role === 'rescuer') {
    return (
      <main className="rescuer-console">
        <header className="rescuer-header"><div className="brand-lockup"><Logo size="small" /><div><strong>RESQ-ROUTE</strong><span>RESCUE FIELD OPERATIONS</span></div></div><div className="header-actions"><span className={`connection ${isConnected ? 'online' : 'offline'}`}><i /> {isConnected ? 'Connected' : 'Reconnecting'}</span><span className="header-time">{formattedCurrentTime} PHT</span>{accountMenu}</div></header>
        <section className="rescuer-content"><div className="rescuer-heading"><span className="eyebrow">FIELD UNIT · {displayName.toUpperCase()}</span><h1>Assignment queue</h1><p>Acknowledge a dispatch to confirm that you are moving to the incident.</p></div>{visibleAlerts.length === 0 ? <div className="rescuer-empty">No assignments are waiting.</div> : <div className="rescuer-assignment-grid">{visibleAlerts.map((alert) => <article className="rescuer-assignment" key={alert.id}><div className="rescuer-assignment-top"><span className="rescuer-signal">{disasterIcons[alert.disaster_type] || disasterIcons.other}</span><div><span className="card-kicker">NEW ASSIGNMENT · #{alert.id}</span><h2>{(alert.severity || 'high').toUpperCase()}</h2></div><span className="rescuer-status">{(alert.status || 'assigned').replace('_', ' ').toUpperCase()}</span></div><div className="rescuer-assignment-body"><div><small>LOCATION</small><strong>{alert.latitude?.toFixed?.(5) || 'Unknown'}, {alert.longitude?.toFixed?.(5) || 'Unknown'}</strong></div><div><small>INCIDENT</small><strong>{disasterLabels[alert.disaster_type] || 'Emergency'} · {alert.sender_name}</strong></div><div><small>INSTRUCTIONS</small><p>{alert.message || 'Proceed to the incident location and assess the situation.'}</p></div></div>{alert.status === 'assigned' ? <button className="rescuer-acknowledge" onClick={() => handleAcknowledgeAssignment(alert.id)}>ACKNOWLEDGE ASSIGNMENT</button> : <div className="rescuer-confirmed">ASSIGNMENT ACKNOWLEDGED · IN TRANSIT</div>}</article>)}</div>}{alertStatus && <p className="alert-status">{alertStatus}</p>}</section>
      </main>
    )
  }

  if (role !== 'dispatcher') {
    return <main className="restricted-console"><Logo size="small" /><h1>Dispatcher access required</h1><p>This operations console is available only to dispatcher accounts.</p><button className="emergency-button" onClick={handleLogout}>RETURN TO LOGIN</button></main>
  }

  return (
    <main className="ops-console">
      <header className="ops-header">
        <div className="brand-lockup"><Logo size="small" /><div><strong>RESQ-ROUTE</strong><span>CDRRMO LIVE OPERATIONS CENTER</span></div></div>
        <div className="header-actions"><span className={`connection ${isConnected ? 'online' : 'offline'}`}><i /> WebSocket: {isConnected ? 'Connected' : 'Reconnecting'}</span><span className="header-time">{formattedCurrentTime} PHT</span><button className="icon-button" onClick={() => setIsDark((value) => !value)} aria-label="Toggle light and dark mode">{isDark ? '☼' : '☾'}</button>{accountMenu}</div>
      </header>
      <div className="incident-ticker"><b>CITIZEN HAZARD STREAM</b><span>[14:31] Sector 2: Fallen heavy billboard blocking flood artery road</span><span>[14:28] Sector 5: Deep flood level, exceeding 1.5m at Melchor Crossing</span><span>[14:25] Sector 1: Downed power line reported</span></div>

      <section className="ops-grid">
        <aside className="feed-panel"><PanelTitle title="LIVE SOS FEED" badge="LIVE" onClick={() => openModal('alerts')} /><div className="feed-list">{alerts.slice(0, 5).map((alert) => { const disasterType = alert.disaster_type || 'other'; const severity = alert.severity || 'high'; return <article className="sos-item" key={alert.id}><div className="sos-meta"><span className={`severity ${severity}`}>{severity.toUpperCase()}</span><time>{formatTime(alert.created_at)} ago</time></div><div className="sos-person"><span className={`sos-icon disaster-${disasterType}`}>{disasterIcons[disasterType] || disasterIcons.other}</span><div><b>{alert.sender_name}</b><small>{disasterLabels[disasterType] || 'Other'} · {statusLabel(alert.status)}{alert.message ? ` · ${alert.message}` : ''}</small></div></div><div className="coordinates">{alert.latitude?.toFixed?.(5) || 'Unknown'}° N, {alert.longitude?.toFixed?.(5) || 'Unknown'}° E</div><div className="sos-actions"><button onClick={() => handleAssignAlert(alert.id)}>ASSIGN</button><button>VERIFY</button><button>MERGE</button></div></article>})}</div></aside>

        <section className="map-panel"><PanelTitle title="CDRRMO TACTICAL MAP AREA" badge="TRACKING MAP" /><div className="map-stage" style={{ height: `${mapHeight}px` }}><DraggableMapOverlay className="map-coordinate" label="Map center coordinates" defaultPosition={{ left: 12, top: 12 }}>{primaryCenter ? <>CENTER: {Number(primaryCenter.latitude).toFixed(5)}° N<br />LONG: {Number(primaryCenter.longitude).toFixed(5)}° E</> : 'CENTER: NO ACTIVE CENTER'}</DraggableMapOverlay><DraggableMapOverlay className="map-legend" label="Map legend" defaultPosition={{ right: 12, top: 12 }}><span><i className="dot red" /> PENDING / CLOSED ALERT</span><span><i className="dot amber" /> ASSIGNED / RECOVERING</span><span><i className="dot green" /> AVAILABLE / CENTER</span><span><i className="dot blue" /> RESOLVING / IN TRANSIT</span></DraggableMapOverlay><MapContainer markers={mapMarkers} />{primaryCenter && <DraggableMapOverlay className="evac-label" label="Evacuation center status" defaultPosition={{ left: 580, top: 164 }}>♧ {primaryCenter.name} ({primaryOccupancy}%)<b /></DraggableMapOverlay>}<DraggableMapOverlay className="map-scale" label="Map scale" defaultPosition={{ left: 12, top: 340 }}>SCALE: 1:25,000</DraggableMapOverlay><DraggableMapOverlay className="map-live" label="Live radar feed status" defaultPosition={{ left: 600, top: 340 }}>LIVE RADAR FEED [WSS_003]</DraggableMapOverlay><button className="map-resize-handle" onMouseDown={startMapResize} aria-label="Drag to resize map" title="Drag to resize map">↕</button></div></section>

        <aside className="right-rail"><section className="metric-card response-card"><small>AVG RESPONSE</small><strong>8.2 min</strong><span>Below target (10m)</span></section><section className="rail-section"><div className="unit-panel-heading"><PanelTitle title="ACTIVE RESCUE UNITS" badge={`${rescueUnits.rescuers.length + rescueUnits.vehicles.length} FOUND`} onClick={() => openModal('units')} /><select value={unitSort} onChange={(event) => setUnitSort(event.target.value)} aria-label="Sort rescue units"><option value="status">Sort: Status</option><option value="name">Sort: Name</option><option value="type">Sort: Type</option></select></div><div className="unit-list-label">RESCUER PROFILES</div>{sortedRescuers.length === 0 ? <p className="unit-empty">No rescuer profiles</p> : sortedRescuers.map((rescuer) => <Unit key={`rescuer-${rescuer.id}`} name={rescuer.full_name || rescuer.username} detail={`${rescuer.station_name || 'No station'} · @${rescuer.username}`} status={rescuer.status} />)}<div className="unit-list-label">VEHICLES</div>{sortedVehicles.length === 0 ? <p className="unit-empty">No vehicles</p> : sortedVehicles.map((vehicle) => <Unit key={`vehicle-${vehicle.id}`} name={`${vehicle.vehicle_type} · ${vehicle.plate_number}`} detail={`${vehicle.driver_name} · capacity ${vehicle.capacity}`} status={vehicle.status} />)}</section><section className="rail-section operational"><PanelTitle title="OPERATIONAL METRICS" /><Metric label="ACTIVE SOS" value={alertCount} note="+4 in last 10m" color="red" /><Metric label="DISPATCHED" value={`${rescueUnits.dispatched_count || 0} / ${rescueUnits.rescuer_count || 0}`} note="Rescuer profiles in transit" color="red" /><Metric label="RESCUED TODAY" value={rescueUnits.closed_alert_count || 0} note="Closed emergency alerts" color="green" /></section></aside>
      </section>
      <section className="alert-console"><PanelTitle title="ACTIVE ALERTS" badge={`${visibleAlerts.length} OPEN`} />{visibleAlerts.length === 0 ? <p>No active alerts.</p> : visibleAlerts.map((alert) => <div className="alert-row" key={alert.id}><b>{alert.sender_name}</b><span>{alert.message}</span><em>{alert.status}</em><><select value={selectedRescuerId} onChange={(event) => setSelectedRescuerId(event.target.value)}><option value="">Select rescuer</option>{rescuers.map((rescuer) => <option key={rescuer.id} value={rescuer.id}>{rescuer.display_name || rescuer.full_name || rescuer.username}</option>)}</select><button onClick={() => handleAssignAlert(alert.id)}>ASSIGN</button></></div>)}</section>
      {activeModal && <div className="modal-backdrop" onClick={() => setActiveModal(null)}><section className="ops-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><div className="modal-header"><PanelTitle title={activeModal === 'alerts' ? 'ALL EMERGENCY ALERTS' : 'ACTIVE RESCUE UNITS'} badge="LIVE DATA" /><button className="modal-close" onClick={() => setActiveModal(null)} aria-label="Close modal">×</button></div>{modalLoading ? <p className="modal-empty">Loading live data...</p> : activeModal === 'alerts' ? <div className="modal-alert-list">{alerts.length === 0 ? <p className="modal-empty">No emergency alerts found.</p> : alerts.map((alert) => { const disasterType = alert.disaster_type || 'other'; return <div className="modal-alert" key={alert.id}><input type="checkbox" checked={selectedMergeIds.includes(alert.id)} onChange={() => toggleMergeAlert(alert.id)} aria-label={`Select alert ${alert.id} for merge`} /><span className={`sos-icon disaster-${disasterType}`}>{disasterIcons[disasterType] || disasterIcons.other}</span><div><b>{disasterLabels[disasterType] || 'Other'} · {(alert.severity || 'high').toUpperCase()}</b><small>{alert.sender_name} · {alert.message || 'No additional message'}</small></div><em>{alert.status}</em><div className="modal-alert-actions"><select value={selectedRescuerId} onChange={(event) => setSelectedRescuerId(event.target.value)} aria-label="Select rescuer"><option value="">Assign...</option>{rescuers.map((rescuer) => <option key={rescuer.id} value={rescuer.id}>{rescuer.display_name || rescuer.full_name || rescuer.username}</option>)}</select><button onClick={() => handleAssignAlert(alert.id)}>Assign</button><button onClick={() => setVerifiedAlert(alert)}>Verify</button></div>{verifiedAlert?.id === alert.id && <div className="verified-alert"><b>ALERT DETAILS</b><span>{alert.latitude}, {alert.longitude} · {formatTime(alert.created_at)}</span><small>{alert.message || 'No additional message provided.'}</small></div>}</div> })}<div className="merge-toolbar"><span>{selectedMergeIds.length} selected</span><button disabled={selectedMergeIds.length < 2} onClick={handleMergeAlerts}>Merge selected as duplicates</button></div></div> : <div className="modal-unit-grid"><div><h3>RESCUER PROFILES</h3>{rescueUnits.rescuers.length === 0 ? <p className="modal-empty">No rescuer profiles found.</p> : rescueUnits.rescuers.map((rescuer) => <div className="modal-unit" key={rescuer.id}><b>Profile #{rescuer.id}</b><span>{rescuer.status.replace('_', ' ')}</span><small>{rescuer.station_name || 'Unassigned station'}</small></div>)}</div><div><h3>VEHICLES</h3>{rescueUnits.vehicles.length === 0 ? <p className="modal-empty">No vehicles found.</p> : rescueUnits.vehicles.map((vehicle) => <div className="modal-unit" key={vehicle.id}><b>{vehicle.vehicle_type}</b><span>{vehicle.status}</span><small>{vehicle.plate_number} · {vehicle.driver_name}</small></div>)}</div></div>}</section></div>}
      {assigningAlert && <div className="modal-backdrop" onClick={() => setAssigningAlert(null)}><section className="ops-modal assignment-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><div className="modal-header"><PanelTitle title="ASSIGN RESCUER" badge={`ALERT #${assigningAlert.id}`} /><button className="modal-close" onClick={() => setAssigningAlert(null)} aria-label="Close assignment modal">×</button></div><div className="assignment-body"><p>Nearest available rescuers for <b>{assigningAlert.sender_name}</b>.</p>{rankedAssignmentRescuers.length === 0 ? <p className="modal-empty">No rescuer profiles found.</p> : rankedAssignmentRescuers.map((rescuer) => { const distance = distanceBetween(assigningAlert.latitude, assigningAlert.longitude, rescuer.current_latitude, rescuer.current_longitude); return <button className="rescuer-choice" key={rescuer.id} onClick={() => { setSelectedRescuerId(String(rescuer.user_id)); handleAssignAlert(assigningAlert.id); setAssigningAlert(null) }}><span><b>{rescuer.full_name || rescuer.username}</b><small>@{rescuer.username} · {rescuer.station_name || 'Unassigned station'}</small></span><em>{distance === null ? 'Distance unavailable' : `${distance.toFixed(1)} km away`} · {rescuer.status.replace('_', ' ')}</em></button> })}</div></section></div>}
    </main>
  )
}

const DraggableMapOverlay = ({ className, label, defaultPosition, children }) => {
  const [position, setPosition] = useState(defaultPosition)
  const dragRef = React.useRef(null)

  const moveOverlay = (clientX, clientY) => {
    const mapBounds = dragRef.current?.parentElement?.getBoundingClientRect()
    if (!mapBounds) return
    const overlayBounds = dragRef.current.getBoundingClientRect()
    const left = Math.max(0, Math.min(mapBounds.width - overlayBounds.width, clientX - mapBounds.left))
    const top = Math.max(0, Math.min(mapBounds.height - overlayBounds.height, clientY - mapBounds.top))
    setPosition({ left, top })
  }

  const handlePointerDown = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    const move = (moveEvent) => moveOverlay(moveEvent.clientX, moveEvent.clientY)
    const stop = () => {
      event.currentTarget.removeEventListener('pointermove', move)
      event.currentTarget.removeEventListener('pointerup', stop)
    }
    event.currentTarget.addEventListener('pointermove', move)
    event.currentTarget.addEventListener('pointerup', stop)
  }

  const handleKeyDown = (event) => {
    const distance = event.shiftKey ? 20 : 5
    const nextPosition = { ...position }
    if (event.key === 'ArrowLeft') nextPosition.left -= distance
    if (event.key === 'ArrowRight') nextPosition.left += distance
    if (event.key === 'ArrowUp') nextPosition.top -= distance
    if (event.key === 'ArrowDown') nextPosition.top += distance
    if (nextPosition.left !== position.left || nextPosition.top !== position.top) {
      event.preventDefault()
      setPosition({ left: Math.max(0, nextPosition.left), top: Math.max(0, nextPosition.top) })
    }
  }

  return <div ref={dragRef} className={`map-overlay-draggable ${className}`} style={{ left: position.left, top: position.top, right: 'auto', bottom: 'auto' }} onPointerDown={handlePointerDown} onKeyDown={handleKeyDown} role="group" tabIndex="0" aria-label={`${label}. Use arrow keys to move.`}>{children}</div>
}

const PanelTitle = ({ title, badge, onClick }) => <div className={`panel-title ${onClick ? 'panel-title-clickable' : ''}`} onClick={onClick} onKeyDown={(event) => event.key === 'Enter' && onClick?.()} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}><h2>{title}</h2>{badge && <span>{badge}</span>}</div>
const Unit = ({ name, detail, status }) => <div className="unit-row"><div><b>{name}</b><small>{detail}</small></div><span className={`unit-status ${String(status || '').toLowerCase().replace(/_/g, '-')}`}>{statusLabel(status)}</span></div>
const Metric = ({ label, value, note, color }) => <div className="rail-metric"><small>{label}</small><strong className={color}>{value}</strong><span>{note}</span></div>

export default Dashboard