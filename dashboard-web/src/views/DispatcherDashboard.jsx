import React, { useCallback, useEffect, useLayoutEffect, useState, useRef } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { useActiveRoadHazards } from '../hooks/useActiveRoadHazards'
import { useVoiceConference } from '../hooks/useVoiceConference'
import MapContainer from '../components/MapContainer'
import RoadHazardReportForm from '../components/RoadHazardReportForm'
import Logo from '../components/Logo'
import { useTheme } from '../ThemeContext'
import HazardTicker from '../components/HazardTicker'
import AssignmentModal from '../components/AssignmentModal'
import DeployedVehicles from '../components/DeployedVehicles'
import { BASE_URL, WS_URL } from '../dataProvider'
import '../styles/ops-console.css'
import { ChevronLeft, ChevronRight, SlidersHorizontal, X } from 'lucide-react'

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
const normalizeAlertStatus = (status) => String(status?.value || status || '').toLowerCase().split('.').pop()
const isClosedAlert = (alert) => normalizeAlertStatus(alert.status) === 'closed'
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
const manilaDateKey = (value) => {
  const date = value instanceof Date ? value : parseAlertDate(value)
  if (!date) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date)
  const part = (type) => parts.find((item) => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}`
}
const shiftDateKey = (dateKey, days) => {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}
const getAlertResponseMinutes = (alert) => {
  const createdAt = parseAlertDate(alert.created_at)?.getTime()
  const closedAt = parseAlertDate(alert.updated_at)?.getTime()
  return Number.isFinite(createdAt) && Number.isFinite(closedAt) && closedAt >= createdAt
    ? (closedAt - createdAt) / 60_000
    : null
}
const loadResqLogoBytes = async () => {
  const response = await fetch(new URL('/resq_logo.png', window.location.origin))
  if (!response.ok) throw new Error(`Unable to load the ResQ-Route logo (${response.status}).`)
  return new Uint8Array(await response.arrayBuffer())
}
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
const isCriticalAlert = (alert) => String(alert?.severity || '').toLowerCase() === 'critical'
const isRecoveringRescuer = (rescuer) => String(rescuer?.status || '').toLowerCase() === 'recovering'
const isAvailableRescuer = (rescuer) => String(rescuer?.status || '').toLowerCase() === 'available'
const isDisplayableRescuer = (rescuer) => isAvailableRescuer(rescuer) || isRecoveringRescuer(rescuer)
const getEligibleAssignmentRescuers = (rescuers, alert) => {
  if (isCriticalAlert(alert)) return rescuers
  const availableRescuers = rescuers.filter(isAvailableRescuer)
  return availableRescuers.length > 0
    ? availableRescuers
    : rescuers.filter(isRecoveringRescuer)
}

const API_BASE_URL = BASE_URL

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
const alertCategoryOptions = [
  { value: 'all', label: 'All alerts', color: '#e7edf5' },
  ...Object.entries(disasterLabels).map(([value, label]) => ({
    value,
    label,
    color: alertMarkerColors[value]
  }))
]
const normalizeDisasterType = (value) => {
  const category = String(value || 'other').toLowerCase()
  return Object.prototype.hasOwnProperty.call(disasterLabels, category) ? category : 'other'
}

const getAlertImageUrls = (value) => {
  if (!value) return []
  try {
    const decoded = JSON.parse(value)
    if (Array.isArray(decoded)) return decoded.filter((url) => typeof url === 'string' && url.trim())
    if (typeof decoded === 'string' && decoded.trim()) return [decoded]
  } catch {}
  return typeof value === 'string' ? [value] : []
}

const ALERT_LOCATION_CACHE_KEY = 'resq-nominatim-reverse-geocode-v1'
const alertLocationCache = new Map()

const formatAlertLocation = (address) => {
  if (!address) return null
  const road = address.road || address.pedestrian || address.footway
  const barangay = address.neighbourhood || address.suburb || address.quarter || address.village
  const city = address.city || address.town || address.municipality || address.county
  return [road, barangay, city]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(', ') || address.display_name?.split(',').slice(0, 3).join(', ') || null
}

const getAlertCoordinateFallback = (latitude, longitude) => {
  const latitudeDirection = latitude >= 0 ? 'N' : 'S'
  const longitudeDirection = longitude >= 0 ? 'E' : 'W'
  return `${Math.abs(latitude).toFixed(4)}° ${latitudeDirection}, ${Math.abs(longitude).toFixed(4)}° ${longitudeDirection}`
}

const lookupAlertLocation = async (latitude, longitude) => {
  const lat = Number(latitude)
  const lon = Number(longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return ''
  const key = `${lat.toFixed(6)},${lon.toFixed(6)}`
  if (!alertLocationCache.size) {
    try {
      const stored = JSON.parse(window.localStorage.getItem(ALERT_LOCATION_CACHE_KEY) || '{}')
      Object.entries(stored).forEach(([cachedKey, value]) => alertLocationCache.set(cachedKey, value))
    } catch {}
  }
  if (alertLocationCache.has(key)) return alertLocationCache.get(key) || getAlertCoordinateFallback(lat, lon)

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 5000)
  try {
    const params = new URLSearchParams({ format: 'json', lat: String(lat), lon: String(lon), zoom: '18', addressdetails: '1' })
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'Accept-Language': 'en' },
    })
    if (!response.ok) throw new Error(`Nominatim returned ${response.status}`)
    const data = await response.json()
    const location = formatAlertLocation(data.address)
    alertLocationCache.set(key, location)
    try {
      const stored = Object.fromEntries([...alertLocationCache.entries()].filter(([, value]) => value))
      window.localStorage.setItem(ALERT_LOCATION_CACHE_KEY, JSON.stringify(stored))
    } catch {}
    return location || getAlertCoordinateFallback(lat, lon)
  } catch {
    alertLocationCache.set(key, null)
    return getAlertCoordinateFallback(lat, lon)
  } finally {
    window.clearTimeout(timeout)
  }
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

const SosFeedItem = ({ alert, now, onAssign, onView, isClosed = false }) => {
  const disasterType = alert.disaster_type || 'other'
  const severity = alert.severity || 'high'
  const unattended = isUnattendedAlert(alert, now)
  const sentAt = parseAlertDate(alert.created_at)

  return (
    <article
      className={unattended ? 'sos-item unattended-alert' : 'sos-item'}
      onClick={() => onView?.(alert)}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) {
          event.preventDefault()
          onView?.(alert)
        }
      }}
      role={onView ? 'button' : undefined}
      tabIndex={onView ? 0 : undefined}
    >
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
      {!isClosed && (
        <div className="sos-actions">
          <button onClick={(event) => { event.stopPropagation(); onAssign(alert.id) }}>ASSIGN</button>
          <button type="button" onClick={() => onView(alert)}>VIEW</button>
          <button onClick={(event) => event.stopPropagation()}>MERGE</button>
        </div>
      )}
    </article>
  )
}

export const Dashboard = ({ onLogout }) => {
  const auth = getStoredAuth()
  const role = normalizeRole(auth?.user?.role) || 'citizen'
  const [latestGps, setLatestGps] = useState(null)
  const [liveRescuerLocations, setLiveRescuerLocations] = useState({})
  const [alertMessage, setAlertMessage] = useState('')
  const [alertStatus, setAlertStatus] = useState('')
  const [latestStatusReport, setLatestStatusReport] = useState(null)
  const [statusReportQueue, setStatusReportQueue] = useState([])
  const seenStatusReportIds = useRef(new Set())
  const pendingStatusReportIds = useRef(new Set())
  const statusReportsInitialized = useRef(false)
  const [alertRecords, setAlertRecords] = useState([])
  const [operationMetrics, setOperationMetrics] = useState(null)
  const [centers, setCenters] = useState([])
  const [evacuationRecommendation, setEvacuationRecommendation] = useState(null)
  const [evacuationLoading, setEvacuationLoading] = useState(false)
  const [evacuationRoute, setEvacuationRoute] = useState(null)
  const [activeEvacuationRoute, setActiveEvacuationRoute] = useState(null)
  const [isRoadHazardFormOpen, setIsRoadHazardFormOpen] = useState(false)
  const [pendingRoadHazards, setPendingRoadHazards] = useState({ type: 'FeatureCollection', features: [] })
  const [roadHazardReviewing, setRoadHazardReviewing] = useState(null)
  const [roadHazardReviewError, setRoadHazardReviewError] = useState('')
  const [selectedRoadHazard, setSelectedRoadHazard] = useState(null)
  const [hazardLayers, setHazardLayers] = useState([])
  const [hazardLayerPublishing, setHazardLayerPublishing] = useState(null)
  const [showNoahHazards, setShowNoahHazards] = useState(true)
  const [showRoadHazards, setShowRoadHazards] = useState(true)
  const [routeRerouted, setRouteRerouted] = useState(false)
  const [rescuers, setRescuers] = useState([])
  const [selectedRescuerId, setSelectedRescuerId] = useState('')
  const [selectedIncident, setSelectedIncident] = useState('')
  const [selectedSeverity, setSelectedSeverity] = useState('high')
  const [selectedAlert, setSelectedAlert] = useState(null)
  const [selectedImagePreview, setSelectedImagePreview] = useState(null)
  const [alertImageSize, setAlertImageSize] = useState('medium')
  const [alertLocation, setAlertLocation] = useState('')
  const [alertLocationLoading, setAlertLocationLoading] = useState(false)
  const [activeModal, setActiveModal] = useState(null)
  // ── Voice call state ──────────────────────────────────────────────────
  const { callId, callError, isSocketReady: isVoiceReady, participants: callParticipants, remoteStreams, startCall, endCall } =
    useVoiceConference({
      wsUrl: WS_URL,
      authToken: auth?.token || auth?.access_token,
    })
  const [rescueUnits, setRescueUnits] = useState({ rescuers: [], vehicles: [] })
  const [unitSort, setUnitSort] = useState('status')
  const [modalLoading, setModalLoading] = useState(false)
  const [selectedMergeIds, setSelectedMergeIds] = useState([])
  const [verifiedAlertState, setVerifiedAlertState] = useState(null)
  const [assigningAlert, setAssigningAlert] = useState(null)
  const [feedView, setFeedView] = useState('latest')
  const [regularAlertPage, setRegularAlertPage] = useState(0)
  const [pinnedAlertPage, setPinnedAlertPage] = useState(0)
  const [closedAlertPage, setClosedAlertPage] = useState(0)
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const [mapHeight, setMapHeight] = useState(480)
  const [focusedAlertLocation, setFocusedAlertLocation] = useState(null)
  const [focusedAlertId, setFocusedAlertId] = useState(null)
  const [selectedMapAlertCategory, setSelectedMapAlertCategory] = useState('all')
  const [focusRequestKey, setFocusRequestKey] = useState(0)
  const [reportEndDate, setReportEndDate] = useState(() => manilaDateKey(new Date()))
  const [reportStartDate, setReportStartDate] = useState(() => shiftDateKey(manilaDateKey(new Date()), -29))
  const [isExportingReport, setIsExportingReport] = useState(false)
  const [reportExportError, setReportExportError] = useState('')
  const [isPanelDrawerOpen, setIsPanelDrawerOpen] = useState(false)
  const initialPanelVisibility = {
    operationsReport: true,
    operationalMetrics: true,
    sosFeed: true,
    tacticalMap: true,
    averageResponse: true,
    vehicles: true,
    rescuers: true,
  }
  const [visiblePanels, setVisiblePanels] = useState({
    ...initialPanelVisibility,
  })
  const [renderedPanels, setRenderedPanels] = useState({ ...initialPanelVisibility })
  const [panelAnimationStates, setPanelAnimationStates] = useState({})
  const panelAnimationTimers = useRef({})
  const panelLayoutBeforeChange = useRef(null)
  const capturePanelLayout = () => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    panelLayoutBeforeChange.current = new Map(
      Array.from(document.querySelectorAll(
        '.ops-console .ops-grid .operational-panel, .ops-console .ops-grid .feed-panel, .ops-console .ops-grid .map-only-column, .ops-console .ops-grid .metric-card, .ops-console .ops-grid .rail-box'
      ), (element) => [element, element.getBoundingClientRect()])
    )
  }
  const setPanelVisibility = (panel, shouldShow) => {
    window.clearTimeout(panelAnimationTimers.current[panel])
    setVisiblePanels((current) => ({ ...current, [panel]: shouldShow }))

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const duration = reducedMotion ? 0 : 220
    setPanelAnimationStates((current) => ({ ...current, [panel]: shouldShow ? 'entering' : 'exiting' }))

    if (shouldShow) {
      capturePanelLayout()
      setRenderedPanels((current) => ({ ...current, [panel]: true }))
    }
    panelAnimationTimers.current[panel] = window.setTimeout(() => {
      if (!shouldShow) {
        capturePanelLayout()
        setRenderedPanels((current) => ({ ...current, [panel]: false }))
      }
      setPanelAnimationStates((current) => {
        const next = { ...current }
        delete next[panel]
        return next
      })
      delete panelAnimationTimers.current[panel]
    }, duration)
  }
  const togglePanel = (panel) => {
    setPanelVisibility(panel, !visiblePanels[panel])
  }
  const allPanelsVisible = Object.values(visiblePanels).every(Boolean)
  const toggleAllPanels = () => {
    const shouldShow = !allPanelsVisible
    Object.keys(visiblePanels).forEach((panel) => setPanelVisibility(panel, shouldShow))
  }
  const getPanelAnimationClass = (panel) => {
    const state = panelAnimationStates[panel]
    return state ? `panel-visibility-${state}` : ''
  }
  const hasLeftRail = renderedPanels.operationalMetrics || renderedPanels.sosFeed
  const hasRightRail = renderedPanels.averageResponse || renderedPanels.vehicles || renderedPanels.rescuers
  const gridColumns = [
    ...(hasLeftRail ? ['200px'] : []),
    ...(renderedPanels.tacticalMap ? ['minmax(0, 1fr)'] : []),
    ...(hasRightRail ? ['213px'] : []),
  ]
  if (!renderedPanels.tacticalMap && gridColumns.length > 0) gridColumns.fill('minmax(0, 1fr)')

  useEffect(() => () => {
    Object.values(panelAnimationTimers.current).forEach(window.clearTimeout)
  }, [])
  useLayoutEffect(() => {
    const previousPositions = panelLayoutBeforeChange.current
    if (!previousPositions) return
    panelLayoutBeforeChange.current = null
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    document.querySelectorAll(
      '.ops-console .ops-grid .operational-panel, .ops-console .ops-grid .feed-panel, .ops-console .ops-grid .map-only-column, .ops-console .ops-grid .metric-card, .ops-console .ops-grid .rail-box'
    ).forEach((element) => {
      const previousPosition = previousPositions.get(element)
      if (!previousPosition) return

      const nextPosition = element.getBoundingClientRect()
      const offsetX = previousPosition.left - nextPosition.left
      const offsetY = previousPosition.top - nextPosition.top
      if (Math.abs(offsetX) < 1 && Math.abs(offsetY) < 1) return

      element.animate(
        [{ translate: `${offsetX}px ${offsetY}px` }, { translate: '0 0' }],
        { duration: 280, easing: 'cubic-bezier(.2, .8, .2, 1)' }
      )
    })
  })

  const categoryFilteredAlertRecords = selectedMapAlertCategory === 'all'
    ? alertRecords
    : alertRecords.filter((alert) => normalizeDisasterType(alert.disaster_type) === selectedMapAlertCategory)
  const closedAlerts = categoryFilteredAlertRecords.filter(isClosedAlert)
  const isReportDateRangeValid = Boolean(reportStartDate && reportEndDate && reportStartDate <= reportEndDate)
  const reportAlerts = isReportDateRangeValid
    ? alertRecords.filter((alert) => {
      const createdDate = manilaDateKey(alert.created_at)
      return createdDate && createdDate >= reportStartDate && createdDate <= reportEndDate
    })
    : []
  const reportClosedAlerts = reportAlerts.filter(isClosedAlert)
  const reportResponseTimes = reportClosedAlerts.map(getAlertResponseMinutes).filter((minutes) => minutes !== null)
  const reportAverageResponseMinutes = reportResponseTimes.length
    ? reportResponseTimes.reduce((total, minutes) => total + minutes, 0) / reportResponseTimes.length
    : null
  const reportMetrics = {
    total: reportAlerts.length,
    active: reportAlerts.filter((alert) => !isClosedAlert(alert)).length,
    dispatched: reportAlerts.filter((alert) => alert.assigned_rescuer_id != null).length,
    rescued: reportClosedAlerts.length,
    averageResponseMinutes: reportAverageResponseMinutes
  }
  const countBy = (getLabel) => reportAlerts.reduce((counts, alert) => {
    const label = getLabel(alert)
    counts[label] = (counts[label] || 0) + 1
    return counts
  }, {})
  const reportAlertsBySeverity = countBy((alert) => statusLabel(alert.severity))
  const reportAlertsByType = countBy((alert) => (
    disasterLabels[String(alert.disaster_type || 'other').toLowerCase()] || statusLabel(alert.disaster_type)
  ))
  const reportFilenamePeriod = `${reportStartDate || 'start'}_to_${reportEndDate || 'end'}`
  const getAssignedVehicleLabels = (alert) => {
    try {
      const assignedVehicleIds = Array.isArray(alert.assigned_vehicle_ids)
        ? alert.assigned_vehicle_ids
        : JSON.parse(alert.assigned_vehicle_ids || '[]')
      return assignedVehicleIds
        .map((vehicleId) => rescueUnits.vehicles.find((vehicle) => String(vehicle.id) === String(vehicleId)))
        .filter(Boolean)
        .map((vehicle) => `${vehicle.vehicle_type} ${vehicle.plate_number}`)
        .join(', ')
    } catch {
      return ''
    }
  }
  const exportReportXlsx = async () => {
    if (!isReportDateRangeValid) return
    setIsExportingReport(true)
    setReportExportError('')
    try {
      const ExcelJS = await import('exceljs')
      const logoBytes = await loadResqLogoBytes()
      const alertRows = reportAlerts.map((alert) => {
        const responseMinutes = isClosedAlert(alert) ? getAlertResponseMinutes(alert) : null
        return {
          'Alert ID': alert.id,
          'Reported at (PHT)': formatTime(alert.created_at),
          'Closed at (PHT)': isClosedAlert(alert) ? formatTime(alert.updated_at) : '',
          Status: statusLabel(alert.status),
          Type: disasterLabels[String(alert.disaster_type || 'other').toLowerCase()] || statusLabel(alert.disaster_type),
          Severity: statusLabel(alert.severity),
          'Reported by': alert.sender_name || '',
          'Assigned rescuer': alert.assigned_rescuer_name || '',
          'Assigned vehicles': getAssignedVehicleLabels(alert),
          'Response time (minutes)': responseMinutes === null ? '' : Number(responseMinutes.toFixed(1)),
          Details: alert.message || ''
        }
      })
      const workbook = new ExcelJS.Workbook()
      workbook.creator = 'ResQ-Route Operations Center'
      workbook.subject = `Operational summary from ${reportStartDate} to ${reportEndDate}`
      workbook.title = 'ResQ-Route Operations Report'
      workbook.created = new Date()
      const logoBase64 = btoa(Array.from(logoBytes, (byte) => String.fromCharCode(byte)).join(''))
      const logoId = workbook.addImage({ base64: `data:image/png;base64,${logoBase64}`, extension: 'png' })
      const navy = '15243A'
      const red = 'D62839'
      const green = '168A75'
      const amber = 'D08A00'
      const muted = '63738A'
      const white = 'FFFFFF'
      const pale = 'F2F5F9'
      const border = 'D9E1EB'
      const styleHeader = (row) => {
        row.height = 24
        row.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } }
          cell.font = { name: 'Aptos', bold: true, color: { argb: white }, size: 10 }
          cell.alignment = { vertical: 'middle', horizontal: 'left' }
          cell.border = { bottom: { style: 'medium', color: { argb: red } } }
        })
      }

      const summarySheet = workbook.addWorksheet('Summary', { views: [{ showGridLines: false }] })
      summarySheet.columns = [{ width: 34 }, { width: 24 }, { width: 20 }, { width: 20 }]
      summarySheet.mergeCells('A1:D2')
      summarySheet.getCell('A1').value = 'RESQ-ROUTE  |  OPERATIONS REPORT'
      summarySheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } }
      summarySheet.getCell('A1').font = { name: 'Aptos Display', size: 19, bold: true, color: { argb: white } }
      summarySheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
      summarySheet.getRow(1).height = 26
      summarySheet.getRow(2).height = 22
      summarySheet.addImage(logoId, { tl: { col: 3.25, row: 0.05 }, ext: { width: 48, height: 48 } })
      summarySheet.mergeCells('A3:D3')
      summarySheet.getCell('A3').value = `REPORTING PERIOD  ·  ${reportStartDate}  —  ${reportEndDate}  (PHILIPPINE TIME)`
      summarySheet.getCell('A3').font = { name: 'Aptos', size: 10, bold: true, color: { argb: muted } }
      summarySheet.getCell('A3').alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
      summarySheet.getRow(3).height = 25

      const kpis = [
        { title: 'TOTAL ALERTS', value: reportMetrics.total, color: navy },
        { title: 'ACTIVE', value: reportMetrics.active, color: red },
        { title: 'RESCUED / CLOSED', value: reportMetrics.rescued, color: green },
        { title: 'MEAN RESPONSE', value: reportMetrics.averageResponseMinutes === null ? 'N/A' : `${reportMetrics.averageResponseMinutes.toFixed(1)} min`, color: amber }
      ]
      kpis.forEach((kpi, index) => {
        const column = index + 1
        summarySheet.mergeCells(5, column, 5, column)
        summarySheet.mergeCells(6, column, 7, column)
        const titleCell = summarySheet.getCell(5, column)
        const valueCell = summarySheet.getCell(6, column)
        titleCell.value = kpi.title
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: kpi.color } }
        titleCell.font = { name: 'Aptos', size: 9, bold: true, color: { argb: white } }
        titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
        valueCell.value = kpi.value
        valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: pale } }
        valueCell.font = { name: 'Aptos Display', size: 19, bold: true, color: { argb: kpi.color } }
        valueCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
        valueCell.border = { bottom: { style: 'thin', color: { argb: border } } }
      })
      summarySheet.getRow(5).height = 23
      summarySheet.getRow(6).height = 25
      summarySheet.getRow(7).height = 16

      const summarySections = [
        { title: 'RESPONSE TEAM', rows: [['Dispatched alerts', reportMetrics.dispatched]] },
        { title: 'ALERTS BY SEVERITY', rows: Object.entries(reportAlertsBySeverity).map(([label, count]) => [label, count]) },
        { title: 'ALERTS BY INCIDENT TYPE', rows: Object.entries(reportAlertsByType).map(([label, count]) => [label, count]) }
      ]
      let summaryRow = 9
      summarySections.forEach((section) => {
        summarySheet.mergeCells(summaryRow, 1, summaryRow, 4)
        const heading = summarySheet.getCell(summaryRow, 1)
        heading.value = section.title
        heading.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } }
        heading.font = { name: 'Aptos', size: 10, bold: true, color: { argb: white } }
        heading.alignment = { vertical: 'middle', indent: 1 }
        summarySheet.getRow(summaryRow).height = 21
        summaryRow += 1
        if (section.rows.length === 0) section.rows.push(['No alerts', 0])
        section.rows.forEach(([label, value], rowIndex) => {
          const row = summarySheet.getRow(summaryRow)
          row.getCell(1).value = label
          row.getCell(2).value = value
          row.getCell(1).font = { name: 'Aptos', size: 10, color: { argb: navy }, bold: true }
          row.getCell(2).font = { name: 'Aptos', size: 10, color: { argb: navy }, bold: true }
          row.getCell(2).alignment = { horizontal: 'right' }
          row.getCell(1).fill = row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowIndex % 2 ? white : pale } }
          row.getCell(1).border = row.getCell(2).border = { bottom: { style: 'hair', color: { argb: border } } }
          row.height = 19
          summaryRow += 1
        })
        summaryRow += 1
      })
      summarySheet.mergeCells(summaryRow, 1, summaryRow, 4)
      summarySheet.getCell(summaryRow, 1).value = 'Generated by the ResQ-Route Operations Center'
      summarySheet.getCell(summaryRow, 1).font = { name: 'Aptos', italic: true, size: 9, color: { argb: muted } }

      const activitySheet = workbook.addWorksheet('Rescue activity', { views: [{ state: 'frozen', ySplit: 1, showGridLines: false }] })
      const alertHeaders = [
        'Alert ID', 'Reported at (PHT)', 'Closed at (PHT)', 'Status', 'Type', 'Severity',
        'Reported by', 'Assigned rescuer', 'Assigned vehicles', 'Response time (minutes)', 'Details'
      ]
      activitySheet.columns = [
        { width: 10 }, { width: 24 }, { width: 24 }, { width: 16 }, { width: 16 }, { width: 14 },
        { width: 23 }, { width: 24 }, { width: 28 }, { width: 23 }, { width: 46 }
      ]
      activitySheet.mergeCells(1, 1, 1, alertHeaders.length)
      activitySheet.getCell('A1').value = 'RESQ-ROUTE  |  RESCUE ACTIVITY'
      activitySheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } }
      activitySheet.getCell('A1').font = { name: 'Aptos Display', size: 16, bold: true, color: { argb: white } }
      activitySheet.getCell('A1').alignment = { vertical: 'middle', indent: 1 }
      activitySheet.getRow(1).height = 32
      activitySheet.mergeCells(2, 1, 2, alertHeaders.length)
      activitySheet.getCell('A2').value = `Reporting period: ${reportStartDate} to ${reportEndDate} (Philippine time)  ·  ${alertRows.length} alerts`
      activitySheet.getCell('A2').font = { name: 'Aptos', size: 10, color: { argb: muted }, italic: true }
      activitySheet.getCell('A2').alignment = { vertical: 'middle' }
      activitySheet.getRow(2).height = 22
      const headerRow = activitySheet.addRow(alertHeaders)
      styleHeader(headerRow)
      activitySheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: alertHeaders.length } }
      alertRows.forEach((data, index) => {
        const row = activitySheet.addRow(alertHeaders.map((header) => data[header]))
        row.height = 32
        row.eachCell((cell) => {
          cell.font = { name: 'Aptos', size: 9, color: { argb: navy } }
          cell.alignment = { vertical: 'middle', wrapText: true }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index % 2 ? white : pale } }
          cell.border = { bottom: { style: 'hair', color: { argb: border } } }
        })
        const statusCell = row.getCell(4)
        const isClosed = String(data.Status).toLowerCase() === 'closed'
        statusCell.font = { name: 'Aptos', size: 9, bold: true, color: { argb: isClosed ? green : red } }
        const severityCell = row.getCell(6)
        const severity = String(data.Severity).toLowerCase()
        const severityColor = severity === 'critical' || severity === 'high' ? red : severity === 'medium' ? amber : green
        severityCell.font = { name: 'Aptos', size: 9, bold: true, color: { argb: severityColor } }
        row.getCell(10).alignment = { vertical: 'middle', horizontal: 'right' }
      })
      activitySheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
      activitySheet.pageSetup.printTitlesRow = '1:3'
      const buffer = await workbook.xlsx.writeBuffer()
      const downloadUrl = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const downloadLink = document.createElement('a')
      downloadLink.href = downloadUrl
      downloadLink.download = `resq-route-operations-${reportFilenamePeriod}.xlsx`
      downloadLink.click()
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000)
    } catch (error) {
      console.error('Unable to export the operations report as XLSX.', error)
      setReportExportError(error.message || 'Could not create the XLSX report. Please try again.')
    } finally {
      setIsExportingReport(false)
    }
  }
  const exportReportPdf = async () => {
    if (!isReportDateRangeValid) return
    setIsExportingReport(true)
    setReportExportError('')
    try {
      const { jsPDF } = await import('jspdf')
      const logoBytes = await loadResqLogoBytes()
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 13
      const contentWidth = pageWidth - margin * 2
      const colors = {
        navy: [21, 36, 58],
        red: [214, 40, 57],
        green: [22, 138, 117],
        amber: [208, 138, 0],
        muted: [99, 115, 138],
        pale: [242, 245, 249],
        border: [217, 225, 235],
        white: [255, 255, 255],
        body: [39, 52, 71]
      }
      const formatPdfDate = (dateKey) => {
        const date = new Date(`${dateKey}T12:00:00+08:00`)
        return new Intl.DateTimeFormat('en-PH', {
          timeZone: 'Asia/Manila',
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        }).format(date)
      }
      const drawPageBrand = (continued = false) => {
        pdf.setFillColor(...colors.navy)
        pdf.rect(0, 0, pageWidth, 31, 'F')
        pdf.setFillColor(...colors.red)
        pdf.rect(0, 31, pageWidth, 2, 'F')
        pdf.addImage(logoBytes, 'PNG', margin, 4, 22, 22)
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(15)
        pdf.setTextColor(...colors.white)
        pdf.text('RESQ-ROUTE', margin + 27, 12)
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(8)
        pdf.setTextColor(205, 216, 231)
        pdf.text(continued ? 'OPERATIONS REPORT  ·  CONTINUED' : 'OPERATIONS REPORT  ·  DISPATCH SUMMARY', margin + 27, 18)
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(8)
        pdf.setTextColor(...colors.white)
        pdf.text(`${formatPdfDate(reportStartDate)} — ${formatPdfDate(reportEndDate)}  ·  PHILIPPINE TIME`, pageWidth - margin, 25, { align: 'right' })
      }
      drawPageBrand()
      let y = 40
      const addPageIfNeeded = (height) => {
        if (y + height > pageHeight - margin) {
          pdf.addPage()
          drawPageBrand(true)
          y = 39
        }
      }
      const drawSectionHeading = (title, subtitle = '') => {
        pdf.setFillColor(...colors.navy)
        pdf.roundedRect(margin, y, contentWidth, 7, 1.4, 1.4, 'F')
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(8.5)
        pdf.setTextColor(...colors.white)
        pdf.text(title.toUpperCase(), margin + 3, y + 4.7)
        if (subtitle) {
          pdf.setFont('helvetica', 'normal')
          pdf.setFontSize(7.5)
          pdf.text(subtitle, pageWidth - margin - 3, y + 4.7, { align: 'right' })
        }
        y += 10
      }
      const kpis = [
        { label: 'TOTAL ALERTS', value: String(reportMetrics.total), color: colors.navy },
        { label: 'ACTIVE', value: String(reportMetrics.active), color: colors.red },
        { label: 'RESCUED', value: String(reportMetrics.rescued), color: colors.green },
        { label: 'MEAN RESPONSE', value: reportMetrics.averageResponseMinutes === null ? 'N/A' : `${reportMetrics.averageResponseMinutes.toFixed(1)} min`, color: colors.amber }
      ]
      const cardGap = 3
      const cardWidth = (contentWidth - cardGap * 3) / 4
      kpis.forEach((kpi, index) => {
        const x = margin + index * (cardWidth + cardGap)
        pdf.setFillColor(...colors.pale)
        pdf.roundedRect(x, y, cardWidth, 20, 1.5, 1.5, 'F')
        pdf.setFillColor(...kpi.color)
        pdf.roundedRect(x, y, 2, 20, 1, 1, 'F')
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(7)
        pdf.setTextColor(...colors.muted)
        pdf.text(kpi.label, x + 4, y + 6)
        pdf.setFontSize(kpi.value.length > 10 ? 10 : 13)
        pdf.setTextColor(...kpi.color)
        pdf.text(kpi.value, x + 4, y + 14)
      })
      y += 25
      drawSectionHeading('Operational overview', `${reportMetrics.dispatched} dispatched`)
      const breakdown = [
        { title: 'BY SEVERITY', entries: Object.entries(reportAlertsBySeverity), color: colors.red },
        { title: 'BY INCIDENT TYPE', entries: Object.entries(reportAlertsByType), color: colors.green }
      ]
      const breakdownGap = 5
      const breakdownWidth = (contentWidth - breakdownGap) / 2
      breakdown.forEach((section, index) => {
        const x = margin + index * (breakdownWidth + breakdownGap)
        pdf.setFillColor(...colors.pale)
        pdf.roundedRect(x, y, breakdownWidth, 24, 1.5, 1.5, 'F')
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(7)
        pdf.setTextColor(...colors.muted)
        pdf.text(section.title, x + 4, y + 5)
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(8)
        pdf.setTextColor(...section.color)
        const entries = section.entries.map(([label, count]) => `${label}  ${count}`)
        const lines = pdf.splitTextToSize(entries.length ? entries.join('   ·   ') : 'No alerts', breakdownWidth - 8)
        pdf.text(lines.slice(0, 2), x + 4, y + 11)
      })
      y += 30
      drawSectionHeading('Rescue activity', `${reportAlerts.length} alerts in selected period`)

      reportAlerts.forEach((alert) => {
        const responseMinutes = isClosedAlert(alert) ? getAlertResponseMinutes(alert) : null
        const assignedVehicles = getAssignedVehicleLabels(alert)
        const status = statusLabel(alert.status)
        const severity = statusLabel(alert.severity)
        const statusColor = isClosedAlert(alert) ? colors.green : colors.red
        const severityColor = severity === 'CRITICAL' || severity === 'HIGH' ? colors.red : severity === 'MEDIUM' ? colors.amber : colors.green
        const category = disasterLabels[String(alert.disaster_type || 'other').toLowerCase()] || 'Other'
        const lines = [
          `Reported   ${formatTime(alert.created_at)}${isClosedAlert(alert) ? `     Closed   ${formatTime(alert.updated_at)}` : ''}`,
          `Reporter   ${alert.sender_name || 'Unknown'}${alert.assigned_rescuer_name ? `     Rescuer   ${alert.assigned_rescuer_name}` : ''}${responseMinutes === null ? '' : `     Response   ${responseMinutes.toFixed(1)} min`}`,
          assignedVehicles ? `Vehicles   ${assignedVehicles}` : '',
          alert.message ? `Details   ${alert.message}` : ''
        ].filter(Boolean).flatMap((line) => pdf.splitTextToSize(line, contentWidth - 10))
        const cardHeight = 12 + lines.length * 4.1 + 3
        addPageIfNeeded(cardHeight + 2)
        pdf.setFillColor(249, 251, 253)
        pdf.roundedRect(margin, y, contentWidth, cardHeight, 1.5, 1.5, 'F')
        pdf.setFillColor(...statusColor)
        pdf.roundedRect(margin, y, 2, cardHeight, 1, 1, 'F')
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(9)
        pdf.setTextColor(...colors.navy)
        pdf.text(`#${alert.id}   ${category}`, margin + 5, y + 5.5)
        pdf.setFontSize(7)
        const statusLabelWidth = pdf.getTextWidth(status) + 5
        const severityLabelWidth = pdf.getTextWidth(severity) + 5
        pdf.setFillColor(...severityColor)
        pdf.roundedRect(pageWidth - margin - statusLabelWidth - severityLabelWidth - 3, y + 2, severityLabelWidth, 5, 1, 1, 'F')
        pdf.setTextColor(...colors.white)
        pdf.text(severity, pageWidth - margin - statusLabelWidth - severityLabelWidth - 0.5, y + 5.5)
        pdf.setFillColor(...statusColor)
        pdf.roundedRect(pageWidth - margin - statusLabelWidth - 1, y + 2, statusLabelWidth, 5, 1, 1, 'F')
        pdf.text(status, pageWidth - margin - statusLabelWidth + 1.5, y + 5.5)
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(7.5)
        pdf.setTextColor(...colors.body)
        pdf.text(lines, margin + 5, y + 11)
        y += cardHeight + 2
      })
      if (reportAlerts.length === 0) {
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(9)
        pdf.setTextColor(...colors.muted)
        pdf.text('No alerts were reported during this period.', margin, y + 2)
      }
      const pageCount = pdf.internal.getNumberOfPages()
      for (let page = 1; page <= pageCount; page += 1) {
        pdf.setPage(page)
        pdf.setDrawColor(...colors.border)
        pdf.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10)
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(7)
        pdf.setTextColor(...colors.muted)
        pdf.text('RESQ-ROUTE  ·  OPERATIONAL USE', margin, pageHeight - 5)
        pdf.text(`PAGE ${page} OF ${pageCount}`, pageWidth - margin, pageHeight - 5, { align: 'right' })
      }
      pdf.save(`resq-route-operations-${reportFilenamePeriod}.pdf`)
    } catch (error) {
      console.error('Unable to export the operations report as PDF.', error)
      setReportExportError('Could not create the PDF report. Please try again.')
    } finally {
      setIsExportingReport(false)
    }
  }
  const alerts = categoryFilteredAlertRecords.filter((alert) => !isClosedAlert(alert))
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
  const closedAlertPageCount = Math.max(1, Math.ceil(closedAlerts.length / ALERTS_PER_PAGE))
  const currentClosedAlertPage = Math.min(closedAlertPage, closedAlertPageCount - 1)
  const visibleClosedAlerts = closedAlerts.slice(
    currentClosedAlertPage * ALERTS_PER_PAGE,
    (currentClosedAlertPage + 1) * ALERTS_PER_PAGE
  )
  const setAlerts = (nextAlerts) => setAlertRecords((currentAlerts) => (
    typeof nextAlerts === 'function' ? nextAlerts(currentAlerts) : nextAlerts
  ))

  const handleViewAlert = (alert) => {
    setSelectedAlert(alert)
    setSelectedImagePreview(null)
    setAlertImageSize('medium')
    const longitude = Number(alert.longitude)
    const latitude = Number(alert.latitude)
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      setAlertStatus(`Alert #${alert.id} does not have valid map coordinates.`)
      return
    }
    setFocusedAlertLocation([longitude, latitude])
    setFocusedAlertId(alert.id)
    setFocusRequestKey((current) => current + 1)
  }

  useEffect(() => {
    if (!selectedAlert) {
      setAlertLocation('')
      return undefined
    }
    let cancelled = false
    setAlertLocationLoading(true)
    lookupAlertLocation(selectedAlert.latitude, selectedAlert.longitude)
      .then((location) => {
        if (!cancelled) setAlertLocation(location)
      })
      .finally(() => {
        if (!cancelled) setAlertLocationLoading(false)
      })
    return () => { cancelled = true }
  }, [selectedAlert?.id, selectedAlert?.latitude, selectedAlert?.longitude])

  const verifiedAlert = verifiedAlertState
  const setVerifiedAlert = (alert) => setVerifiedAlertState((current) => current?.id === alert?.id ? null : alert)
  const { socket, isConnected, lastMessage } = useWebSocket(WS_URL)
  const { collection: roadHazardZones, hazards: roadHazards, applyFeature: applyRoadHazard } = useActiveRoadHazards(lastMessage, isConnected)

  const refreshPendingRoadHazards = useCallback(async () => {
    if (!['dispatcher', 'admin'].includes(role)) return
    const response = await fetch(`${API_BASE_URL}/api/v1/hazards/pending`, { headers: getAuthHeaders() })
    if (!response.ok) throw new Error(`Pending road hazards could not be loaded (${response.status}).`)
    setPendingRoadHazards(await response.json())
  }, [role])

  useEffect(() => {
    void refreshPendingRoadHazards().catch(() => {})
    const timer = window.setInterval(() => void refreshPendingRoadHazards().catch(() => {}), 30_000)
    return () => window.clearInterval(timer)
  }, [refreshPendingRoadHazards])

  useEffect(() => {
    if (lastMessage?.type === 'road_hazard_submitted') {
      void refreshPendingRoadHazards().catch(() => {})
    }
  }, [lastMessage, refreshPendingRoadHazards])

  const reviewRoadHazard = async (id, approved) => {
    setRoadHazardReviewing(id)
    setRoadHazardReviewError('')
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/hazards/road-reports/${id}/review`, {
        method: 'PATCH',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved }),
      })
      if (!response.ok) {
        const responseData = await response.json().catch(() => null)
        throw new Error(responseData?.detail || `Review failed (${response.status}).`)
      }
      const feature = await response.json()
      setPendingRoadHazards((current) => ({
        ...current,
        features: current.features.filter((item) => String(item.id) !== String(id)),
      }))
      applyRoadHazard(feature)
    } catch (error) {
      setRoadHazardReviewError(error.message || 'Unable to review road hazard.')
    } finally {
      setRoadHazardReviewing(null)
    }
  }

  const handleMapMarkerClick = (marker) => {
    if (marker.kind !== 'road-hazard') return
    const pendingId = String(marker.id || '').startsWith('pending-road-')
      ? String(marker.id).replace('pending-road-', '')
      : null
    const pendingFeature = pendingId
      ? pendingRoadHazards.features.find((feature) => String(feature.id) === pendingId)
      : null
    const hazard = roadHazards.find((item) => String(item.id) === String(marker.id))
    setSelectedRoadHazard({
      id: hazard?.id || pendingFeature?.id || pendingId || marker.id,
      ...(hazard || pendingFeature?.properties || {}),
    })
  }

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
      setSelectedAlert((currentAlert) => (
        currentAlert?.id === lastMessage.data.id
          ? { ...currentAlert, ...lastMessage.data }
          : currentAlert
      ))
    }

    if (lastMessage?.type === 'rescuer_status_updated' && lastMessage.data) {
      const { rescuer_id: rescuerId, status } = lastMessage.data
      setRescuers((current) => current.map((rescuer) => (
        String(rescuer.user_id ?? rescuer.id) === String(rescuerId) ? { ...rescuer, status } : rescuer
      )))
      setRescueUnits((current) => ({
        ...current,
        rescuers: current.rescuers.map((rescuer) => (
          String(rescuer.user_id ?? rescuer.id) === String(rescuerId) ? { ...rescuer, status } : rescuer
        )),
      }))
    }

    if (role !== 'citizen' && lastMessage?.type === 'evacuation_route_updated' && lastMessage.data) {
      setActiveEvacuationRoute(lastMessage.data)
    }
  }, [lastMessage, role])

  useEffect(() => {
    if (role !== 'dispatcher' || lastMessage?.type !== 'alert_status_report_updated') return undefined
    const reportId = lastMessage.data?.report_id
    if (!Number.isInteger(reportId) || seenStatusReportIds.current.has(reportId) || pendingStatusReportIds.current.has(reportId)) {
      return undefined
    }

    pendingStatusReportIds.current.add(reportId)
    const loadStatusReport = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/auth/alerts/status-reports/${reportId}`, {
          headers: getAuthHeaders(),
        })
        if (!response.ok) throw new Error(`Unable to load rescuer report (${response.status}).`)
        const report = await response.json()
        if (seenStatusReportIds.current.has(report.id)) return
        seenStatusReportIds.current.add(report.id)
        setStatusReportQueue((current) => [...current, report])
      } catch (error) {
        console.error('Unable to load rescuer status report.', error)
      } finally {
        pendingStatusReportIds.current.delete(reportId)
      }
    }

    loadStatusReport()
    return undefined
  }, [API_BASE_URL, lastMessage, role])

  useEffect(() => {
    if (role !== 'dispatcher' || !isConnected) return undefined
    let disposed = false

    const loadRecentStatusReports = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/auth/alerts/status-reports/recent`, {
          headers: getAuthHeaders(),
        })
        if (!response.ok) throw new Error(`Unable to load rescuer reports (${response.status}).`)
        const reports = await response.json()
        if (disposed) return

        if (!statusReportsInitialized.current) {
          reports.forEach((report) => {
            if (!pendingStatusReportIds.current.has(report.id)) seenStatusReportIds.current.add(report.id)
          })
          statusReportsInitialized.current = true
          return
        }

        reports.reverse().forEach((report) => {
          if (seenStatusReportIds.current.has(report.id)) return
          seenStatusReportIds.current.add(report.id)
          setStatusReportQueue((current) => [...current, report])
        })
      } catch (error) {
        if (!disposed) console.error('Unable to load recent rescuer status reports.', error)
      }
    }

    loadRecentStatusReports()
    return () => {
      disposed = true
    }
  }, [API_BASE_URL, isConnected, role])

  useEffect(() => {
    if (latestStatusReport || statusReportQueue.length === 0) return
    setLatestStatusReport(statusReportQueue[0])
    setStatusReportQueue((current) => current.slice(1))
  }, [latestStatusReport, statusReportQueue])

  useEffect(() => {
    if (!latestStatusReport) return undefined
    const timeoutId = window.setTimeout(() => setLatestStatusReport(null), 4000)
    return () => window.clearTimeout(timeoutId)
  }, [latestStatusReport?.id])

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
    let disposed = false
    const loadOperationMetrics = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/operations/metrics?window_days=7`, { headers: getAuthHeaders() })
        if (!response.ok) throw new Error(`Unable to load operation metrics (${response.status}).`)
        const payload = await response.json()
        if (!disposed) setOperationMetrics(payload)
      } catch (error) {
        if (!disposed) {
          setOperationMetrics(null)
          console.error('Failed to load operation metrics', error)
        }
      }
    }

    loadOperationMetrics()
    const intervalId = window.setInterval(loadOperationMetrics, 30_000)
    return () => {
      disposed = true
      window.clearInterval(intervalId)
    }
  }, [API_BASE_URL])

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

    const loadHazardLayers = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/hazards/map-layers?status=all`, { headers: getAuthHeaders() })
        if (response.ok) setHazardLayers(await response.json())
      } catch (error) {
        console.error('Failed to load hazard map layers', error)
      }
    }

    loadAlerts()
    loadRescuers()
    loadRescueUnits()
    loadCenters()
    loadHazardLayers()
    const rescuerStatusRefresh = window.setInterval(() => {
      loadRescuers()
      loadRescueUnits()
    }, 30_000)
    return () => {
      window.clearInterval(rescuerStatusRefresh)
    }
  }, [API_BASE_URL])

  const mediumHazardLayers = hazardLayers.filter((layer) => String(layer.hazard_level).toLowerCase() === 'medium')
  const highHazardLayers = hazardLayers.filter((layer) => String(layer.hazard_level).toLowerCase() === 'high')
  const visibleHazardLayers = hazardLayers.filter((layer) => ['medium', 'high'].includes(String(layer.hazard_level).toLowerCase()))
  const renderedHazardLayers = showNoahHazards ? visibleHazardLayers : []
  const renderedRoadHazardZones = showRoadHazards ? roadHazardZones : { type: 'FeatureCollection', features: [] }
  const renderedPendingRoadHazards = showRoadHazards ? pendingRoadHazards : { type: 'FeatureCollection', features: [] }
  const allMediumHazardsPublished = mediumHazardLayers.length > 0 && mediumHazardLayers.every((layer) => layer.is_published)
  const allHighHazardsPublished = highHazardLayers.length > 0 && highHazardLayers.every((layer) => layer.is_published)

  const handlePublishHazardLevel = async (hazardLevel, isPublished) => {
    const layersToUpdate = hazardLevel === 'medium' ? mediumHazardLayers : highHazardLayers
    setHazardLayerPublishing(hazardLevel)
    try {
      const responses = await Promise.all(layersToUpdate.map((layer) => fetch(`${API_BASE_URL}/api/v1/hazards/${layer.id}/publish`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ is_published: isPublished })
      })))
      if (responses.some((response) => !response.ok)) throw new Error('Unable to update hazard publication status.')
      setHazardLayers((layers) => layers.map((layer) => layersToUpdate.some((updatedLayer) => updatedLayer.id === layer.id) ? { ...layer, is_published: isPublished } : layer))
    } catch (error) {
      setAlertStatus(error.message)
    } finally {
      setHazardLayerPublishing(null)
    }
  }

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
      const alert = alerts.find((entry) => String(entry.id) === String(alertId))
      const hasAvailableRescuer = rescueUnits.rescuers.some(isAvailableRescuer)
      if (rescuer && isRecoveringRescuer(rescuer) && !isCriticalAlert(alert) && hasAvailableRescuer) {
        setAlertStatus('Recovering rescuers can only be assigned to critical alerts or when no rescuer is available.')
        return false
      }

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

      if (!response.ok) {
        const responseData = await response.json()
        throw new Error(responseData.detail || 'Unable to assign rescuer')
      }

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

  const openAssignmentModal = (alertId) => {
    const alert = alerts.find((entry) => String(entry.id) === String(alertId))
    if (alert) setAssigningAlert(alert)
  }

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

  const alertMarkers = alerts.map((alert) => {
    const category = normalizeDisasterType(alert.disaster_type)
    return {
      kind: 'alert',
      id: alert.id,
      category,
      position: [alert.longitude, alert.latitude],
      label: `${alert.sender_name} · ${statusLabel(alert.status)}`,
      color: alertMarkerColors[category],
      icon: disasterIcons[category],
      details: { type: disasterLabels[category], status: statusLabel(alert.status), reported_by: alert.sender_name, time: formatTime(alert.created_at), location: `${alert.latitude}, ${alert.longitude}`, severity: alert.severity, message: alert.message }
    }
  })

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
    id: hazard.id,
    kind: 'road-hazard',
    position: [hazard.longitude, hazard.latitude],
    label: `${hazard.road_name || 'Road hazard'} · ${String(hazard.hazard_type).replace(/_/g, ' ')} (${hazard.radius_meters}m)`,
    color: '#ea580c',
    icon: '!',
    details: { type: String(hazard.hazard_type).replace(/_/g, ' '), severity: hazard.severity, status: hazard.is_resolved ? 'Resolved' : hazard.is_active === false ? 'Inactive' : 'Active', road: hazard.road_name || 'Unspecified road', time: formatTime(hazard.reported_at || hazard.created_at), location: `${hazard.latitude}, ${hazard.longitude}`, description: hazard.description }
  }))

  const pendingHazardMarkers = pendingRoadHazards.features.map(({ id, properties }) => ({
    id: `pending-road-${id}`,
    kind: 'road-hazard',
    position: [properties.longitude, properties.latitude],
    label: `${properties.road_name || 'Road hazard'} · Pending review`,
    color: '#f59e0b',
    icon: '!',
    details: { type: properties.hazard_type, severity: properties.severity, status: 'Pending dispatcher review', description: properties.description },
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

  const mapMarkers = [...centerMarkers, ...alertMarkers, ...rescuerMarkers, ...liveRescuerMarkers, ...vehicleMarkers, ...hazardMarkers, ...pendingHazardMarkers]
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
      if (handle.hasPointerCapture?.(upEvent.pointerId)) handle.releasePointerCapture(upEvent.pointerId)
      handle?.removeEventListener('pointermove', onPointerMove)
      handle?.removeEventListener('pointerup', onPointerUp)
      window.dispatchEvent(new Event('resize'))
    }

    handle.addEventListener('pointermove', onPointerMove)
    handle.addEventListener('pointerup', onPointerUp)
  }

  const activeRescuerCount = rescueUnits.rescuers.filter(isDisplayableRescuer).length
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
    ? getEligibleAssignmentRescuers(rescueUnits.rescuers, assigningAlert)
      .sort((first, second) => {
      const hasAvailableRescuer = rescueUnits.rescuers.some(isAvailableRescuer)
      if (!hasAvailableRescuer) {
        const firstRecovering = isRecoveringRescuer(first) ? 0 : 1
        const secondRecovering = isRecoveringRescuer(second) ? 0 : 1
        if (firstRecovering !== secondRecovering) return firstRecovering - secondRecovering
      }
      const firstAvailable = isAvailableRescuer(first) ? 0 : 1
      const secondAvailable = isAvailableRescuer(second) ? 0 : 1
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

  const handleLogout = () => onLogout?.()

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

  const animateDashboardCardClick = (event) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const target = event.target
    if (!(target instanceof Element)) return

    const card = target.closest(
      '.sos-item, .rail-metric, .metric-card, .unit-row, .operational-panel, .feed-panel, .rail-box, .panel-title-clickable'
    )
    if (!card || !event.currentTarget.contains(card)) return

    card.animate(
      [
        { transform: 'scale(1)' },
        { transform: 'scale(0.985)', offset: 0.45 },
        { transform: 'scale(1)' }
      ],
      { duration: 220, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
    )
  }

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
    <main className="ops-console" onClickCapture={animateDashboardCardClick}>
      <header className="ops-header">
        <div className="brand-lockup">
          <Logo size="small" />
          <div><strong>RESQ-ROUTE</strong><span>CDRRMO LIVE OPERATIONS CENTER</span></div>
        </div>
        <div className="header-actions">
          <span className={`connection ${isConnected ? 'online' : 'offline'}`}><i /> WebSocket: {isConnected ? 'Connected' : 'Reconnecting'}</span>
          <span className="header-time">{formattedCurrentTime} PHT</span>
          <button
            type="button"
            className="panel-drawer-toggle"
            aria-label={isPanelDrawerOpen ? 'Close dashboard panel settings' : 'Open dashboard panel settings'}
            aria-expanded={isPanelDrawerOpen}
            aria-controls="dashboard-panel-drawer"
            onClick={() => setIsPanelDrawerOpen((open) => !open)}
          >
            <SlidersHorizontal size={15} />
            <span>Panels</span>
          </button>
          {accountMenu}
        </div>
      </header>

      {renderedPanels.operationsReport && (
        <HazardTicker
          hazards={roadHazards}
          className={getPanelAnimationClass('operationsReport')}
        />
      )}

      {isPanelDrawerOpen && (
        <>
          <button
            type="button"
            className="panel-drawer-backdrop"
            aria-label="Close dashboard panel settings"
            onClick={() => setIsPanelDrawerOpen(false)}
          />
          <aside id="dashboard-panel-drawer" className="panel-drawer" aria-label="Dashboard panel visibility">
            <div className="panel-drawer-heading">
              <div>
                <strong>Dashboard panels</strong>
                <span>Choose which cards are visible</span>
              </div>
              <button type="button" className="panel-drawer-close" onClick={() => setIsPanelDrawerOpen(false)} aria-label="Close panel settings">
                <X size={16} />
              </button>
            </div>
            <button type="button" className="panel-drawer-show-all" onClick={toggleAllPanels}>
              {allPanelsVisible ? 'Hide all panels' : 'Show all panels'}
            </button>
            <div className="panel-drawer-options">
              {[
                ['operationsReport', 'Operations report and hazard ticker'],
                ['operationalMetrics', 'Operational metrics'],
                ['sosFeed', 'Live SOS feed'],
                ['tacticalMap', 'Tactical map'],
                ['averageResponse', 'Average response'],
                ['vehicles', 'Vehicles'],
                ['rescuers', 'Rescuer profiles'],
              ].map(([panel, label]) => (
                <label key={panel} className="panel-drawer-option">
                  <input
                    type="checkbox"
                    checked={visiblePanels[panel]}
                    onChange={() => togglePanel(panel)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </aside>
        </>
      )}

      {latestStatusReport && (
        <section
          role="status"
          aria-live="assertive"
          className={`rescuer-report-toast${latestStatusReport.report_type === 'need_backup' ? ' is-backup' : ''}`}
        >
          <div>
            <strong className="rescuer-report-title">
              {latestStatusReport.report_type === 'need_backup' ? 'Backup requested' : 'Rescuer status report'}
            </strong>
            <span className="rescuer-report-meta">Alert #{latestStatusReport.alert_id} · {latestStatusReport.reporter_name}</span>
            <p style={{ margin: '5px 0 0', fontSize: '13px' }}>{latestStatusReport.message}</p>
            {latestStatusReport.additional_notes && (
              <p className="rescuer-report-notes">{latestStatusReport.additional_notes}</p>
            )}
          </div>
          <button
            type="button"
            aria-label="Dismiss latest rescuer report"
            onClick={() => setLatestStatusReport(null)}
            className="rescuer-report-dismiss"
          >
            Dismiss
          </button>
        </section>
      )}

      {renderedPanels.operationsReport && <section className={`report-toolbar ${getPanelAnimationClass('operationsReport')}`} aria-labelledby="report-toolbar-title">
        <div className="report-toolbar-heading">
          <strong id="report-toolbar-title">OPERATIONS REPORT</strong>
          <span>
            {isReportDateRangeValid
              ? `${reportMetrics.total} alerts · ${reportMetrics.rescued} rescued · ${reportMetrics.active} active`
              : 'Choose a valid date range'}
          </span>
        </div>
        <label>
          <span>From</span>
          <input
            type="date"
            value={reportStartDate}
            max={reportEndDate || undefined}
            onChange={(event) => setReportStartDate(event.target.value)}
          />
        </label>
        <label>
          <span>To</span>
          <input
            type="date"
            value={reportEndDate}
            min={reportStartDate || undefined}
            onChange={(event) => setReportEndDate(event.target.value)}
          />
        </label>
        <div className="report-export-actions">
          <button type="button" disabled={!isReportDateRangeValid || isExportingReport} onClick={exportReportPdf}>
            {isExportingReport ? 'Preparing…' : 'Export PDF'}
          </button>
          <button type="button" disabled={!isReportDateRangeValid || isExportingReport} onClick={exportReportXlsx}>
            {isExportingReport ? 'Preparing…' : 'Export XLSX'}
          </button>
        </div>
        {!isReportDateRangeValid && (
          <span className="report-range-error" role="alert">The start date must be on or before the end date.</span>
        )}
        {reportExportError && <span className="report-range-error" role="alert">{reportExportError}</span>}
      </section>}

      <section
        className={`ops-grid${gridColumns.length === 0 ? ' is-empty' : ''}`}
        style={gridColumns.length > 0 ? { gridTemplateColumns: gridColumns.join(' ') } : undefined}
      >
        {/* LEFT COLUMN: Operational Metrics (Top) + Live SOS Feed (Bottom) */}
        {hasLeftRail && <aside className="left-rail">
          {/* TOP: Operational Metrics */}
          {renderedPanels.operationalMetrics && <section className={`operational-panel ${getPanelAnimationClass('operationalMetrics')}`}>
            <PanelTitle title="OPERATIONAL METRICS" />
            <div className="operational-metrics-body">
              <Metric label="ACTIVE SOS" value={alertCount} color="red" />
              <Metric
                label="DISPATCHED"
                value={`${rescueUnits.dispatched_count || 0} / ${rescueUnits.rescuer_count || 0}`}
                color="red"
              />
              <Metric label="RESCUED (7D)" value={operationMetrics ? operationMetrics.people_rescued : '—'} color="green" />
            </div>
          </section>}

          {/* BOTTOM: Live SOS Feed */}
          {renderedPanels.sosFeed && <section className={`feed-panel ${getPanelAnimationClass('sosFeed')}`}>
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
                <button
                  type="button"
                  className={feedView === 'closed' ? 'active' : ''}
                  aria-pressed={feedView === 'closed'}
                  onClick={() => setFeedView('closed')}
                >
                  <span>CLOSED</span>
                  <span className="feed-view-count">{closedAlerts.length}</span>
                </button>
              </div>

              {feedView === 'closed' ? (
                <div className="feed-alert-section" aria-label="Closed SOS alerts">
                  <h3>CLOSED SOS ALERTS</h3>
                  <div className="feed-items-scroll">
                    {closedAlerts.length === 0 ? (
                      <p className="feed-empty">No closed SOS alerts.</p>
                    ) : (
                      visibleClosedAlerts.map((alert) => (
                        <SosFeedItem
                          key={`closed-${alert.id}`}
                          alert={alert}
                          now={currentTime}
                          onAssign={handleAssignAlert}
                          onView={handleViewAlert}
                          isClosed
                        />
                      ))
                    )}
                  </div>
                  {closedAlerts.length > ALERTS_PER_PAGE && (
                    <nav className="feed-alert-pagination" aria-label="Closed SOS alert pages">
                      <button
                        type="button"
                        aria-label="Previous closed alerts"
                        disabled={currentClosedAlertPage === 0}
                        onClick={() => setClosedAlertPage((page) => Math.max(0, page - 1))}
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <span>PAGE {currentClosedAlertPage + 1} / {closedAlertPageCount}</span>
                      <button
                        type="button"
                        aria-label="Next closed alerts"
                        disabled={currentClosedAlertPage >= closedAlertPageCount - 1}
                        onClick={() => setClosedAlertPage((page) => Math.min(closedAlertPageCount - 1, page + 1))}
                      >
                        <ChevronRight size={14} />
                      </button>
                    </nav>
                  )}
                </div>
              ) : feedView === 'unattended' ? (
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
                          onAssign={openAssignmentModal}
                          onView={handleViewAlert}
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
                          onAssign={openAssignmentModal}
                          onView={handleViewAlert}
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
          </section>}
        </aside>}

        {/* CENTER COLUMN: MAP ONLY */}
        {renderedPanels.tacticalMap && <main className={`center-column map-only-column ${getPanelAnimationClass('tacticalMap')}`}>
          <section className="map-panel">
            <PanelTitle title="CDRRMO TACTICAL MAP AREA" badge="TRACKING MAP" />
            <button className="map-hazard-publish-button" type="button" onClick={() => setIsRoadHazardFormOpen((open) => !open)}>
              Report Road Hazard
            </button>
            {selectedRoadHazard && (
              <article className="road-hazard-selected-report" aria-label={`Road hazard report ${selectedRoadHazard.id}`}>
                <div className="road-hazard-selected-heading">
                  <h3>Road hazard report #{selectedRoadHazard.id}</h3>
                  <button type="button" onClick={() => setSelectedRoadHazard(null)} aria-label="Close hazard report details">×</button>
                </div>
                <dl>
                  <div><dt>Type</dt><dd>{String(selectedRoadHazard.hazard_type || '—').replace(/_/g, ' ')}</dd></div>
                  <div><dt>Severity</dt><dd>{selectedRoadHazard.severity || '—'}</dd></div>
                  <div><dt>Status</dt><dd>{selectedRoadHazard.review_status || (selectedRoadHazard.is_resolved ? 'Resolved' : 'Active')}</dd></div>
                  <div><dt>Road</dt><dd>{selectedRoadHazard.road_name || 'Unspecified road'}</dd></div>
                  <div><dt>Location</dt><dd>{selectedRoadHazard.latitude ?? '—'}, {selectedRoadHazard.longitude ?? '—'}</dd></div>
                  <div><dt>Description</dt><dd>{selectedRoadHazard.description || 'No description provided.'}</dd></div>
                </dl>
              </article>
            )}
            {pendingRoadHazards.features.length > 0 && (
              <section className="road-hazard-review-queue" aria-label="Pending road hazard reports">
                <h3>Road hazards awaiting review ({pendingRoadHazards.features.length})</h3>
                {pendingRoadHazards.features.map(({ id, properties }) => (
                  <article key={id} className="road-hazard-review-item">
                    <strong>{String(properties.hazard_type).replace(/_/g, ' ')} · {properties.severity}</strong>
                    <span>{properties.road_name || 'Unnamed road'} · {properties.radius_meters} m radius</span>
                    <p>{properties.description}</p>
                    <small>{Number(properties.latitude).toFixed(5)}, {Number(properties.longitude).toFixed(5)} · Reported by {properties.reporter_name || 'Anonymous'}</small>
                    <div>
                      <button type="button" disabled={roadHazardReviewing !== null} onClick={() => reviewRoadHazard(id, true)}>Approve & publish</button>
                      <button type="button" disabled={roadHazardReviewing !== null} onClick={() => reviewRoadHazard(id, false)}>Reject</button>
                    </div>
                  </article>
                ))}
              </section>
            )}
            {roadHazardReviewError && <p className="road-hazard-review-error" role="alert">{roadHazardReviewError}</p>}
            {isRoadHazardFormOpen && (
              <RoadHazardReportForm
                initialLocation={latestGps || primaryCenter}
                reporterName={auth?.user?.full_name || ''}
                onReported={() => void refreshPendingRoadHazards()}
                onClose={() => setIsRoadHazardFormOpen(false)}
              />
            )}
            <div className="map-category-filter" role="group" aria-label="Filter alert markers by category">
              {alertCategoryOptions.map((category) => (
                <button
                  key={category.value}
                  type="button"
                  className={selectedMapAlertCategory === category.value ? 'is-selected' : ''}
                  style={{ '--category-color': category.color }}
                  aria-pressed={selectedMapAlertCategory === category.value}
                  onClick={() => {
                    setSelectedMapAlertCategory(category.value)
                    setRegularAlertPage(0)
                    setPinnedAlertPage(0)
                    setClosedAlertPage(0)
                  }}
                >
                  {category.label}
                </button>
              ))}
            </div>
            <div className="map-hazard-publish-controls" aria-label="Publish hazard layers to citizens">
              {[
                { level: 'medium', label: 'Medium', layers: mediumHazardLayers, published: allMediumHazardsPublished },
                { level: 'high', label: 'High', layers: highHazardLayers, published: allHighHazardsPublished },
              ].map(({ level, label, layers, published }) => (
                <button
                  key={level}
                  type="button"
                  className={`map-hazard-publish-button hazard-${level}`}
                  disabled={hazardLayerPublishing !== null || layers.length === 0}
                  aria-pressed={published}
                  onClick={() => handlePublishHazardLevel(level, !published)}
                >
                  {hazardLayerPublishing === level && <span className="map-hazard-publish-spinner" aria-hidden="true" />}
                  {published ? `Unpublish ${label} Hazards` : `Publish ${label} Hazards`}
                </button>
              ))}
            </div>
            <div className="map-stage" style={{ height: `${mapHeight}px` }}>
              <div className="map-legend-static" role="group" aria-label="Map legend">
                <b>MAP LEGEND</b>
                <span><i className="legend-swatch marker-alert-flood" /> ALERT · FLOOD</span>
                <span><i className="legend-swatch marker-alert-earthquake" /> ALERT · EARTHQUAKE</span>
                <span><i className="legend-swatch marker-alert-fire" /> ALERT · FIRE</span>
                <span><i className="legend-swatch marker-alert-medical" /> ALERT · MEDICAL</span>
                <span><i className="legend-swatch marker-alert-rescue" /> ALERT · RESCUE</span>
                <span><i className="legend-swatch marker-alert-other" /> ALERT · OTHER</span>
                <span><i className="legend-swatch marker-available" /> AVAILABLE / CENTER</span>
                <span><i className="legend-swatch marker-recovering" /> RECOVERING</span>
                <span><i className="legend-swatch marker-transit" /> IN TRANSIT</span>
                <span><i className="legend-swatch marker-full" /> FULL CENTER / MAINTENANCE</span>
                <span><i className="legend-swatch hazard-high" /> NOAH HIGH HAZARD</span>
                <span><i className="legend-swatch hazard-medium" /> NOAH MEDIUM HAZARD</span>
                <span><i className="legend-swatch road-hazard" /> ACTIVE ROAD HAZARD</span>
                <span><i className="legend-swatch pending-road-hazard" /> PENDING ROAD HAZARD</span>
              </div>
              <MapContainer hazardLayers={renderedHazardLayers} roadHazardZones={renderedRoadHazardZones} pendingRoadHazardZones={renderedPendingRoadHazards} markers={[...mapMarkers.filter((marker) => showRoadHazards || marker.kind !== 'road-hazard'), ...activeRouteMarkers]} onMarkerClick={handleMapMarkerClick} center={focusedAlertLocation} focusMarkerId={focusedAlertId} selectedAlertCategory={selectedMapAlertCategory} centerRequestKey={focusRequestKey} route={activeEvacuationRoute?.geometry} trackDeviceLocation={false} />
              <div className="ops-map-layer-controls" role="group" aria-label="Map layers">
                <button type="button" className={`ops-map-layer-button${showNoahHazards ? ' active' : ''}`} aria-pressed={showNoahHazards} onClick={() => setShowNoahHazards((visible) => !visible)} title={`${showNoahHazards ? 'Hide' : 'Show'} UP NOAH disaster hazards`}>
                  <span className="ops-map-layer-swatch noah" aria-hidden="true" />
                  {showNoahHazards ? 'Hide' : 'Show'} UP NOAH Disaster hazards
                </button>
                <button type="button" className={`ops-map-layer-button${showRoadHazards ? ' active' : ''}`} aria-pressed={showRoadHazards} onClick={() => setShowRoadHazards((visible) => !visible)} title={`${showRoadHazards ? 'Hide' : 'Show'} public road hazards`}>
                  <span className="ops-map-layer-swatch road" aria-hidden="true" />
                  {showRoadHazards ? 'Hide' : 'Show'} road hazards
                </button>
              </div>
              <button className="map-resize-handle" onPointerDown={startMapResize} aria-label="Drag to resize map" title="Drag to resize map">↕</button>
            </div>
          </section>
        </main>}

        {/* RIGHT RAIL: Average Response -> Vehicles -> Rescuer Profiles */}
        {hasRightRail && <aside className="right-rail">
          {/* 1. TOP: Average Response */}
          {renderedPanels.averageResponse && <section className={`metric-card response-card ${getPanelAnimationClass('averageResponse')}`}>
            <small>7-DAY AVERAGE RESPONSE</small>
            <strong>{operationMetrics?.average_response_minutes == null ? '—' : `${Number(operationMetrics.average_response_minutes).toFixed(1)} min`}</strong>
            <span>
              {operationMetrics?.average_response_minutes == null
                ? 'No resolved operations in the 7-day window'
                : `7-day database mean from ${operationMetrics.response_samples} resolved operation${operationMetrics.response_samples === 1 ? '' : 's'}`}
            </span>
          </section>}

          {/* 2. MIDDLE: Vehicles */}
          {renderedPanels.vehicles && <section className={`rail-box vehicle-box ${getPanelAnimationClass('vehicles')}`}>
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
          </section>}

          {/* 3. BOTTOM: Rescuer Profiles */}
          {renderedPanels.rescuers && <section className={`rail-box rescuer-box ${getPanelAnimationClass('rescuers')}`}>
            <div className="unit-panel-heading">
              <PanelTitle
                title="RESCUER PROFILES"
                badge={`${activeRescuerCount} ACTIVE`}
                onClick={() => openModal('units')}
              />
              <button
                className="call-rescuer-button"
                type="button"
                disabled={!isVoiceReady || Boolean(callId) || !sortedRescuers.some((rescuer) => rescuer.user_id != null)}
                onClick={() => startCall(sortedRescuers.map((rescuer) => rescuer.user_id).filter((userId) => userId != null))}
              >
                CALL ALL
              </button>
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
                  <div key={`rescuer-${rescuer.id}`} className="rescuer-call-row">
                    <Unit
                      name={rescuer.full_name || rescuer.username}
                      detail={`${rescuer.station_name || 'No station'} · @${rescuer.username}`}
                      status={rescuer.status}
                    />
                    <button
                      className="call-rescuer-button"
                      type="button"
                      disabled={!isVoiceReady || rescuer.user_id == null || Boolean(callId)}
                      onClick={() => startCall([rescuer.user_id])}
                      aria-label={`Call ${rescuer.full_name || rescuer.username}`}
                    >
                      CALL
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>}
        </aside>}
      </section>

      {/* Voice call footer */}
      {callError && !callId && (
        <div role="alert" className="voice-call-error">{callError}</div>
      )}
      {callId && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 99999,
            background: '#0b1120',
            border: '1px solid #1e293b',
            borderRadius: '12px',
            padding: '16px 20px',
            width: '360px',
            maxWidth: 'calc(100vw - 48px)',
            boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            alignItems: 'stretch',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#f1f5f9', fontWeight: '600', fontSize: '14px' }}>
              Conference call
            </span>
            <button
              onClick={endCall}
              style={{
                background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer',
                fontSize: '18px', padding: '4px', lineHeight: 1,
              }}
            >
              &times;
            </button>
          </div>

          {Object.entries(remoteStreams).map(([userId, stream]) => (
            <audio
              key={userId}
              autoPlay
              ref={(audio) => {
                if (audio && audio.srcObject !== stream) audio.srcObject = stream
              }}
              aria-label={`Audio from rescuer ${userId}`}
            />
          ))}
          <div style={{ color: '#cbd5e1', fontSize: '13px' }}>
            {callParticipants.map((participant) => (
              <p key={participant.user_id} style={{ margin: '4px 0' }}>
                {participant.display_name} · {participant.status}
              </p>
            ))}
            {!callParticipants.some((participant) => participant.status === 'connected')
              && <p style={{ color: '#f59e0b', textAlign: 'center' }}>Waiting for rescuers to accept…</p>}
          </div>
          {callError && (
            <p style={{ color: '#ef4444', textAlign: 'center', fontSize: '12px' }}>{callError}</p>
          )}

          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            {callParticipants.length > 0 && (
              <button
                onClick={endCall}
                style={{
                  flex: 1, padding: '8px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer',
                  background: '#ef4444', color: '#fff', border: 'none', fontSize: '13px',
                }}
              >
                End Call
              </button>
            )}
          </div>
        </div>
      )}

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
                            {getEligibleAssignmentRescuers(rescuers, alert).map((rescuer) => (
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

      {selectedAlert && (
        <div className="modal-backdrop alert-detail-backdrop" onClick={() => setSelectedAlert(null)}>
          <section
            className="ops-modal alert-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="alert-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <PanelTitle title="EMERGENCY ALERT DETAILS" badge={`ALERT #${selectedAlert.id}`} />
              <button className="modal-close" onClick={() => setSelectedAlert(null)} aria-label="Close alert details">Ã—</button>
            </div>
            <div className="alert-detail-content">
              <div className="alert-detail-heading">
                <span className={`severity ${selectedAlert.severity || 'high'}`}>
                  {(selectedAlert.severity || 'high').toUpperCase()}
                </span>
                <h2 id="alert-detail-title">{disasterLabels[normalizeDisasterType(selectedAlert.disaster_type)] || 'Other'} incident</h2>
                <span className="alert-detail-status">{statusLabel(selectedAlert.status)}</span>
              </div>

              <div className="alert-detail-preview-toolbar">
                <span>IMAGE PREVIEW</span>
                <div className="alert-image-size-controls" role="group" aria-label="Adjust image preview size">
                  {[
                    ['small', 'SMALL'],
                    ['medium', 'MEDIUM'],
                    ['large', 'LARGE'],
                  ].map(([size, label]) => (
                    <button
                      key={size}
                      type="button"
                      className={alertImageSize === size ? 'active' : ''}
                      aria-pressed={alertImageSize === size}
                      onClick={() => setAlertImageSize(size)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {getAlertImageUrls(selectedAlert.image_url).length > 0 ? (
                <div className={`alert-detail-image-frame ${alertImageSize}`}>
                  <div className="alert-detail-image-gallery">
                    {getAlertImageUrls(selectedAlert.image_url).map((imageUrl, index) => (
                      <button
                        className="alert-detail-image-button"
                        key={`${imageUrl}-${index}`}
                        type="button"
                        onClick={() => setSelectedImagePreview({ url: imageUrl, index })}
                        aria-label={`Open uploaded evidence ${index + 1} for alert ${selectedAlert.id}`}
                      >
                        <img
                          className="alert-detail-image"
                          src={imageUrl}
                          alt={`Uploaded evidence ${index + 1} for alert ${selectedAlert.id}`}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="alert-detail-image-empty">NO IMAGE ATTACHED</div>
              )}

              <dl className="alert-detail-fields">
                <div><dt>Reported by</dt><dd>{selectedAlert.sender_name || 'Unknown reporter'}</dd></div>
                <div><dt>Reported</dt><dd>{formatTime(selectedAlert.created_at)}</dd></div>
                <div><dt>General location</dt><dd>{alertLocationLoading ? 'Looking up location...' : alertLocation || 'Location unavailable'}</dd></div>
                <div><dt>Coordinates</dt><dd>{selectedAlert.latitude}, {selectedAlert.longitude}</dd></div>
                <div className="alert-detail-message"><dt>Description</dt><dd>{selectedAlert.message || 'No additional description provided.'}</dd></div>
              </dl>
              {!isClosedAlert(selectedAlert) && (
                <button
                  type="button"
                  className="alert-detail-assign-button"
                  onClick={() => {
                    openAssignmentModal(selectedAlert.id)
                    setSelectedAlert(null)
                  }}
                >
                  ASSIGN RESCUER
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {selectedImagePreview && (
        <div className="image-preview-backdrop" onClick={() => setSelectedImagePreview(null)}>
          <section
            className="image-preview-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Uploaded evidence ${selectedImagePreview.index + 1}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="image-preview-header">
              <span>IMAGE {selectedImagePreview.index + 1}</span>
              <button
                className="modal-close"
                type="button"
                onClick={() => setSelectedImagePreview(null)}
                aria-label="Close image preview"
              >
                Ã—
              </button>
            </div>
            <img
              className="image-preview-full"
              src={selectedImagePreview.url}
              alt={`Expanded uploaded evidence ${selectedImagePreview.index + 1}`}
            />
          </section>
        </div>
      )}

      {assigningAlert && (
        <AssignmentModal
          key={assigningAlert.id}
          alert={assigningAlert}
          rescuers={rankedAssignmentRescuers}
          hasAvailableRescuer={rescueUnits.rescuers.some(isAvailableRescuer)}
          vehicles={rescueUnits.vehicles}
          getRescuerDistance={getRescuerDistance}
          onConfirm={async (rescuer, vehicleIds) => {
            const assigned = await handleAssignAlert(assigningAlert.id, String(rescuer.user_id), vehicleIds)
            if (assigned) setAssigningAlert(null)
          }}
          onClose={() => setAssigningAlert(null)}
        />
      )}
    </main>
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
