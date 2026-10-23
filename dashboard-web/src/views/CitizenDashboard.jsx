import React, { useEffect, useRef, useState } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { WS_URL } from '../dataProvider'
import MapContainer from '../components/MapContainer'
import Logo from '../components/Logo'
import { Menu, QrCode, UploadCloud } from 'lucide-react'
import QRCode from 'qrcode'
import 'maplibre-gl/dist/maplibre-gl.css'
import "../styles/citizen-console.css";

const Icons = {
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

const getApiErrorMessage = (detail, fallback) => {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((issue) => {
        const field = Array.isArray(issue.loc) ? issue.loc.filter((part) => part !== 'body').join('.') : ''
        return field ? `${field}: ${issue.msg}` : issue.msg
      })
      .join('; ')
  }
  return fallback
}

const isCenterFull = (center) => {
  const capacity = Number(center?.capacity) || 100
  const occupancy = Number(center?.current_occupancy) || 0
  return occupancy >= capacity
}

const isCenterAvailable = (center) => center?.is_active !== false && !isCenterFull(center)

const getDistanceKm = (latitude, longitude, center) => {
  const centerLatitude = Number(center.latitude)
  const centerLongitude = Number(center.longitude)
  const radians = (degrees) => (degrees * Math.PI) / 180
  const latitudeDelta = radians(centerLatitude - latitude)
  const longitudeDelta = radians(centerLongitude - longitude)
  const arc =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(latitude)) *
      Math.cos(radians(centerLatitude)) *
      Math.sin(longitudeDelta / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc))
}

const getReadablePinnedLocation = (location, centers) => {
  if (!location || centers.length === 0) return 'Map location selected'

  const nearestCenter = centers
    .filter((center) => Number.isFinite(Number(center.latitude)) && Number.isFinite(Number(center.longitude)))
    .map((center) => ({ center, distance: getDistanceKm(location.latitude, location.longitude, center) }))
    .sort((first, second) => first.distance - second.distance)[0]

  if (!nearestCenter || nearestCenter.distance > 1.5) return 'Map location selected'
  return `Near ${nearestCenter.center.address || nearestCenter.center.name}`
}

export const CitizenDashboard = ({ auth, onLogout }) => {
  const [latestGps, setLatestGps] = useState(null)
  const [isQrDialogOpen, setIsQrDialogOpen] = useState(false)
  const [evacuationQr, setEvacuationQr] = useState('')
  const [isQrLoading, setIsQrLoading] = useState(false)
  const [qrError, setQrError] = useState('')
  const [centers, setCenters] = useState([])
  const [roadHazards, setRoadHazards] = useState([])
  const [publishedHazardLayers, setPublishedHazardLayers] = useState([])
  const [selectedCenter, setSelectedCenter] = useState(null)
  const [centerRequestKey, setCenterRequestKey] = useState(0)
  const [isDetailClosing, setIsDetailClosing] = useState(false)
  const detailCloseTimeoutRef = useRef(null)
  const [isReportClosing, setIsReportClosing] = useState(false)
  const reportCloseTimeoutRef = useRef(null)
  const [evacuationRoute, setEvacuationRoute] = useState(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeInfo, setRouteInfo] = useState(null)
  const [routeError, setRouteError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [isShelterPanelCollapsed, setIsShelterPanelCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState('shelters')
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isSettingsLoading, setIsSettingsLoading] = useState(false)
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false)
  const [isSettingsSaving, setIsSettingsSaving] = useState(false)
  const [settingsError, setSettingsError] = useState('')
  const [settingsSuccess, setSettingsSuccess] = useState('')
  const [profileUser, setProfileUser] = useState(auth?.user || {})
  const [settingsForm, setSettingsForm] = useState({
    full_name: auth?.user?.full_name || '',
    email: auth?.user?.email || '',
    current_password: '',
    new_password: '',
    household_name: '',
    family_members: []
  })
  const familyMemberKeyRef = useRef(0)
  const [savedShelterIds, setSavedShelterIds] = useState([])
  const [copyFeedback, setCopyFeedback] = useState('')
  const profileMenuRef = useRef(null)

  const [pinnedLocation, setPinnedLocation] = useState(null)

  const [selectedIncident, setSelectedIncident] = useState('flood')
  const [selectedSeverity, setSelectedSeverity] = useState('high')
  const [alertMessage, setAlertMessage] = useState('')
  const [alertStatus, setAlertStatus] = useState('')
  const [attachmentFiles, setAttachmentFiles] = useState([])
  const [pendingMediaAlertId, setPendingMediaAlertId] = useState(null)
  const [pendingMediaUploadToken, setPendingMediaUploadToken] = useState(null)
  const [isSubmittingAlert, setIsSubmittingAlert] = useState(false)
  const [isUploadingMedia, setIsUploadingMedia] = useState(false)
  const mediaInputRef = useRef(null)
  const cameraInputRef = useRef(null)
  const selectedPhotoCount = attachmentFiles.filter((file) => file.type.startsWith('image/')).length
  const selectedVideoCount = attachmentFiles.filter((file) => file.type.startsWith('video/')).length

  const [peopleAffected, setPeopleAffected] = useState(3)

  const { isConnected } = useWebSocket(WS_URL)
  const displayName = profileUser?.full_name || profileUser?.username || 'Resident'
  const [currentTime, setCurrentTime] = useState(() => new Date())

  useEffect(() => {
    const clockInterval = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(clockInterval)
  }, [])

  useEffect(() => () => {
    window.clearTimeout(detailCloseTimeoutRef.current)
    window.clearTimeout(reportCloseTimeoutRef.current)
  }, [])

  useEffect(() => {
    if (!isProfileMenuOpen) return undefined

    const closeOnOutsideClick = (event) => {
      if (!profileMenuRef.current?.contains(event.target)) setIsProfileMenuOpen(false)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setIsProfileMenuOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [isProfileMenuOpen])

  useEffect(() => {
    if (!isSettingsOpen) return undefined
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setIsSettingsOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [isSettingsOpen])

  const handleOpenSettings = async () => {
    setIsProfileMenuOpen(false)
    setIsSettingsOpen(true)
    setIsSettingsLoading(true)
    setIsSettingsLoaded(false)
    setSettingsError('')
    setSettingsSuccess('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/settings`, {
        headers: { Authorization: `Bearer ${auth?.token}` }
      })
      const data = await response.json()
      if (!response.ok) throw new Error(getApiErrorMessage(data.detail, 'Could not load account settings'))

      setProfileUser(data.user)
      setSettingsForm({
        full_name: data.user.full_name || '',
        email: data.user.email || '',
        current_password: '',
        new_password: '',
        household_name: data.household?.household_name || '',
        family_members: (data.household?.family_members || []).map((member) => ({
          ...member,
          clientKey: `saved-${member.id}`
        }))
      })
      setIsSettingsLoaded(true)
    } catch (error) {
      setSettingsError(error.message || 'Could not load account settings')
    } finally {
      setIsSettingsLoading(false)
    }
  }

  const handleSettingsSubmit = async (event) => {
    event.preventDefault()
    if (settingsForm.family_members.some((member) => !member.name.trim())) {
      setSettingsError('Enter a name for each family member before saving.')
      setSettingsSuccess('')
      return
    }
    setIsSettingsSaving(true)
    setSettingsError('')
    setSettingsSuccess('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth?.token}`
        },
        body: JSON.stringify({
          full_name: settingsForm.full_name,
          email: settingsForm.email,
          current_password: settingsForm.current_password || null,
          new_password: settingsForm.new_password || null,
          household_name: settingsForm.household_name,
          family_members: settingsForm.family_members.map(({ name, has_account }) => ({
            name: name.trim(),
            has_account
          }))
        })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(getApiErrorMessage(data.detail, 'Could not save account settings'))

      setProfileUser(data.user)
      setSettingsForm((current) => ({
        ...current,
        current_password: '',
        new_password: '',
        family_members: (data.household?.family_members || []).map((member) => ({
          ...member,
          clientKey: `saved-${member.id}`
        }))
      }))
      if (auth?.token) {
        localStorage.setItem('auth', JSON.stringify({ ...auth, user: data.user }))
      }
      setSettingsSuccess('Your account and household settings have been saved.')
    } catch (error) {
      setSettingsError(error.message || 'Could not save account settings')
    } finally {
      setIsSettingsSaving(false)
    }
  }

  const updateSettingsField = (event) => {
    const { name, value } = event.target
    setSettingsForm((current) => ({ ...current, [name]: value }))
  }

  const addFamilyMember = () => {
    familyMemberKeyRef.current += 1
    setSettingsForm((current) => ({
      ...current,
      family_members: [
        ...current.family_members,
        { clientKey: `new-${familyMemberKeyRef.current}`, name: '', has_account: false }
      ]
    }))
  }

  const handleMapClick = (coords) => {
    setPinnedLocation(coords)
    if (activeTab === 'alert') {
      setAlertStatus(`Pinned location: ${getReadablePinnedLocation(coords, centers)}`)
    }
  }

  const formattedPhtTime = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(currentTime)

  const alternativeCenter = centers.find((c) => c.id !== selectedCenter?.id && isCenterAvailable(c)) || null
  const selectedCenterDistanceMeters = latestGps && selectedCenter
    ? getDistanceKm(
      latestGps.latitude,
      latestGps.longitude,
      { latitude: selectedCenter.latitude, longitude: selectedCenter.longitude }
    ) * 1000
    : Number.POSITIVE_INFINITY
  const isWithinQrCheckInRange = Number.isFinite(selectedCenterDistanceMeters) &&
    selectedCenterDistanceMeters < 50 &&
    Date.now() - latestGps?.timestamp < 30_000

  useEffect(() => {
    if (isQrDialogOpen && !isWithinQrCheckInRange) {
      setIsQrDialogOpen(false)
      setEvacuationQr('')
      setQrError('')
    }
  }, [isQrDialogOpen, isWithinQrCheckInRange])

  useEffect(() => {
    if (!('geolocation' in navigator)) return
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setLatestGps({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        timestamp: Date.now()
      }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/v1/shelters/?limit=100`)
      .then((res) => res.ok && res.json())
      .then((data) => {
        if (data?.length) setCenters(data)
      })
      .catch(() => {})

    const loadRoadHazards = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/road-hazards/?limit=100`)
        if (response.ok) setRoadHazards(await response.json())
      } catch {}
    }

    const loadPublishedHazardLayers = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/hazards/map-layers?status=published`)
        if (response.ok) setPublishedHazardLayers(await response.json())
      } catch {}
    }

    loadRoadHazards()
    loadPublishedHazardLayers()
    const roadHazardRefresh = window.setInterval(loadRoadHazards, 60_000)
    const hazardLayerRefresh = window.setInterval(loadPublishedHazardLayers, 60_000)
    return () => {
      window.clearInterval(roadHazardRefresh)
      window.clearInterval(hazardLayerRefresh)
    }
  }, [])

  const handleRouteToCenter = async (center) => {
    if (!isCenterAvailable(center)) return

    const originLocation = pinnedLocation || latestGps
    if (!originLocation) {
      setAlertStatus('Location required. Please enable GPS or pin a location on the map.')
      return
    }
    setRouteLoading(true)
    setRouteError('')
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
      if (!res.ok || data.fallback || !Array.isArray(data.geometry?.coordinates) || data.geometry.coordinates.length < 2) {
        throw new Error('A road route avoiding active hazards is unavailable right now.')
      }
      setEvacuationRoute(data.geometry)
      setRouteInfo({
        distance: (data.distance_meters / 1000).toFixed(1) + ' km',
        duration: Math.round(data.duration_seconds / 60) + ' min walk'
      })
    } catch (error) {
      setEvacuationRoute(null)
      setRouteInfo(null)
      setRouteError(error.message || 'A road route avoiding active hazards is unavailable right now.')
    } finally {
      setRouteLoading(false)
    }
  }

  const handleCloseDetail = () => {
    if (!selectedCenter || isDetailClosing) return
    setIsDetailClosing(true)
    detailCloseTimeoutRef.current = window.setTimeout(() => {
      setSelectedCenter(null)
      setIsDetailClosing(false)
      setEvacuationRoute(null)
      setRouteInfo(null)
      setRouteError('')
    }, 260)
  }

  const handleCloseReport = ({ clearShelterSelection = false } = {}) => {
    if (activeTab !== 'alert' || isReportClosing) return
    setIsReportClosing(true)
    reportCloseTimeoutRef.current = window.setTimeout(() => {
      if (clearShelterSelection) {
        setSelectedCenter(null)
        setEvacuationRoute(null)
        setRouteInfo(null)
      }
      setActiveTab('shelters')
      setIsReportClosing(false)
    }, 260)
  }

  const handleOpenReport = () => {
    window.clearTimeout(reportCloseTimeoutRef.current)
    window.clearTimeout(detailCloseTimeoutRef.current)
    setIsReportClosing(false)
    setIsDetailClosing(false)
    setActiveTab('alert')
  }

  const handleSelectCenter = (center) => {
    window.clearTimeout(detailCloseTimeoutRef.current)
    setIsDetailClosing(false)
    setSelectedCenter(center)
    setCenterRequestKey((requestKey) => requestKey + 1)
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

  const handleShowEvacuationQr = async () => {
    if (!selectedCenter || !isWithinQrCheckInRange) return
    setIsQrDialogOpen(true)
    setIsQrLoading(true)
    setEvacuationQr('')
    setQrError('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/settings`, {
        headers: { Authorization: `Bearer ${auth?.token}` }
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(getApiErrorMessage(data.detail, 'Could not load household information'))
      }

      const payload = {
        type: 'resq-route-evacuation-check-in',
        version: 1,
        account_holder: {
          id: data.user.id,
          name: data.user.full_name || data.user.username
        },
        household: {
          id: data.household?.id || null,
          name: data.household?.household_name || '',
          family_members: (data.household?.family_members || []).map(({ id, name, has_account }) => ({
            id,
            name,
            has_account
          }))
        },
        center: {
          id: selectedCenter.id,
          name: selectedCenter.name
        }
      }
      const qrImage = await QRCode.toDataURL(JSON.stringify(payload), {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 280
      })
      setEvacuationQr(qrImage)
    } catch (error) {
      setQrError(error.message || 'Could not create your check-in QR code')
    } finally {
      setIsQrLoading(false)
    }
  }

  const uploadAlertMedia = async (alertId, files, mediaUploadToken) => {
    setIsUploadingMedia(true)
    try {
      for (const file of files) {
        setAlertStatus(`Uploading ${file.name}...`)
        const formData = new FormData()
        formData.append('file', file)
        const response = await fetch(`${API_BASE_URL}/api/v1/auth/alerts/${alertId}/media`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${mediaUploadToken || auth?.token}` },
          body: formData
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(`${file.name}: ${data.detail || 'Media upload failed'}`)
        setAttachmentFiles((currentFiles) => currentFiles.filter((currentFile) => currentFile !== file))
      }
      setPendingMediaAlertId(null)
      setPendingMediaUploadToken(null)
      setAlertStatus('SOS and all selected media sent to CDRRMO.')
      return true
    } catch (error) {
      setPendingMediaAlertId(alertId)
      setAlertStatus(`SOS ${alertId} was sent, but a media upload failed: ${error.message}. Retry the remaining uploads.`)
      return false
    } finally {
      setIsUploadingMedia(false)
    }
  }

  const handleMediaSelection = (event) => {
    const selectedFiles = Array.from(event.target.files || [])
    event.target.value = ''
    if (selectedFiles.length === 0) return

    let imageCount = attachmentFiles.filter((file) => file.type.startsWith('image/')).length
    let videoCount = attachmentFiles.filter((file) => file.type.startsWith('video/')).length
    const acceptedFiles = []
    const rejectedFiles = []
    for (const file of selectedFiles) {
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        rejectedFiles.push(`${file.name}: unsupported file type`)
      } else if (file.size > 25 * 1024 * 1024) {
        rejectedFiles.push(`${file.name}: maximum size is 25 MB`)
      } else if (file.type.startsWith('image/') && imageCount >= 5) {
        rejectedFiles.push(`${file.name}: up to 5 photos are allowed`)
      } else if (file.type.startsWith('video/') && videoCount >= 1) {
        rejectedFiles.push(`${file.name}: only 1 video is allowed`)
      } else {
        acceptedFiles.push(file)
        if (file.type.startsWith('image/')) imageCount += 1
        if (file.type.startsWith('video/')) videoCount += 1
      }
    }
    if (acceptedFiles.length > 0) setAttachmentFiles((currentFiles) => [...currentFiles, ...acceptedFiles])
    setAlertStatus(rejectedFiles[0] || `${imageCount} photo${imageCount === 1 ? '' : 's'} and ${videoCount} video${videoCount === 1 ? '' : 's'} selected.`)
  }

  const handleSendEmergencyAlert = async () => {
    if (pendingMediaAlertId && attachmentFiles.length > 0) {
      await uploadAlertMedia(pendingMediaAlertId, attachmentFiles, pendingMediaUploadToken)
      return
    }
    const targetLocation = pinnedLocation || latestGps
    if (!targetLocation) {
      setAlertStatus('Please click on the map to pin your location or turn on GPS.')
      return
    }
    setIsSubmittingAlert(true)
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
      const sentAlert = await res.json()
      setAlertMessage('')
      setPinnedLocation(null)
      if (attachmentFiles.length > 0) {
        setPendingMediaAlertId(sentAlert.id)
        setPendingMediaUploadToken(sentAlert.media_upload_token)
        const uploaded = await uploadAlertMedia(sentAlert.id, attachmentFiles, sentAlert.media_upload_token)
        if (!uploaded) return
      } else {
        setAlertStatus('Emergency alert dispatched to CDRRMO!')
      }
    } catch (err) {
      setAlertStatus(err.message)
    } finally {
      setIsSubmittingAlert(false)
    }
  }

  const centerMarkers = centers.filter((c) => c.is_active !== false).map((c) => ({
    id: c.id,
    kind: 'shelter',
    position: [c.longitude, c.latitude],
    label: c.name,
    color: isCenterFull(c) ? '#dc2626' : '#1a73e8',
    isFull: isCenterFull(c),
    icon: '⌂'
  }))

  const hazardMarkers = roadHazards.filter((h) => h.is_active !== false && !h.is_resolved).map((h) => ({
    position: [h.longitude, h.latitude],
    label: `${h.road_name || 'Hazard'}`,
    color: '#d93025',
    icon: '!'
  }))

  const isSaved = selectedCenter && savedShelterIds.includes(selectedCenter.id)
  const capacity = Number(selectedCenter?.capacity) || 100
  const occupancy = Number(selectedCenter?.current_occupancy) || 0
  const selectedCenterFull = Boolean(selectedCenter && isCenterFull(selectedCenter))
  const selectedCenterAvailable = Boolean(selectedCenter && isCenterAvailable(selectedCenter))
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
          hazardLayers={publishedHazardLayers}
          markers={[...centerMarkers, ...hazardMarkers]}
          route={evacuationRoute}
          center={selectedCenter ? [selectedCenter.longitude, selectedCenter.latitude] : null}
          centerRequestKey={centerRequestKey}
          centerZoom={17}
          highlightMarkerId={selectedCenter?.id ?? null}
          pinnedLocation={pinnedLocation}
          onMapClick={handleMapClick}
        />
      </div>

      {/* 2. Top Pill Filter Chips */}
      <div
        className={`citizen-top-bar ${activeTab === 'shelters' && isShelterPanelCollapsed ? 'shelter-panel-collapsed' : ''}`}
      >
        <div className="citizen-chip-row">
          <button
            className={`citizen-chip ${activeTab === 'shelters' ? 'active' : ''}`}
            onClick={() => {
              if (activeTab === 'alert') {
                handleCloseReport({ clearShelterSelection: true })
              } else {
                setActiveTab('shelters')
                handleCloseDetail()
              }
            }}
          >
            <Icons.Shelter /> Evacuation Centers
          </button>
          <button
            className={`citizen-chip alert-chip ${activeTab === 'alert' ? 'active' : ''}`}
            onClick={handleOpenReport}
          >
            <Icons.Alert /> Report Emergency
          </button>
          <div className="citizen-network-badge">
            <span className={`dot ${isConnected ? 'online' : 'offline'}`} />
            {isConnected ? 'Live Telemetry' : 'Offline'}
          </div>
        </div>
      </div>

      {/* 3. Profile and logout controls */}
      <div className="citizen-top-right-controls">
        {onLogout && (
          <div className="citizen-profile-menu" ref={profileMenuRef}>
            <button
              type="button"
              className="citizen-profile-avatar-btn"
              onClick={() => setIsProfileMenuOpen((isOpen) => !isOpen)}
              title={`Logged in as ${displayName}`}
              aria-label={`Account menu for ${displayName}`}
              aria-haspopup="menu"
              aria-expanded={isProfileMenuOpen}
            >
              {displayName.charAt(0).toUpperCase()}
            </button>
            {isProfileMenuOpen && (
              <div className="citizen-profile-dropdown" role="menu">
                <span className="citizen-profile-name">{displayName}</span>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleOpenSettings}
                >
                  Settings
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsProfileMenuOpen(false)
                    onLogout()
                  }}
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {isSettingsOpen && (
        <div
          className="citizen-settings-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setIsSettingsOpen(false)
          }}
        >
          <section
            className="citizen-settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="citizen-settings-title"
          >
            <header className="citizen-settings-header">
              <div>
                <p className="citizen-settings-eyebrow">Your profile</p>
                <h2 id="citizen-settings-title">Account settings</h2>
                <p>Keep your account and household information up to date.</p>
              </div>
              <button
                type="button"
                className="citizen-settings-close"
                aria-label="Close account settings"
                onClick={() => setIsSettingsOpen(false)}
              >
                <Icons.Close />
              </button>
            </header>

            {isSettingsLoading ? (
              <div className="citizen-settings-loading" role="status">Loading your settings…</div>
            ) : !isSettingsLoaded ? (
              <div className="citizen-settings-feedback citizen-settings-error" role="alert">
                <p>{settingsError || 'Account settings could not be loaded.'}</p>
                <button type="button" onClick={handleOpenSettings}>Try again</button>
              </div>
            ) : (
              <form className="citizen-settings-form" onSubmit={handleSettingsSubmit}>
                <div className="citizen-settings-section">
                  <h3>Account</h3>
                  <label className="citizen-settings-field">
                    <span>Full name</span>
                    <input
                      name="full_name"
                      type="text"
                      maxLength={255}
                      value={settingsForm.full_name}
                      onChange={updateSettingsField}
                    />
                  </label>
                  <label className="citizen-settings-field">
                    <span>Email address</span>
                    <input
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={settingsForm.email}
                      onChange={updateSettingsField}
                    />
                  </label>
                  <p className="citizen-settings-username">
                    Username: <strong>{profileUser?.username || '—'}</strong>
                  </p>
                </div>

                <div className="citizen-settings-section">
                  <h3>Change password</h3>
                  <p className="citizen-settings-helper">Leave both password fields blank to keep your current password.</p>
                  <label className="citizen-settings-field">
                    <span>Current password</span>
                    <input
                      name="current_password"
                      type="password"
                      autoComplete="current-password"
                      value={settingsForm.current_password}
                      onChange={updateSettingsField}
                    />
                  </label>
                  <label className="citizen-settings-field">
                    <span>New password</span>
                    <input
                      name="new_password"
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      value={settingsForm.new_password}
                      onChange={updateSettingsField}
                    />
                  </label>
                </div>

                <div className="citizen-settings-section">
                  <div className="citizen-settings-section-heading">
                    <div>
                      <h3>Household</h3>
                      <p>Add family members who may need help during an emergency.</p>
                    </div>
                    <button
                      type="button"
                      className="citizen-settings-add-member"
                      onClick={addFamilyMember}
                    >
                      + Add member
                    </button>
                  </div>
                  <label className="citizen-settings-field">
                    <span>Household name</span>
                    <input
                      name="household_name"
                      type="text"
                      maxLength={120}
                      placeholder="e.g. Santos Household"
                      value={settingsForm.household_name}
                      onChange={updateSettingsField}
                    />
                  </label>
                  {settingsForm.family_members.length === 0 ? (
                    <p className="citizen-settings-empty">No family members added yet.</p>
                  ) : (
                    <div className="citizen-settings-members">
                      {settingsForm.family_members.map((member, index) => (
                        <div className="citizen-settings-member" key={member.clientKey}>
                          <label className="citizen-settings-field citizen-settings-member-name">
                            <span>Family member {index + 1}</span>
                            <input
                              type="text"
                              maxLength={120}
                              required
                              value={member.name}
                              onChange={(event) => {
                                const { value } = event.target
                                setSettingsForm((current) => ({
                                  ...current,
                                  family_members: current.family_members.map((item) =>
                                    item.clientKey === member.clientKey ? { ...item, name: value } : item
                                  )
                                }))
                              }}
                            />
                          </label>
                          <label className="citizen-settings-account-check">
                            <input
                              type="checkbox"
                              checked={Boolean(member.has_account)}
                              onChange={(event) => {
                                const { checked } = event.target
                                setSettingsForm((current) => ({
                                  ...current,
                                  family_members: current.family_members.map((item) =>
                                    item.clientKey === member.clientKey ? { ...item, has_account: checked } : item
                                  )
                                }))
                              }}
                            />
                            <span>Has an account</span>
                          </label>
                          <button
                            type="button"
                            className="citizen-settings-remove-member"
                            aria-label={`Remove family member ${index + 1}`}
                            onClick={() => setSettingsForm((current) => ({
                              ...current,
                              family_members: current.family_members.filter(
                                (item) => item.clientKey !== member.clientKey
                              )
                            }))}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="citizen-settings-helper">The account checkbox records your selection; it does not verify or link an account.</p>
                </div>

                {settingsError && (
                  <p className="citizen-settings-feedback citizen-settings-error" role="alert">{settingsError}</p>
                )}
                {settingsSuccess && (
                  <p className="citizen-settings-feedback citizen-settings-success" role="status">{settingsSuccess}</p>
                )}
                <footer className="citizen-settings-actions">
                  <button
                    type="button"
                    className="citizen-settings-cancel"
                    onClick={() => setIsSettingsOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="citizen-settings-save"
                    disabled={isSettingsSaving}
                  >
                    {isSettingsSaving ? 'Saving…' : 'Save changes'}
                  </button>
                </footer>
              </form>
            )}
          </section>
        </div>
      )}

      {isQrDialogOpen && (
        <div
          className="citizen-qr-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setIsQrDialogOpen(false)
          }}
        >
          <section
            className="citizen-qr-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="citizen-qr-title"
          >
            <button
              type="button"
              className="citizen-qr-close"
              aria-label="Close QR code"
              onClick={() => setIsQrDialogOpen(false)}
            >
              <Icons.Close />
            </button>
            <div className="citizen-qr-icon"><QrCode size={22} aria-hidden="true" /></div>
            <h2 id="citizen-qr-title">Evacuation check-in</h2>
            <p className="citizen-qr-center-name">{selectedCenter?.name}</p>
            {isQrLoading ? (
              <div className="citizen-qr-loading" role="status">Preparing your QR code…</div>
            ) : qrError ? (
              <p className="citizen-qr-error" role="alert">{qrError}</p>
            ) : evacuationQr ? (
              <>
                <img className="citizen-qr-image" src={evacuationQr} alt="QR code containing your account and household check-in information" />
                <p className="citizen-qr-guidance">Show this code to the evacuation center coordinator to help record your household’s arrival.</p>
              </>
            ) : null}
          </section>
        </div>
      )}

      {/* 4. Left Panel */}
      {activeTab === 'shelters' && (
        <button
          type="button"
          className={`shelter-panel-toggle ${isShelterPanelCollapsed ? 'collapsed' : ''}`}
          aria-label={isShelterPanelCollapsed ? 'Show shelter panel' : 'Hide shelter panel'}
          aria-expanded={!isShelterPanelCollapsed}
          aria-controls="citizen-shelter-sidebar"
          onClick={() => setIsShelterPanelCollapsed((collapsed) => !collapsed)}
        >
          <Menu size={20} aria-hidden="true" />
        </button>
      )}
      <aside
        id="citizen-shelter-sidebar"
        className={`citizen-sidebar ${activeTab === 'shelters' ? 'shelter-sidebar' : 'report-sidebar'} ${activeTab === 'shelters' && isShelterPanelCollapsed ? 'collapsed' : ''}`}
        aria-hidden={activeTab === 'shelters' && isShelterPanelCollapsed}
        inert={activeTab === 'shelters' && isShelterPanelCollapsed}
      >
        <div className="mobile-pull-handle" />
        {activeTab === 'alert' ? (
          <div
            className={`citizen-scroll-content report-panel-padding${isReportClosing ? ' closing' : ''}`}
            aria-hidden={isReportClosing}
          >
            <div className="report-incident-card">
              <div className="report-header-row">
                <div>
                  <h2 className="report-header-title">Report incident</h2>
                  <p className="report-header-subtitle">Shares your selected location directly with dispatchers.</p>
                </div>
                <button
                  type="button"
                  className="report-close-btn"
                  onClick={() => handleCloseReport()}
                >
                  <Icons.Close />
                </button>
              </div>

              {pinnedLocation && (
                <div className="pinned-location-banner">
                  <span>📍 Pin set: {getReadablePinnedLocation(pinnedLocation, centers)}</span>
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

              <input
                ref={mediaInputRef}
                className="report-media-input"
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={handleMediaSelection}
                aria-label="Choose photos and a video to attach"
              />
              <input
                ref={cameraInputRef}
                className="report-media-input"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleMediaSelection}
                aria-label="Take a photo to attach"
              />
              <div className="report-attachment-actions">
                <button
                  type="button"
                  className="report-attach-btn"
                  onClick={() => mediaInputRef.current?.click()}
                  disabled={isSubmittingAlert || isUploadingMedia || Boolean(pendingMediaAlertId)}
                >
                  <UploadCloud size={18} />
                  <span>Upload files</span>
                </button>
                <button
                  type="button"
                  className="report-attach-btn"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={isSubmittingAlert || isUploadingMedia || Boolean(pendingMediaAlertId) || selectedPhotoCount >= 5}
                >
                  <Icons.Camera />
                  <span>Open camera</span>
                </button>
              </div>
              {attachmentFiles.length > 0 && (
                <div className="report-media-selection" aria-live="polite">
                  <p>{selectedPhotoCount} / 5 photos · {selectedVideoCount} / 1 video</p>
                  {attachmentFiles.map((file, index) => (
                    <div className="report-media-file" key={`${file.name}-${file.lastModified}-${index}`}>
                      <span>{file.name} ({(file.size / (1024 * 1024)).toFixed(1)} MB)</span>
                      {!pendingMediaAlertId && (
                        <button type="button" onClick={() => setAttachmentFiles((currentFiles) => currentFiles.filter((_, fileIndex) => fileIndex !== index))} aria-label={`Remove ${file.name}`}>Remove</button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                className="report-sos-submit"
                onClick={handleSendEmergencyAlert}
                disabled={isSubmittingAlert || isUploadingMedia}
              >
                <Icons.Alert />
                <span>{isSubmittingAlert ? 'Sending SOS...' : isUploadingMedia ? 'Uploading media...' : pendingMediaAlertId ? 'Retry media upload' : 'Send emergency SOS'}</span>
              </button>

              {!isConnected && (
                <div className="report-offline-banner">
                  <Icons.WifiOff />
                  <span>No signal? Report queues and sends automatically once connected.</span>
                </div>
              )}

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
          <div className={`shelter-detail-wrapper ${isDetailClosing ? 'closing' : ''}`}>
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
                  <span className="shelter-hero-caption">Evacuation center</span>
                </div>

                <div className="shelter-header-group">
                  <div className="shelter-title-row">
                    <h2 className="shelter-name-heading">{selectedCenter.name}</h2>
                    <span className={`shelter-status-pill ${selectedCenterAvailable ? 'open' : 'closed'}`}>
                      {selectedCenterAvailable ? 'Open' : 'Closed'}
                    </span>
                  </div>
                  <span className="shelter-updated-time">Updated 4 minutes ago</span>

                  <div className="shelter-amenities-row">
                    <span className="amenity-pill"><Icons.Water /> Water</span>
                    <span className="amenity-pill"><Icons.MedicalBag /> Medical</span>
                    <span className="amenity-pill"><Icons.Power /> Power</span>
                  </div>
                </div>

                <div className="shelter-actions-trio">
                  <button
                    type="button"
                    className="shelter-btn-pill"
                    onClick={() => handleRouteToCenter(selectedCenter)}
                    disabled={routeLoading || !selectedCenterAvailable}
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

                {routeError && <p className="shelter-route-error" role="alert">{routeError}</p>}
                {routeInfo && !routeError && (
                  <p className="shelter-route-summary">{routeInfo.distance} · {routeInfo.duration}</p>
                )}

                {isWithinQrCheckInRange && (
                  <button
                    type="button"
                    className="shelter-qr-checkin-btn"
                    onClick={handleShowEvacuationQr}
                  >
                    <QrCode size={18} aria-hidden="true" />
                    <span>Show QR Code</span>
                  </button>
                )}

                <div className="occupancy-metric-box">
                  <div className="occupancy-header-row">
                    <span className="occupancy-label">Occupancy</span>
                    <span className={`occupancy-status-alert ${occupancyRate >= 75 ? 'critical' : occupancyRate >= 50 ? 'warning' : 'good'}`}>
                      <Icons.TrendUp />
                      <span>{selectedCenterFull ? 'Full capacity' : occupancyRate >= 75 ? 'Near capacity' : occupancyRate >= 50 ? 'Filling fast' : 'Slots available'}</span>
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
                        handleSelectCenter(alternativeCenter)
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
              <div className="shelter-search-controls">
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
                </div>
              </div>
            </div>

            <div className="citizen-scroll-content">
              <div className="shelter-results-list">
                <h3 className="shelter-results-header">
                  NEARBY EVACUATION CENTERS ({processedCenters.length})
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
                      onClick={() => handleSelectCenter(center)}
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
                          <span className="shelter-open-count" style={{ color: center.occPct >= 100 ? '#dc2626' : barColor }}>
                            {center.occPct >= 100 ? 'Full capacity' : `${center.openSlots} open`}
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
