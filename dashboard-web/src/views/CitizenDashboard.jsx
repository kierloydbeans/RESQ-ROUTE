import React, { useEffect, useState } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import MapContainer from '../components/MapContainer'
import Logo from '../components/Logo'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../theme.css'

const Icons = {
  Sun: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  ),
  Moon: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  ),
  Water: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
    </svg>
  ),
  MedicalBag: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  ),
  Power: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
      <line x1="12" y1="2" x2="12" y2="12" />
    </svg>
  ),
  Pet: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="4" r="2" />
      <circle cx="18" cy="8" r="2" />
      <circle cx="4" cy="8" r="2" />
      <path d="M12 10c-3 0-5 2.5-5 5.5 0 2 1.5 3.5 5 3.5s5-1.5 5-3.5c0-3-2-5.5-5-5.5z" />
    </svg>
  ),
  Accessible: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="4" r="2" />
      <path d="M10 8h4l2 6h-3l-1.5 4" />
      <circle cx="9" cy="18" r="3" />
    </svg>
  ),
  TrendUp: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  ),
  ImageIcon: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  ),
  Shelter: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10l9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10z" />
      <path d="M9 21V12h6v9" />
    </svg>
  ),
  Alert: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  Directions: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3 11 22 2 13 21 11 13 3 11" />
    </svg>
  ),
  Save: ({ saved }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  ),
  Share: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  ),
  Back: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  ),
  Close: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  Search: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#70757a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  Pin: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
  Users: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Globe: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  Phone: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  ),
  Flood: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
    </svg>
  ),
  Camera: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  ),
  WifiOff: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
      <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
      <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
      <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  ),
  Fire: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  ),
  Medical: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  Rescue: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
      <line x1="4.93" y1="4.93" x2="9.17" y2="9.17" />
      <line x1="14.83" y1="14.83" x2="19.07" y2="19.07" />
    </svg>
  ),
  Quake: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2 12 5 12 8 5 12 19 16 12 19 12 22 12" />
    </svg>
  )
}

const rawApiBase = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'https://resq-route.onrender.com').replace(/\/$/, '')
const API_BASE_URL = rawApiBase.endsWith('/api/v1') ? rawApiBase.replace(/\/api\/v1$/, '') : rawApiBase
const WS_BASE_URL = API_BASE_URL.replace(/^http/, 'ws')

export const CitizenDashboard = ({ auth, onLogout }) => {
  const [latestGps, setLatestGps] = useState(null)
  const [centers, setCenters] = useState([])
  const [roadHazards, setRoadHazards] = useState([])
  const [selectedCenter, setSelectedCenter] = useState(null)
  const [evacuationRoute, setEvacuationRoute] = useState(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeInfo, setRouteInfo] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState('shelters')
  const [savedShelterIds, setSavedShelterIds] = useState([])
  const [copyFeedback, setCopyFeedback] = useState('')

  const [pinnedLocation, setPinnedLocation] = useState(null)

  const [selectedIncident, setSelectedIncident] = useState('flood')
  const [selectedSeverity, setSelectedSeverity] = useState('high')
  const [alertMessage, setAlertMessage] = useState('')
  const [alertStatus, setAlertStatus] = useState('')

  const [peopleAffected, setPeopleAffected] = useState(3)

  const [isDark, setIsDark] = useState(() => localStorage.getItem('resq-theme') === 'dark')

  const { isConnected } = useWebSocket(`${WS_BASE_URL}/api/v1/ws`)
  const displayName = auth?.user?.full_name || auth?.user?.username || 'Resident'
  const [currentTime, setCurrentTime] = useState(() => new Date())

  useEffect(() => {
    const clockInterval = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(clockInterval)
  }, [])

  const handleMapClick = (coords) => {
    setPinnedLocation(coords)
    if (activeTab === 'alert') {
      setAlertStatus(`Pinned location: ${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`)
    }
  }

  const formattedPhtTime = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(currentTime)

  const alternativeCenter = centers.find((c) => c.id !== selectedCenter?.id && c.is_active !== false) || null

  useEffect(() => {
    if (!('geolocation' in navigator)) return
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setLatestGps({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light'
    localStorage.setItem('resq-theme', isDark ? 'dark' : 'light')
  }, [isDark])

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/v1/shelters/?limit=100`)
      .then((res) => res.ok && res.json())
      .then((data) => {
        if (data?.length) setCenters(data)
      })
      .catch(() => {})

    fetch(`${API_BASE_URL}/api/v1/road-hazards/?limit=100`)
      .then((res) => res.ok && res.json())
      .then((data) => data && setRoadHazards(data))
      .catch(() => {})
  }, [])

  const handleRouteToCenter = async (center) => {
    const originLocation = pinnedLocation || latestGps
    if (!originLocation) {
      setAlertStatus('Location required. Please enable GPS or pin a location on the map.')
      return
    }
    setRouteLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/routing/walk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin_latitude: originLocation.latitude,
          origin_longitude: originLocation.longitude,
          destination_latitude: Number(center.latitude),
          destination_longitude: Number(center.longitude)
        })
      })
      const data = await res.json()
      if (data.geometry?.coordinates) {
        setEvacuationRoute(data.geometry)
        setRouteInfo({
          distance: (data.distance_meters / 1000).toFixed(1) + ' km',
          duration: Math.round(data.duration_seconds / 60) + ' min walk'
        })
      }
    } catch {
      setEvacuationRoute({
        type: 'LineString',
        coordinates: [[originLocation.longitude, originLocation.latitude], [Number(center.longitude), Number(center.latitude)]]
      })
      setRouteInfo({ distance: 'Direct path', duration: 'Estimate' })
    } finally {
      setRouteLoading(false)
    }
  }

  const handleCloseDetail = () => {
    setSelectedCenter(null)
    setEvacuationRoute(null)
    setRouteInfo(null)
  }

  const toggleSaveShelter = (centerId) => {
    setSavedShelterIds((prev) =>
      prev.includes(centerId) ? prev.filter((id) => id !== centerId) : [...prev, centerId]
    )
  }

  const handleShare = async (center) => {
    const text = `${center.name} - ${center.address || 'Caloocan'}. Capacity: ${center.capacity || 100}`
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      setCopyFeedback('Link copied!')
      setTimeout(() => setCopyFeedback(''), 2500)
    }
  }

  const handleSendEmergencyAlert = async () => {
    const targetLocation = pinnedLocation || latestGps
    if (!targetLocation) {
      setAlertStatus('Please click on the map to pin your location or turn on GPS.')
      return
    }
    setAlertStatus('Broadcasting SOS...')
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_id: auth?.user?.id || 99,
          sender_name: displayName,
          sender_role: 'citizen',
          latitude: targetLocation.latitude,
          longitude: targetLocation.longitude,
          disaster_type: selectedIncident,
          severity: selectedSeverity,
          message: alertMessage
        })
      })
      if (!res.ok) throw new Error('Failed to dispatch alert')
      setAlertStatus('Emergency alert dispatched to CDRRMO!')
      setAlertMessage('')
      setPinnedLocation(null)
    } catch (err) {
      setAlertStatus(err.message)
    }
  }

  const centerMarkers = centers.filter((c) => c.is_active !== false).map((c) => ({
    position: [c.longitude, c.latitude],
    label: c.name,
    color: '#1a73e8',
    icon: '⌂'
  }))

  const hazardMarkers = roadHazards.filter((h) => h.is_active !== false && !h.is_resolved).map((h) => ({
    position: [h.longitude, h.latitude],
    label: `${h.road_name || 'Hazard'}`,
    color: '#d93025',
    icon: '!'
  }))

  const isSaved = selectedCenter && savedShelterIds.includes(selectedCenter.id)
  const capacity = selectedCenter?.capacity || 100
  const occupancy = selectedCenter?.current_occupancy || 0
  const remainingSpaces = Math.max(0, capacity - occupancy)
  const occupancyRate = Math.min(100, Math.round((occupancy / capacity) * 100))

  const incidentOptions = [
    { key: 'flood', label: 'Flood', Icon: Icons.Flood },
    { key: 'fire', label: 'Fire', Icon: Icons.Fire },
    { key: 'medical', label: 'Medical', Icon: Icons.Medical },
    { key: 'trapped', label: 'Rescue', Icon: Icons.Rescue },
    { key: 'earthquake', label: 'Quake', Icon: Icons.Quake }
  ]

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null
    const R = 6371
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLon = ((lon2 - lon1) * Math.PI) / 180
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return (R * c).toFixed(1)
  }

  const [filterType, setFilterType] = useState('nearest')

  const processedCenters = centers
    .filter((c) => {
      const matchesQuery =
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.address && c.address.toLowerCase().includes(searchQuery.toLowerCase()))
      if (!matchesQuery) return false
      if (filterType === 'accessible') return c.is_accessible || c.accessible
      if (filterType === 'pet') return c.pet_friendly || c.pets_allowed
      return true
    })
    .map((c) => {
      const referenceLocation = pinnedLocation || latestGps
      const dist = referenceLocation
        ? parseFloat(calculateDistance(referenceLocation.latitude, referenceLocation.longitude, Number(c.latitude), Number(c.longitude)))
        : null
      const cap = c.capacity || 100
      const occ = c.current_occupancy || 0
      const openSlots = Math.max(0, cap - occ)
      const occPct = Math.min(100, Math.round((occ / cap) * 100))
      return { ...c, distanceKm: dist, openSlots, occPct }
    })
    .sort((a, b) => {
      if (filterType === 'nearest') return (a.distanceKm || 999) - (b.distanceKm || 999)
      if (filterType === 'most_space') return b.openSlots - a.openSlots
      return 0
    })

  return (
    <div className="citizen-map-layout">
      {/* 1. Background Map */}
      <div className="citizen-map-canvas">
        <MapContainer
          markers={[...centerMarkers, ...hazardMarkers]}
          route={evacuationRoute}
          pinnedLocation={pinnedLocation}
          onMapClick={handleMapClick}
        />
      </div>

      {/* 2. Top Pill Filter Chips */}
      <div className="citizen-top-bar">
        <div className="citizen-chip-row">
          <button
            className={`citizen-chip ${activeTab === 'shelters' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('shelters')
              setSelectedCenter(null)
            }}
          >
            <Icons.Shelter /> Evacuation Centers
          </button>
          <button
            className={`citizen-chip alert-chip ${activeTab === 'alert' ? 'active' : ''}`}
            onClick={() => setActiveTab('alert')}
          >
            <Icons.Alert /> Report Emergency
          </button>
          <div className="citizen-network-badge">
            <span className={`dot ${isConnected ? 'online' : 'offline'}`} />
            {isConnected ? 'Live Telemetry' : 'Offline'}
          </div>
        </div>
      </div>

      {/* 3. Floating Controls (Theme Toggle & Circular Profile/Logout) */}
      <div className="citizen-top-right-controls">
        <button
          type="button"
          className="theme-toggle-btn"
          onClick={() => setIsDark((prev) => !prev)}
          title="Toggle Dark/Light Mode"
        >
          {isDark ? <Icons.Sun /> : <Icons.Moon />}
        </button>

        {onLogout && (
          <button
            type="button"
            className="citizen-profile-avatar-btn"
            onClick={onLogout}
            title={`Logged in as ${displayName} — Click to Logout`}
          >
            {displayName.charAt(0).toUpperCase()}
          </button>
        )}
      </div>

      {/* 4. Left Panel */}
      <aside className="citizen-sidebar">
        <div className="mobile-pull-handle" />
        {activeTab === 'alert' ? (
          <div className="citizen-scroll-content report-panel-padding">
            <div className="report-incident-card">
              <div className="report-header-row">
                <div>
                  <h2 className="report-header-title">Report incident</h2>
                  <p className="report-header-subtitle">Shares live coordinates directly to dispatchers.</p>
                </div>
                <button
                  type="button"
                  className="report-close-btn"
                  onClick={() => setActiveTab('shelters')}
                >
                  <Icons.Close />
                </button>
              </div>

              {pinnedLocation && (
                <div className="pinned-location-banner">
                  <span>📍 Pin set: {pinnedLocation.latitude.toFixed(4)}, {pinnedLocation.longitude.toFixed(4)}</span>
                  <button
                    type="button"
                    className="pinned-location-clear-btn"
                    onClick={() => setPinnedLocation(null)}
                  >
                    Clear
                  </button>
                </div>
              )}

              <label className="report-section-label">Incident type</label>
              <div className="report-type-grid">
                {incidentOptions.map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    className={`report-type-pill ${selectedIncident === key ? 'active' : ''}`}
                    onClick={() => setSelectedIncident(key)}
                  >
                    <Icon />
                    <span>{label}</span>
                  </button>
                ))}
              </div>

              <label className="report-section-label">Severity level</label>
              <div className="report-severity-grid">
                {[
                  { key: 'low', label: 'Low' },
                  { key: 'medium', label: 'Medium' },
                  { key: 'high', label: 'High' },
                  { key: 'critical', label: 'Critical' }
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    className={`report-severity-button ${key} ${selectedSeverity === key ? 'active' : ''}`}
                    onClick={() => setSelectedSeverity(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <label className="report-section-label">People affected</label>
              <div className="people-stepper-row">
                <button
                  type="button"
                  className="stepper-btn"
                  onClick={() => setPeopleAffected((prev) => Math.max(1, prev - 1))}
                >
                  –
                </button>
                <span className="stepper-count">{peopleAffected}</span>
                <button
                  type="button"
                  className="stepper-btn"
                  onClick={() => setPeopleAffected((prev) => prev + 1)}
                >
                  +
                </button>
              </div>

              <label className="report-section-label">Details / landmark</label>
              <textarea
                className="report-textarea"
                rows={3}
                placeholder="Mention landmarks, injuries, or stranded count..."
                value={alertMessage}
                onChange={(e) => setAlertMessage(e.target.value)}
              />

              <button type="button" className="report-attach-btn">
                <Icons.Camera />
                <span>Attach photo or video</span>
              </button>

              <button
                type="button"
                className="report-sos-submit"
                onClick={handleSendEmergencyAlert}
              >
                <Icons.Alert />
                <span>Send emergency SOS</span>
              </button>

              <div className="report-offline-banner">
                <Icons.WifiOff />
                <span>No signal? Report queues and sends automatically once connected.</span>
              </div>

              <div className="report-status-section">
                <span className="report-status-heading">Status & activity</span>
                <div className="report-status-feed">
                  <span className="report-status-dot" />
                  <span>{alertStatus || 'Ready · Tap map to drop location pin'}</span>
                </div>
              </div>
            </div>
          </div>
        ) : selectedCenter ? (
          <div className="shelter-detail-wrapper">
            <div className="detail-nav-bar">
              <button className="detail-nav-btn" onClick={handleCloseDetail} title="Back to list">
                <Icons.Back />
              </button>
              <span className="detail-nav-title">{selectedCenter.name}</span>
              <button className="detail-nav-btn" onClick={handleCloseDetail} title="Close">
                <Icons.Close />
              </button>
            </div>

            <div className="citizen-scroll-content shelter-card-padding">
              <div className="shelter-detail-card">
                <div className="shelter-hero-banner">
                  <div className="shelter-gallery-grid">
                    {[selectedCenter.image_url, selectedCenter.image_url_2, selectedCenter.image_url_3].map((imageUrl, index) => (
                        <div className="shelter-gallery-item" key={`${selectedCenter.id}-image-${index}`}>
                          {imageUrl ? <img src={imageUrl} alt={`${selectedCenter.name} view ${index + 1}`} /> : <Icons.ImageIcon />}
                        </div>
                      ))}
                    {/* <div className="shelter-gallery-item">
                      <Icons.ImageIcon />
                    </div>
                    <div className="shelter-gallery-item">
                      <Icons.ImageIcon />
                    </div> */}
                  </div>
                  <span className="shelter-hero-caption">Safe haven facility</span>
                </div>

                <div className="shelter-header-group">
                  <div className="shelter-title-row">
                    <h2 className="shelter-name-heading">{selectedCenter.name}</h2>
                    <span className={`shelter-status-pill ${selectedCenter.is_active !== false ? 'open' : 'closed'}`}>
                      {selectedCenter.is_active !== false ? 'Open' : 'Closed'}
                    </span>
                  </div>
                  <span className="shelter-updated-time">Updated 4 minutes ago</span>

                  <div className="shelter-amenities-row">
                    <span className="amenity-pill"><Icons.Water /> Water</span>
                    <span className="amenity-pill"><Icons.MedicalBag /> Medical</span>
                    <span className="amenity-pill"><Icons.Power /> Power</span>
                    <span className="amenity-pill"><Icons.Pet /> Pet ok</span>
                    <span className="amenity-pill"><Icons.Accessible /> Accessible</span>
                  </div>
                </div>

                <div className="shelter-actions-trio">
                  <button
                    type="button"
                    className="shelter-btn-pill"
                    onClick={() => handleRouteToCenter(selectedCenter)}
                    disabled={routeLoading}
                  >
                    <Icons.Directions />
                    <span>{routeLoading ? 'Calculating...' : 'Directions'}</span>
                  </button>

                  <button
                    type="button"
                    className={`shelter-btn-pill ${isSaved ? 'saved' : ''}`}
                    onClick={() => toggleSaveShelter(selectedCenter.id)}
                  >
                    <Icons.Save saved={isSaved} />
                    <span>{isSaved ? 'Saved' : 'Save'}</span>
                  </button>

                  <button
                    type="button"
                    className="shelter-btn-pill"
                    onClick={() => handleShare(selectedCenter)}
                  >
                    <Icons.Share />
                    <span>{copyFeedback || 'Share'}</span>
                  </button>
                </div>

                <div className="occupancy-metric-box">
                  <div className="occupancy-header-row">
                    <span className="occupancy-label">Occupancy</span>
                    <span className={`occupancy-status-alert ${occupancyRate >= 75 ? 'critical' : occupancyRate >= 50 ? 'warning' : 'good'}`}>
                      <Icons.TrendUp />
                      <span>{occupancyRate >= 75 ? 'Near capacity' : occupancyRate >= 50 ? 'Filling fast' : 'Slots available'}</span>
                    </span>
                  </div>

                  <div className="occupancy-count-row">
                    <strong>{occupancy} / {capacity}</strong>
                    <span className="occupancy-percentage">({occupancyRate}%)</span>
                  </div>

                  <div className="occupancy-track">
                    <div
                      className="occupancy-bar-fill"
                      style={{
                        width: `${occupancyRate}%`,
                        backgroundColor: occupancyRate >= 80 ? '#d93025' : occupancyRate >= 50 ? '#f9ab00' : '#1a73e8'
                      }}
                    />
                  </div>
                </div>

                <div className="shelter-details-grid">
                  <div className="shelter-detail-row">
                    <div className="detail-row-left">
                      <Icons.Pin />
                      <span>Address</span>
                    </div>
                    <span className="detail-row-value">{selectedCenter.address || 'Caloocan, Metro Manila'}</span>
                  </div>

                  <div className="shelter-detail-row">
                    <div className="detail-row-left">
                      <Icons.Phone />
                      <span>Emergency desk</span>
                    </div>
                    <a href="tel:0282887777" className="detail-row-value link-value">(02) 8288-7777</a>
                  </div>
                </div>

                {alternativeCenter && (
                  <div className="shelter-alternative-section">
                    <p className="shelter-alternative-heading">Near capacity — nearby alternative</p>
                    <div
                      className="alternative-shelter-card"
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setSelectedCenter(alternativeCenter)
                        handleRouteToCenter(alternativeCenter)
                      }}
                    >
                      <div className="alt-shelter-info">
                        <strong>{alternativeCenter.name}</strong>
                        <span>
                          {Math.max(0, (alternativeCenter.capacity || 100) - (alternativeCenter.current_occupancy || 0))} slots open · 1.2 km
                        </span>
                      </div>
                      <span className="alt-arrow">➔</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="shelter-search-section">
              <div className="citizen-search-box">
                <Icons.Search />
                <input
                  type="text"
                  className="citizen-search-field"
                  placeholder="Search evacuation centers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button className="citizen-clear-btn" onClick={() => setSearchQuery('')}>
                    <Icons.Close />
                  </button>
                )}
              </div>

              <div className="shelter-filter-row">
                <button
                  type="button"
                  className={`shelter-filter-pill ${filterType === 'nearest' ? 'active' : ''}`}
                  onClick={() => setFilterType('nearest')}
                >
                  Nearest
                </button>
                <button
                  type="button"
                  className={`shelter-filter-pill ${filterType === 'most_space' ? 'active' : ''}`}
                  onClick={() => setFilterType('most_space')}
                >
                  Most space
                </button>
                <button
                  type="button"
                  className={`shelter-filter-pill ${filterType === 'accessible' ? 'active' : ''}`}
                  onClick={() => setFilterType('accessible')}
                >
                  <Icons.Accessible /> Accessible
                </button>
                <button
                  type="button"
                  className={`shelter-filter-pill ${filterType === 'pet' ? 'active' : ''}`}
                  onClick={() => setFilterType('pet')}
                >
                  <Icons.Pet /> Pet ok
                </button>
              </div>
            </div>

            <div className="citizen-scroll-content">
              <div className="shelter-results-list">
                <h3 className="shelter-results-header">
                  NEARBY SAFE HAVENS ({processedCenters.length})
                </h3>

                {processedCenters.map((center) => {
                  const barColor =
                    center.occPct >= 80 ? '#d93025' : center.occPct >= 50 ? '#f9ab00' : '#059669'

                  return (
                    <div
                      key={center.id}
                      className="shelter-item-card"
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedCenter(center)}
                    >
                      <div className="shelter-item-avatar">
                        <Icons.Shelter />
                      </div>

                      <div className="shelter-item-main">
                        <div className="shelter-item-top">
                          <h4 className="shelter-item-name">{center.name}</h4>
                          <span className="shelter-item-distance">
                            {center.distanceKm !== null ? `${center.distanceKm} km` : '--'}
                          </span>
                        </div>

                        <p className="shelter-item-address">
                          {center.address || 'Caloocan, Metro Manila'}
                        </p>

                        <div className="shelter-item-bottom">
                          <div className="shelter-progress-track">
                            <div
                              className="shelter-progress-fill"
                              style={{
                                width: `${center.occPct}%`,
                                backgroundColor: barColor
                              }}
                            />
                          </div>
                          <span className="shelter-open-count" style={{ color: barColor }}>
                            {center.openSlots} open
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </aside>
    </div>
  )
}

export default CitizenDashboard