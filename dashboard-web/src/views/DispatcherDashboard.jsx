import React, { useEffect, useState, useRef } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import MapContainer from '../components/MapContainer'
import Logo from '../components/Logo'
import { useTheme } from '../ThemeContext'
import HazardTicker from '../components/HazardTicker'
import AssignmentModal from '../components/AssignmentModal'
import DeployedVehicles from '../components/DeployedVehicles'
import '../styles/ops-console.css'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const getStoredAuth = () => {
  try {
    return JSON.parse(localStorage.getItem('auth'))
  } catch {
    return null
  }
}

const getAuthHeaders = () => {
  const auth = getStoredAuth()
  const token = auth?.token || auth?.access_token
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }
}

const normalizeRole = (role) => String(role?.value || role || '').toLowerCase().split('.').pop()
const statusLabel = (status) => String(status || 'unknown').replace(/_/g, ' ').toUpperCase()
const parseAlertDate = (value) => {
  if (!value) return null
  const normalizedValue = typeof value === 'string' && !/(Z|[+-]\d{2}:\d{2})$/i.test(value) ? `${value}Z` : value
  const date = new Date(normalizedValue)
  return Number.isFinite(date.getTime()) ? date : null
}
const alertDateFormatter = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  day: '2-digit',
  month: 'short',
  year: 'numeric'
})
const alertTimeFormatter = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true
})
const formatTime = (value) => {
  const date = parseAlertDate(value)
  return date
    ? `${alertDateFormatter.format(date)} | ${alertTimeFormatter.format(date)}`
    : 'Time unavailable'
}
const ALERTS_PER_PAGE = 5
const alertTimestamp = (value) => parseAlertDate(value)?.getTime() ?? Number.NaN
const isUnattendedAlert = (alert, now) => {
  const status = String(alert.status?.value || alert.status || '').toLowerCase().split('.').pop()
  const createdAt = alertTimestamp(alert.created_at)
  return status === 'pending' && Number.isFinite(createdAt) && now.getTime() - createdAt >= 2 * 60 * 60 * 1000
}
const alertMarkerColors = { flood: '#3298df', earthquake: '#d18c48', fire: '#f04444', medical: '#dd5ca8', trapped: '#a56ee7', other: '#dc2626' }
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
  const [normalizedFirstLatitude, normalizedFirstLongitude, normalizedSecondLatitude, normalizedSecondLongitude] = [firstLatitude, firstLongitude, secondLatitude, secondLongitude].map(Number)
  if ([normalizedFirstLatitude, normalizedFirstLongitude, normalizedSecondLatitude, normalizedSecondLongitude].some((value) => !Number.isFinite(value))) return null
  firstLatitude = normalizedFirstLatitude
  firstLongitude = normalizedFirstLongitude
  secondLatitude = normalizedSecondLatitude
  secondLongitude = normalizedSecondLongitude
  const earthRadiusKm = 6371
  const latitudeDelta = (secondLatitude - firstLatitude) * Math.PI / 180
  const longitudeDelta = (secondLongitude - firstLongitude) * Math.PI / 180
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude * Math.PI / 180) * Math.cos(secondLatitude * Math.PI / 180) * Math.sin(longitudeDelta / 2) ** 2
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const SosFeedItem = ({ alert, now, onAssign }) => {
  const disasterType = alert.disaster_type || 'other'
  const severity = alert.severity || 'high'
  const unattended = isUnattendedAlert(alert, now)
  const sentAt = parseAlertDate(alert.created_at)

  return (
    <article className={unattended ? 'sos-item unattended-alert' : 'sos-item'}>
      <div className="sos-meta">
        <span className={`severity ${severity}`}>{severity.toUpperCase()}</span>
        {unattended && <span className="unattended-badge">UNATTENDED 2H+</span>}
        <time dateTime={sentAt?.toISOString()}>{formatTime(alert.created_at)}</time>
      </div>
      <div className="sos-person">
        <span className={`sos-icon disaster-${disasterType}`}>{disasterIcons[disasterType] || disasterIcons.other}</span>
        <div>
          <b>{alert.sender_name}</b>
          <small>{disasterLabels[disasterType] || 'Other'} · {statusLabel(alert.status)}{alert.message ? ` · ${alert.message}` : ''}</small>
        </div>
      </div>
      <div className="coordinates">{alert.latitude?.toFixed?.(5) || 'Unknown'}° N, {alert.longitude?.toFixed?.(5) || 'Unknown'}° E</div>
      <div className="sos-actions">
        <button onClick={() => onAssign(alert.id)}>ASSIGN</button>
        <button>VERIFY</button>
        <button>MERGE</button>
      </div>
    </article>
  )
}

export const Dashboard = () => {
  const auth = getStoredAuth()
  const role = normalizeRole(auth?.user?.role) || 'citizen'
  const rescuerId = auth?.user?.id
  const [latestGps, setLatestGps] = useState(null)
  const [liveRescuerLocations, setLiveRescuerLocations] = useState({})
  const [alertMessage, setAlertMessage] = useState('')
  const [alertStatus, setAlertStatus] = useState('')
  const [alertRecords, setAlertRecords] = useState([])
  const [centers, setCenters] = useState([])
  const [evacuationRecommendation, setEvacuationRecommendation] = useState(null)
  const [evacuationLoading, setEvacuationLoading] = useState(false)
  const [evacuationRoute, setEvacuationRoute] = useState(null)
  const [activeEvacuationRoute, setActiveEvacuationRoute] = useState(null)
  const [roadHazards, setRoadHazards] = useState([])
  const [routeRerouted, setRouteRerouted] = useState(false)
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
  const [feedView, setFeedView] = useState('latest')
  const [regularAlertPage, setRegularAlertPage] = useState(0)
  const [pinnedAlertPage, setPinnedAlertPage] = useState(0)
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const [mapHeight, setMapHeight] = useState(480)

  const alerts = alertRecords
  const unattendedAlerts = alerts.filter((alert) => isUnattendedAlert(alert, currentTime))
  const pinnedAlertPageCount = Math.max(1, Math.ceil(unattendedAlerts.length / ALERTS_PER_PAGE))
  const currentPinnedAlertPage = Math.min(pinnedAlertPage, pinnedAlertPageCount - 1)
  const visiblePinnedAlerts = unattendedAlerts.slice(
    currentPinnedAlertPage * ALERTS_PER_PAGE,
    (currentPinnedAlertPage + 1) * ALERTS_PER_PAGE
  )
  const regularAlertPageCount = Math.max(1, Math.ceil(alerts.length / ALERTS_PER_PAGE))
  const currentRegularAlertPage = Math.min(regularAlertPage, regularAlertPageCount - 1)
  const visibleRegularAlerts = alerts.slice(
    currentRegularAlertPage * ALERTS_PER_PAGE,
    (currentRegularAlertPage + 1) * ALERTS_PER_PAGE
  )
  const setAlerts = (nextAlerts) => setAlertRecords((currentAlerts) => (
    typeof nextAlerts === 'function' ? nextAlerts(currentAlerts) : nextAlerts
  ))

  const verifiedAlert = verifiedAlertState
  const setVerifiedAlert = (alert) => setVerifiedAlertState((current) => current?.id === alert?.id ? null : alert)
  const { socket, isConnected, lastMessage } = useWebSocket(`${WS_BASE_URL}/api/v1/ws`)

  useEffect(() => {
    const clock = window.setInterval(() => setCurrentTime(new Date()), 1000)
    return () => window.clearInterval(clock)
  }, [])

  const openModal = async (modal) => {
    setActiveModal(modal)
    setModalLoading(true)
    try {
      if (modal === 'alerts') {
        const response = await fetch(`${API_BASE_URL}/api/v1/auth/alerts`, { headers: getAuthHeaders() })
        if (response.ok) setAlerts(await response.json())
      }
      if (modal === 'units') {
        const response = await fetch(`${API_BASE_URL}/api/v1/auth/rescue-units`, { headers: getAuthHeaders() })
        if (response.ok) setRescueUnits(await response.json())
      }
    } catch (error) {
      console.error(`Failed to load ${modal}`, error)
    } finally {
      setModalLoading(false)
    }
  }

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/v1/gps`, { headers: getAuthHeaders() })
      .then((response) => response.json())
      .then((data) => {
        setLatestGps(data.gps)
        if (role !== 'citizen') {
          setLiveRescuerLocations(Object.fromEntries((data.locations || []).filter((location) => normalizeRole(location.role) === 'rescuer' && location.user_id != null).map((location) => [String(location.user_id), location])))
        }
      })
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
          timestamp: Date.now(),
          user_id: auth?.user?.id,
          role,
          display_name: auth?.user?.full_name || auth?.user?.username
        }
        setLatestGps(nextGps)

        fetch(`${API_BASE_URL}/api/v1/gps`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(nextGps)
        }).catch(() => {})
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    )

    return () => navigator.geolocation.clearWatch(watchId)
  }, [API_BASE_URL, role])

  useEffect(() => {
    if (lastMessage?.type === 'gps_update' && lastMessage.data) {
      setLatestGps(lastMessage.data)
      if (role !== 'citizen' && normalizeRole(lastMessage.data.role) === 'rescuer' && lastMessage.data.user_id != null) {
        setLiveRescuerLocations((current) => ({ ...current, [String(lastMessage.data.user_id)]: lastMessage.data }))
      }
    }

    if (lastMessage?.type === 'alert_created' && lastMessage.data) {
      setAlerts((currentAlerts) => [lastMessage.data, ...currentAlerts.filter((alert) => alert.id !== lastMessage.data.id)])
    }

    if (lastMessage?.type === 'alert_updated' && lastMessage.data) {
      setAlerts((currentAlerts) => currentAlerts.map((alert) => alert.id === lastMessage.data.id ? lastMessage.data : alert))
    }

    if (role !== 'citizen' && lastMessage?.type === 'evacuation_route_updated' && lastMessage.data) {
      setActiveEvacuationRoute(lastMessage.data)
    }
  }, [lastMessage, role])

  useEffect(() => {
    if (role !== 'citizen') return undefined
    if (!activeEvacuationRoute) return undefined

    fetch(`${API_BASE_URL}/api/v1/evacuation-route`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(activeEvacuationRoute)
    }).catch(() => {})

    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'evacuation_route_updated', data: activeEvacuationRoute }))
    }

    return undefined
  }, [activeEvacuationRoute, isConnected, role, socket])

  useEffect(() => {
    if (role === 'citizen') return undefined

    let cancelled = false
    const loadActiveRoute = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/evacuation-route`, { headers: getAuthHeaders() })
        const data = await response.json()
        if (!cancelled && response.ok && data.route) setActiveEvacuationRoute(data.route)
      } catch {}
    }

    loadActiveRoute()
    const intervalId = window.setInterval(loadActiveRoute, 3000)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [API_BASE_URL, role])

  useEffect(() => {
    const loadAlerts = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/auth/alerts`, { headers: getAuthHeaders() })
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
        const response = await fetch(`${API_BASE_URL}/api/v1/auth/rescuers`, { headers: getAuthHeaders() })
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
        const response = await fetch(`${API_BASE_URL}/api/v1/auth/rescue-units`, { headers: getAuthHeaders() })
        if (response.ok) setRescueUnits(await response.json())
      } catch (error) {
        console.error('Failed to load rescue units', error)
      }
    }

    const loadCenters = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/shelters/?limit=100`, { headers: getAuthHeaders() })
        if (response.ok) setCenters(await response.json())
      } catch (error) {
        console.error('Failed to load evacuation centers', error)
      }
    }

    const loadRoadHazards = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/road-hazards/?limit=100`, { headers: getAuthHeaders() })
        if (response.ok) setRoadHazards(await response.json())
      } catch (error) {
        console.error('Failed to load road hazards', error)
      }
    }

    loadAlerts()
    loadRescuers()
    loadRescueUnits()
    loadCenters()
    loadRoadHazards()
    const roadHazardRefresh = window.setInterval(loadRoadHazards, 60_000)
    return () => window.clearInterval(roadHazardRefresh)
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
        headers: getAuthHeaders(),
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

      if (!response.ok) throw new Error('Unable to send alert')

      setAlertStatus('Alert sent to the response team.')
      setAlertMessage('')
      const refreshed = await fetch(`${API_BASE_URL}/api/v1/auth/alerts`, { headers: getAuthHeaders() })
      if (refreshed.ok) setAlerts(await refreshed.json())
    } catch (error) {
      setAlertStatus(error.message)
    }
  }

  const handleFindEvacuationCenter = () => {
    setEvacuationLoading(true)
    setAlertStatus('')

    const findNearestCenter = (location) => {
      const candidates = centers
        .filter((center) => center.is_active !== false)
        .map((center) => {
          const capacity = Number(center.capacity) || 0
          const occupancy = Number(center.current_occupancy) || 0
          const remainingCapacity = Math.max(0, capacity - occupancy)
          const distance = distanceBetween(location.latitude, location.longitude, Number(center.latitude), Number(center.longitude))
          const supportedTypes = center.disaster_types || center.supported_disaster_types || []
          const supportsIncident = selectedIncident && (Array.isArray(supportedTypes) ? supportedTypes.includes(selectedIncident) : supportedTypes === selectedIncident)
          const score = (distance ?? Number.POSITIVE_INFINITY) + (remainingCapacity > 0 ? 0 : 10000) - (supportsIncident ? 5 : 0) - Math.min(remainingCapacity, 100) / 100
          return { ...center, capacity, occupancy, remainingCapacity, distance, supportsIncident, score }
        })
        .filter((center) => center.remainingCapacity > 0 && center.distance !== null)
        .sort((first, second) => first.score - second.score)

      const recommendation = candidates[0]
      if (!recommendation) {
        setEvacuationRecommendation(null)
        setAlertStatus('No active evacuation center with available capacity was found.')
      } else {
        const walkingMinutes = Math.max(1, Math.round((recommendation.distance / 5) * 60))
        setEvacuationRecommendation({ ...recommendation, etaMinutes: walkingMinutes })
      }
      setEvacuationLoading(false)
    }

    if (latestGps) {
      findNearestCenter(latestGps)
      return
    }

    if (!('geolocation' in navigator)) {
      setAlertStatus('Location access is unavailable on this device.')
      setEvacuationLoading(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => findNearestCenter({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => {
        setAlertStatus('Allow location access to find the nearest evacuation center.')
        setEvacuationLoading(false)
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    )
  }

  const handleRouteToCenter = async (center) => {
    if (!latestGps) {
      setAlertStatus('Waiting for your location before creating a route.')
      return
    }

    setEvacuationRecommendation(center)
    setRouteRerouted(false)
    setAlertStatus('Calculating walking route...')
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/routing/walk`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          origin_latitude: latestGps.latitude,
          origin_longitude: latestGps.longitude,
          destination_latitude: Number(center.latitude),
          destination_longitude: Number(center.longitude)
        })
      })
      if (!response.ok) throw new Error(`Routing service returned HTTP ${response.status}`)
      const data = await response.json()
      const geometry = data.geometry
      if (!geometry?.coordinates?.length) throw new Error('Routing service returned no route')
      setEvacuationRoute(geometry)
      const routeUpdate = {
        citizenId: auth?.user?.id,
        citizenName: auth?.user?.full_name || auth?.user?.username || 'Citizen',
        centerId: center.id,
        centerName: center.name,
        origin: { latitude: latestGps.latitude, longitude: latestGps.longitude },
        destination: { latitude: Number(center.latitude), longitude: Number(center.longitude) },
        geometry,
        rerouted: Boolean(data.rerouted),
        timestamp: Date.now()
      }
      setActiveEvacuationRoute(routeUpdate)
      setRouteRerouted(Boolean(data.rerouted))
      const avoided = data.avoided_hazards || []
      if (data.rerouted && avoided.length) {
        const names = avoided.map((hazard) => hazard.road_name || hazard.hazard_type).join(', ')
        setAlertStatus(`Rerouted around road hazards: ${names}.`)
      } else {
        setAlertStatus(data.message || 'Walking route ready.')
      }
    } catch (error) {
      setRouteRerouted(false)
      const directGeometry = { type: 'LineString', coordinates: [[Number(latestGps.longitude), Number(latestGps.latitude)], [Number(center.longitude), Number(center.latitude)]] }
      const routeUpdate = {
        citizenId: auth?.user?.id,
        citizenName: auth?.user?.full_name || auth?.user?.username || 'Citizen',
        centerId: center.id,
        centerName: center.name,
        origin: { latitude: latestGps.latitude, longitude: latestGps.longitude },
        destination: { latitude: Number(center.latitude), longitude: Number(center.longitude) },
        geometry: directGeometry,
        rerouted: false,
        timestamp: Date.now()
      }
      setEvacuationRoute(directGeometry)
      setActiveEvacuationRoute(routeUpdate)
      setAlertStatus('Walking route unavailable. Showing a direct path.')
    }
  }

  const getRescuerSelectionValue = (rescuer) => {
    if (!rescuer) return null
    if (typeof rescuer === 'string' || typeof rescuer === 'number') return String(rescuer)
    return [rescuer.id, rescuer.user_id, rescuer.user?.id].find((value) => value != null && value !== '')?.toString() ?? null
  }

  const findRescuerBySelection = (rescuerSelection) => {
    const normalizedSelection = getRescuerSelectionValue(rescuerSelection)
    if (!normalizedSelection) return null

    const selectionMatcher = (entry) => {
      const values = [entry.id, entry.user_id, entry.user?.id].filter((value) => value != null && value !== '')
      return values.some((value) => String(value) === normalizedSelection)
    }

    return rescuers.find(selectionMatcher) || rescueUnits.rescuers.find(selectionMatcher) || null
  }

  const handleAssignAlert = async (alertId, rescuerSelection = selectedRescuerId, vehicleIds = []) => {
    const normalizedRescuerSelection = rescuerSelection ?? selectedRescuerId
    if (!normalizedRescuerSelection) {
      const alert = alerts.find((entry) => entry.id === alertId)
      if (alert) setAssigningAlert(alert)
      return
    }

    try {
      const rescuer = findRescuerBySelection(normalizedRescuerSelection)
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/alerts/${alertId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          status: 'assigned',
          assigned_rescuer_id: rescuer?.user_id ?? rescuer?.id,
          assigned_rescuer_name: rescuer ? `${rescuer.display_name || rescuer.full_name || rescuer.username}` : 'Rescuer',
          assigned_vehicle_ids: JSON.stringify(vehicleIds)
        })
      })

      if (!response.ok) throw new Error('Unable to assign rescuer')

      const refreshed = await fetch(`${API_BASE_URL}/api/v1/auth/alerts`, { headers: getAuthHeaders() })
      if (refreshed.ok) setAlerts(await refreshed.json())
      const units = await fetch(`${API_BASE_URL}/api/v1/auth/rescue-units`, { headers: getAuthHeaders() })
      if (units.ok) setRescueUnits(await units.json())
      setAlertStatus('Alert assigned to rescuer.')
      return true
    } catch (error) {
      setAlertStatus(error.message)
    }
  }

  useEffect(() => {
    if (assigningAlert && selectedRescuerId) {
      handleAssignAlert(assigningAlert.id, selectedRescuerId)
      setAssigningAlert(null)
    }
  }, [assigningAlert, selectedRescuerId])

  const handleMergeAlerts = async () => {
    if (selectedMergeIds.length < 2) return
    const duplicateIds = selectedMergeIds.slice(1)
    try {
      await Promise.all(duplicateIds.map((alertId) => fetch(`${API_BASE_URL}/api/v1/auth/alerts/${alertId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: 'closed' })
      })))
      setSelectedMergeIds([])
      const refreshed = await fetch(`${API_BASE_URL}/api/v1/auth/alerts`, { headers: getAuthHeaders() })
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
      icon: '⌂',
      details: { type: 'Evacuation center', status: center.is_active === false ? 'Inactive' : 'Active', occupancy: `${occupancy}%`, location: `${center.latitude}, ${center.longitude}` }
    }
  })

  const alertMarkers = alerts.map((alert) => ({
    position: [alert.longitude, alert.latitude],
    label: `${alert.sender_name} · ${statusLabel(alert.status)}`,
    color: alertMarkerColors[alert.disaster_type] || alertMarkerColors.other,
    icon: disasterIcons[alert.disaster_type] || disasterIcons.other,
    details: { type: disasterLabels[alert.disaster_type] || 'Other alert', status: statusLabel(alert.status), reported_by: alert.sender_name, time: formatTime(alert.created_at), location: `${alert.latitude}, ${alert.longitude}`, severity: alert.severity, message: alert.message }
  }))

  const rescuerMarkers = rescueUnits.rescuers.filter((rescuer) => rescuer.current_latitude !== null && rescuer.current_longitude !== null).map((rescuer) => ({
    position: [rescuer.current_longitude, rescuer.current_latitude],
    label: `${rescuer.full_name || rescuer.username} · ${statusLabel(rescuer.status)}`,
    color: rescuerMarkerColors[rescuer.status] || '#00d6a0',
    icon: '♟',
    details: { type: 'Rescuer', status: statusLabel(rescuer.status), name: rescuer.full_name || rescuer.username, location: `${rescuer.current_latitude}, ${rescuer.current_longitude}` }
  }))

  const liveRescuerMarkers = Object.values(liveRescuerLocations).map((location) => ({
    position: [location.longitude, location.latitude],
    label: `${location.display_name || 'Rescuer'} · LIVE LOCATION`,
    color: '#00d6a0',
    icon: '♟'
  }))

  const vehicleMarkers = rescueUnits.vehicles.filter((vehicle) => vehicle.current_location_lat !== null && vehicle.current_location_lng !== null).map((vehicle) => ({
    position: [vehicle.current_location_lng, vehicle.current_location_lat],
    label: `${vehicle.vehicle_type} ${vehicle.plate_number} · ${statusLabel(vehicle.status)}`,
    color: vehicleMarkerColors[vehicle.status] || '#64748b',
    icon: '▣',
    details: { type: vehicle.vehicle_type, status: statusLabel(vehicle.status), plate: vehicle.plate_number, driver: vehicle.driver_name, rescuer_onboard: vehicle.rescuer_onboard, location: `${vehicle.current_location_lat}, ${vehicle.current_location_lng}` }
  }))

  const hazardMarkers = roadHazards.filter((hazard) => hazard.is_active !== false && !hazard.is_resolved).map((hazard) => ({
    position: [hazard.longitude, hazard.latitude],
    label: `${hazard.road_name || 'Road hazard'} · ${String(hazard.hazard_type).replace(/_/g, ' ')} (${hazard.radius_meters}m)`,
    color: '#ea580c',
    icon: '!',
    details: { type: String(hazard.hazard_type).replace(/_/g, ' '), severity: hazard.severity, status: hazard.is_resolved ? 'Resolved' : hazard.is_active === false ? 'Inactive' : 'Active', road: hazard.road_name || 'Unspecified road', time: formatTime(hazard.reported_at || hazard.created_at), location: `${hazard.latitude}, ${hazard.longitude}`, description: hazard.description }
  }))

  const activeRouteMarkers = activeEvacuationRoute ? [
    {
      position: [activeEvacuationRoute.origin.longitude, activeEvacuationRoute.origin.latitude],
      label: `${activeEvacuationRoute.citizenName} · Current location`,
      color: '#50a8ff',
      icon: '●',
      details: { type: 'Citizen route origin', name: activeEvacuationRoute.citizenName, location: `${activeEvacuationRoute.origin.latitude}, ${activeEvacuationRoute.origin.longitude}`, destination: activeEvacuationRoute.centerName }
    },
    {
      position: [activeEvacuationRoute.destination.longitude, activeEvacuationRoute.destination.latitude],
      label: `${activeEvacuationRoute.centerName} · Selected evacuation center`,
      color: '#f4b21b',
      icon: '⌂',
      details: { type: 'Route destination', center: activeEvacuationRoute.centerName, location: `${activeEvacuationRoute.destination.latitude}, ${activeEvacuationRoute.destination.longitude}`, route_status: activeEvacuationRoute.rerouted ? 'Rerouted' : 'Ready' }
    }
  ] : []

  const mapMarkers = [...centerMarkers, ...alertMarkers, ...rescuerMarkers, ...liveRescuerMarkers, ...vehicleMarkers, ...hazardMarkers]
  const primaryCenter = centers.find((center) => center.is_active !== false) || centers[0]
  const displayName = auth?.user?.full_name || auth?.user?.username || 'Cmdr. Reyes'
  const visibleAlerts = role === 'rescuer' ? alerts.filter((alert) => alert.assigned_rescuer_id === rescuerId) : alerts
  const alertCount = alerts.length
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)

  const formattedCurrentTime = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(currentTime)

  // Smooth Pointer-Capture Map Resizing
  const startMapResize = (e) => {
    e.preventDefault()
    const handle = e.currentTarget
    const stage = handle.parentElement
    if (!stage) return

    const startY = e.clientY
    const initialHeight = stage.getBoundingClientRect().height
    handle.setPointerCapture(e.pointerId)

    const onPointerMove = (moveEvent) => {
      const deltaY = moveEvent.clientY - startY
      const minHeight = 260
      const maxHeight = window.innerHeight - 180
      const newHeight = Math.min(maxHeight, Math.max(minHeight, initialHeight + deltaY))

      setMapHeight(newHeight)
      window.dispatchEvent(new Event('resize'))
    }

    const onPointerUp = (upEvent) => {
      handle.releasePointerCapture(upEvent.pointerId)
      handle.removeEventListener('pointermove', onPointerMove)
      handle.removeEventListener('pointerup', onPointerUp)
      window.dispatchEvent(new Event('resize'))
    }

    handle.addEventListener('pointermove', onPointerMove)
    handle.addEventListener('pointerup', onPointerUp)
  }

  const sortedRescuers = [...rescueUnits.rescuers].sort((first, second) => {
    if (unitSort === 'name') return (first.full_name || first.username || '').localeCompare(second.full_name || second.username || '')
    return (first.status || '').localeCompare(second.status || '')
  })

  const getRescuerCoordinates = (rescuer) => {
    const rescuerIdentity = rescuer?.user_id ?? rescuer?.id
    const liveLocation = rescuerIdentity != null ? liveRescuerLocations[String(rescuerIdentity)] : null
    return {
      latitude: liveLocation?.latitude ?? rescuer?.current_latitude ?? null,
      longitude: liveLocation?.longitude ?? rescuer?.current_longitude ?? null
    }
  }

  const getRescuerDistance = (rescuer) => {
    const coordinates = getRescuerCoordinates(rescuer)
    const distance = distanceBetween(assigningAlert?.latitude, assigningAlert?.longitude, coordinates.latitude, coordinates.longitude)
    return distance === null ? null : distance.toFixed(1)
  }

  const rankedAssignmentRescuers = assigningAlert
    ? [...rescueUnits.rescuers].sort((first, second) => {
      const firstAvailable = first.status === 'available' ? 0 : 1
      const secondAvailable = second.status === 'available' ? 0 : 1
      if (firstAvailable !== secondAvailable) return firstAvailable - secondAvailable
      const firstCoordinates = getRescuerCoordinates(first)
      const secondCoordinates = getRescuerCoordinates(second)
      const firstDistance = distanceBetween(assigningAlert.latitude, assigningAlert.longitude, firstCoordinates.latitude, firstCoordinates.longitude) ?? Number.POSITIVE_INFINITY
      const secondDistance = distanceBetween(assigningAlert.latitude, assigningAlert.longitude, secondCoordinates.latitude, secondCoordinates.longitude) ?? Number.POSITIVE_INFINITY
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

  const accountMenu = (
    <div className="account-menu">
      <button className="operator operator-trigger" onClick={() => setAccountMenuOpen((value) => !value)} aria-expanded={accountMenuOpen} aria-haspopup="menu">
        <span className="operator-avatar">♟</span>
        <span><b>{displayName}</b><small>{role.toUpperCase()}</small></span>
      </button>
      {accountMenuOpen && (
        <div className="account-dropdown" role="menu">
          <button onClick={handleLogout} role="menuitem">Logout</button>
        </div>
      )}
    </div>
  )

  if (role !== 'dispatcher') {
    return (
      <main className="restricted-console">
        <Logo size="small" />
        <h1>Dispatcher access required</h1>
        <p>This operations console is available only to dispatcher accounts.</p>
        <button className="emergency-button" onClick={handleLogout}>RETURN TO LOGIN</button>
      </main>
    )
  }

  return (
    <main className="ops-console">
      <header className="ops-header">
        <div className="brand-lockup">
          <Logo size="small" />
          <div><strong>RESQ-ROUTE</strong><span>CDRRMO LIVE OPERATIONS CENTER</span></div>
        </div>
        <div className="header-actions">
          <span className={`connection ${isConnected ? 'online' : 'offline'}`}><i /> WebSocket: {isConnected ? 'Connected' : 'Reconnecting'}</span>
          <span className="header-time">{formattedCurrentTime} PHT</span>
          {accountMenu}
        </div>
      </header>

      <HazardTicker hazards={roadHazards} />

      <section className="ops-grid">
        {/* LEFT COLUMN: Operational Metrics (Top) + Live SOS Feed (Bottom) */}
        <aside className="left-rail">
          {/* TOP: Operational Metrics */}
          <section className="operational-panel">
            <PanelTitle title="OPERATIONAL METRICS" />
            <div className="operational-metrics-body">
              <Metric label="ACTIVE SOS" value={alertCount} color="red" />
              <Metric
                label="DISPATCHED"
                value={`${rescueUnits.dispatched_count || 0} / ${rescueUnits.rescuer_count || 0}`}
                color="red"
              />
              <Metric
                label="RESCUED TODAY"
                value={rescueUnits.closed_alert_count || 0}
                color="green"
              />
            </div>
          </section>

          {/* BOTTOM: Live SOS Feed */}
          <section className="feed-panel">
            <PanelTitle title="LIVE SOS FEED" badge="LIVE" onClick={() => openModal('alerts')} />
            <div className="feed-list">
              <div className="feed-view-switch" role="group" aria-label="Choose SOS alert view">
                <button
                  type="button"
                  className={feedView === 'unattended' ? 'active' : ''}
                  aria-pressed={feedView === 'unattended'}
                  onClick={() => setFeedView('unattended')}
                >
                  <span>UNATTENDED</span>
                  <span className="feed-view-count">{unattendedAlerts.length}</span>
                </button>
                <button
                  type="button"
                  className={feedView === 'latest' ? 'active' : ''}
                  aria-pressed={feedView === 'latest'}
                  onClick={() => setFeedView('latest')}
                >
                  <span>LATEST</span>
                  <span className="feed-view-count">{alerts.length}</span>
                </button>
              </div>

              {feedView === 'unattended' ? (
                <div className="pinned-alerts" aria-label="Pinned unattended SOS alerts">
                  <h3>UNATTENDED · 2H+</h3>
                  <div className="feed-items-scroll">
                    {unattendedAlerts.length === 0 ? (
                      <p className="feed-empty">No unattended SOS alerts.</p>
                    ) : (
                      visiblePinnedAlerts.map((alert) => (
                        <SosFeedItem
                          key={`pinned-${alert.id}`}
                          alert={alert}
                          now={currentTime}
                          onAssign={handleAssignAlert}
                        />
                      ))
                    )}
                  </div>

                  {unattendedAlerts.length > ALERTS_PER_PAGE && (
                    <nav className="feed-alert-pagination" aria-label="Pinned alert pages">
                      <button
                        type="button"
                        aria-label="Previous pinned alerts"
                        disabled={currentPinnedAlertPage === 0}
                        onClick={() => setPinnedAlertPage((page) => Math.max(0, page - 1))}
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <span>PAGE {currentPinnedAlertPage + 1} / {pinnedAlertPageCount}</span>
                      <button
                        type="button"
                        aria-label="Next pinned alerts"
                        disabled={currentPinnedAlertPage >= pinnedAlertPageCount - 1}
                        onClick={() => setPinnedAlertPage((page) => Math.min(pinnedAlertPageCount - 1, page + 1))}
                      >
                        <ChevronRight size={14} />
                      </button>
                    </nav>
                  )}
                </div>
              ) : (
                <div className="feed-alert-section" aria-label="Latest SOS alerts">
                  <h3>LATEST SOS ALERTS</h3>
                  <div className="feed-items-scroll">
                    {alerts.length === 0 ? (
                      <p className="feed-empty">No SOS alerts.</p>
                    ) : (
                      visibleRegularAlerts.map((alert) => (
                        <SosFeedItem
                          key={alert.id}
                          alert={alert}
                          now={currentTime}
                          onAssign={handleAssignAlert}
                        />
                      ))
                    )}
                  </div>

                  {alerts.length > ALERTS_PER_PAGE && (
                    <nav className="feed-alert-pagination" aria-label="Latest SOS alert pages">
                      <button
                        type="button"
                        aria-label="Previous SOS alerts"
                        disabled={currentRegularAlertPage === 0}
                        onClick={() => setRegularAlertPage((page) => Math.max(0, page - 1))}
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <span>PAGE {currentRegularAlertPage + 1} / {regularAlertPageCount}</span>
                      <button
                        type="button"
                        aria-label="Next SOS alerts"
                        disabled={currentRegularAlertPage >= regularAlertPageCount - 1}
                        onClick={() => setRegularAlertPage((page) => Math.min(regularAlertPageCount - 1, page + 1))}
                      >
                        <ChevronRight size={14} />
                      </button>
                    </nav>
                  )}
                </div>
              )}
            </div>
          </section>
        </aside>

        {/* CENTER COLUMN: MAP ONLY */}
        <main className="center-column map-only-column">
          <section className="map-panel">
            <PanelTitle title="CDRRMO TACTICAL MAP AREA" badge="TRACKING MAP" />
            <div className="map-stage" style={{ height: `${mapHeight}px` }}>
              <DraggableMapOverlay className="map-coordinate" label="Map center coordinates" defaultPosition={{ left: 12, top: 12 }}>
                {primaryCenter ? <>CENTER: {Number(primaryCenter.latitude).toFixed(5)}° N<br />LONG: {Number(primaryCenter.longitude).toFixed(5)}° E</> : 'CENTER: NO ACTIVE CENTER'}
              </DraggableMapOverlay>
              <DraggableMapOverlay className="map-legend" label="Map legend" defaultPosition={{ right: 12, top: 12 }}>
                <span><i className="dot red" /> PENDING / CLOSED ALERT</span>
                <span><i className="dot amber" /> ASSIGNED / RECOVERING</span>
                <span><i className="dot green" /> AVAILABLE / CENTER</span>
                <span><i className="dot blue" /> RESOLVING / IN TRANSIT</span>
              </DraggableMapOverlay>
              <MapContainer markers={[...mapMarkers, ...activeRouteMarkers]} route={activeEvacuationRoute?.geometry} trackDeviceLocation={false} />
              {activeEvacuationRoute && (
                <DraggableMapOverlay className="evac-label evac-label-list" label="Active citizen evacuation route" defaultPosition={{ left: 280, top: 12 }}>
                  <b>ACTIVE EVACUATION ROUTE</b>
                  <span>{activeEvacuationRoute.citizenName} → {activeEvacuationRoute.centerName}</span>
                </DraggableMapOverlay>
              )}
              {centers.length > 0 && (
                <DraggableMapOverlay className="evac-label evac-label-list" label="Evacuation center list" defaultPosition={{ left: 580, top: 164 }}>
                  <b>EVACUATION CENTERS</b>
                  {centers.filter((center) => center.is_active !== false).map((center) => {
                    const occupancy = center.capacity > 0 ? Math.round((center.current_occupancy / center.capacity) * 100) : 0
                    return <span key={center.id}>{center.name} ({occupancy}%)</span>
                  })}
                </DraggableMapOverlay>
              )}
              <button className="map-resize-handle" onPointerDown={startMapResize} aria-label="Drag to resize map" title="Drag to resize map">↕</button>
            </div>
          </section>
        </main>

        {/* RIGHT RAIL: Average Response -> Vehicles -> Rescuer Profiles */}
        <aside className="right-rail">
          {/* 1. TOP: Average Response */}
          <section className="metric-card response-card">
            <small>AVERAGE RESPONSE</small>
            <strong>8.2 min</strong>
            <span>Below target (10m)</span>
          </section>

          {/* 2. MIDDLE: Vehicles */}
          <section className="rail-box vehicle-box">
            <div className="unit-panel-heading">
              <PanelTitle
                title="VEHICLES"
                badge={`${rescueUnits.vehicles.length} UNITS`}
                onClick={() => openModal('units')}
              />
              <select
                value={unitSort}
                onChange={(event) => setUnitSort(event.target.value)}
                aria-label="Sort vehicles"
              >
                <option value="status">Sort: Status</option>
                <option value="type">Sort: Type</option>
              </select>
            </div>

            <div className="unit-items-scroll">
              {sortedVehicles.length === 0 ? (
                <p className="unit-empty">No vehicles</p>
              ) : (
                sortedVehicles.map((vehicle) => (
                  <Unit
                    key={`vehicle-${vehicle.id}`}
                    name={`${vehicle.vehicle_type} · ${vehicle.plate_number}`}
                    detail={`${vehicle.driver_name} · capacity ${vehicle.capacity}`}
                    status={vehicle.status}
                  />
                ))
              )}
            </div>
          </section>

          {/* 3. BOTTOM: Rescuer Profiles */}
          <section className="rail-box rescuer-box">
            <div className="unit-panel-heading">
              <PanelTitle
                title="RESCUER PROFILES"
                badge={`${rescueUnits.rescuers.length} ACTIVE`}
                onClick={() => openModal('units')}
              />
              <select
                value={unitSort}
                onChange={(event) => setUnitSort(event.target.value)}
                aria-label="Sort rescuers"
              >
                <option value="status">Sort: Status</option>
                <option value="name">Sort: Name</option>
              </select>
            </div>

            <div className="unit-items-scroll">
              {sortedRescuers.length === 0 ? (
                <p className="unit-empty">No rescuer profiles</p>
              ) : (
                sortedRescuers.map((rescuer) => (
                  <Unit
                    key={`rescuer-${rescuer.id}`}
                    name={rescuer.full_name || rescuer.username}
                    detail={`${rescuer.station_name || 'No station'} · @${rescuer.username}`}
                    status={rescuer.status}
                  />
                ))
              )}
            </div>
          </section>
        </aside>
      </section>

      {/* MODAL */}
      {activeModal && (
        <div className="modal-backdrop" onClick={() => setActiveModal(null)}>
          <section className="ops-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <PanelTitle title={activeModal === 'alerts' ? 'ALL EMERGENCY ALERTS' : 'ACTIVE RESCUE UNITS'} badge="LIVE DATA" />
              <button className="modal-close" onClick={() => setActiveModal(null)} aria-label="Close modal">×</button>
            </div>
            {modalLoading ? (
              <p className="modal-empty">Loading live data...</p>
            ) : activeModal === 'alerts' ? (
              <div className="modal-alert-list">
                {alerts.length === 0 ? (
                  <p className="modal-empty">No emergency alerts found.</p>
                ) : (
                  alerts.map((alert) => {
                    const disasterType = alert.disaster_type || 'other'
                    return (
                      <div className="modal-alert" key={alert.id}>
                        <input
                          type="checkbox"
                          checked={selectedMergeIds.includes(alert.id)}
                          onChange={() => {
                            setSelectedMergeIds((currentIds) =>
                              currentIds.includes(alert.id)
                                ? currentIds.filter((id) => id !== alert.id)
                                : [...currentIds, alert.id]
                            )
                          }}
                          aria-label={`Select alert ${alert.id} for merge`}
                        />
                        <span className={`sos-icon disaster-${disasterType}`}>
                          {disasterIcons[disasterType] || disasterIcons.other}
                        </span>
                        <div>
                          <b>{disasterLabels[disasterType] || 'Other'} · {(alert.severity || 'high').toUpperCase()}</b>
                          <small>{alert.sender_name} · {alert.message || 'No additional message'}</small>
                        </div>
                        <em>{alert.status}</em>
                        <div className="modal-alert-actions">
                          <select value={selectedRescuerId} onChange={(event) => setSelectedRescuerId(event.target.value)} aria-label="Select rescuer">
                            <option value="">Assign...</option>
                            {rescuers.map((rescuer) => (
                              <option key={rescuer.id} value={rescuer.id}>
                                {rescuer.display_name || rescuer.full_name || rescuer.username}
                              </option>
                            ))}
                          </select>
                          <button onClick={() => handleAssignAlert(alert.id)}>Assign</button>
                          <button onClick={() => setVerifiedAlert(alert)}>Verify</button>
                        </div>
                        {verifiedAlert?.id === alert.id && (
                          <div className="verified-alert">
                            <b>ALERT DETAILS</b>
                            <span>{alert.latitude}, {alert.longitude} · {formatTime(alert.created_at)}</span>
                            <small>{alert.message || 'No additional message provided.'}</small>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
                <div className="merge-toolbar">
                  <span>{selectedMergeIds.length} selected</span>
                  <button disabled={selectedMergeIds.length < 2} onClick={handleMergeAlerts}>Merge selected as duplicates</button>
                </div>
              </div>
            ) : (
              <div className="modal-unit-grid">
                <div>
                  <h3>RESCUER PROFILES</h3>
                  {rescueUnits.rescuers.length === 0 ? (
                    <p className="modal-empty">No rescuer profiles found.</p>
                  ) : (
                    rescueUnits.rescuers.map((rescuer) => (
                      <div className="modal-unit" key={rescuer.id}>
                        <b>Profile #{rescuer.id}</b>
                        <span>{rescuer.status.replace('_', ' ')}</span>
                        <small>{rescuer.station_name || 'Unassigned station'}</small>
                      </div>
                    ))
                  )}
                </div>
                <div>
                  <h3>VEHICLES</h3>
                  {rescueUnits.vehicles.length === 0 ? (
                    <p className="modal-empty">No vehicles found.</p>
                  ) : (
                    rescueUnits.vehicles.map((vehicle) => (
                      <div className="modal-unit" key={vehicle.id}>
                        <b>{vehicle.vehicle_type}</b>
                        <span>{vehicle.status}</span>
                        <small>{vehicle.plate_number} · {vehicle.driver_name}</small>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {assigningAlert && (
        <AssignmentModal
          alert={assigningAlert}
          rescuers={rankedAssignmentRescuers}
          vehicles={rescueUnits.vehicles}
          getRescuerDistance={getRescuerDistance}
          onConfirm={async (rescuer, vehicleIds) => {
            await handleAssignAlert(assigningAlert.id, String(rescuer.user_id), vehicleIds)
            setAssigningAlert(null)
          }}
          onClose={() => setAssigningAlert(null)}
        />
      )}
    </main>
  )
}

const DraggableMapOverlay = ({ className, label, defaultPosition, children }) => {
  const [position, setPosition] = useState(defaultPosition)
  const [minimized, setMinimized] = useState(false)
  const dragRef = useRef(null)

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

  return (
    <div
      ref={dragRef}
      className={`map-overlay-draggable ${className} ${minimized ? 'minimized' : ''}`}
      style={{
        left: position.left ?? 'auto',
        top: position.top ?? 'auto',
        right: position.right ?? 'auto',
        bottom: position.bottom ?? 'auto'
      }}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      role="group"
      tabIndex="0"
      aria-label={`${label}. Use arrow keys to move.`}
    >
      <button
        className="map-overlay-toggle"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => setMinimized((value) => !value)}
        aria-label={`${minimized ? 'Expand' : 'Minimize'} ${label}`}
        title={minimized ? 'Expand' : 'Minimize'}
      >
        {minimized ? '+' : '-'}
      </button>
      {!minimized && children}
    </div>
  )
}

const PanelTitle = ({ title, badge, onClick }) => (
  <div
    className={`panel-title ${onClick ? 'panel-title-clickable' : ''}`}
    onClick={onClick}
    onKeyDown={(event) => event.key === 'Enter' && onClick?.()}
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
  >
    <h2>{title}</h2>
    {badge && <span>{badge}</span>}
  </div>
)

const Unit = ({ name, detail, status }) => (
  <div className="unit-row">
    <div>
      <b>{name}</b>
      <small>{detail}</small>
    </div>
    <span className={`unit-status ${String(status || '').toLowerCase().replace(/_/g, '-')}`}>
      {statusLabel(status)}
    </span>
  </div>
)

const Metric = ({ label, value, color }) => (
  <div className="rail-metric">
    <small>{label}</small>
    <strong className={color}>{value}</strong>
  </div>
)

export default Dashboard