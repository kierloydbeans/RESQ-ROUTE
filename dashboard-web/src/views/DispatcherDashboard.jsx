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

const SosFeedItem = ({ alert, now, onAssign, onView, isClosed = false }) => {
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
      {!isClosed && (
        <div className="sos-actions">
          <button onClick={() => onAssign(alert.id)}>ASSIGN</button>
          <button type="button" onClick={() => onView(alert)}>VIEW</button>
          <button>MERGE</button>
        </div>
      )}
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
  const [latestStatusReport, setLatestStatusReport] = useState(null)
  const [statusReportQueue, setStatusReportQueue] = useState([])
  const seenStatusReportIds = useRef(new Set())
  const pendingStatusReportIds = useRef(new Set())
  const statusReportsInitialized = useRef(false)
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
  const [closedAlertPage, setClosedAlertPage] = useState(0)
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const [mapHeight, setMapHeight] = useState(480)
  const [focusedAlertLocation, setFocusedAlertLocation] = useState(null)
  const [focusedAlertId, setFocusedAlertId] = useState(null)
  const [focusRequestKey, setFocusRequestKey] = useState(0)
  const [reportEndDate, setReportEndDate] = useState(() => manilaDateKey(new Date()))
  const [reportStartDate, setReportStartDate] = useState(() => shiftDateKey(manilaDateKey(new Date()), -29))
  const [isExportingReport, setIsExportingReport] = useState(false)
  const [reportExportError, setReportExportError] = useState('')

  const closedAlerts = alertRecords.filter(isClosedAlert)
  const closedAlertResponseTimes = closedAlerts
    .map(getAlertResponseMinutes)
    .filter((minutes) => minutes !== null)
  const averageResponseMinutes = closedAlertResponseTimes.length
    ? closedAlertResponseTimes.reduce((total, minutes) => total + minutes, 0) / closedAlertResponseTimes.length
    : null
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
  const alerts = alertRecords.filter((alert) => !isClosedAlert(alert))
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
    const rescuerStatusRefresh = window.setInterval(() => {
      loadRescuers()
      loadRescueUnits()
    }, 30_000)
    return () => {
      window.clearInterval(roadHazardRefresh)
      window.clearInterval(rescuerStatusRefresh)
    }
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
    kind: 'alert',
    id: alert.id,
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

      <section className="report-toolbar" aria-labelledby="report-toolbar-title">
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
      </section>

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
                label="RESCUED"
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
                          onAssign={handleAssignAlert}
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
                          onAssign={handleAssignAlert}
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
                <span><i className="dot red" /> ACTIVE ALERT</span>
                <span><i className="dot amber" /> ASSIGNED / RECOVERING</span>
                <span><i className="dot green" /> AVAILABLE / CENTER</span>
                <span><i className="dot blue" /> RESOLVING / IN TRANSIT</span>
              </DraggableMapOverlay>
              <MapContainer markers={[...mapMarkers, ...activeRouteMarkers]} center={focusedAlertLocation} focusMarkerId={focusedAlertId} centerRequestKey={focusRequestKey} route={activeEvacuationRoute?.geometry} trackDeviceLocation={false} />
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
            <strong>{averageResponseMinutes === null ? '—' : `${averageResponseMinutes.toFixed(1)} min`}</strong>
            <span>
              {averageResponseMinutes === null
                ? 'No closed alerts to calculate'
                : `Mean from ${closedAlertResponseTimes.length} closed alert${closedAlertResponseTimes.length === 1 ? '' : 's'}`}
            </span>
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