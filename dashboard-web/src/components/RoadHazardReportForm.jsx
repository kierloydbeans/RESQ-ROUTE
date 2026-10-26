import { useEffect, useRef, useState } from 'react'
import { BASE_URL } from '../dataProvider'
import { Camera, UploadCloud } from 'lucide-react'
import '../styles/road-hazard-report.css'

const HAZARD_TYPES = [
  ['flood', 'Flood'],
  ['debris', 'Debris'],
  ['fire', 'Fire'],
  ['landslide', 'Landslide'],
  ['collapsed_road', 'Collapsed road'],
  ['downed_power_line', 'Downed power line'],
  ['other', 'Other'],
]

const ROAD_LOOKUP_CACHE_KEY = 'resq-nominatim-reverse-geocode-v1'
const roadLookupCache = new Map()

const coordinateFallback = (latitude, longitude) => {
  const latitudeDirection = latitude >= 0 ? 'N' : 'S'
  const longitudeDirection = longitude >= 0 ? 'E' : 'W'
  return `Local road near ${Math.abs(latitude).toFixed(4)}° ${latitudeDirection}, ${Math.abs(longitude).toFixed(4)}° ${longitudeDirection}`
}

const formatAddress = (address) => {
  if (!address) return null
  const road = address.road || address.pedestrian || address.footway
  const barangay = address.neighbourhood || address.suburb || address.quarter || address.village
  const city = address.city || address.town || address.municipality || address.county
  return [road, barangay, city]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(', ') || null
}

const lookupRoadName = async (latitude, longitude) => {
  const lat = Number(latitude)
  const lon = Number(longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return ''
  const key = `${lat.toFixed(6)},${lon.toFixed(6)}`
  if (!roadLookupCache.size) {
    try {
      const stored = JSON.parse(window.localStorage.getItem(ROAD_LOOKUP_CACHE_KEY) || '{}')
      Object.entries(stored).forEach(([cachedKey, value]) => roadLookupCache.set(cachedKey, value))
    } catch {}
  }
  if (roadLookupCache.has(key)) return roadLookupCache.get(key) || coordinateFallback(lat, lon)

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
    const friendlyAddress = formatAddress(data.address)
    roadLookupCache.set(key, friendlyAddress)
    try {
      const stored = Object.fromEntries([...roadLookupCache.entries()].filter(([, value]) => value))
      window.localStorage.setItem(ROAD_LOOKUP_CACHE_KEY, JSON.stringify(stored))
    } catch {}
    return friendlyAddress || coordinateFallback(lat, lon)
  } catch {
    roadLookupCache.set(key, null)
    return coordinateFallback(lat, lon)
  } finally {
    window.clearTimeout(timeout)
  }
}

export default function RoadHazardReportForm({ initialLocation, reporterName = '', onReported, onClose }) {
  const [form, setForm] = useState({
    hazard_type: 'debris', description: '', latitude: '', longitude: '',
    radius_meters: 75, severity: 'high', road_name: '', reporter_name: reporterName,
  })
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState('')
  const [roadLookupLoading, setRoadLookupLoading] = useState(false)
  const [attachmentFiles, setAttachmentFiles] = useState([])
  const [mediaUploading, setMediaUploading] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const mediaInputRef = useRef(null)
  const cameraVideoRef = useRef(null)
  const cameraStreamRef = useRef(null)

  useEffect(() => {
    if (!initialLocation) return
    setForm((current) => ({
      ...current,
      latitude: String(initialLocation.latitude),
      longitude: String(initialLocation.longitude),
    }))
  }, [initialLocation?.latitude, initialLocation?.longitude])

  useEffect(() => {
    if (String(form.road_name || '').trim()) return undefined
    if (!Number.isFinite(Number(form.latitude)) || !Number.isFinite(Number(form.longitude))) return undefined
    let active = true
    const timer = window.setTimeout(async () => {
      setRoadLookupLoading(true)
      const roadName = await lookupRoadName(form.latitude, form.longitude)
      if (active && roadName && !String(form.road_name || '').trim()) {
        setForm((current) => current.road_name.trim() ? current : { ...current, road_name: roadName })
      }
      if (active) setRoadLookupLoading(false)
    }, 250)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [form.latitude, form.longitude, form.road_name])

  useEffect(() => {
    if (!cameraOpen) return undefined
    let active = true
    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is not supported by this browser.')
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        if (!active) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        cameraStreamRef.current = stream
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream
          await cameraVideoRef.current.play()
        }
      } catch (error) {
        if (active) {
          setCameraError(error.message || 'Unable to open the camera.')
          setCameraOpen(false)
        }
      }
    }
    startCamera()
    return () => {
      active = false
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
      cameraStreamRef.current = null
    }
  }, [cameraOpen])

  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }))

  const handleMediaSelection = (event) => {
    const selectedFiles = Array.from(event.target.files || [])
    event.target.value = ''
    const acceptedFiles = []
    const rejectedFiles = []
    let imageCount = attachmentFiles.length
    for (const file of selectedFiles) {
      if (!file.type.startsWith('image/')) rejectedFiles.push(`${file.name}: images only`)
      else if (file.size > 25 * 1024 * 1024) rejectedFiles.push(`${file.name}: maximum size is 25 MB`)
      else if (imageCount >= 5) rejectedFiles.push(`${file.name}: up to 5 photos are allowed`)
      else {
        acceptedFiles.push(file)
        imageCount += 1
      }
    }
    if (acceptedFiles.length) setAttachmentFiles((current) => [...current, ...acceptedFiles])
    setStatus(rejectedFiles[0] || `${imageCount} photo${imageCount === 1 ? '' : 's'} selected.`)
  }

  const openCamera = () => {
    setCameraError('')
    setCameraOpen(true)
  }

  const captureCameraImage = () => {
    const video = cameraVideoRef.current
    if (!video?.videoWidth || !video.videoHeight) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (!blob) return
      const file = new File([blob], `road-hazard-${Date.now()}.jpg`, { type: 'image/jpeg' })
      setAttachmentFiles((current) => current.length >= 5 ? current : [...current, file])
      setCameraOpen(false)
    }, 'image/jpeg', 0.9)
  }

  const submit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setStatus('')
    try {
      const roadName = String(form.road_name || '').trim() || await lookupRoadName(form.latitude, form.longitude)
      const response = await fetch(`${BASE_URL}/api/v1/hazards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          road_name: roadName,
          latitude: Number(form.latitude),
          longitude: Number(form.longitude),
          radius_meters: Number(form.radius_meters),
        }),
      })
      if (!response.ok) throw new Error(`Unable to submit road hazard (${response.status}).`)
      const feature = await response.json()
      if (attachmentFiles.length > 0) {
        setMediaUploading(true)
        setStatus('Preparing photos...')
        const auth = JSON.parse(window.localStorage.getItem('auth') || 'null')
        const token = auth?.token || auth?.access_token
        for (const file of attachmentFiles) {
          setStatus(`Uploading ${file.name}`)
          const media = new FormData()
          media.append('file', file)
          const mediaResponse = await fetch(`${BASE_URL}/api/v1/hazards/${feature.id}/media`, {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: media,
          })
          const mediaData = await mediaResponse.json().catch(() => ({}))
          if (!mediaResponse.ok) throw new Error(`${file.name}: ${mediaData.detail || 'Image upload failed'}`)
        }
      }
      onReported?.(feature)
      setForm((current) => ({ ...current, description: '', road_name: '' }))
      setAttachmentFiles([])
      setStatus('Report and attached photos sent to dispatchers for review. It will appear on public maps only if approved.')
    } catch (error) {
      setStatus(error.message || 'Unable to submit road hazard.')
    } finally {
      setSubmitting(false)
      setMediaUploading(false)
    }
  }

  return (
    <form className="road-hazard-report-form" onSubmit={submit}>
      <div className="road-hazard-report-heading">
        <div><h2>Report Road Hazard</h2><p>Pin the map or enter the affected location.</p></div>
        {onClose && <button type="button" onClick={onClose} aria-label="Close road hazard report">×</button>}
      </div>
      <label>Hazard type
        <select name="hazard_type" value={form.hazard_type} onChange={update}>
          {HAZARD_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label>Description
        <textarea name="description" required minLength={1} rows={3} value={form.description} onChange={update} placeholder="What is blocking or endangering this road?" />
      </label>
      <div className="road-hazard-report-grid">
        <label>Latitude<input name="latitude" type="number" step="any" min="-90" max="90" required value={form.latitude} onChange={update} /></label>
        <label>Longitude<input name="longitude" type="number" step="any" min="-180" max="180" required value={form.longitude} onChange={update} /></label>
        <label>Radius (m)<input name="radius_meters" type="number" min="10" max="2000" required value={form.radius_meters} onChange={update} /></label>
        <label>Severity
          <select name="severity" value={form.severity} onChange={update}>
            {['low', 'medium', 'high', 'critical'].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
      </div>
      <label>Road name<input name="road_name" value={form.road_name} onChange={update} placeholder={roadLookupLoading ? 'Looking up road name…' : 'Filled from location'} aria-busy={roadLookupLoading} /></label>
      <label>Reporter name<input name="reporter_name" value={form.reporter_name} readOnly aria-readonly="true" placeholder="Optional" /></label>
      <input ref={mediaInputRef} className="report-media-input" type="file" accept="image/*" multiple onChange={handleMediaSelection} aria-label="Upload road hazard photos" />
      <div className="report-attachment-actions">
        <button type="button" className="report-attach-btn" onClick={() => mediaInputRef.current?.click()} disabled={submitting || mediaUploading}>
          <UploadCloud size={18} />
          <span>Upload files</span>
        </button>
        <button type="button" className="report-attach-btn" onClick={openCamera} disabled={submitting || mediaUploading || attachmentFiles.length >= 5}>
          <Camera size={18} />
          <span>Open camera</span>
        </button>
      </div>
      {attachmentFiles.length > 0 && (
        <div className="road-hazard-media-selection" aria-live="polite">
          <p>{attachmentFiles.length} / 5 photos selected</p>
          {attachmentFiles.map((file, index) => (
            <div key={`${file.name}-${file.lastModified}-${index}`}>
              <span>{file.name}</span>
              <button type="button" onClick={() => setAttachmentFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}>Remove</button>
            </div>
          ))}
        </div>
      )}
      {cameraOpen && (
        <div className="road-hazard-camera-panel">
          <video ref={cameraVideoRef} className="road-hazard-camera-preview" autoPlay muted playsInline />
          <div className="road-hazard-camera-actions">
            <button type="button" onClick={() => setCameraOpen(false)}>Cancel</button>
            <button type="button" onClick={captureCameraImage}>Capture photo</button>
          </div>
        </div>
      )}
      {cameraError && <p className="road-hazard-report-status" role="alert">{cameraError}</p>}
      <button className="road-hazard-submit" type="submit" disabled={submitting}>{submitting ? 'Publishing…' : 'Publish Road Hazard'}</button>
      {status && <p className={`road-hazard-report-status${mediaUploading ? ' is-busy' : ''}`} role="status">{status}</p>}
    </form>
  )
}
