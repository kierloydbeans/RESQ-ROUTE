import React, { useEffect, useState, useRef } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import MapContainer from '../components/MapContainer'
import Logo from '../components/Logo'
import 'maplibre-gl/dist/maplibre-gl.css'


const rawApiBase = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'https://resq-route.onrender.com').replace(/\/$/, '')
const API_BASE_URL = rawApiBase.endsWith('/api/v1') ? rawApiBase.replace(/\/api\/v1$/, '') : rawApiBase
const WS_BASE_URL = API_BASE_URL.replace(/^http/, 'ws')

const statusLabel = (s) => String(s || 'unknown').replace(/_/g, ' ').toUpperCase()
const alertMarkerColors = { flood: '#3298df', earthquake: '#d18c48', fire: '#f04444', medical: '#dd5ca8', trapped: '#a56ee7', other: '#dc2626' }
const rescuerMarkerColors = { available: '#00d6a0', recovering: '#f59e0b', in_transit: '#2563eb' }
const vehicleMarkerColors = { available: '#00d6a0', in_transit: '#2563eb', maintenance: '#dc2626' }
const disasterIcons = { flood: '⌁', earthquake: '⌂', fire: '♨', medical: '+', trapped: '!', other: '•' }
const disasterLabels = { flood: 'Flood', earthquake: 'Earthquake', fire: 'Fire', medical: 'Medical', trapped: 'Rescue', other: 'Other' }

const distanceBetween = (firstLat, firstLng, secondLat, secondLng) => {
  if ([firstLat, firstLng, secondLat, secondLng].some((v) => typeof v !== 'number')) return null
  const R = 6371
  const dLat = (secondLat - firstLat) * Math.PI / 180
  const dLng = (secondLng - firstLng) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(firstLat * Math.PI / 180) * Math.cos(secondLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const DraggableMapOverlay = ({ className, label, defaultPosition, children }) => {
  const [pos, setPos] = useState(defaultPosition)
  const [minimized, setMinimized] = useState(false)
  const dragRef = useRef(null)

  const moveOverlay = (x, y) => {
    const mapBounds = dragRef.current?.parentElement?.getBoundingClientRect()
    if (!mapBounds) return
    const bounds = dragRef.current.getBoundingClientRect()
    setPos({
      left: Math.max(0, Math.min(mapBounds.width - bounds.width, x - mapBounds.left)),
      top: Math.max(0, Math.min(mapBounds.height - bounds.height, y - mapBounds.top))
    })
  }

  const handlePointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const move = (ev) => moveOverlay(ev.clientX, ev.clientY)
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  return (
    <div ref={dragRef} className={`map-overlay-draggable ${className} ${minimized ? 'minimized' : ''}`} style={{ left: pos.left ?? 'auto', top: pos.top ?? 'auto', right: pos.right ?? 'auto', bottom: pos.bottom ?? 'auto' }} onPointerDown={handlePointerDown} role="group">
      <button className="map-overlay-toggle" onPointerDown={(e) => e.stopPropagation()} onClick={() => setMinimized((v) => !v)}>{minimized ? '+' : '-'}</button>
      {!minimized && children}
    </div>
  )
}

const PanelTitle = ({ title, badge, onClick }) => (
  <div className={`panel-title ${onClick ? 'panel-title-clickable' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}>
    <h2>{title}</h2>{badge && <span>{badge}</span>}
  </div>
)
const Unit = ({ name, detail, status }) => (
  <div className="unit-row"><div><b>{name}</b><small>{detail}</small></div><span className={`unit-status ${String(status || '').toLowerCase().replace(/_/g, '-')}`}>{statusLabel(status)}</span></div>
)
const Metric = ({ label, value, note, color }) => (
  <div className="rail-metric"><small>{label}</small><strong className={color}>{value}</strong><span>{note}</span></div>
)

export const DispatcherDashboard = ({ auth, onLogout }) => {
  const [alerts, setAlerts] = useState([])
  const [centers, setCenters] = useState([])
  const [rescuers, setRescuers] = useState([])
  const [rescueUnits, setRescueUnits] = useState({ rescuers: [], vehicles: [] })
  const [roadHazards, setRoadHazards] = useState([])
  const [selectedRescuerId, setSelectedRescuerId] = useState('')
  const [unitSort, setUnitSort] = useState('status')
  const [mapHeight, setMapHeight] = useState(375)
  const [activeModal, setActiveModal] = useState(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [selectedMergeIds, setSelectedMergeIds] = useState([])
  const [assigningAlert, setAssigningAlert] = useState(null)
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const [isDark, setIsDark] = useState(() => localStorage.getItem('resq-theme') !== 'light')
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)

  const { isConnected, lastMessage } = useWebSocket(`${WS_BASE_URL}/api/v1/ws`)
  const displayName = auth?.user?.full_name || auth?.user?.username || 'Cmdr. Reyes'

  useEffect(() => {
    const clock = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(clock)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light'
    localStorage.setItem('resq-theme', isDark ? 'dark' : 'light')
  }, [isDark])

  const fetchAlerts = () => fetch(`${API_BASE_URL}/api/v1/auth/alerts`).then((r) => r.ok && r.json()).then((d) => d && setAlerts(d))

  useEffect(() => {
    fetchAlerts()
    fetch(`${API_BASE_URL}/api/v1/auth/rescuers`).then((r) => r.ok && r.json()).then((d) => d && setRescuers(d))
    fetch(`${API_BASE_URL}/api/v1/auth/rescue-units`).then((r) => r.ok && r.json()).then((d) => d && setRescueUnits(d))
    fetch(`${API_BASE_URL}/api/v1/shelters/?limit=100`).then((r) => r.ok && r.json()).then((d) => d && setCenters(d))
    fetch(`${API_BASE_URL}/api/v1/road-hazards/?limit=100`).then((r) => r.ok && r.json()).then((d) => d && setRoadHazards(d))
  }, [])

  useEffect(() => {
    if (lastMessage?.type === 'alert_created' && lastMessage.data) {
      setAlerts((curr) => [lastMessage.data, ...curr.filter((a) => a.id !== lastMessage.data.id)])
    }
    if (lastMessage?.type === 'alert_updated' && lastMessage.data) {
      setAlerts((curr) => curr.map((a) => a.id === lastMessage.data.id ? lastMessage.data : a))
    }
  }, [lastMessage])

  const handleAssignAlert = async (alertId, rescuerIdVal = selectedRescuerId) => {
    if (!rescuerIdVal) {
      const alert = alerts.find((a) => a.id === alertId)
      if (alert) setAssigningAlert(alert)
      return
    }
    const rescuer = rescuers.find((r) => r.id === Number(rescuerIdVal))
    await fetch(`${API_BASE_URL}/api/v1/auth/alerts/${alertId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'assigned',
        assigned_rescuer_id: rescuer?.id,
        assigned_rescuer_name: rescuer?.display_name || rescuer?.full_name || rescuer?.username || 'Rescuer'
      })
    })
    fetchAlerts()
  }

  const primaryCenter = centers.find((c) => c.is_active !== false) || centers[0]
  const formattedCurrentTime = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(currentTime)

  const mapMarkers = [
    ...centers.filter((c) => c.is_active !== false).map((c) => ({ position: [c.longitude, c.latitude], label: c.name, color: '#00d6a0', icon: '⌂' })),
    ...alerts.map((a) => ({ position: [a.longitude, a.latitude], label: `${a.sender_name} · ${statusLabel(a.status)}`, color: alertMarkerColors[a.disaster_type] || '#dc2626', icon: disasterIcons[a.disaster_type] || '•' })),
    ...rescueUnits.rescuers.filter((r) => r.current_latitude && r.current_longitude).map((r) => ({ position: [r.current_longitude, r.current_latitude], label: r.full_name || r.username, color: rescuerMarkerColors[r.status] || '#00d6a0', icon: '♟' })),
    ...rescueUnits.vehicles.filter((v) => v.current_location_lat && v.current_location_lng).map((v) => ({ position: [v.current_location_lng, v.current_location_lat], label: `${v.vehicle_type} ${v.plate_number}`, color: vehicleMarkerColors[v.status] || '#64748b', icon: '▣' })),
    ...roadHazards.filter((h) => h.is_active !== false && !h.is_resolved).map((h) => ({ position: [h.longitude, h.latitude], label: h.road_name, color: '#ea580c', icon: '!' }))
  ]

  return (
    <main className="ops-console">
      <header className="ops-header">
        <div className="brand-lockup"><Logo size="small" /><div><strong>RESQ-ROUTE</strong><span>CDRRMO LIVE OPERATIONS CENTER</span></div></div>
        <div className="header-actions">
          <span className={`connection ${isConnected ? 'online' : 'offline'}`}><i /> WebSocket: {isConnected ? 'Connected' : 'Reconnecting'}</span>
          <span className="header-time">{formattedCurrentTime} PHT</span>
          <button className="icon-button" onClick={() => setIsDark((v) => !v)}>{isDark ? '☼' : '☾'}</button>
          <div className="account-menu">
            <button className="operator operator-trigger" onClick={() => setAccountMenuOpen((v) => !v)}>
              <span className="operator-avatar">♟</span>
              <span><b>{displayName}</b><small>DISPATCHER</small></span>
            </button>
            {accountMenuOpen && <div className="account-dropdown"><button onClick={onLogout}>Logout</button></div>}
          </div>
        </div>
      </header>

      <div className="incident-ticker">
        <b>CITIZEN HAZARD STREAM</b>
        <span>[14:31] Sector 2: Fallen heavy billboard blocking flood artery road</span>
        <span>[14:28] Sector 5: Deep flood level, exceeding 1.5m at Melchor Crossing</span>
        <span>[14:25] Sector 1: Downed power line reported</span>
      </div>

      <section className="ops-grid">
        <aside className="feed-panel">
          <PanelTitle title="LIVE SOS FEED" badge="LIVE" onClick={() => setActiveModal('alerts')} />
          <div className="feed-list">
            {alerts.slice(0, 5).map((a) => (
              <article className="sos-item" key={a.id}>
                <div className="sos-meta"><span className={`severity ${a.severity || 'high'}`}>{(a.severity || 'high').toUpperCase()}</span></div>
                <div className="sos-person"><div><b>{a.sender_name}</b><small>{statusLabel(a.status)}{a.message ? ` · ${a.message}` : ''}</small></div></div>
                <div className="sos-actions"><button onClick={() => handleAssignAlert(a.id)}>ASSIGN</button></div>
              </article>
            ))}
          </div>
        </aside>

        <section className="map-panel">
          <PanelTitle title="CDRRMO TACTICAL MAP AREA" badge="TRACKING MAP" />
          <div className="map-stage" style={{ height: `${mapHeight}px` }}>
            <DraggableMapOverlay className="map-coordinate" label="Coordinates" defaultPosition={{ left: 12, top: 12 }}>
              {primaryCenter ? <>CENTER: {Number(primaryCenter.latitude).toFixed(4)}° N<br />LONG: {Number(primaryCenter.longitude).toFixed(4)}° E</> : 'NO CENTER'}
            </DraggableMapOverlay>
            <MapContainer markers={mapMarkers} />
          </div>
        </section>

        <aside className="right-rail">
          <section className="metric-card response-card"><small>AVG RESPONSE</small><strong>8.2 min</strong><span>Below target (10m)</span></section>
          <section className="rail-section">
            <PanelTitle title="ACTIVE RESCUE UNITS" badge={`${rescueUnits.rescuers.length + rescueUnits.vehicles.length} FOUND`} onClick={() => setActiveModal('units')} />
            <div className="unit-list-label">RESCUER PROFILES</div>
            {rescueUnits.rescuers.map((r) => <Unit key={r.id} name={r.full_name || r.username} detail={r.station_name || 'No station'} status={r.status} />)}
          </section>
          <section className="rail-section operational">
            <PanelTitle title="OPERATIONAL METRICS" />
            <Metric label="ACTIVE SOS" value={alerts.length} note="+4 in last 10m" color="red" />
            <Metric label="DISPATCHED" value={`${rescueUnits.dispatched_count || 0} / ${rescueUnits.rescuer_count || 0}`} note="In transit" color="red" />
          </section>
        </aside>
      </section>

      <section className="alert-console">
        <PanelTitle title="ACTIVE ALERTS" badge={`${alerts.length} OPEN`} />
        {alerts.map((a) => (
          <div className="alert-row" key={a.id}>
            <b>{a.sender_name}</b><span>{a.message}</span><em>{a.status}</em>
            <select value={selectedRescuerId} onChange={(e) => setSelectedRescuerId(e.target.value)}>
              <option value="">Select rescuer</option>
              {rescuers.map((r) => <option key={r.id} value={r.id}>{r.full_name || r.username}</option>)}
            </select>
            <button onClick={() => handleAssignAlert(a.id)}>ASSIGN</button>
          </div>
        ))}
      </section>
    </main>
  )
}
export default DispatcherDashboard