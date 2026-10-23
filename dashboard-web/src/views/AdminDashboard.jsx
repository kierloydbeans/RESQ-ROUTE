import React, { useCallback, useEffect, useMemo, useRef, useState, useReducer } from 'react'
import '../styles/admin-console.css'

/*
 * API contract used by this screen:
 *
 * GET  /api/dashboard -> { incidents, units, services, analytics, kpis, map }
 * GET  /api/audit     -> { entries: [{ id, action, user, role, timestamp, ip, urgent }] }
 * GET  /api/rbac      -> { roles: { Role: { permission_id: boolean } }, version, roleUserCounts }
 * POST /api/auth/reauth -> { authenticated: true, reauthToken?: string }
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

const SAMPLE_MAP_DATA = {
  isSample: true,
  source: 'Illustrative data only',
  pings: [
    { id: 'sample-creek-crossing', name: 'Sample creek crossing', x: -420, y: 260, level: 'h', depth: 120, timestamp: '2026-10-23T06:02:00Z' },
    { id: 'sample-school-frontage', name: 'Sample school frontage', x: -380, y: -180, level: 'h', depth: 95, timestamp: '2026-10-23T05:40:00Z' },
    { id: 'sample-market-underpass', name: 'Sample market underpass', x: 260, y: -340, level: 'm', depth: 60, timestamp: '2026-10-23T05:15:00Z' },
    { id: 'sample-riverside-lane', name: 'Sample riverside lane', x: 520, y: 210, level: 'm', depth: 45, timestamp: '2026-10-23T04:50:00Z' },
    { id: 'sample-main-road-dip', name: 'Sample main-road dip', x: 40, y: 40, level: 'h', depth: 110, timestamp: '2026-10-23T06:10:00Z' },
    { id: 'sample-barangay-corner', name: 'Sample barangay-hall corner', x: -760, y: -420, level: 'l', depth: 25, timestamp: '2026-10-23T03:30:00Z' },
    { id: 'sample-foot-bridge', name: 'Sample foot bridge', x: 700, y: -120, level: 'l', depth: 20, timestamp: '2026-10-23T03:05:00Z' },
    { id: 'sample-chapel-street', name: 'Sample chapel street', x: -120, y: 520, level: 'm', depth: 50, timestamp: '2026-10-23T04:20:00Z' }
  ],
  arterialRoads: [
    [[-1500, 200], [1500, 200]],
    [[-1400, -250], [1400, -250]],
    [[-300, -900], [-300, 900]],
    [[450, -900], [450, 900]],
    [[-1200, 800], [800, -700]]
  ],
  secondaryRoads: [
    [[-1200, -600], [1200, -600]],
    [[-1200, 600], [1200, 600]],
    [[-800, -900], [-800, 900]],
    [[900, -900], [900, 900]]
  ],
  creekPath: [
    [-1800, 520], [-1100, 280], [-450, 140], [30, 20], [520, -140], [1100, -380], [1800, -560]
  ],
  labels: {
    northRoad: 'SAMPLE NORTH BYPASS RD',
    centralRoad: 'SAMPLE CENTRAL HIGHWAY',
    creek: 'SAMPLE CREEK BASIN'
  }
}

const EMPTY_DASHBOARD = {
  incidents: [],
  units: [],
  services: [],
  analytics: null,
  kpis: {},
  map: SAMPLE_MAP_DATA
}

// Explicit demonstration fixtures. Never use these as operational records.
const DEMO_DATA = {
  dashboard: {
    incidents: Array.from({ length: 24 }, (_, index) => ({
      id: String(1084 + index), status: 'ACTIVE',
      severity: index < 3 ? 'CRITICAL' : index < 12 ? 'MODERATE' : 'MINOR'
    })),
    units: [
      { id: 'alpha', name: 'Unit Alpha', rate: 99.2, status: 'ON SCENE', incident: 'INC#1084' },
      { id: 'bravo', name: 'Unit Bravo', rate: 98.5, status: 'EN ROUTE', incident: 'INC#1088' },
      { id: 'charlie', name: 'Unit Charlie', rate: 94.1, status: 'STAGING', assignment: 'SECTOR-3' },
      { id: 'delta', name: 'Unit Delta', rate: 96.8, status: 'AVAILABLE', assignment: 'STANDBY' }
    ],
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
    kpis: { rescueSuccessRate: 98.7, rescueSuccessComparison: '+0.2%', peopleRescued7d: 1284, peopleRescuedComparison: '+8%', avgResponseMinutes: 6.4, responseTargetMinutes: 8 },
    map: SAMPLE_MAP_DATA
  },
  audit: [
    { id: 'demo-a1', action: 'Dispatch assigned Unit Alpha to Incident #1084', user: 'Operator-03', role: 'Dispatcher', timestamp: '2026-10-23T06:30:12Z', ip: '192.0.2.44' },
    { id: 'demo-a2', action: 'Inventory adjusted: -50 Food Packs at Center A', user: 'Logistics-A', role: 'Warehouse Mgr', timestamp: '2026-10-23T06:28:45Z', ip: '192.0.2.92' },
    { id: 'demo-a3', action: 'Incident #1072 marked RESOLVED', user: 'Field-Lead', role: 'Field Commander', timestamp: '2026-10-23T06:25:11Z', ip: '192.0.2.19' },
    { id: 'demo-a4', action: 'Evacuee check-in: 14 households at Sports Arena', user: 'Registrar-02', role: 'Center Staff', timestamp: '2026-10-23T06:21:38Z', ip: '192.0.2.7' },
    { id: 'demo-a5', action: 'Failed login attempt (3x)', user: 'Logistics-C', role: 'Warehouse Mgr', timestamp: '2026-10-23T06:03:57Z', ip: '192.0.2.88', urgent: true },
    { id: 'demo-a6', action: 'Unit Charlie status changed: STAGING', user: 'Charlie-Lead', role: 'Field Commander', timestamp: '2026-10-23T05:41:26Z', ip: '192.0.2.23' }
  ],
  rbac: {
    version: 1,
    roles: Object.fromEntries([
      ['System Admin', PERMISSIONS.map(p => p.id)],
      ['Dispatcher', ['view_dashboard', 'dispatch_units']],
      ['Field Commander', ['view_dashboard', 'dispatch_units', 'resolve_incidents']],
      ['Warehouse Mgr', ['view_dashboard', 'edit_inventory']],
      ['Center Staff', ['view_dashboard', 'register_evacuees']]
    ].map(([role, allowed]) => [role, Object.fromEntries(PERMISSIONS.map(p => [p.id, allowed.includes(p.id)]))])),
    roleUserCounts: { 'System Admin': 1, Dispatcher: 3, 'Field Commander': 4, 'Warehouse Mgr': 2, 'Center Staff': 0 }
  }
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

const levelColor = { h: '#ef4444', m: '#f5a524', l: '#12b9d6' }
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
    action: source.action || source.message || 'Unknown audit action',
    user: source.user || source.actor || source.userId || '—',
    role: source.role || source.authorityRole || '—',
    timestamp,
    ip: source.ip || source.ipAddress || source.networkAddress || '—',
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

function normalizeUnit(raw, index) {
  const source = raw || {}
  const status = String(source.status || 'UNKNOWN').toUpperCase()
  const statusClass = {
    'ON SCENE': 'ub-onscene',
    'EN ROUTE': 'ub-enroute',
    STAGING: 'ub-staging',
    AVAILABLE: 'ub-avail'
  }[status] || 'ub-unknown'

  return {
    id: String(source.id || source.unitId || makeClientId(`unit-${index}`)),
    name: source.name || source.unitName || 'Unnamed unit',
    rate: Number.isFinite(Number(source.rate)) ? Number(source.rate) : null,
    status,
    className: statusClass,
    incident: source.incident || source.incidentId || source.assignment || '—'
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
  if (!raw) return SAMPLE_MAP_DATA

  const pings = raw.pings || raw.floodPings || []
  return {
    ...SAMPLE_MAP_DATA,
    ...raw,
    // A map is considered real only when the server explicitly says so.
    isSample: raw.isSample !== false,
    pings: pings.map((ping, index) => ({
      ...ping,
      id: String(ping.id || makeClientId(`ping-${index}`)),
      level: ping.level || 'l'
    }))
  }
}

function normalizeDashboardPayload(payload) {
  const source = payload?.dashboard || payload || {}
  return {
    incidents: (source.incidents || []).map(normalizeIncident),
    units: (source.units || []).map(normalizeUnit),
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

function PhtClock() {
  const [time, setTime] = useState(() => formatPhtClock())

  useEffect(() => {
    const update = () => setTime(formatPhtClock())
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [])

  return <span className="clock mono">{time}</span>
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
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Incident frequency trend with forecast">
        <defs>
          <linearGradient id="gHist" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#12b9d6" stopOpacity="0.35" />
            <stop offset="1" stopColor="#12b9d6" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="gProj" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f5a524" stopOpacity="0.20" />
            <stop offset="1" stopColor="#f5a524" stopOpacity="0" />
          </linearGradient>
        </defs>

        {projected.length > 0 && (
          <>
            <rect x={x(projectionStart)} y={t} width={Math.max(0, x(maxDay) - x(projectionStart))} height={plotH} fill="rgba(245,165,36,0.04)" />
            <line x1={x(projectionStart)} x2={x(projectionStart)} y1={t} y2={t + plotH} stroke="#f5a524" strokeDasharray="3,3" strokeOpacity="0.45" />
            <text x={x(projectionStart) + 6} y={t + 12} fill="#f5a524" fontSize="11" fontWeight="600" fontFamily="ui-monospace, monospace">
              PROJECTED
            </text>
          </>
        )}

        {[0, 0.33, 0.66, 1].map((ratio) => {
          const value = Math.round(maxValue * ratio)
          return (
            <g key={ratio}>
              <line x1={l} x2={W - r} y1={y(value)} y2={y(value)} stroke="#1e293b" />
              <text x={l - 10} y={y(value) + 4} fill="#94a3b8" fontSize="11" fontWeight="600" textAnchor="end" fontFamily="ui-monospace, monospace">
                {value}
              </text>
            </g>
          )
        })}

        {labels.map((label, index) => (
          <text key={`${label}-${index}`} x={x(index)} y={H - 8} fill={index >= projectionStart ? '#cbd5e1' : '#94a3b8'} fontSize="11" fontWeight={index === projectionStart ? '700' : '500'} textAnchor="middle" fontFamily="ui-monospace, monospace">
            {String(label).replace(/\s*\(.*?\)/, '')}
          </text>
        ))}

        {historical.length > 0 && (
          <>
            <polygon points={`${x(historical[0].day)},${y(0)} ${historicalPoints.join(' ')} ${x(historical[historical.length - 1].day)},${y(0)}`} fill="url(#gHist)" />
            <polyline points={historicalPoints.join(' ')} fill="none" stroke="#12b9d6" strokeWidth="2.5" strokeLinejoin="round" />
          </>
        )}
        {projected.length > 0 && (
          <>
            <polygon points={`${x(projected[0].day)},${y(0)} ${projectedPoints.join(' ')} ${x(projected[projected.length - 1].day)},${y(0)}`} fill="url(#gProj)" />
            <polyline points={projectedPoints.join(' ')} fill="none" stroke="#f5a524" strokeWidth="2" strokeDasharray="5,4" strokeLinejoin="round" />
          </>
        )}

        {historical.map((point) => (
          <circle key={`hist-${point.day}`} cx={x(point.day)} cy={y(point.value)} r="4" fill="#0d1220" stroke="#12b9d6" strokeWidth="2">
            <title>{`${labels[point.day] || 'Day'}: ${point.value} incidents`}</title>
          </circle>
        ))}
        {projected.map((point) => (
          <circle key={`proj-${point.day}`} cx={x(point.day)} cy={y(point.value)} r="3.5" fill="#0d1220" stroke="#f5a524" strokeWidth="2" strokeDasharray="2,2">
            <title>{`${labels[point.day] || 'Day'}: projected ${point.value} incidents`}</title>
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
                  <td className="mono m">{log.ip}</td>
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
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.clearRect(0, 0, W, H)

    if (isGridMode) {
      context.fillStyle = '#080d1a'
      context.fillRect(0, 0, W, H)
      const cols = 5
      const rows = 4
      const pad = 12
      const cellW = (W - (cols + 1) * pad) / cols
      const cellH = (H - (rows + 1) * pad) / rows
      const gridMatrix = mapData.gridMatrix || [
        ['#12b9d6', '#ef4444', '#0e1726', '#f5a524', '#0e1726'],
        ['#f5a524', '#0e1726', '#12b9d6', '#ef4444', '#f5a524'],
        ['#0e1726', '#f5a524', '#0e1726', '#12b9d6', '#ef4444'],
        ['#ef4444', '#0e1726', '#f5a524', '#12b9d6', '#ef4444']
      ]
      const gridZones = mapData.gridZones || []
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const x = pad + col * (cellW + pad)
          const y = pad + row * (cellH + pad)
          context.fillStyle = gridMatrix[row][col]
          context.beginPath()
          context.roundRect ? context.roundRect(x, y, cellW, cellH, 4) : context.rect(x, y, cellW, cellH)
          context.fill()
          context.strokeStyle = '#1d2740'
          context.lineWidth = 1
          context.stroke()
          context.fillStyle = '#e6ebf5'
          context.font = '600 10px ui-monospace,monospace'
          context.textAlign = 'center'
          context.fillText(gridZones[row]?.[col] || `ZONE ${row + 1}-${col + 1}`, x + cellW / 2, y + cellH / 2)
        }
      }
      context.textAlign = 'start'
      context.fillStyle = '#94a3b8'
      context.font = '600 11px ui-monospace,monospace'
      context.fillText(mapData.isSample ? 'SAMPLE HISTORICAL DENSITY MATRIX' : 'HISTORICAL DENSITY MATRIX', 14, H - 12)
      return
    }

    const mpp = spanM / W
    const px = (east) => W / 2 + east / mpp
    const py = (north) => H / 2 - north / mpp
    context.fillStyle = '#080d19'
    context.fillRect(0, 0, W, H)

    // Explicit styles are required because a canvas defaults to black strokes.
    context.strokeStyle = '#1a2640'
    context.lineWidth = 1
    ;(mapData.secondaryRoads || []).forEach((line) => {
      context.beginPath()
      context.moveTo(px(line[0][0]), py(line[0][1]))
      context.lineTo(px(line[1][0]), py(line[1][1]))
      context.stroke()
    })

    context.strokeStyle = '#2a3a62'
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
    context.strokeStyle = 'rgba(18,185,214,0.55)'
    context.lineWidth = 2
    context.stroke()

    context.fillStyle = '#94a3b8'
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
    context.strokeStyle = '#94a3b8'
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
        <canvas ref={canvasRef} role="img" aria-label={`${mapData.isSample ? 'Sample ' : ''}flood density map`} />
        <div className="map-disclaimer" role="note">
          {mapData.isSample ? 'SAMPLE MAP — NOT FOR DISPATCH' : `GIS source: ${mapData.source || 'server'}`}
        </div>
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
            {mapData.isSample && <span className="grid-legend-note">Sample values only.</span>}
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
  auditEndpoint = '/api/audit',
  rbacEndpoint = '/api/rbac',
  reauthEndpoint = '/api/auth/reauth',
  socketUrl,
  demoMode = true,
  initialData = demoMode ? DEMO_DATA : undefined,
  idleTimeoutMinutes = 30
}) {
  const authToken = auth?.token || auth?.accessToken || ''
  const suppliedDashboard = initialData?.dashboard || (initialData && (initialData.incidents || initialData.units || initialData.services) ? initialData : null)
  const suppliedAudit = initialData?.audit || initialData?.logs
  const suppliedRbac = initialData?.rbac
  const initialDashboard = useMemo(() => normalizeDashboardPayload(suppliedDashboard), [suppliedDashboard])
  const initialRbac = useMemo(() => normalizeRbacPayload(suppliedRbac), [suppliedRbac])

  const [activeTab, setActiveTab] = useState('an')
  const [isGridMode, setIsGridMode] = useState(false)
  const [dashboard, setDashboard] = useState(initialDashboard)
  const [dashboardStatus, setDashboardStatus] = useState(suppliedDashboard ? 'ready' : 'loading')
  const [dashboardError, setDashboardError] = useState('')
  const [logs, setLogs] = useState(() => normalizeAuditLogs(suppliedAudit))
  const [auditLoading, setAuditLoading] = useState(!suppliedAudit)
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
    if (suppliedAudit || !auditEndpoint) {
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
  }, [apiBaseUrl, authToken, auditEndpoint, suppliedAudit])

  const loadRbac = useCallback(async () => {
    if (suppliedRbac || !rbacEndpoint) {
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
  }, [apiBaseUrl, authToken, rbacEndpoint, rbacEditor.hydrate, suppliedRbac])

  useEffect(() => { loadDashboard() }, [loadDashboard])
  useEffect(() => { loadAudit() }, [loadAudit])
  useEffect(() => { loadRbac() }, [loadRbac])

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

  const websocketStatus = useWebSocketStatus(demoMode ? null : socketUrl || auth?.socketUrl, handleIncomingAudit)
  const handleIdleTimeout = useCallback(() => onLogout?.({ reason: 'idle-timeout' }), [onLogout])
  useIdleTimeout({ enabled: Boolean(onLogout), minutes: idleTimeoutMinutes, onTimeout: handleIdleTimeout })

  const handleFinalSave = useCallback(async (password) => {
    if (demoMode) {
      setSaveError('Demo data is for preview only. Connect your backend to save role changes.')
      return
    }
    setSaveBusy(true)
    setSaveError('')
    try {
      const reauth = await apiRequest(resolveEndpoint(apiBaseUrl, reauthEndpoint), authToken, {
        method: 'POST',
        body: JSON.stringify({ password })
      })
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
  }, [demoMode, apiBaseUrl, authToken, loadAudit, rbacEditor.draftMatrix, rbacEditor.roleUserCounts, rbacEditor.saveSucceeded, rbacEditor.version, rbacEndpoint, reauthEndpoint])

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
  const units = dashboard.units
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
    const total = units.length
    const available = units.filter((unit) => unit.status === 'AVAILABLE').length
    const engaged = total - available
    return {
      total,
      available,
      engaged,
      availabilityPct: total ? Math.round((available / total) * 100) : null,
      utilizedPct: total ? Math.round((engaged / total) * 100) : null
    }
  }, [units])

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

  const kpis = dashboard.kpis || {}
  const statusLabel = { online: 'Connected', connecting: 'Connecting…', reconnecting: 'Reconnecting…', offline: 'Offline' }[websocketStatus]

  return (
    <div className="resilience-root">
      {demoMode && <div className="demo-banner" role="note">DEMO MODE — Dummy data for preview. No live operations or saved changes.</div>}
      <header>
        <div className="brand"><span className="dot" />RESILIENCE</div>
        <nav className="nav-compact" role="tablist" aria-label="Sections">
          {TAB_DEFS.map((tab) => (
            <button key={tab.id} id={`tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={tab.panelId} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => setActiveTab(tab.id)} onKeyDown={(event) => handleTabKeyDown(event, tab.id)}>
              {tab.label}
            </button>
          ))}
        </nav>
        <span className="sp" />
        <span className={`ws mono ws-${websocketStatus}`}><span className="dot" />{demoMode ? 'Demo: no live connection' : `WebSocket: ${statusLabel}`}</span>
        <div className="pill-breakdown mono">
          <span><b>{incidentStats.active}</b> ACTIVE</span><span className="sev-dot">·</span><span className="sev-crit">{incidentStats.critical} CRIT</span><span className="sev-dot">·</span><span className="sev-mod">{incidentStats.moderate} MOD</span><span className="sev-dot">·</span><span className="sev-min">{incidentStats.minor} MIN</span>
        </div>
        <PhtClock />
        <div className="user">
          <div className="av">{(auth?.user?.name || 'AD').slice(0, 2).toUpperCase()}</div>
          <div><div className="header-user-name">{auth?.user?.name || 'Administrator'}</div><small>{auth?.user?.title || 'ADMIN'}</small></div>
          <button type="button" className="logout-btn mono" onClick={onLogout}>EXIT</button>
        </div>
      </header>

      <main>
        {activeTab === 'an' && (
          <section id="analytics-panel" className="view on" role="tabpanel" aria-labelledby="tab-an" tabIndex="0">
            <div className="col analytics-main-col">
              <div className="panel chart-panel">
                <div className="pt"><span>INCIDENT FREQUENCY TREND (7-DAY ANALYSIS)</span><em>{demoMode ? 'SAMPLE DATA' : dashboardStatus === 'error' ? 'LIVE DATA UNAVAILABLE' : 'SERVER DATA'}</em></div>
                <IncidentChart analytics={dashboard.analytics} active={activeTab === 'an'} />
              </div>
              <div className="panel rate">
                <div className="rate-item"><div className="rate-label-row"><small>RESCUE SUCCESS RATE</small>{kpis.rescueSuccessComparison != null && <span className="status-chip chip-ok">{kpis.rescueSuccessComparison} vs prior period</span>}</div><div className="big mono">{formatNumber(kpis.rescueSuccessRate, '%')}</div></div>
                <div className="mini rate-item"><div className="rate-label-row"><small>PEOPLE RESCUED (7D)</small>{kpis.peopleRescuedComparison != null && <span className="status-chip chip-ok">{kpis.peopleRescuedComparison} vs last week</span>}</div><b className="mono">{formatNumber(kpis.peopleRescued7d)}</b></div>
                <div className="mini rate-item"><div className="rate-label-row"><small>AVG RESPONSE TIME</small>{kpis.responseTargetMinutes != null && <span className="status-chip chip-ok">TARGET &lt;{kpis.responseTargetMinutes}m</span>}</div><b className="mono">{kpis.avgResponseMinutes == null ? '—' : `${kpis.avgResponseMinutes} min`}</b></div>
                <div className="mini rate-item"><div className="rate-label-row"><small>UNITS DEPLOYED</small><span className={`status-chip ${unitStats.total && unitStats.availabilityPct < 20 ? 'chip-warn' : 'chip-ok'}`}>{unitStats.total ? `${unitStats.engaged} / ${unitStats.total} DEPLOYED · ${unitStats.availabilityPct}% AVAIL` : 'NO DATA'}</span></div><b className="mono">{unitStats.utilizedPct == null ? '—' : `${unitStats.utilizedPct}% UTILIZED`}</b></div>
              </div>
              <div className="panel audit-mini-panel">
                <div className="bandh"><span>RECENT SECURITY &amp; ACTIVITY AUDIT TRAIL</span><span className="mono audit-feed-label">{demoMode ? 'SAMPLE RECORDS' : 'LIVE FEED'} (SELECT ROW FOR IP)</span></div>
                {auditError && <div className="panel-state panel-error" role="alert">{auditError}</div>}
                {auditLoading ? <div className="panel-state">Loading audit entries…</div> : <AuditTable logs={logs} compact urgentLogId={urgentLogId} expandedLogId={expandedLogId} onToggleLog={(id) => setExpandedLogId((current) => current === id ? null : id)} />}
              </div>
            </div>

            <div className="col side">
              <div className="panel map-panel">
                <div className="pt"><span>FLOOD SECTOR SITUATIONAL MAP</span><div className="map-tools"><button type="button" className={`btn-toggle-grid ${isGridMode ? 'active' : ''}`} onClick={() => setIsGridMode((previous) => !previous)}>{isGridMode ? 'VECTOR MAP' : 'GRID MODE'}</button></div></div>
                <FloodMap mapData={dashboard.map} active={activeTab === 'an'} isGridMode={isGridMode} />
              </div>
              <div className="panel units-panel">
                <div className="pt"><span>ACTIVE UNIT DEPLOYMENT &amp; RESPONSE</span><em>{unitStats.total ? `${unitStats.engaged}/${unitStats.total} ENGAGED` : 'NO DATA'}</em></div>
                {units.length ? <div className="unit">{units.map((unit) => { const color = unit.rate == null ? 'var(--mute)' : unit.rate >= 98 ? 'var(--ok)' : unit.rate >= 95 ? 'var(--cyan)' : 'var(--warn)'; return <div key={unit.id}><div className="unit-head"><div className="unit-info-left"><b>{unit.name}</b><span className={`unit-badge ${unit.className}`}>{unit.status}</span><span className="unit-inc">{unit.incident}</span></div><span className="mono unit-rate" style={{ '--rate-color': color }}>{unit.rate == null ? '—' : `${unit.rate}% rate`}</span></div><div className="bar unit-progress"><i style={{ '--bar-width': `${unit.rate == null ? 0 : unit.rate}%`, '--bar-color': color }} /></div></div> })}</div> : <div className="panel-state">No unit data returned by the server.</div>}
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

        {activeTab === 'rb' && <RbacMatrix editor={rbacEditor} loading={rbacLoading} error={rbacError} onOpenDelete={handleOpenDelete} onRequestSave={() => { if (demoMode) { rbacEditor.setMutationError('Demo changes are temporary. Connect your backend to save them.'); return }; setSaveError(''); setSaveModalOpen(true) }} />}

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
