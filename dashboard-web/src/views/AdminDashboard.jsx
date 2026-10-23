import React, { useCallback, useEffect, useMemo, useRef, useState, useReducer } from 'react'
import '../styles/admin-console.css'
import LiveHazardMap from '../components/LiveHazardMap'
import Logo from '../components/Logo'
import { ChevronDown, LogOut } from 'lucide-react'
import { WS_URL } from '../dataProvider'

const rawApiBase = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'https://resq-route.onrender.com').replace(/\/$/, '')
const API_BASE_URL = rawApiBase.endsWith('/api/v1') ? rawApiBase.replace(/\/api\/v1$/, '') : rawApiBase

/*
 * API contract used by this screen:
 *
 * GET  /api/dashboard -> { incidents, units, services, analytics, kpis, map }
 * GET  /api/audit     -> { entries: [{ id, action, user, role, timestamp, ip, urgent }] }
 * GET  /api/rbac      -> { roles: { Role: { permission_id: boolean } }, version, roleUserCounts }
 * POST /api/v1/auth/reauth -> { authenticated: true, reauthToken?: string }
 * PUT  /api/rbac      -> { roles, version, roleUserCounts }
 *
 * The server must validate authentication, permission IDs, System Admin
 * safeguards, role names, role assignments, and the optimistic-lock version.
 * This component never treats a client-side password check as authentication.
 */

const PERMISSIONS = [
  { id: 'view_dashboard', label: 'View dashboard' },
  { id: 'dispatch_units', label: 'Dispatch units' },
  { id: 'edit_inventory', label: 'Edit inventory' },
  { id: 'register_evacuees', label: 'Register evacuees' },
  { id: 'resolve_incidents', label: 'Resolve incidents' },
  { id: 'manage_users', label: 'Manage users' },
  { id: 'view_audit', label: 'View audit logs' }
]

const LOCKED_SYSTEM_ADMIN_PERMISSION_IDS = new Set(['manage_users', 'view_audit'])
const ROLE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _-]{1,39}$/

const TAB_DEFS = [
  { id: 'an', label: 'ANALYTICS', panelId: 'analytics-panel' },
  { id: 'au', label: 'AUDIT LOGS', panelId: 'audit-panel' },
  { id: 'rb', label: 'RBAC', panelId: 'rbac-panel' },
  { id: 'si', label: 'INTEGRITY', panelId: 'integrity-panel' }
]

const EMPTY_DASHBOARD = {
  incidents: [],
  units: [],
  services: [],
  analytics: null,
  kpis: {},
  map: null
}

function buildNoahAdjustedAnalytics(analytics, payload) {
  const predictions = Array.isArray(payload?.predictions) ? payload.predictions : []
  const scores = predictions
    .map((prediction) => Number(prediction.flood_susceptibility_score))
    .filter(Number.isFinite)

  if (!analytics || !scores.length) return null

  const meanScore = scores.reduce((sum, score) => sum + score, 0) / scores.length
  const highRiskCount = scores.filter((score) => score >= 0.67).length
  const severeRiskCount = scores.filter((score) => score >= 0.85).length
  const highRiskShare = highRiskCount / scores.length
  const severeRiskShare = severeRiskCount / scores.length
  const riskIndex = Math.min(1, Math.max(0, (meanScore * 0.55) + (highRiskShare * 0.3) + (severeRiskShare * 0.15)))
  const incidentPressure = 0.7 + (riskIndex * 0.8)
  const projected = (analytics.projected || []).map((point, index) => {
    const day = Number(point.day ?? point[0] ?? index)
    const value = Number(point.value ?? point[1] ?? 0)
    return [day, index === 0 ? value : Math.max(0, Math.round(value * incidentPressure))]
  })

  return {
    ...analytics,
    projected,
    projectionSource: 'UP NOAH',
    noahSummary: {
      gridCount: scores.length,
      meanScore,
      highRiskCount,
      riskIndex
    },
    disclaimer: payload?.disclaimer || 'Static NOAH susceptibility estimate; not a real-time flood forecast or emergency alert.'
  }
}

// Explicit demonstration fixtures. Never use these as operational records.
const DEMO_DATA = {
  dashboard: {
    incidents: Array.from({ length: 24 }, (_, index) => ({
      id: String(1084 + index), status: 'ACTIVE',
      severity: index < 3 ? 'CRITICAL' : index < 12 ? 'MODERATE' : 'MINOR'
    })),
    services: [
      { name: 'API Gateway', status: 'ok', latency: 42, uptime: 99.99 },
      { name: 'WebSocket Hub', status: 'ok', latency: 18, uptime: 99.95 },
      { name: 'Database Primary', status: 'ok', latency: 9, uptime: 99.99 },
      { name: 'SMS Alert Gateway', status: 'warn', latency: 340, uptime: 98.2 },
      { name: 'GIS Flood Sensors', status: 'ok', latency: 120, uptime: 99.4 },
      { name: 'Backup Storage', status: 'ok', latency: 65, uptime: 99.9 },
      { name: 'Radio Dispatch Link', status: 'bad', latency: null, uptime: 91.3 },
      { name: 'Auth Service', status: 'ok', latency: 27, uptime: 99.98 }
    ],
    analytics: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      historical: [[0, 5], [1, 63], [2, 133], [3, 42], [4, 22]],
      projected: [[4, 22], [5, 14], [6, 8]]
    },
    kpis: { rescueSuccessRate: 98.7, rescueSuccessComparison: '+0.2%' },
  },
}

const PHT_CLOCK_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Manila',
  hour12: false,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
})

const PHT_DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Manila',
  dateStyle: 'medium',
  timeStyle: 'medium'
})

const levelColor = { h: 'var(--bad)', m: 'var(--warn)', l: 'var(--cyan)' }
const levelText = { h: 'SEVERE', m: 'MODERATE', l: 'MINOR' }

class ApiRequestError extends Error {
  constructor(message, status, body) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.body = body
  }
}

function cloneRoleMatrix(matrix) {
  return Object.fromEntries(
    Object.entries(matrix || {}).map(([role, permissions]) => {
      const normalized = {}
      PERMISSIONS.forEach((permission, index) => {
        normalized[permission.id] = Array.isArray(permissions)
          ? Boolean(permissions[index])
          : Boolean(permissions?.[permission.id])
      })
      return [role, normalized]
    })
  )
}

function normalizeRbacPayload(payload) {
  const source = payload || {}
  const roles = source.roles || source.matrix || {}
  return {
    roles: cloneRoleMatrix(roles),
    version: source.version ?? null,
    roleUserCounts: source.roleUserCounts || source.assignedUsersByRole || {}
  }
}

function makeClientId(prefix) {
  const random = Math.random().toString(36).slice(2, 9)
  return `${prefix}-${Date.now()}-${random}`
}

function normalizeAuditLog(raw, index = 0) {
  const source = raw || {}
  const timestamp = source.timestamp || source.createdAt || source.occurredAt || null
  return {
    id: String(source.id || source.auditId || makeClientId(`audit-${index}`)),
    action: source.action || source.action_entry || source.message || 'Unknown audit action',
    user: source.user || source.actor || source.userId || source.user_id || '—',
    role: source.role || source.authorityRole || source.authority_role || '—',
    timestamp,
    ip: source.ip || source.ipAddress || source.networkAddress || source.net_address || '—',
    urgent: Boolean(source.urgent || source.severity === 'critical' || source.priority === 1)
  }
}

function normalizeAuditLogs(rawEntries) {
  const entries = Array.isArray(rawEntries)
    ? rawEntries
    : rawEntries?.entries || rawEntries?.logs || rawEntries?.data || []

  return entries
    .map(normalizeAuditLog)
    .sort((a, b) => {
      const aTime = Date.parse(a.timestamp || '')
      const bTime = Date.parse(b.timestamp || '')
      if (Number.isNaN(aTime) || Number.isNaN(bTime)) return 0
      return bTime - aTime
    })
}

function normalizeIncident(raw, index) {
  const source = raw || {}
  const status = String(source.status || 'UNKNOWN').toUpperCase()
  const severity = String(source.severity || source.priority || 'MINOR').toUpperCase()
  return {
    id: String(source.id || source.incidentId || makeClientId(`incident-${index}`)),
    status,
    severity
  }
}

function normalizeRescuer(raw, index) {
  const source = raw || {}
  const rawStatus = String(source.status || 'offline').toLowerCase()
  const statusMap = {
    available: ['AVAILABLE', 'ub-avail'],
    assigned: ['DISPATCHED', 'ub-dispatched'],
    in_transit: ['DISPATCHED', 'ub-dispatched'],
    recovering: ['RECOVERING', 'ub-recovering'],
    off_duty: ['OFFLINE', 'ub-offline']
  }
  const [status, className] = statusMap[rawStatus] || ['OFFLINE', 'ub-offline']
  const responseRate = source.response_rate == null ? null : Number(source.response_rate)
  return {
    id: String(source.id || source.user_id || makeClientId(`rescuer-${index}`)),
    name: source.rescuer_name || source.username || 'Unnamed rescuer',
    station: source.station_name || 'Station not assigned',
    status,
    className,
    phone: source.phone || 'No phone recorded',
    latitude: Number.isFinite(Number(source.current_latitude)) && Number(source.current_latitude) !== 0 ? Number(source.current_latitude) : null,
    longitude: Number.isFinite(Number(source.current_longitude)) && Number(source.current_longitude) !== 0 ? Number(source.current_longitude) : null,
    completedCases: Number(source.completed_cases || 0),
    responseRate: Number.isFinite(responseRate) ? responseRate : null,
    assignedCases: Number(source.assigned_cases || 0),
    lastSeenAt: source.last_seen_at || null,
    recoveringUntil: source.recovering_until || null
  }
}

function normalizeService(raw, index) {
  const source = raw || {}
  const status = String(source.status || 'unknown').toLowerCase()
  return {
    id: String(source.id || source.name || makeClientId(`service-${index}`)),
    name: source.name || 'Unnamed service',
    status: ['ok', 'warn', 'bad'].includes(status) ? status : 'bad',
    latency: Number.isFinite(Number(source.latency)) ? Number(source.latency) : null,
    uptime: Number.isFinite(Number(source.uptime)) ? Number(source.uptime) : null
  }
}

function normalizeMapData(raw) {
  if (!raw || typeof raw !== 'object') return null
  return raw
}

function normalizeDashboardPayload(payload) {
  const source = payload?.dashboard || payload || {}
  return {
    incidents: (source.incidents || []).map(normalizeIncident),
    units: [],
    services: (source.services || []).map(normalizeService),
    analytics: source.analytics || null,
    kpis: source.kpis || {},
    map: normalizeMapData(source.map || source.mapData)
  }
}

function resolveEndpoint(baseUrl, endpoint) {
  if (!endpoint) return null
  if (/^https?:\/\//i.test(endpoint) || endpoint.startsWith('/')) return endpoint
  return `${String(baseUrl || '').replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`
}

async function apiRequest(url, authToken, options = {}) {
  if (!url) throw new ApiRequestError('No API endpoint configured.', 0)

  const headers = new Headers(options.headers || {})
  headers.set('Accept', 'application/json')
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`)

  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers
  })

  let body = null
  const contentType = response.headers.get('content-type') || ''
  if (response.status !== 204) {
    body = contentType.includes('application/json') ? await response.json() : await response.text()
  }

  if (!response.ok) {
    const message = typeof body === 'object' && body?.message
      ? body.message
      : `Request failed with status ${response.status}.`
    throw new ApiRequestError(message, response.status, body)
  }

  return body
}

function formatPhtClock(date = new Date()) {
  return `${PHT_CLOCK_FORMATTER.format(date)} PHT`
}

function formatPhtDateTime(value) {
  if (!value) return 'Missing server timestamp'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Invalid server timestamp' : `${PHT_DATE_FORMATTER.format(date)} PHT`
}

function formatNumber(value, suffix = '') {
  return value === null || value === undefined || Number.isNaN(Number(value))
    ? '—'
    : `${Number(value).toLocaleString()}${suffix}`
}

function exportAuditCsv(logs) {
  const escapeCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`
  const rows = [
    ['id', 'action', 'user', 'role', 'timestamp_utc', 'display_time_pht', 'ip', 'urgent'],
    ...logs.map((log) => [log.id, log.action, log.user, log.role, log.timestamp || '', formatPhtDateTime(log.timestamp), log.ip, log.urgent ? 'true' : 'false'])
  ]
  const csv = rows.map((row) => row.map(escapeCell).join(',')).join('\n')
  const blobUrl = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = blobUrl
  link.download = `audit-export-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(blobUrl)
}

function useRbacEditor(initialPayload) {
  const reducer = (state, action) => {
    switch (action.type) {
      case 'HYDRATE': {
        const normalized = normalizeRbacPayload(action.payload)
        return {
          ...state,
          savedMatrix: normalized.roles,
          draftMatrix: cloneRoleMatrix(normalized.roles),
          version: normalized.version,
          roleUserCounts: normalized.roleUserCounts,
          isEditing: false,
          roleToDelete: null,
          roleInputError: '',
          mutationError: ''
        }
      }
      case 'START_EDIT':
        return {
          ...state,
          draftMatrix: cloneRoleMatrix(state.savedMatrix),
          isEditing: true,
          newRoleInput: '',
          roleInputError: '',
          mutationError: ''
        }
      case 'CANCEL_EDIT':
        return {
          ...state,
          draftMatrix: cloneRoleMatrix(state.savedMatrix),
          isEditing: false,
          newRoleInput: '',
          roleInputError: '',
          mutationError: '',
          roleToDelete: null
        }
      case 'SET_NEW_ROLE_INPUT':
        return { ...state, newRoleInput: action.value }
      case 'SET_ROLE_ERROR':
        return { ...state, roleInputError: action.message }
      case 'SET_MUTATION_ERROR':
        return { ...state, mutationError: action.message }
      case 'TOGGLE': {
        if (isPermissionLocked(action.role, action.permissionId)) return state
        const current = state.draftMatrix[action.role] || {}
        return {
          ...state,
          draftMatrix: {
            ...state.draftMatrix,
            [action.role]: {
              ...current,
              [action.permissionId]: !Boolean(current[action.permissionId])
            }
          }
        }
      }
      case 'ADD_ROLE': {
        const permissions = Object.fromEntries(PERMISSIONS.map((permission) => [permission.id, false]))
        return {
          ...state,
          draftMatrix: { ...state.draftMatrix, [action.role]: permissions },
          newRoleInput: '',
          roleInputError: ''
        }
      }
      case 'OPEN_DELETE':
        return { ...state, roleToDelete: action.role, mutationError: '' }
      case 'CLOSE_DELETE':
        return { ...state, roleToDelete: null }
      case 'REMOVE_ROLE': {
        const next = { ...state.draftMatrix }
        delete next[action.role]
        return { ...state, draftMatrix: next, roleToDelete: null, mutationError: '' }
      }
      case 'SAVE_SUCCEEDED': {
        const normalized = normalizeRbacPayload(action.payload)
        const roles = Object.keys(normalized.roles).length
          ? normalized.roles
          : cloneRoleMatrix(state.draftMatrix)
        return {
          ...state,
          savedMatrix: roles,
          draftMatrix: cloneRoleMatrix(roles),
          version: normalized.version ?? state.version,
          roleUserCounts: normalized.roleUserCounts || state.roleUserCounts,
          isEditing: false,
          roleToDelete: null,
          mutationError: ''
        }
      }
      default:
        return state
    }
  }

  const [state, dispatch] = useReducer(
    reducer,
    initialPayload,
    (payload) => {
      const normalized = normalizeRbacPayload(payload)
      return {
        savedMatrix: normalized.roles,
        draftMatrix: cloneRoleMatrix(normalized.roles),
        version: normalized.version,
        roleUserCounts: normalized.roleUserCounts,
        isEditing: false,
        newRoleInput: '',
        roleInputError: '',
        mutationError: '',
        roleToDelete: null
      }
    }
  )

  const { diffs, unsavedCount } = useMemo(() => {
    const changes = []
    let count = 0
    const savedRoles = Object.keys(state.savedMatrix)
    const draftRoles = Object.keys(state.draftMatrix)

    savedRoles.forEach((role) => {
      if (!draftRoles.includes(role)) {
        changes.push({ role, action: 'REMOVE_ROLE', text: 'Entire role removed' })
        count += 1
      }
    })

    draftRoles.forEach((role) => {
      if (!savedRoles.includes(role)) {
        changes.push({ role, action: 'ADD_ROLE', text: 'New role added' })
        count += 1
        return
      }

      const permissionChanges = []
      PERMISSIONS.forEach((permission) => {
        const original = Boolean(state.savedMatrix[role]?.[permission.id])
        const current = Boolean(state.draftMatrix[role]?.[permission.id])
        if (original !== current) {
          permissionChanges.push(`${current ? '+' : '-'}${permission.label}`)
          count += 1
        }
      })
      if (permissionChanges.length) {
        changes.push({ role, action: 'MODIFIED', text: permissionChanges.join(', ') })
      }
    })

    return { diffs: changes, unsavedCount: count }
  }, [state.savedMatrix, state.draftMatrix])

  const hydrate = useCallback((payload) => dispatch({ type: 'HYDRATE', payload }), [])
  const startEdit = useCallback(() => dispatch({ type: 'START_EDIT' }), [])
  const cancelEdit = useCallback(() => dispatch({ type: 'CANCEL_EDIT' }), [])
  const setNewRoleInput = useCallback((value) => dispatch({ type: 'SET_NEW_ROLE_INPUT', value }), [])
  const setRoleError = useCallback((message) => dispatch({ type: 'SET_ROLE_ERROR', message }), [])
  const setMutationError = useCallback((message) => dispatch({ type: 'SET_MUTATION_ERROR', message }), [])
  const toggle = useCallback((role, permissionId) => dispatch({ type: 'TOGGLE', role, permissionId }), [])
  const addRole = useCallback((role) => dispatch({ type: 'ADD_ROLE', role }), [])
  const openDelete = useCallback((role) => dispatch({ type: 'OPEN_DELETE', role }), [])
  const closeDelete = useCallback(() => dispatch({ type: 'CLOSE_DELETE' }), [])
  const removeRole = useCallback((role) => dispatch({ type: 'REMOVE_ROLE', role }), [])
  const saveSucceeded = useCallback((payload) => dispatch({ type: 'SAVE_SUCCEEDED', payload }), [])

  return {
    ...state,
    diffs,
    unsavedCount,
    hydrate,
    startEdit,
    cancelEdit,
    setNewRoleInput,
    setRoleError,
    setMutationError,
    toggle,
    addRole,
    openDelete,
    closeDelete,
    removeRole,
    saveSucceeded
  }
}

function isPermissionLocked(role, permissionId) {
  return role === 'System Admin' && LOCKED_SYSTEM_ADMIN_PERMISSION_IDS.has(permissionId)
}

function PhtClock({ className = 'clock' }) {
  const [time, setTime] = useState(() => formatPhtClock())

  useEffect(() => {
    const update = () => setTime(formatPhtClock())
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [])

return <span className={`${className} mono`}>{time}</span>
}

function useWebSocketStatus(url, onAudit) {
  const [status, setStatus] = useState(url ? 'connecting' : 'offline')

  useEffect(() => {
    if (!url || typeof WebSocket === 'undefined') {
      setStatus('offline')
      return undefined
    }

    let socket
    let retryTimer
    let closedByEffect = false
    let retryCount = 0

    const connect = () => {
      if (closedByEffect) return
      setStatus(retryCount ? 'reconnecting' : 'connecting')
      try {
        socket = new WebSocket(url)
      } catch {
        setStatus('offline')
        return
      }

      socket.onopen = () => {
        retryCount = 0
        setStatus('online')
      }

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data)
          if (payload?.type === 'audit.created' && payload.entry) onAudit(payload.entry)
        } catch {
          // Ignore non-JSON socket frames; connection state remains authoritative.
        }
      }

      socket.onerror = () => setStatus('reconnecting')
      socket.onclose = () => {
        if (closedByEffect) return
        retryCount += 1
        setStatus('reconnecting')
        retryTimer = window.setTimeout(connect, Math.min(30000, 1000 * 2 ** Math.min(retryCount, 5)))
      }
    }

    connect()
    return () => {
      closedByEffect = true
      window.clearTimeout(retryTimer)
      if (socket) socket.close()
    }
  }, [url, onAudit])

  return status
}

function useIdleTimeout({ enabled, minutes, onTimeout }) {
  useEffect(() => {
    if (!enabled || !minutes || minutes <= 0) return undefined
    let timer
    const resetTimer = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(onTimeout, minutes * 60 * 1000)
    }
    const events = ['pointerdown', 'keydown', 'mousemove', 'touchstart']
    events.forEach((eventName) => window.addEventListener(eventName, resetTimer, { passive: true }))
    resetTimer()
    return () => {
      window.clearTimeout(timer)
      events.forEach((eventName) => window.removeEventListener(eventName, resetTimer))
    }
  }, [enabled, minutes, onTimeout])
}

function IncidentChart({ analytics, active }) {
  const [chartNode, setChartNode] = useState(null)
  const [chartDims, setChartDims] = useState({ w: 600, h: 220 })

  useEffect(() => {
    if (!active || !chartNode || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(([entry]) => {
      setChartDims({
        w: Math.max(entry.contentRect.width, 100),
        h: Math.max(entry.contentRect.height, 100)
      })
    })
    observer.observe(chartNode)
    return () => observer.disconnect()
  }, [active, chartNode])

  const labels = analytics?.labels || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const historical = (analytics?.historical || []).map((point, index) => ({
    day: Number(point.day ?? point[0] ?? index),
    value: Number(point.value ?? point[1] ?? 0)
  }))
  const projected = (analytics?.projected || []).map((point, index) => ({
    day: Number(point.day ?? point[0] ?? index),
    value: Number(point.value ?? point[1] ?? 0)
  }))

  if (!historical.length && !projected.length) {
    return (
      <div id="chart" ref={setChartNode} className="panel-state" aria-live="polite">
        No analytics data returned by the server.
      </div>
    )
  }

  const allPoints = [...historical, ...projected]
  const maxValue = Math.max(10, ...allPoints.map((point) => point.value))
  const { w: W, h: H } = chartDims
  const l = 44
  const r = 24
  const t = 16
  const b = 28
  const plotW = Math.max(W - l - r, 10)
  const plotH = Math.max(H - t - b, 10)
  const maxDay = Math.max(labels.length - 1, ...allPoints.map((point) => point.day), 1)
  const x = (day) => l + (day / maxDay) * plotW
  const y = (value) => t + plotH - (value / maxValue) * plotH
  const historicalPoints = historical.map((point) => `${x(point.day)},${y(point.value)}`)
  const projectedPoints = projected.map((point) => `${x(point.day)},${y(point.value)}`)
  const projectionStart = projected[0]?.day ?? historical[historical.length - 1]?.day ?? 0

  return (
    <div id="chart" ref={setChartNode} aria-busy={!analytics}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Historical incident frequency with a NOAH-adjusted risk scenario">
        <defs>
          <linearGradient id="gHist" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--cyan)" stopOpacity="0.35" />
            <stop offset="1" stopColor="var(--cyan)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="gProj" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--warn)" stopOpacity="0.20" />
            <stop offset="1" stopColor="var(--warn)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {projected.length > 0 && (
          <>
            <rect x={x(projectionStart)} y={t} width={Math.max(0, x(maxDay) - x(projectionStart))} height={plotH} fill="var(--warn)" fillOpacity="0.04" />
            <line x1={x(projectionStart)} x2={x(projectionStart)} y1={t} y2={t + plotH} stroke="var(--warn)" strokeDasharray="3,3" strokeOpacity="0.45" />
            <text x={x(projectionStart) + 6} y={t + 12} fill="var(--warn)" fontSize="11" fontWeight="600" fontFamily="ui-monospace, monospace">
              NOAH RISK SCENARIO
            </text>
          </>
        )}

        {[0, 0.33, 0.66, 1].map((ratio) => {
          const value = Math.round(maxValue * ratio)
          return (
            <g key={ratio}>
              <line x1={l} x2={W - r} y1={y(value)} y2={y(value)} stroke="var(--line)" />
              <text x={l - 10} y={y(value) + 4} fill="var(--mute)" fontSize="11" fontWeight="600" textAnchor="end" fontFamily="ui-monospace, monospace">
                {value}
              </text>
            </g>
          )
        })}

        {labels.map((label, index) => (
          <text key={`${label}-${index}`} x={x(index)} y={H - 8} fill={index >= projectionStart ? 'var(--mute-strong)' : 'var(--mute)'} fontSize="11" fontWeight={index === projectionStart ? '700' : '500'} textAnchor="middle" fontFamily="ui-monospace, monospace">
            {String(label).replace(/\s*\(.*?\)/, '')}
          </text>
        ))}

        {historical.length > 0 && (
          <>
            <polygon points={`${x(historical[0].day)},${y(0)} ${historicalPoints.join(' ')} ${x(historical[historical.length - 1].day)},${y(0)}`} fill="url(#gHist)" />
            <polyline points={historicalPoints.join(' ')} fill="none" stroke="var(--cyan)" strokeWidth="2.5" strokeLinejoin="round" />
          </>
        )}
        {projected.length > 0 && (
          <>
            <polygon points={`${x(projected[0].day)},${y(0)} ${projectedPoints.join(' ')} ${x(projected[projected.length - 1].day)},${y(0)}`} fill="url(#gProj)" />
            <polyline points={projectedPoints.join(' ')} fill="none" stroke="var(--warn)" strokeWidth="2" strokeDasharray="5,4" strokeLinejoin="round" />
          </>
        )}

        {historical.map((point) => (
          <circle key={`hist-${point.day}`} cx={x(point.day)} cy={y(point.value)} r="4" fill="var(--panel)" stroke="var(--cyan)" strokeWidth="2">
            <title>{`${labels[point.day] || 'Day'}: ${point.value} incidents`}</title>
          </circle>
        ))}
        {projected.map((point) => (
          <circle key={`proj-${point.day}`} cx={x(point.day)} cy={y(point.value)} r="3.5" fill="var(--panel)" stroke="var(--warn)" strokeWidth="2" strokeDasharray="2,2">
            <title>{`${labels[point.day] || 'Day'}: NOAH-adjusted scenario value ${point.value}; not a forecast`}</title>
          </circle>
        ))}
      </svg>
    </div>
  )
}

function AuditTable({ logs, compact = false, urgentLogId, expandedLogId, onToggleLog }) {
  const entries = compact ? logs.slice(0, 10) : logs
  const colSpan = 5

  return (
    <div className="scroll" role="log" aria-live="polite" aria-label={compact ? 'Recent audit activity' : 'Full audit trail'}>
      <table>
        <thead>
          <tr>
            <th className="audit-action-col">SYSTEM ACTION ENTRY</th>
            <th className="audit-user-col">USER ID</th>
            <th className="audit-role-col">AUTHORITY ROLE</th>
            <th className="audit-time-col">TIME (PHT)</th>
            <th className="audit-ip-col">NET ADDRESS</th>
          </tr>
        </thead>
        <tbody>
          {entries.length ? entries.map((log) => {
            const expanded = expandedLogId === log.id
            return (
              <React.Fragment key={log.id}>
                <tr className={urgentLogId === log.id && log.urgent ? 'flash-urgent' : ''}>
                  <td className="a">
                    <button type="button" className="audit-action-button" aria-expanded={expanded} onClick={() => onToggleLog(log.id)}>
                      {log.action}
                    </button>
                    <button type="button" className="audit-ip-toggle" aria-expanded={expanded} onClick={() => onToggleLog(log.id)}>
                      {expanded ? 'HIDE DETAILS' : 'SHOW IP'}
                    </button>
                  </td>
                  <td className="mono">{log.user}</td>
                  <td className="r">{log.role}</td>
                  <td className="mono m">{formatPhtDateTime(log.timestamp)}</td>
                  <td className="mono m">{expanded ? log.ip : 'HIDDEN'}</td>
                </tr>
                {expanded && (
                  <tr className="audit-detail-row">
                    <td colSpan={colSpan}>
                      <span>Network address: <b className="mono">{log.ip}</b></span>
                      <span>Recorded: <b className="mono">{formatPhtDateTime(log.timestamp)}</b></span>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            )
          }) : (
            <tr>
              <td colSpan={colSpan} className="empty-state">No audit entries returned by the server.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function FloodMap({ mapData, active, isGridMode }) {
  const [spanM, setSpanM] = useState(3000)
  const [mapSize, setMapSize] = useState({ w: 0, h: 0 })
  const [boxNode, setBoxNode] = useState(null)
  const [activeTooltipId, setActiveTooltipId] = useState(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!active || !boxNode) return undefined
    const measure = () => setMapSize({ w: boxNode.clientWidth, h: boxNode.clientHeight })
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(boxNode)
    return () => observer.disconnect()
  }, [active, boxNode])

  useEffect(() => {
    if (!active || !canvasRef.current || mapSize.w < 50 || mapSize.h < 50) return
    const canvas = canvasRef.current
    const W = mapSize.w
    const H = mapSize.h
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = W * dpr
    canvas.height = H * dpr
    const context = canvas.getContext('2d')
    const themeStyles = getComputedStyle(boxNode.closest('.resilience-root') || boxNode)
    const themeColor = (name, fallback) => themeStyles.getPropertyValue(name).trim() || fallback
    const canvasColors = {
      background: themeColor('--bg', '#060910'),
      panel2: themeColor('--panel2', '#121a2c'),
      line: themeColor('--line', '#1d2740'),
      text: themeColor('--text', '#e6ebf5'),
      mute: themeColor('--mute', '#94a3b8'),
      cyan: themeColor('--cyan', '#12b9d6')
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.clearRect(0, 0, W, H)

    if (isGridMode) {
      context.fillStyle = canvasColors.background
      context.fillRect(0, 0, W, H)
      const cols = 5
      const rows = 4
      const pad = 12
      const cellW = (W - (cols + 1) * pad) / cols
      const cellH = (H - (rows + 1) * pad) / rows
      const gridMatrix = mapData.gridMatrix || []
      const gridZones = mapData.gridZones || []
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const x = pad + col * (cellW + pad)
          const y = pad + row * (cellH + pad)
          context.fillStyle = gridMatrix[row]?.[col] || canvasColors.panel2
          context.beginPath()
          context.roundRect ? context.roundRect(x, y, cellW, cellH, 4) : context.rect(x, y, cellW, cellH)
          context.fill()
          context.strokeStyle = canvasColors.line
          context.lineWidth = 1
          context.stroke()
          context.fillStyle = canvasColors.text
          context.font = '600 10px ui-monospace,monospace'
          context.textAlign = 'center'
          context.fillText(gridZones[row]?.[col] || `ZONE ${row + 1}-${col + 1}`, x + cellW / 2, y + cellH / 2)
        }
      }
      context.textAlign = 'start'
      context.fillStyle = canvasColors.mute
      context.font = '600 11px ui-monospace,monospace'
      context.fillText('HISTORICAL DENSITY MATRIX', 14, H - 12)
      return
    }

    const mpp = spanM / W
    const px = (east) => W / 2 + east / mpp
    const py = (north) => H / 2 - north / mpp
    context.fillStyle = canvasColors.background
    context.fillRect(0, 0, W, H)

    // Explicit styles are required because a canvas defaults to black strokes.
    context.strokeStyle = canvasColors.line
    context.lineWidth = 1
    ;(mapData.secondaryRoads || []).forEach((line) => {
      context.beginPath()
      context.moveTo(px(line[0][0]), py(line[0][1]))
      context.lineTo(px(line[1][0]), py(line[1][1]))
      context.stroke()
    })

    context.strokeStyle = canvasColors.panel2
    context.lineWidth = 2.25
    ;(mapData.arterialRoads || []).forEach((line) => {
      context.beginPath()
      context.moveTo(px(line[0][0]), py(line[0][1]))
      context.lineTo(px(line[1][0]), py(line[1][1]))
      context.stroke()
    })

    context.lineJoin = 'round'
    context.lineCap = 'round'
    context.beginPath()
    ;(mapData.creekPath || []).forEach((point, index) => {
      if (index) context.lineTo(px(point[0]), py(point[1]))
      else context.moveTo(px(point[0]), py(point[1]))
    })
    context.strokeStyle = 'rgba(18,120,160,0.30)'
    context.lineWidth = 14
    context.stroke()
    context.strokeStyle = canvasColors.cyan
    context.lineWidth = 2
    context.stroke()

    context.fillStyle = canvasColors.mute
    context.font = '600 11px ui-monospace,monospace'
    context.fillText(mapData.labels?.northRoad || '', px(-1400), py(220) - 6)
    context.fillText(mapData.labels?.centralRoad || '', px(-280), py(800))
    context.fillText(mapData.labels?.creek || '', px(60), py(-40))

    const centerX = W / 2
    const centerY = H / 2
    context.setLineDash([4, 4])
    context.strokeStyle = 'rgba(230,235,245,0.45)'
    context.lineWidth = 1
    context.beginPath()
    context.arc(centerX, centerY, 500 / mpp, 0, Math.PI * 2)
    context.stroke()
    context.setLineDash([])

    const step = spanM > 2500 ? 500 : 250
    const scaleLength = step / mpp
    context.strokeStyle = canvasColors.mute
    context.lineWidth = 2
    context.beginPath()
    context.moveTo(W - 14 - scaleLength, H - 18)
    context.lineTo(W - 14, H - 18)
    context.stroke()
    context.fillText(`${step} m`, W - 14 - scaleLength, H - 24)
  }, [active, isGridMode, mapData, mapSize.h, mapSize.w, spanM])

  const getCanvasCoords = useCallback((east, north) => {
    if (mapSize.w < 1) return { left: 0, top: 0 }
    const mpp = spanM / mapSize.w
    return {
      left: mapSize.w / 2 + east / mpp,
      top: mapSize.h / 2 - north / mpp
    }
  }, [mapSize.h, mapSize.w, spanM])

  const activeTooltip = (mapData.pings || []).find((ping) => ping.id === activeTooltipId)
  const activeTooltipPosition = activeTooltip ? getCanvasCoords(activeTooltip.x, activeTooltip.y) : null

  const setTooltip = (pingId) => setActiveTooltipId(pingId)
  const clearTooltip = (pingId) => setActiveTooltipId((current) => current === pingId ? null : current)

  return (
    <>
      <div id="dens" ref={setBoxNode}>
        <canvas ref={canvasRef} role="img" aria-label="Flood density map" />
        <div className="map-disclaimer" role="note">GIS source: {mapData.source || 'server'}</div>
        <div className="zb">
          <button type="button" onClick={() => setSpanM((previous) => Math.max(800, previous / 1.5))} aria-label="Zoom in">+</button>
          <button type="button" onClick={() => setSpanM(3000)} title="Reset view" aria-label="Reset view">⟲</button>
          <button type="button" onClick={() => setSpanM((previous) => Math.min(6000, previous * 1.5))} aria-label="Zoom out">−</button>
        </div>

        {!isGridMode && mapSize.w >= 50 && (mapData.pings || []).map((ping) => {
          const position = getCanvasCoords(ping.x, ping.y)
          const selected = activeTooltipId === ping.id
          return (
            <button
              type="button"
              key={ping.id}
              className="pg"
              style={{ left: `${position.left}px`, top: `${position.top}px`, '--c': levelColor[ping.level] || levelColor.l }}
              onMouseEnter={() => setTooltip(ping.id)}
              onMouseLeave={() => clearTooltip(ping.id)}
              onFocus={() => setTooltip(ping.id)}
              onBlur={() => clearTooltip(ping.id)}
              onClick={() => setActiveTooltipId((current) => current === ping.id ? null : ping.id)}
              aria-label={`${ping.name}, ${levelText[ping.level] || 'UNKNOWN'}, ${ping.depth ?? 'unknown'} cm depth`}
              aria-pressed={selected}
            />
          )
        })}

        {activeTooltip && activeTooltipPosition && !isGridMode && (
          <div
            id="tip"
            style={{
              display: 'block',
              left: `${Math.max(8, Math.min(activeTooltipPosition.left + 14, mapSize.w - 210))}px`,
              top: `${Math.max(activeTooltipPosition.top - 48, 8)}px`
            }}
            role="status"
          >
            <b>{activeTooltip.name}</b><br />
            {levelText[activeTooltip.level] || 'UNKNOWN'} · {activeTooltip.depth ?? 'unknown'} cm depth · {formatPhtDateTime(activeTooltip.timestamp)}
          </div>
        )}
      </div>

      <div className="lg">
        {isGridMode ? (
          <>
            <span className="grid-legend-note">Grid mode shows historical density zones.</span>
          </>
        ) : (
          <>
            <span style={{ '--c': '#ef4444' }}>Severe (&gt;100cm)</span>
            <span style={{ '--c': '#f5a524' }}>Moderate (50-100cm)</span>
            <span style={{ '--c': '#12b9d6' }}>Minor (&lt;50cm)</span>
            <span style={{ '--c': '#fff' }}>Sensor ping</span>
          </>
        )}
      </div>
    </>
  )
}

function ServiceGrid({ services }) {
  const labelMap = { ok: 'OPERATIONAL', warn: 'DEGRADED', bad: 'OFFLINE' }
  if (!services.length) return <div className="panel-state">No service health data returned by the server.</div>

  return (
    <div className="cards">
      {services.map((service) => (
        <div className="card" key={service.id}>
          <h3>
            {service.name}
            <span className={`badge ${service.status}`}>{labelMap[service.status]}</span>
          </h3>
          <div className="kv"><span>Latency</span><b className="mono">{service.latency === null ? 'N/A' : `${service.latency} ms`}</b></div>
          <div className="kv"><span>30-day uptime</span><b className="mono">{formatNumber(service.uptime, '%')}</b></div>
          <div className="bar service-bar">
            <i style={{ '--bar-width': `${Math.max(0, Math.min(100, service.uptime || 0))}%`, '--bar-color': `var(--${service.status})` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function RbacMatrix({ editor, loading, error, onOpenDelete, onRequestSave }) {
  const handleAddRole = (event) => {
    event.preventDefault()
    const role = editor.newRoleInput.trim()
    if (!ROLE_NAME_PATTERN.test(role)) {
      editor.setRoleError('Use 2–40 characters: letters, numbers, spaces, hyphens, or underscores.')
      return
    }
    if (Object.keys(editor.draftMatrix).some((existing) => existing.toLowerCase() === role.toLowerCase())) {
      editor.setRoleError('A role with this name already exists.')
      return
    }
    editor.addRole(role)
  }

  return (
    <section id="rbac-panel" className="view on" role="tabpanel" aria-labelledby="tab-rb" tabIndex="0">
      <div className="panel rbac-panel">
        <div className="bandh">
          <div className="rbac-header-actions">
            <span>ROLE-BASED ACCESS CONTROL MATRIX</span>
            {editor.isEditing && (
              <span className={`mono status-chip rbac-unsaved-badge ${editor.unsavedCount > 0 ? 'chip-warn' : ''}`}>
                {editor.unsavedCount} UNSAVED {editor.unsavedCount === 1 ? 'CHANGE' : 'CHANGES'}
              </span>
            )}
          </div>
          <div className="rbac-header-actions">
            {!editor.isEditing ? (
              <button type="button" className="mono rbac-btn-edit" disabled={loading || Boolean(error)} onClick={editor.startEdit}>EDIT</button>
            ) : (
              <>
                <button type="button" className="mono rbac-btn-cancel" onClick={editor.cancelEdit}>CANCEL</button>
                <button type="button" className="mono rbac-btn-save" disabled={editor.unsavedCount === 0} onClick={onRequestSave}>SAVE CHANGES</button>
              </>
            )}
          </div>
        </div>

        {editor.isEditing && (
          <div className="rbac-add-role-panel">
            <form onSubmit={handleAddRole} className="rbac-add-role-form">
              <label className="sr-only" htmlFor="new-role-name">New role name</label>
              <input id="new-role-name" type="text" maxLength="40" placeholder="New role name" value={editor.newRoleInput} onChange={(event) => { editor.setNewRoleInput(event.target.value); if (editor.roleInputError) editor.setRoleError('') }} className="rbac-add-role-input" />
              <button type="submit" className="mono rbac-add-role-submit">+ ADD ROLE</button>
            </form>
            {editor.roleInputError && <span className="rbac-role-error" role="alert">{editor.roleInputError}</span>}
          </div>
        )}

        {error && <div className="panel-state panel-error" role="alert">{error}</div>}
        {editor.mutationError && <div className="panel-state panel-error" role="alert">{editor.mutationError}</div>}
        {loading ? (
          <div className="panel-state" aria-live="polite">Loading RBAC policy from the server…</div>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th className="rbac-role-col">ROLE</th>
                  {PERMISSIONS.map((permission) => <th key={permission.id} className="rbac-permission-col">{permission.label.toUpperCase()}</th>)}
                  {editor.isEditing && <th className="rbac-action-col">ACT</th>}
                </tr>
              </thead>
              <tbody>
                {Object.entries(editor.isEditing ? editor.draftMatrix : editor.savedMatrix).map(([role, permissions]) => {
                  const isSystemAdmin = role === 'System Admin'
                  const isNewRole = editor.isEditing && !editor.savedMatrix[role]
                  const hasAssignmentCount = Object.prototype.hasOwnProperty.call(editor.roleUserCounts, role)
                  const assignedUsers = hasAssignmentCount ? Number(editor.roleUserCounts[role] || 0) : null
                  return (
                    <tr key={role} className={isNewRole ? 'rbac-new-role' : ''}>
                      <td className="a">
                        <span className="role-name">
                          {role}
                          {isNewRole && <span className="rbac-new-role-dot" title="New role in this draft" aria-label="New role" />}
                          {isSystemAdmin && <span className="mono rbac-locked-pill" title="System Admin cannot be removed">LOCKED</span>}
                          {assignedUsers !== null && assignedUsers > 0 && <span className="rbac-assigned-count">{assignedUsers} assigned</span>}
                        </span>
                      </td>
                      {PERMISSIONS.map((permission) => {
                        const isLocked = isPermissionLocked(role, permission.id)
                        const isAllowed = Boolean(permissions[permission.id])
                        const isChanged = editor.isEditing && !isNewRole && Boolean(editor.savedMatrix[role]?.[permission.id]) !== isAllowed
                        if (!editor.isEditing) return <td key={permission.id} className={isAllowed ? 'tick' : 'cross'}>{isAllowed ? '✓' : '—'}</td>
                        return (
                          <td key={permission.id} className="rbac-cell-wrap">
                            <button type="button" role="switch" aria-checked={isAllowed} aria-label={`${role}: ${permission.label}, ${isAllowed ? 'allowed' : 'denied'}${isLocked ? ' (locked safeguard)' : ''}`} disabled={isLocked} onClick={() => editor.toggle(role, permission.id)} title={isLocked ? 'System Admin safeguards cannot be disabled.' : `${role}: ${permission.label}`} className={`rbac-switch ${isAllowed ? 'allowed' : ''} ${isLocked ? 'locked' : ''} ${isChanged ? 'changed' : ''}`}>
                              {isAllowed ? '✓' : '—'}
                              {isChanged && <span className="rbac-changed-dot" />}
                            </button>
                          </td>
                        )
                      })}
                      {editor.isEditing && (
                        <td className="rbac-action-cell">
                          {!isSystemAdmin ? (
                            <button type="button" aria-label={`Remove role ${role}`} title={assignedUsers === null ? 'Cannot remove until role assignments are loaded' : assignedUsers > 0 ? `Cannot remove: ${assignedUsers} users are assigned` : `Remove ${role}`} disabled={assignedUsers === null || assignedUsers > 0} onClick={() => onOpenDelete(role)} className="rbac-remove-btn">✕</button>
                          ) : <span className="rbac-action-placeholder" title="Master role cannot be removed">—</span>}
                        </td>
                      )}
                    </tr>
                  )
                })}
                {!Object.keys(editor.isEditing ? editor.draftMatrix : editor.savedMatrix).length && (
                  <tr><td colSpan={PERMISSIONS.length + 2} className="empty-state">No RBAC policy returned by the server.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

function ReauthModal({ open, mode, roleName, changeSummary, busy, error, onClose, onConfirm }) {
  const dialogRef = useRef(null)
  const passwordRef = useRef(null)
  const previousFocusRef = useRef(null)
  const busyRef = useRef(busy)
  const closeRef = useRef(onClose)
  const [password, setPassword] = useState('')
  const isDelete = mode === 'delete'
  const titleId = `rbac-modal-title-${mode}`

  useEffect(() => { busyRef.current = busy }, [busy])
  useEffect(() => { closeRef.current = onClose }, [onClose])

  useEffect(() => {
    if (!open) return undefined
    previousFocusRef.current = document.activeElement
    setPassword('')
    const focusInitial = window.setTimeout(() => {
      if (isDelete) dialogRef.current?.querySelector('button:not([disabled])')?.focus()
      else passwordRef.current?.focus()
    }, 0)
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = [...dialogRef.current.querySelectorAll('button:not([disabled]), input:not([disabled])')]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(focusInitial)
      document.removeEventListener('keydown', handleKeyDown)
      previousFocusRef.current?.focus?.()
    }
  }, [isDelete, open])

  if (!open) return null

  const submit = (event) => {
    event.preventDefault()
    onConfirm(isDelete ? undefined : password)
  }

  return (
    <div className="rbac-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <form ref={dialogRef} onSubmit={submit} className={`panel rbac-modal-dialog ${isDelete ? 'danger' : 'verify'}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h3 id={titleId} className="rbac-modal-title">{isDelete ? 'CONFIRM ROLE REMOVAL' : 'CONFIRM & AUTHENTICATE RBAC CHANGES'}</h3>
        <p className="rbac-modal-copy">
          {isDelete
            ? <>Remove <b className="modal-emphasis">{roleName}</b> from this draft? The server will validate the role assignment when you save.</>
            : 'Administrative re-authentication is required. Your password is sent to the server over the existing authenticated session.'}
        </p>

        {!isDelete && (
          <>
            <div className="rbac-diff-box">
              {changeSummary.map((item) => <div key={`${item.role}-${item.action}`} className="rbac-diff-row"><b className="modal-emphasis">{item.role}</b>: <span>{item.text}</span></div>)}
            </div>
            <div className="rbac-modal-field">
              <label htmlFor="admin-save-pass" className="rbac-pass-label">ENTER CURRENT ADMIN PASSWORD</label>
              <input ref={passwordRef} id="admin-save-pass" type="password" autoComplete="current-password" required placeholder="••••••••••••" value={password} onChange={(event) => setPassword(event.target.value)} className={`rbac-pass-input ${error ? 'has-error' : ''}`} />
            </div>
          </>
        )}

        {error && <span className="rbac-role-error rbac-modal-error" role="alert">{error}</span>}
        <div className="rbac-modal-actions">
          <button type="button" className="mono rbac-btn-cancel" onClick={onClose} disabled={busy}>{isDelete ? 'CANCEL' : 'BACK TO EDIT'}</button>
          <button type="submit" disabled={busy} className={`mono ${isDelete ? 'rbac-danger-submit' : 'rbac-btn-save'}`}>{busy ? (isDelete ? 'REMOVING…' : 'AUTHENTICATING…') : (isDelete ? 'REMOVE FROM DRAFT' : 'CONFIRM & SAVE')}</button>
        </div>
      </form>
    </div>
  )
}

export function AdminDashboard({
  auth,
  onLogout,
  apiBaseUrl = '',
  dashboardEndpoint = '/api/dashboard',
  auditEndpoint = `${API_BASE_URL}/api/v1/audit-logs`,
  rbacEndpoint = `${API_BASE_URL}/api/v1/rbac/summary`,
  reauthEndpoint = `${API_BASE_URL}/api/v1/auth/reauth`,
  noahPredictionEndpoint = `${API_BASE_URL}/api/v1/predictions/flood`,
  metricsEndpoint = `${API_BASE_URL}/api/v1/admin-dashboard/metrics`,
  operationsMetricsEndpoint = `${API_BASE_URL}/api/v1/operations/metrics?window_days=7`,
  deploymentEndpoint = `${API_BASE_URL}/api/v1/rescuers/deployment`,
  socketUrl,
  demoMode = true,
  initialData = demoMode ? DEMO_DATA : undefined,
  idleTimeoutMinutes = 30
}) {
  const authToken = auth?.token || auth?.accessToken || ''
  const suppliedDashboard = initialData?.dashboard || (initialData && (initialData.incidents || initialData.units || initialData.services) ? initialData : null)
  const suppliedRbac = initialData?.rbac
  const initialDashboard = useMemo(() => normalizeDashboardPayload(suppliedDashboard), [suppliedDashboard])
  const initialRbac = useMemo(() => normalizeRbacPayload(suppliedRbac), [suppliedRbac])

  const [activeTab, setActiveTab] = useState('an')
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const profileMenuRef = useRef(null)
  const [dashboard, setDashboard] = useState(initialDashboard)
  const [dashboardStatus, setDashboardStatus] = useState(suppliedDashboard ? 'ready' : 'loading')
  const [dashboardError, setDashboardError] = useState('')
  const [databaseMetrics, setDatabaseMetrics] = useState(null)
  const [metricsStatus, setMetricsStatus] = useState('loading')
  const [metricsError, setMetricsError] = useState('')
  const [operationsMetrics, setOperationsMetrics] = useState(null)
  const [operationsMetricsStatus, setOperationsMetricsStatus] = useState('loading')
  const [rescuers, setRescuers] = useState([])
  const [rescuersStatus, setRescuersStatus] = useState('loading')
  const [rescuersError, setRescuersError] = useState('')
  const [noahAnalytics, setNoahAnalytics] = useState(null)
  const [noahStatus, setNoahStatus] = useState('loading')
  const [logs, setLogs] = useState([])
  const [auditLoading, setAuditLoading] = useState(true)
  const [auditError, setAuditError] = useState('')
  const [selectedRole, setSelectedRole] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedLogId, setExpandedLogId] = useState(null)
  const [urgentLogId, setUrgentLogId] = useState(null)
  const [rbacLoading, setRbacLoading] = useState(!suppliedRbac)
  const [rbacError, setRbacError] = useState('')
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const urgentTimerRef = useRef(null)
  const rbacEditor = useRbacEditor(initialRbac)

  const loadDashboard = useCallback(async () => {
    if (suppliedDashboard || !dashboardEndpoint) {
      setDashboardStatus('ready')
      return
    }
    setDashboardStatus('loading')
    setDashboardError('')
    try {
      const payload = await apiRequest(resolveEndpoint(apiBaseUrl, dashboardEndpoint), authToken)
      setDashboard(normalizeDashboardPayload(payload))
      setDashboardStatus('ready')
    } catch (error) {
      setDashboardStatus('error')
      setDashboardError(error.message || 'Dashboard data could not be loaded.')
    }
  }, [apiBaseUrl, authToken, dashboardEndpoint, suppliedDashboard])

  const loadAudit = useCallback(async () => {
    if (!auditEndpoint) {
      setAuditLoading(false)
      return
    }
    setAuditLoading(true)
    setAuditError('')
    try {
      const payload = await apiRequest(resolveEndpoint(apiBaseUrl, auditEndpoint), authToken)
      setLogs(normalizeAuditLogs(payload))
    } catch (error) {
      setAuditError(error.message || 'Audit data could not be loaded.')
    } finally {
      setAuditLoading(false)
    }
  }, [apiBaseUrl, authToken, auditEndpoint])

  const loadRbac = useCallback(async () => {
    if (!rbacEndpoint) {
      setRbacLoading(false)
      return
    }
    setRbacLoading(true)
    setRbacError('')
    try {
      const payload = await apiRequest(resolveEndpoint(apiBaseUrl, rbacEndpoint), authToken)
      rbacEditor.hydrate(payload)
    } catch (error) {
      setRbacError(error.message || 'RBAC policy could not be loaded.')
    } finally {
      setRbacLoading(false)
    }
  }, [apiBaseUrl, authToken, rbacEndpoint, rbacEditor.hydrate])

  useEffect(() => { loadDashboard() }, [loadDashboard])
  useEffect(() => { loadAudit() }, [loadAudit])
  useEffect(() => { loadRbac() }, [loadRbac])

  useEffect(() => {
    if (!isProfileMenuOpen) return undefined
    const closeProfileMenu = (event) => {
      if (!profileMenuRef.current?.contains(event.target)) setIsProfileMenuOpen(false)
    }
    document.addEventListener('mousedown', closeProfileMenu)
    return () => document.removeEventListener('mousedown', closeProfileMenu)
  }, [isProfileMenuOpen])

  useEffect(() => {
    let cancelled = false
    async function loadRescuerDeployment() {
      setRescuersStatus('loading')
      setRescuersError('')
      try {
        const payload = await apiRequest(deploymentEndpoint, authToken)
        if (cancelled) return
        const rows = Array.isArray(payload) ? payload : payload?.rescuers || payload?.deployment || []
        setRescuers(rows.map(normalizeRescuer))
        setRescuersStatus('ready')
      } catch (error) {
        if (cancelled) return
        setRescuers([])
        setRescuersStatus('error')
        setRescuersError(error.message || 'Rescuer deployment could not be loaded.')
      }
    }
    loadRescuerDeployment()
    return () => { cancelled = true }
  }, [authToken, deploymentEndpoint])

  useEffect(() => {
    let cancelled = false

    async function loadDatabaseMetrics() {
      setMetricsStatus('loading')
      setMetricsError('')
      try {
        const payload = await apiRequest(metricsEndpoint, authToken)
        if (cancelled) return
        setDatabaseMetrics(payload)
        setMetricsStatus('ready')
      } catch (error) {
        if (cancelled) return
        setDatabaseMetrics(null)
        setMetricsStatus(error.status === 401 ? 'auth-error' : 'error')
        setMetricsError(error.status === 401 ? 'SESSION EXPIRED' : 'DATABASE UNAVAILABLE')
      }
    }

    if (metricsEndpoint) loadDatabaseMetrics()
    else setMetricsStatus('error')
    return () => { cancelled = true }
  }, [authToken, metricsEndpoint])

  useEffect(() => {
    let cancelled = false

    async function loadOperationsMetrics() {
      setOperationsMetricsStatus('loading')
      try {
        const payload = await apiRequest(operationsMetricsEndpoint, authToken)
        if (cancelled) return
        setOperationsMetrics(payload)
        setOperationsMetricsStatus('ready')
      } catch (error) {
        if (cancelled) return
        setOperationsMetrics(null)
        setOperationsMetricsStatus(error.status === 401 ? 'auth-error' : 'error')
      }
    }

    if (operationsMetricsEndpoint) loadOperationsMetrics()
    else setOperationsMetricsStatus('error')
    return () => { cancelled = true }
  }, [authToken, operationsMetricsEndpoint])

  useEffect(() => {
    const controller = new AbortController()

    async function loadNoahAnalytics() {
      setNoahStatus('loading')
      try {
        const response = await fetch(noahPredictionEndpoint, { signal: controller.signal })
        if (!response.ok) throw new Error(`NOAH data request failed (${response.status})`)
        const payload = await response.json()
        setNoahAnalytics(payload)
        setNoahStatus('ready')
      } catch (error) {
        if (error.name === 'AbortError') return
        setNoahAnalytics(null)
        setNoahStatus('error')
      }
    }

    if (noahPredictionEndpoint) loadNoahAnalytics()
    else setNoahStatus('error')
    return () => controller.abort()
  }, [noahPredictionEndpoint])

  const adjustedAnalytics = useMemo(
    () => buildNoahAdjustedAnalytics(dashboard.analytics, noahAnalytics) || dashboard.analytics,
    [dashboard.analytics, noahAnalytics]
  )

  const handleIncomingAudit = useCallback((entry) => {
    const normalized = normalizeAuditLog(entry)
    setLogs((previous) => normalizeAuditLogs([normalized, ...previous]))
    if (normalized.urgent) {
      setUrgentLogId(normalized.id)
      window.clearTimeout(urgentTimerRef.current)
      urgentTimerRef.current = window.setTimeout(() => setUrgentLogId(null), 1800)
    }
  }, [])

  useEffect(() => () => window.clearTimeout(urgentTimerRef.current), [])

  const websocketStatus = useWebSocketStatus(socketUrl || auth?.socketUrl || WS_URL, handleIncomingAudit)
  const handleIdleTimeout = useCallback(() => onLogout?.({ reason: 'idle-timeout' }), [onLogout])
  useIdleTimeout({ enabled: Boolean(onLogout), minutes: idleTimeoutMinutes, onTimeout: handleIdleTimeout })

  const handleFinalSave = useCallback(async (password) => {
    setSaveBusy(true)
    setSaveError('')
    try {
      let reauth
      try {
        reauth = await apiRequest(resolveEndpoint(apiBaseUrl, reauthEndpoint), authToken, {
          method: 'POST',
          body: JSON.stringify({ password })
        })
      } catch (error) {
        if (error.status !== 404) throw error
        const username = auth?.user?.username || auth?.username
        if (!username) throw new ApiRequestError('Administrator username is unavailable for re-authentication.', 401)
        reauth = await apiRequest(`${API_BASE_URL}/api/v1/auth/login`, '', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ username, password, role: 'admin' }).toString()
        })
      }
      if (reauth?.authenticated === false) throw new ApiRequestError('Administrator re-authentication failed.', 401, reauth)

      const reauthHeaders = reauth?.reauthToken ? { 'X-Reauth-Token': reauth.reauthToken } : undefined
      const saved = await apiRequest(resolveEndpoint(apiBaseUrl, rbacEndpoint), authToken, {
        method: 'PUT',
        headers: reauthHeaders,
        body: JSON.stringify({
          roles: rbacEditor.draftMatrix,
          version: rbacEditor.version
        })
      })

      rbacEditor.saveSucceeded({
        roles: saved?.roles || saved?.matrix || rbacEditor.draftMatrix,
        version: saved?.version ?? rbacEditor.version,
        roleUserCounts: saved?.roleUserCounts || rbacEditor.roleUserCounts
      })
      setSaveModalOpen(false)
      await loadAudit()
    } catch (error) {
      if (error.status === 409) setSaveError('This RBAC policy changed in another session. Reload it before saving.')
      else setSaveError(error.message || 'RBAC changes were not saved.')
    } finally {
      setSaveBusy(false)
    }
  }, [apiBaseUrl, auth, authToken, loadAudit, rbacEditor.draftMatrix, rbacEditor.roleUserCounts, rbacEditor.saveSucceeded, rbacEditor.version, rbacEndpoint, reauthEndpoint])

  const closeSaveModal = useCallback(() => {
    if (!saveBusy) {
      setSaveModalOpen(false)
      setSaveError('')
    }
  }, [saveBusy])

  const handleOpenDelete = useCallback((role) => {
    const hasAssignmentCount = Object.prototype.hasOwnProperty.call(rbacEditor.roleUserCounts, role)
    if (!hasAssignmentCount) {
      rbacEditor.setMutationError(`Cannot remove ${role}: the server did not provide a role-assignment count.`)
      return
    }
    const assignedUsers = Number(rbacEditor.roleUserCounts[role] || 0)
    if (assignedUsers > 0) {
      rbacEditor.setMutationError(`Cannot remove ${role}: ${assignedUsers} user${assignedUsers === 1 ? '' : 's'} are assigned. Choose a replacement role first.`)
      return
    }
    rbacEditor.openDelete(role)
  }, [rbacEditor.openDelete, rbacEditor.roleUserCounts, rbacEditor.setMutationError])

  const closeDeleteModal = useCallback(() => {
    if (!deleteBusy) rbacEditor.closeDelete()
  }, [deleteBusy, rbacEditor.closeDelete])

  const confirmDelete = useCallback(() => {
    if (!rbacEditor.roleToDelete) return
    setDeleteBusy(true)
    rbacEditor.removeRole(rbacEditor.roleToDelete)
    setDeleteBusy(false)
  }, [rbacEditor.removeRole, rbacEditor.roleToDelete])

  useEffect(() => {
    if (!rbacEditor.isEditing || rbacEditor.unsavedCount === 0) return undefined
    const warnBeforeUnload = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [rbacEditor.isEditing, rbacEditor.unsavedCount])

  const incidents = dashboard.incidents
  const services = dashboard.services
  const incidentStats = useMemo(() => {
    const active = incidents.filter((incident) => !['RESOLVED', 'CLOSED'].includes(incident.status))
    return {
      active: active.length,
      critical: active.filter((incident) => ['CRITICAL', 'P1', '1'].includes(incident.severity)).length,
      moderate: active.filter((incident) => ['MODERATE', 'P2', '2'].includes(incident.severity)).length,
      minor: active.filter((incident) => ['MINOR', 'P3', '3'].includes(incident.severity)).length
    }
  }, [incidents])

  const unitStats = useMemo(() => {
    const total = rescuers.length
    const available = rescuers.filter((rescuer) => rescuer.status === 'AVAILABLE').length
    const engaged = rescuers.filter((rescuer) => rescuer.status === 'DISPATCHED').length
    return {
      total,
      available,
      engaged,
      availabilityPct: total ? Math.round((available / total) * 100) : null,
      utilizedPct: total ? Math.round((engaged / total) * 100) : null
    }
  }, [rescuers])

  const healthyCount = services.filter((service) => service.status === 'ok').length
  const uniqueRoles = [...new Set(logs.map((log) => log.role))].filter(Boolean)
  const filteredAudit = logs.filter((log) => {
    const matchesRole = !selectedRole || log.role === selectedRole
    const query = searchQuery.toLowerCase()
    const matchesQuery = !query || `${log.action} ${log.user} ${log.role} ${log.ip}`.toLowerCase().includes(query)
    return matchesRole && matchesQuery
  })

  const handleTabKeyDown = (event, tabId) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const currentIndex = TAB_DEFS.findIndex((tab) => tab.id === tabId)
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? TAB_DEFS.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + TAB_DEFS.length) % TAB_DEFS.length
    setActiveTab(TAB_DEFS[nextIndex].id)
    window.setTimeout(() => document.getElementById(`tab-${TAB_DEFS[nextIndex].id}`)?.focus(), 0)
  }

  const kpis = {
    ...(dashboard.kpis || {}),
    ...(databaseMetrics ? {
      rescueSuccessRate: databaseMetrics.rescue_success_rate,
      rescueSuccessComparison: databaseMetrics.rescue_success_change
    } : {})
  }
  const rescueComparison = kpis.rescueSuccessComparison == null
    ? null
    : `${Number(kpis.rescueSuccessComparison) >= 0 ? '+' : ''}${Number(kpis.rescueSuccessComparison).toFixed(1)}%`
  const statusLabel = { online: 'Connected', connecting: 'Connecting…', reconnecting: 'Reconnecting…', offline: 'Offline' }[websocketStatus]
  const websocketConnected = websocketStatus === 'online'
  const websocketIndicatorState = websocketConnected ? 'online' : 'reconnecting'
  const websocketIndicatorLabel = websocketConnected ? 'Websocket: Connected' : 'Websocket: Reconnecting'

  return (
    <div className="resilience-root">
      <header className="coord-header admin-coord-header">
        <div className="coord-header-left">
          <Logo size="small" />
          <h1 className="coord-system-title">RESQ-ROUTE ADMINISTRATION</h1>
        </div>
        <nav className="nav-compact" role="tablist" aria-label="Sections">
          {TAB_DEFS.map((tab) => (
            <button key={tab.id} id={`tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={tab.panelId} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => setActiveTab(tab.id)} onKeyDown={(event) => handleTabKeyDown(event, tab.id)}>
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="coord-header-right">
          <div className={`coord-telemetry-status ${websocketIndicatorState}`} aria-label={websocketIndicatorLabel}>
            <span className={`coord-status-indicator ${websocketIndicatorState}`} />
            <span>{websocketIndicatorLabel}</span>
          </div>
          <div className="coord-incident-pill" aria-label={`Active alerts: ${incidentStats.active}`} title={`Active alerts: ${incidentStats.active}`}>
            <span className="coord-incident-label">ACTIVE ALERTS:</span>
            <span>{incidentStats.active}</span>
          </div>
          <PhtClock className="coord-clock" />
          <div className="coordinator-profile-menu" ref={profileMenuRef}>
            <button type="button" className="coord-profile-badge" onClick={() => setIsProfileMenuOpen((open) => !open)} aria-label="Account menu for System Admin" aria-haspopup="menu" aria-expanded={isProfileMenuOpen}>
              <span className="coord-avatar-circle">AD</span>
              <span className="coord-profile-meta"><span className="coord-profile-name">{auth?.user?.full_name || auth?.user?.username || 'Administrator'}</span><span className="coord-profile-role">System Admin</span></span>
              <ChevronDown size={14} aria-hidden="true" />
            </button>
            {isProfileMenuOpen && <div className="coordinator-profile-dropdown" role="menu"><span className="coordinator-dropdown-name">System Admin</span><button type="button" role="menuitem" onClick={() => { setIsProfileMenuOpen(false); onLogout() }}><LogOut size={15} aria-hidden="true" />Sign out</button></div>}
          </div>
        </div>
      </header>

      <main>
        {activeTab === 'an' && (
          <section id="analytics-panel" className="view on" role="tabpanel" aria-labelledby="tab-an" tabIndex="0">
            <div className="col analytics-main-col">
              <div className="panel chart-panel">
                <div className="pt"><span>INCIDENT FREQUENCY &amp; NOAH-ADJUSTED RISK SCENARIO</span><em>{noahStatus === 'ready' ? 'SCENARIO · NOT FORECAST' : demoMode ? 'LIVE DATA · LIMITED PREVIEW' : dashboardStatus === 'error' ? 'LIVE DATA UNAVAILABLE' : 'SERVER DATA'}</em></div>
                <IncidentChart analytics={adjustedAnalytics} active={activeTab === 'an'} />
                <div className="noah-chart-context" aria-live="polite">
                  {adjustedAnalytics?.noahSummary ? (
                    <>
                      <span><b>UP NOAH susceptibility input</b> · {adjustedAnalytics.noahSummary.gridCount} grids · {adjustedAnalytics.noahSummary.highRiskCount} high-risk · mean score {(adjustedAnalytics.noahSummary.meanScore * 100).toFixed(1)}%</span>
                      <small>Dashed values are a susceptibility-adjusted risk scenario—not predicted incidents, live flooding, or a weather forecast.</small>
                    </>
                  ) : (
                    <small>{noahStatus === 'loading' ? 'Loading UP NOAH susceptibility data…' : 'UP NOAH data unavailable; showing the existing incident projection.'}</small>
                  )}
                </div>
              </div>
              <div className="panel rate">
                <div className="rate-item" title={databaseMetrics?.definition}>
                  <div className="rate-label-row">
                    <small>RESCUE SUCCESS RATE (7D)</small>
                    {metricsStatus === 'ready' && databaseMetrics ? (
                      <span className={`status-chip ${Number(databaseMetrics.rescue_success_change) < 0 ? 'chip-warn' : 'chip-ok'}`}>
                        {rescueComparison == null ? 'NO PRIOR COHORT' : `${rescueComparison} vs prior period`}
                      </span>
                    ) : <span className="status-chip chip-warn">{metricsStatus === 'loading' ? 'QUERYING DATABASE' : metricsError || 'DATABASE UNAVAILABLE'}</span>}
                  </div>
                  <div className="big mono">{metricsStatus === 'ready' ? formatNumber(kpis.rescueSuccessRate, '%') : '—'}</div>
                  {databaseMetrics && <small className="kpi-source-note">{databaseMetrics.rescue_successful} resolved / {databaseMetrics.rescue_total} assigned · database</small>}
                </div>
                <div className="mini rate-item" title={operationsMetrics?.definition}><div className="rate-label-row"><small>PEOPLE RESCUED (7D)</small><span className={`status-chip ${operationsMetricsStatus === 'ready' ? 'chip-ok' : 'chip-warn'}`}>{operationsMetricsStatus === 'ready' ? 'DATABASE' : 'DATABASE UNAVAILABLE'}</span></div><b className="mono">{operationsMetricsStatus === 'ready' ? formatNumber(operationsMetrics.people_rescued) : '—'}</b></div>
                <div className="mini rate-item" title={operationsMetrics?.definition}><div className="rate-label-row"><small>AVG RESPONSE TIME</small><span className={`status-chip ${operationsMetricsStatus === 'ready' ? 'chip-ok' : 'chip-warn'}`}>{operationsMetricsStatus === 'ready' ? `${operationsMetrics.response_samples} SAMPLES` : 'DATABASE UNAVAILABLE'}</span></div><b className="mono">{operationsMetricsStatus === 'ready' && operationsMetrics.average_response_minutes != null ? `${operationsMetrics.average_response_minutes} min` : '—'}</b></div>
                <div className="mini rate-item"><div className="rate-label-row"><small>UNITS DEPLOYED</small><span className={`status-chip ${unitStats.total && unitStats.availabilityPct < 20 ? 'chip-warn' : 'chip-ok'}`}>{unitStats.total ? `${unitStats.engaged} / ${unitStats.total} DEPLOYED · ${unitStats.availabilityPct}% AVAIL` : 'NO DATA'}</span></div><b className="mono">{unitStats.utilizedPct == null ? '—' : `${unitStats.utilizedPct}% UTILIZED`}</b></div>
              </div>
              <div className="panel audit-mini-panel">
                <div className="bandh"><span>RECENT SECURITY &amp; ACTIVITY AUDIT TRAIL</span><span className="mono audit-feed-label">DATABASE FEED (SELECT ROW FOR IP)</span></div>
                {auditError && <div className="panel-state panel-error" role="alert">{auditError}</div>}
                {auditLoading ? <div className="panel-state">Loading audit entries…</div> : <AuditTable logs={logs} compact urgentLogId={urgentLogId} expandedLogId={expandedLogId} onToggleLog={(id) => setExpandedLogId((current) => current === id ? null : id)} />}
              </div>
            </div>

            <div className="col side">
              <div className="panel map-panel">
                <div className="pt"><span>LIVE FLOOD HAZARD MAP</span><em>MAPLIBRE · UP NOAH</em></div>
                <LiveHazardMap apiBaseUrl={API_BASE_URL} active={activeTab === 'an'} />
              </div>
              <div className="panel units-panel">
                <div className="pt"><span>RESCUER DEPLOYMENT RATE</span><em>{unitStats.total ? `${unitStats.engaged}/${unitStats.total} DISPATCHED` : 'NO DATA'}</em></div>
                {rescuersStatus === 'loading' ? <div className="panel-state">Loading rescuer deployment…</div> : rescuersError ? <div className="panel-state panel-error" role="alert">{rescuersError}</div> : rescuers.length ? <div className="unit">{rescuers.map((rescuer) => {
                  const responseRate = rescuer.responseRate == null ? null : Math.max(0, Math.min(100, rescuer.responseRate))
                  return <div key={rescuer.id} className="rescuer-deployment-row"><div className="unit-head"><div className="unit-info-left"><b>{rescuer.name}</b><span className={`unit-badge ${rescuer.className}`}>{rescuer.status}</span><span className="unit-inc">{rescuer.station}</span></div><span className="mono unit-rate">{responseRate == null ? '—' : `${responseRate}% response`}</span></div><div className={`response-rate-bar ${responseRate == null ? 'is-unavailable' : ''}`} role="progressbar" aria-label={`${rescuer.name} response rate`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={responseRate ?? undefined}><span style={{ '--rate-width': `${responseRate ?? 0}%` }} /></div><div className="rescuer-meta"><span>{rescuer.completedCases} completed cases</span><span>{rescuer.phone}</span><span>{rescuer.latitude != null && rescuer.longitude != null ? `${rescuer.latitude.toFixed(5)}, ${rescuer.longitude.toFixed(5)}` : 'Location unavailable'}</span></div></div>
                })}</div> : <div className="panel-state">No rescuer profiles returned by the server.</div>}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'au' && (
          <section id="audit-panel" className="view on" role="tabpanel" aria-labelledby="tab-au" tabIndex="0">
            <div className="panel full-panel">
              <div className="bandh"><span>FULL AUDIT TRAIL</span><span className="mono audit-feed-label">{filteredAudit.length} ENTRIES</span></div>
              <div className="tools"><label className="sr-only" htmlFor="audit-search">Search audit entries</label><input id="audit-search" type="search" placeholder="Search action, user ID, or IP address" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} /><label className="sr-only" htmlFor="audit-role">Filter by role</label><select id="audit-role" value={selectedRole} onChange={(event) => setSelectedRole(event.target.value)}><option value="">All roles</option>{uniqueRoles.map((role) => <option key={role} value={role}>{role}</option>)}</select><button type="button" className="btn-toggle-grid export-btn" disabled={!filteredAudit.length} onClick={() => exportAuditCsv(filteredAudit)}>EXPORT CSV</button></div>
              {auditError && <div className="panel-state panel-error" role="alert">{auditError}</div>}
              {auditLoading ? <div className="panel-state">Loading audit entries…</div> : <AuditTable logs={filteredAudit} urgentLogId={urgentLogId} expandedLogId={expandedLogId} onToggleLog={(id) => setExpandedLogId((current) => current === id ? null : id)} />}
            </div>
          </section>
        )}

        {activeTab === 'rb' && <RbacMatrix editor={rbacEditor} loading={rbacLoading} error={rbacError} onOpenDelete={handleOpenDelete} onRequestSave={() => { setSaveError(''); setSaveModalOpen(true) }} />}

        {activeTab === 'si' && (
          <section id="integrity-panel" className="view on" role="tabpanel" aria-labelledby="tab-si" tabIndex="0">
            <div className="panel full-panel"><div className="bandh"><span>SYSTEM INTEGRITY</span><span className="mono integrity-count">{services.length ? `${healthyCount} / ${services.length} SERVICES HEALTHY` : 'NO DATA'}</span></div><ServiceGrid services={services} /></div>
          </section>
        )}
      </main>

      <ReauthModal open={saveModalOpen} mode="save" changeSummary={rbacEditor.diffs} busy={saveBusy} error={saveError} onClose={closeSaveModal} onConfirm={handleFinalSave} />
      <ReauthModal open={Boolean(rbacEditor.roleToDelete)} mode="delete" roleName={rbacEditor.roleToDelete} busy={deleteBusy} onClose={closeDeleteModal} onConfirm={confirmDelete} />
    </div>
  )
}

export default AdminDashboard
