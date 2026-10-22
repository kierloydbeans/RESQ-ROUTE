import React, { useEffect, useState, useMemo, useRef } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import {
  fetchCenters,
  fetchInventory,
  fetchCenterInventory,
  fetchInventoryWithCenters,
  fetchEvacuees,
  fetchShelteredEvacueesCount,
  fetchActiveAlertsCount,
  createInventoryItem,
  updateCenterStatus
} from '../lib/supabase'
import Logo from '../components/Logo'
import {
  createInventoryShipment,
  fetchPendingInventoryShipments,
  markInventoryShipmentArrived
} from '../lib/inventoryShipments'
import {
  assignCoordinatorToCenter,
  fetchCoordinatorAssignments
} from '../lib/coordinatorAssignments'
import { ChevronDown, FileDown, FileSpreadsheet, LogOut, Plus, X } from 'lucide-react'
import '../styles/coordinator-console.css'

const rawApiBase = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'https://resq-route.onrender.com').replace(/\/$/, '')
const API_BASE_URL = rawApiBase.endsWith('/api/v1') ? rawApiBase.replace(/\/api\/v1$/, '') : rawApiBase
const WS_BASE_URL = API_BASE_URL.replace(/^http/, 'ws')

const getInventoryStatus = (currentStock, targetStock) => {
  const stockRatio = targetStock > 0 ? currentStock / targetStock : 0
  if (stockRatio >= 0.5) return 'OK'
  if (stockRatio >= 0.15) return 'LOW'
  return 'CRITICAL'
}

const formatReportDate = (value) => {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Not recorded'
    : new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(date)
}

const loadResqLogoBytes = async () => {
  const response = await fetch(new URL('/resq_logo.png', window.location.origin))
  if (!response.ok) throw new Error(`Unable to load the ResQ-Route logo (${response.status}).`)
  return new Uint8Array(await response.arrayBuffer())
}

export const CoordinatorDashboard = ({ auth, onLogout }) => {
  // Navigation tabs: 'centers' | 'registry' | 'inventory'
  const [activeTab, setActiveTab] = useState('centers')

  // Live Backend Data States
  const [centers, setCenters] = useState([])
  const [inventory, setInventory] = useState([])
  const [evacuees, setEvacuees] = useState([])
  const [hasCentersData, setHasCentersData] = useState(false)
  const [hasInventoryData, setHasInventoryData] = useState(false)
  const [shelteredEvacueesCount, setShelteredEvacueesCount] = useState(null)
  const [activeAlertsCount, setActiveAlertsCount] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isAddInventoryOpen, setIsAddInventoryOpen] = useState(false)
  const [isSavingInventory, setIsSavingInventory] = useState(false)
  const [inventoryFormError, setInventoryFormError] = useState('')
  const [pendingShipments, setPendingShipments] = useState([])
  const [shipmentDrafts, setShipmentDrafts] = useState({})
  const [savingShipmentItemId, setSavingShipmentItemId] = useState(null)
  const [arrivingShipmentId, setArrivingShipmentId] = useState(null)
  const [shipmentError, setShipmentError] = useState('')
  const [coordinatorAssignments, setCoordinatorAssignments] = useState([])
  const [selectedCoordinatorId, setSelectedCoordinatorId] = useState('')
  const [selectedCoordinatorCenterId, setSelectedCoordinatorCenterId] = useState('')
  const [coordinatorAssignmentError, setCoordinatorAssignmentError] = useState('')
  const [coordinatorAssignmentNotice, setCoordinatorAssignmentNotice] = useState('')
  const [savingCoordinatorAssignment, setSavingCoordinatorAssignment] = useState(false)
  const [isExportingReport, setIsExportingReport] = useState(false)
  const [reportExportError, setReportExportError] = useState('')
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const profileMenuRef = useRef(null)

  // Evacuee Registry Filter States
  const [registrySearch, setRegistrySearch] = useState('')
  const [selectedCenterFilter, setSelectedCenterFilter] = useState('all')
  const [selectedPriorityFilter, setSelectedPriorityFilter] = useState('all')
  const [newInventoryItem, setNewInventoryItem] = useState({
    item_description: '',
    current_stock: '',
    max_stock: ''
  })

  // Clock & Realtime Telemetry
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const { isConnected } = useWebSocket(`${WS_BASE_URL}/api/v1/ws`)

  const displayName = auth?.user?.full_name || auth?.user?.username || 'Cmdr. Reyes, J.'
  const userRole = auth?.user?.role?.toUpperCase() || 'COMMAND DIRECTOR'

  // 1-second Philippine Standard Time (PHT) ticker
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
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

  const formattedPhtTime = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(currentTime)

  // Fetch live telemetry from Supabase
  useEffect(() => {
    let isMounted = true

    const fetchAllData = async () => {
      try {
        const token = auth?.token || auth?.access_token
        const [centersData, invData, evacData, shelteredCountData, incData, shipmentsData, assignmentsData] = await Promise.allSettled([
          fetchCenters(100),
          fetchInventory(100), // Master inventory with totals
          fetchEvacuees(500),
          fetchShelteredEvacueesCount(),
          fetchActiveAlertsCount(),
          fetchPendingInventoryShipments(token),
          fetchCoordinatorAssignments(token)
        ])

        if (!isMounted) return

        if (centersData.status === 'fulfilled') {
          setCenters(Array.isArray(centersData.value) ? centersData.value : [])
          setHasCentersData(true)
        } else {
          console.error('[RESQ Coordinator] Failed to refresh centers:', centersData.reason)
        }

        if (invData.status === 'fulfilled') {
          setInventory(Array.isArray(invData.value) ? invData.value : [])
          setHasInventoryData(true)
        } else {
          console.error('[RESQ Coordinator] Failed to refresh inventory:', invData.reason)
        }

        if (evacData.status === 'fulfilled') {
          setEvacuees(Array.isArray(evacData.value) ? evacData.value : [])
        }

        if (shelteredCountData.status === 'fulfilled') {
          setShelteredEvacueesCount(shelteredCountData.value)
        } else {
          console.error('[RESQ Coordinator] Failed to refresh sheltered evacuee count:', shelteredCountData.reason)
          setShelteredEvacueesCount(null)
        }

        if (incData.status === 'fulfilled') {
          setActiveAlertsCount(incData.value)
        } else {
          console.error('[RESQ Coordinator] Failed to refresh active alerts:', incData.reason)
        }

        if (shipmentsData.status === 'fulfilled') {
          setPendingShipments(shipmentsData.value)
        } else {
          console.error('[RESQ Coordinator] Failed to load pending shipments:', shipmentsData.reason)
          setShipmentError('Pending shipments could not be loaded. Check your session and try refreshing.')
        }

        if (assignmentsData.status === 'fulfilled') {
          setCoordinatorAssignments(assignmentsData.value)
          setCoordinatorAssignmentError('')
        } else {
          console.error('[RESQ Coordinator] Failed to load coordinator assignments:', assignmentsData.reason)
          setCoordinatorAssignmentError('Coordinator accounts could not be loaded.')
        }
      } catch (error) {
        console.error('[RESQ Coordinator] Supabase sync error:', error)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    fetchAllData()
    const interval = setInterval(fetchAllData, 15000)

    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [auth?.token, auth?.access_token])

  // Consolidated Math Calculations
  const totalCenterOccupancy = useMemo(() => {
    return centers.reduce((sum, c) => sum + (Number(c.current_occupancy) || 0), 0)
  }, [centers])

  const totalCapacity = useMemo(() => {
    return centers.reduce((sum, c) => sum + (Number(c.capacity) || 0), 0)
  }, [centers])

  const activeUtilization = useMemo(() => {
    if (!totalCapacity) return 0
    return Math.min(100, Math.round((totalCenterOccupancy / totalCapacity) * 100))
  }, [totalCenterOccupancy, totalCapacity])

  const totalStockPacks = useMemo(() => {
    return inventory.reduce((sum, item) => sum + Number(item.current_stock ?? item.quantity ?? 0), 0)
  }, [inventory])

  // Dedicated Critical Supply & Shelter Warnings
  const supplyAlerts = useMemo(() => {
    const alertsList = []

    // 1. Shelter Capacity Alerts (>= 85% full)
    centers.forEach((c) => {
      const cap = Number(c.capacity) || 100
      const occ = Number(c.current_occupancy) || 0
      const pct = Math.round((occ / cap) * 100)
      if (pct >= 85) {
        alertsList.push(`${c.name}: ${pct}% full, redirect new arrivals`)
      }
    })

    // 2. Inventory Stock Alerts based on Supabase columns
    inventory.forEach((item) => {
      const current = Number(item.current_stock ?? item.quantity ?? item.units ?? 0)
      const target = Number(item.max_stock ?? item.max_capacity ?? item.target ?? 1000)
      const name = item.item_description || item.name || 'Supply Item'
      const status = String(item.status || getInventoryStatus(current, target)).toUpperCase()

      if (status === 'CRITICAL') {
        alertsList.push(`${name}: only ${current} units left`)
      } else if (status === 'LOW') {
        alertsList.push(`${name}: running low (${current} units)`)
      }
    })

    return alertsList
  }, [centers, inventory])

  // Filtered Evacuee Registry
  const filteredEvacuees = useMemo(() => {
    return evacuees.filter((e) => {
      const name = (e.head_of_household || e.head_name || e.name || '').toLowerCase()
      const hhId = (e.household_id || e.id || '').toString().toLowerCase()
      const centerName = (e.center_name || e.center || '').toLowerCase()
      const q = registrySearch.toLowerCase().trim()

      const matchesSearch = !q || name.includes(q) || hhId.includes(q) || centerName.includes(q)

      const matchesCenter =
        selectedCenterFilter === 'all' ||
        (e.center_id && String(e.center_id) === String(selectedCenterFilter)) ||
        (e.center_name && e.center_name.toLowerCase() === selectedCenterFilter.toLowerCase())

      const priority = (e.priority_level || e.priority || 'standard').toLowerCase()
      const matchesPriority =
        selectedPriorityFilter === 'all' || priority === selectedPriorityFilter.toLowerCase()

      return matchesSearch && matchesCenter && matchesPriority
    })
  }, [evacuees, registrySearch, selectedCenterFilter, selectedPriorityFilter])

// Add under your other state declarations
const [selectedCenterId, setSelectedCenterId] = useState(null)

// Per-center inventory state (fetched from center_inventory_detail view)
const [centerInventory, setCenterInventory] = useState([])

// Fetch per-center inventory when selectedCenterId changes
useEffect(() => {
  if (!selectedCenterId) {
    setCenterInventory([])
    return
  }

  let isMounted = true
  fetchCenterInventory(selectedCenterId, 200)
    .then((data) => {
      if (isMounted) {
        setCenterInventory(Array.isArray(data) ? data : [])
      }
    })
    .catch((error) => {
      console.error('[RESQ Coordinator] Failed to fetch center inventory:', error)
      if (isMounted) setCenterInventory([])
    })

  return () => {
    isMounted = false
  }
}, [selectedCenterId])

// Derive inventory items for the active center selection
// Uses centerInventory (fetched from center_inventory_detail view) when center is selected
// Falls back to inventory filtering for backward compatibility
const displayedInventory = useMemo(() => {
  if (!selectedCenterId) return inventory

  // Use the center-specific inventory fetched from junction table
  if (centerInventory.length > 0) {
    return centerInventory
  }

  // Fallback: filter main inventory by center_id (for backward compatibility)
  return inventory.filter((item) => {
    return (
      item.center_id === selectedCenterId ||
      item.shelter_id === selectedCenterId ||
      String(item.center_id) === String(selectedCenterId)
    )
  })
}, [inventory, selectedCenterId, centerInventory])

// Find active center details for banner display
const activeCenterObj = useMemo(() => {
  return centers.find((c) => c.id === selectedCenterId)
}, [centers, selectedCenterId])

// Consolidated Inventory - group by item_description and sum stocks
const consolidatedInventory = useMemo(() => {
  const consolidated = new Map()

  inventory.forEach((item) => {
    const name = item.item_description || item.name || 'Unnamed Item'
    const units = Number(item.current_stock ?? item.quantity ?? item.units ?? 0)
    const maxUnits = Number(item.max_stock ?? item.max_capacity ?? item.target ?? 1000)
    const statusRaw = String(item.status || getInventoryStatus(units, maxUnits)).toUpperCase()
    const status = statusRaw
    const lastShipment = item.last_shipment || item.updated_at

    if (consolidated.has(name)) {
      const existing = consolidated.get(name)
      existing.current_stock += units
      existing.max_stock += maxUnits
      // Keep the worst status (CRITICAL > LOW > OK)
      const statusPriority = { CRITICAL: 3, LOW: 2, OK: 1 }
      if (statusPriority[status] > statusPriority[existing.status]) {
        existing.status = status
      }
      // Keep the most recent last_shipment
      if (lastShipment && new Date(lastShipment) > new Date(existing.last_shipment || 0)) {
        existing.last_shipment = lastShipment
      }
    } else {
      consolidated.set(name, {
        item_description: name,
        current_stock: units,
        max_stock: maxUnits,
        status,
        last_shipment: lastShipment,
        inventory_items: [item]
      })
    }
    if (consolidated.has(name)) {
      const existing = consolidated.get(name)
      if (!existing.inventory_items.some((inventoryItem) => inventoryItem.id === item.id)) {
        existing.inventory_items.push(item)
      }
    }
  })

  return Array.from(consolidated.values())
}, [inventory])






  const [updatingCenterId, setUpdatingCenterId] = useState(null)

const handleToggleCenterStatus = async (center) => {
  if (updatingCenterId) return

  const cap = Number(center.capacity) || 100
  const occ = Number(center.current_occupancy) || 0
  const isFull = occ >= cap

  // If it's 100% full, prevent opening unless capacity/occupancy is modified
  if (isFull && center.is_active === false) {
    alert(`Cannot open "${center.name}": Center is at maximum capacity (${occ}/${cap} beds). Free up slots or register departures first.`)
    return
  }

  // Toggle active state
  const newActiveState = center.is_active === false ? true : false
  setUpdatingCenterId(center.id)

  try {
    await updateCenterStatus(center.id, newActiveState)

    setCenters((prev) =>
      prev.map((c) => (c.id === center.id ? { ...c, is_active: newActiveState } : c))
    )
  } catch (err) {
    console.error('Failed to toggle status:', err)
  } finally {
    setUpdatingCenterId(null)
  }
}

const handleAddInventoryItem = async (event) => {
  event.preventDefault()
  setInventoryFormError('')

  const itemDescription = newInventoryItem.item_description.trim()
  const currentStock = Number(newInventoryItem.current_stock)
  const maxStock = Number(newInventoryItem.max_stock)
  if (!itemDescription || !Number.isInteger(currentStock) || !Number.isInteger(maxStock) || currentStock < 0 || maxStock < 1 || currentStock > maxStock) {
    setInventoryFormError('Enter an item name and valid whole-number stock values. Current stock cannot exceed target stock.')
    return
  }

  const status = getInventoryStatus(currentStock, maxStock)
  setIsSavingInventory(true)

  try {
    const createdItems = await createInventoryItem({
      item_description: itemDescription,
      current_stock: currentStock,
      max_stock: maxStock,
      status,
      last_shipment: null
    })
    if (!Array.isArray(createdItems) || createdItems.length === 0) {
      throw new Error('Inventory insert did not return the created record.')
    }
    setInventory((items) => [...items, ...createdItems])
    setNewInventoryItem({ item_description: '', current_stock: '', max_stock: '' })
    setIsAddInventoryOpen(false)
  } catch (error) {
    console.error('[RESQ Coordinator] Failed to add inventory item:', error)
    setInventoryFormError('Could not add the item. Check your connection and inventory permissions, then try again.')
  } finally {
    setIsSavingInventory(false)
  }
}

const handleAssignShipment = async (event, item) => {
  event.preventDefault()
  setShipmentError('')
  const draft = shipmentDrafts[item.id] || {}
  const centerId = Number(draft.centerId)
  const quantity = Number(draft.quantity)
  if (!item.id || !Number.isInteger(centerId) || centerId < 1 || !Number.isInteger(quantity) || quantity < 1) {
    setShipmentError('Select a center and enter a whole-number shipment quantity greater than zero.')
    return
  }

  setSavingShipmentItemId(item.id)
  try {
    const shipment = await createInventoryShipment(auth?.token || auth?.access_token, {
      inventory_id: draft.inventoryId || item.id,
      center_id: centerId,
      quantity
    })
    setPendingShipments((shipments) => [shipment, ...shipments])
    setInventory((items) => items.map((inventoryItem) => (
      String(inventoryItem.id) === String(shipment.inventory_id)
        ? { ...inventoryItem, last_shipment: shipment.created_at }
        : inventoryItem
    )))
    setShipmentDrafts((drafts) => ({
      ...drafts,
      [item.id]: { ...draft, centerId: '', quantity: '' }
    }))
  } catch (error) {
    console.error('[RESQ Coordinator] Failed to assign inventory shipment:', error)
    setShipmentError('Could not assign the shipment. Check your connection and permissions, then try again.')
  } finally {
    setSavingShipmentItemId(null)
  }
}

const handleShipmentArrival = async (shipmentId) => {
  setShipmentError('')
  setArrivingShipmentId(shipmentId)
  try {
    await markInventoryShipmentArrived(auth?.token || auth?.access_token, shipmentId)
    setPendingShipments((shipments) => shipments.filter((shipment) => shipment.id !== shipmentId))
  } catch (error) {
    console.error('[RESQ Coordinator] Failed to receive inventory shipment:', error)
    setShipmentError('Could not mark this shipment as arrived. Its stock was not changed; try again.')
  } finally {
    setArrivingShipmentId(null)
  }
}

const saveCoordinatorAssignment = async (userId, centerId) => {
  setCoordinatorAssignmentError('')
  setCoordinatorAssignmentNotice('')
  setSavingCoordinatorAssignment(true)
  try {
    const updatedUser = await assignCoordinatorToCenter(
      auth?.token || auth?.access_token,
      userId,
      centerId
    )
    setCoordinatorAssignments((assignments) => assignments.map((assignment) => (
      assignment.id === updatedUser.id ? updatedUser : assignment
    )))
    setSelectedCoordinatorId('')
    setSelectedCoordinatorCenterId('')
    setCoordinatorAssignmentNotice(
      centerId === null
        ? 'Center access removed. The account must sign in again.'
        : 'Center assigned. The account must sign in again to open its center dashboard.'
    )
    return true
  } catch (error) {
    console.error('[RESQ Coordinator] Failed to update center coordinator assignment:', error)
    setCoordinatorAssignmentError('Could not update this assignment. Check the account and try again.')
    return false
  } finally {
    setSavingCoordinatorAssignment(false)
  }
}

const handleAssignCoordinator = async (event) => {
  event.preventDefault()
  const userId = Number(selectedCoordinatorId)
  const centerId = Number(selectedCoordinatorCenterId)
  if (!Number.isInteger(userId) || userId < 1 || !Number.isInteger(centerId) || centerId < 1) {
    setCoordinatorAssignmentError('Select a coordinator account and an evacuation center.')
    return
  }
  await saveCoordinatorAssignment(userId, centerId)
}

const getCoordinatorReportData = () => {
  const centerById = new Map(centers.map((center) => [String(center.id), center.name]))
  const centerRows = centers.map((center) => {
    const capacity = Number(center.capacity) || 0
    const occupancy = Number(center.current_occupancy) || 0
    return {
      name: center.name || 'Unnamed center',
      address: center.address || '',
      status: center.is_active === false ? 'Closed' : 'Open',
      occupancy,
      capacity,
      utilization: capacity ? `${Math.min(100, Math.round((occupancy / capacity) * 100))}%` : 'N/A'
    }
  })
  const evacueeRows = evacuees.map((evacuee, index) => ({
    id: evacuee.household_id || evacuee.id || `HH-${1000 + index}`,
    name: evacuee.head_of_household || evacuee.head_name || evacuee.name || 'Not recorded',
    members: evacuee.members_count || evacuee.family_size || 1,
    center: evacuee.center_name || evacuee.center || centerById.get(String(evacuee.center_id ?? evacuee.shelter_id)) || 'Unassigned',
    priority: String(evacuee.priority_level || evacuee.priority || 'standard').toUpperCase(),
    checkedIn: formatReportDate(evacuee.checked_in_at || evacuee.check_in_time)
  }))
  const inventoryRows = inventory.map((item) => {
    const currentStock = Number(item.current_stock ?? item.quantity ?? item.units ?? 0)
    const targetStock = Number(item.max_stock ?? item.max_capacity ?? item.target ?? 0)
    const status = String(item.status || getInventoryStatus(currentStock, targetStock)).toUpperCase()
    return {
      id: item.id || '',
      name: item.item_description || item.name || 'Unnamed item',
      currentStock,
      targetStock,
      status,
      lastShipment: formatReportDate(item.last_shipment)
    }
  })
  const shipmentRows = pendingShipments.map((shipment) => ({
    id: shipment.id,
    item: shipment.item_description,
    center: shipment.center_name,
    quantity: shipment.quantity,
    createdAt: formatReportDate(shipment.created_at)
  }))

  return {
    generatedAt: new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date()),
    shelteredEvacuees: shelteredEvacueesCount,
    activeUtilization,
    totalStockPacks,
    activeAlerts: activeAlertsCount,
    centerRows,
    evacueeRows,
    inventoryRows,
    shipmentRows
  }
}

const exportCoordinatorReportXlsx = async () => {
  setIsExportingReport(true)
  setReportExportError('')
  try {
    const ExcelJS = await import('exceljs')
    const report = getCoordinatorReportData()
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'RESQ-ROUTE'
    workbook.created = new Date()

    const navy = '15243A'
    const red = 'D62839'
    const pale = 'F2F5F9'
    const border = 'D9E1EB'
    const muted = '63738A'
    const white = 'FFFFFF'
    const addTableSheet = (name, title, headers, rows, widths) => {
      const sheet = workbook.addWorksheet(name, {
        views: [{ state: 'frozen', ySplit: 3, showGridLines: false }]
      })
      sheet.columns = widths.map((width) => ({ width }))
      sheet.mergeCells(1, 1, 1, headers.length)
      sheet.getCell('A1').value = `RESQ-ROUTE  |  ${title.toUpperCase()}`
      sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } }
      sheet.getCell('A1').font = { name: 'Aptos Display', size: 16, bold: true, color: { argb: white } }
      sheet.getCell('A1').alignment = { vertical: 'middle', indent: 1 }
      sheet.getRow(1).height = 32
      sheet.mergeCells(2, 1, 2, headers.length)
      sheet.getCell('A2').value = `Generated ${report.generatedAt} (Philippine time) · ${rows.length} records`
      sheet.getCell('A2').font = { name: 'Aptos', size: 10, color: { argb: muted }, italic: true }
      sheet.getRow(2).height = 22
      const headerRow = sheet.addRow(headers)
      headerRow.height = 24
      headerRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: red } }
        cell.font = { name: 'Aptos', size: 9, bold: true, color: { argb: white } }
        cell.alignment = { vertical: 'middle', wrapText: true }
      })
      rows.forEach((values, index) => {
        const row = sheet.addRow(values)
        row.height = 22
        row.eachCell((cell) => {
          cell.font = { name: 'Aptos', size: 9, color: { argb: navy } }
          cell.alignment = { vertical: 'middle', wrapText: true }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index % 2 ? white : pale } }
          cell.border = { bottom: { style: 'hair', color: { argb: border } } }
        })
      })
      if (rows.length) {
        sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: headers.length } }
      }
      sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
      sheet.pageSetup.printTitlesRow = '1:3'
      return sheet
    }

    const summary = workbook.addWorksheet('Summary', { views: [{ showGridLines: false }] })
    summary.columns = [{ width: 36 }, { width: 24 }]
    summary.mergeCells('A1:B2')
    summary.getCell('A1').value = 'RESQ-ROUTE  |  COORDINATOR REPORT'
    summary.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } }
    summary.getCell('A1').font = { name: 'Aptos Display', size: 18, bold: true, color: { argb: white } }
    summary.getCell('A1').alignment = { vertical: 'middle', indent: 1 }
    summary.getRow(1).height = 28
    summary.getRow(2).height = 22
    summary.mergeCells('A3:B3')
    summary.getCell('A3').value = `Generated ${report.generatedAt} (Philippine time)`
    summary.getCell('A3').font = { name: 'Aptos', size: 10, color: { argb: muted }, italic: true }
    const summaryRows = [
      ['TOTAL SHELTERED EVACUEES', report.shelteredEvacuees ?? 'Unavailable'],
      ['ACTIVE CAPACITY UTILIZATION', hasCentersData ? `${report.activeUtilization}%` : 'Unavailable'],
      ['STOCKED HUMANITARIAN PACKS', hasInventoryData ? report.totalStockPacks : 'Unavailable'],
      ['ACTIVE ALERTS', report.activeAlerts ?? 'Unavailable'],
      ['EVACUEE RECORDS EXPORTED', report.evacueeRows.length],
      ['EVACUATION CENTERS', report.centerRows.length],
      ['INVENTORY ITEMS', report.inventoryRows.length],
      ['PENDING SHIPMENTS', report.shipmentRows.length]
    ]
    summaryRows.forEach(([label, value], index) => {
      const row = summary.addRow([label, value])
      row.height = 24
      row.eachCell((cell) => {
        cell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: navy } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index % 2 ? white : pale } }
        cell.border = { bottom: { style: 'hair', color: { argb: border } } }
      })
    })
    addTableSheet('Centers', 'Evacuation centers', ['Center', 'Address', 'Status', 'Occupancy', 'Capacity', 'Utilization'], report.centerRows.map((row) => [row.name, row.address, row.status, row.occupancy, row.capacity, row.utilization]), [28, 42, 14, 14, 14, 14])
    addTableSheet('Evacuees', 'Evacuee registry', ['Household / ID', 'Name', 'Members', 'Center', 'Priority', 'Checked in'], report.evacueeRows.map((row) => [row.id, row.name, row.members, row.center, row.priority, row.checkedIn]), [22, 28, 12, 28, 14, 20])
    addTableSheet('Inventory', 'Resource inventory', ['Inventory ID', 'Item', 'Current stock', 'Target stock', 'Status', 'Last shipment'], report.inventoryRows.map((row) => [row.id, row.name, row.currentStock, row.targetStock, row.status, row.lastShipment]), [38, 28, 16, 16, 14, 20])
    addTableSheet('Pending shipments', 'Pending shipments', ['Shipment ID', 'Item', 'Destination center', 'Quantity', 'Created'], report.shipmentRows.map((row) => [row.id, row.item, row.center, row.quantity, row.createdAt]), [38, 28, 30, 14, 20])

    const buffer = await workbook.xlsx.writeBuffer()
    const downloadUrl = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    const downloadLink = document.createElement('a')
    downloadLink.href = downloadUrl
    downloadLink.download = `resq-route-coordinator-${new Date().toISOString().slice(0, 10)}.xlsx`
    downloadLink.click()
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000)
  } catch (error) {
    console.error('[RESQ Coordinator] Unable to export report as XLSX:', error)
    setReportExportError(error instanceof Error ? error.message : 'Could not create the XLSX report. Please try again.')
  } finally {
    setIsExportingReport(false)
  }
}

const exportCoordinatorReportPdf = async () => {
  setIsExportingReport(true)
  setReportExportError('')
  try {
    const [{ jsPDF }, logoBytes] = await Promise.all([
      import('jspdf'),
      loadResqLogoBytes()
    ])
    const report = getCoordinatorReportData()
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 12
    const contentWidth = pageWidth - margin * 2
    const colors = {
      navy: [21, 36, 58],
      red: [214, 40, 57],
      muted: [99, 115, 138],
      pale: [242, 245, 249],
      border: [217, 225, 235],
      white: [255, 255, 255],
      body: [39, 52, 71]
    }
    let y = 0
    const drawPageHeader = (continued = false) => {
      pdf.setFillColor(...colors.navy)
      pdf.rect(0, 0, pageWidth, 27, 'F')
      pdf.setFillColor(...colors.red)
      pdf.rect(0, 27, pageWidth, 2, 'F')
      pdf.addImage(logoBytes, 'PNG', margin, 3, 21, 21)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(14)
      pdf.setTextColor(...colors.white)
      pdf.text('RESQ-ROUTE', margin + 25, 12)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
      pdf.text(continued ? 'COORDINATOR REPORT · CONTINUED' : 'COORDINATOR RESOURCE & CENTER SUMMARY', margin + 25, 18)
      pdf.text(`${report.generatedAt} PHT`, pageWidth - margin, 20, { align: 'right' })
      y = 35
    }
    const addPage = () => {
      pdf.addPage()
      drawPageHeader(true)
    }
    const drawSection = (title) => {
      if (y + 10 > pageHeight - margin) addPage()
      pdf.setFillColor(...colors.navy)
      pdf.roundedRect(margin, y, contentWidth, 7, 1, 1, 'F')
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(8)
      pdf.setTextColor(...colors.white)
      pdf.text(title.toUpperCase(), margin + 3, y + 4.7)
      y += 10
    }
    const drawTable = (title, headers, rows, widths) => {
      drawSection(title)
      const drawColumnHeaders = () => {
        let x = margin
        headers.forEach((header, index) => {
          pdf.setFillColor(...colors.red)
          pdf.rect(x, y, widths[index], 7, 'F')
          pdf.setFont('helvetica', 'bold')
          pdf.setFontSize(6.5)
          pdf.setTextColor(...colors.white)
          pdf.text(pdf.splitTextToSize(header, widths[index] - 2).slice(0, 2), x + 1, y + 3)
          x += widths[index]
        })
        y += 7
      }
      drawColumnHeaders()
      if (!rows.length) {
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(8)
        pdf.setTextColor(...colors.muted)
        pdf.text('No records available.', margin + 1, y + 5)
        y += 10
        return
      }
      rows.forEach((row, rowIndex) => {
        const cells = row.map((value, index) => pdf.splitTextToSize(String(value ?? ''), widths[index] - 2))
        const lineCount = Math.max(1, ...cells.map((lines) => lines.length))
        const rowHeight = Math.max(7, lineCount * 3.2 + 2)
        if (y + rowHeight > pageHeight - margin) {
          addPage()
          drawSection(`${title} · continued`)
          drawColumnHeaders()
        }
        let x = margin
        cells.forEach((lines, index) => {
          pdf.setFillColor(...(rowIndex % 2 ? colors.white : colors.pale))
          pdf.setDrawColor(...colors.border)
          pdf.rect(x, y, widths[index], rowHeight, 'FD')
          pdf.setFont('helvetica', 'normal')
          pdf.setFontSize(6.5)
          pdf.setTextColor(...colors.body)
          pdf.text(lines, x + 1, y + 3.5)
          x += widths[index]
        })
        y += rowHeight
      })
      y += 6
    }

    drawPageHeader()
    drawSection('Consolidated statistics')
    const stats = [
      ['Sheltered evacuees', report.shelteredEvacuees ?? 'Unavailable'],
      ['Capacity utilization', hasCentersData ? `${report.activeUtilization}%` : 'Unavailable'],
      ['Stocked humanitarian packs', hasInventoryData ? report.totalStockPacks.toLocaleString() : 'Unavailable'],
      ['Active alerts', report.activeAlerts ?? 'Unavailable']
    ]
    const statGap = 3
    const statWidth = (contentWidth - statGap * (stats.length - 1)) / stats.length
    stats.forEach(([label, value], index) => {
      const x = margin + index * (statWidth + statGap)
      pdf.setFillColor(...colors.pale)
      pdf.roundedRect(x, y, statWidth, 18, 1, 1, 'F')
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(7)
      pdf.setTextColor(...colors.muted)
      pdf.text(String(label).toUpperCase(), x + 3, y + 6)
      pdf.setFontSize(12)
      pdf.setTextColor(...colors.navy)
      pdf.text(String(value), x + 3, y + 13)
    })
    y += 24
    drawTable('Evacuation centers', ['Center', 'Address', 'Status', 'Occupancy', 'Capacity', 'Utilization'],
      report.centerRows.map((row) => [row.name, row.address, row.status, row.occupancy, row.capacity, row.utilization]),
      [44, 82, 32, 32, 32, 51])
    drawTable('Evacuee registry', ['Household / ID', 'Name', 'Members', 'Center', 'Priority', 'Checked in'],
      report.evacueeRows.map((row) => [row.id, row.name, row.members, row.center, row.priority, row.checkedIn]),
      [44, 50, 25, 65, 35, 54])
    drawTable('Resource inventory', ['Inventory ID', 'Item', 'Current stock', 'Target stock', 'Status', 'Last shipment'],
      report.inventoryRows.map((row) => [row.id, row.name, row.currentStock, row.targetStock, row.status, row.lastShipment]),
      [54, 50, 38, 38, 32, 61])
    drawTable('Pending shipments', ['Shipment ID', 'Item', 'Destination center', 'Quantity', 'Created'],
      report.shipmentRows.map((row) => [row.id, row.item, row.center, row.quantity, row.createdAt]),
      [55, 50, 65, 40, 63])

    const pageCount = pdf.internal.getNumberOfPages()
    for (let page = 1; page <= pageCount; page += 1) {
      pdf.setPage(page)
      pdf.setDrawColor(...colors.border)
      pdf.line(margin, pageHeight - 8, pageWidth - margin, pageHeight - 8)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7)
      pdf.setTextColor(...colors.muted)
      pdf.text('RESQ-ROUTE · OPERATIONAL USE', margin, pageHeight - 4)
      pdf.text(`PAGE ${page} OF ${pageCount}`, pageWidth - margin, pageHeight - 4, { align: 'right' })
    }
    pdf.save(`resq-route-coordinator-${new Date().toISOString().slice(0, 10)}.pdf`)
  } catch (error) {
    console.error('[RESQ Coordinator] Unable to export report as PDF:', error)
    setReportExportError(error instanceof Error ? error.message : 'Could not create the PDF report. Please try again.')
  } finally {
    setIsExportingReport(false)
  }
}

  return (
    <div className="coord-dashboard-wrapper">
      {/* 1. Header Bar */}
      <header className="coord-header">
        <div className="coord-header-left">
          <Logo size="small" />
          <h1 className="coord-system-title">CSWD EVACUATION &amp; RELIEF LOGISTICS</h1>
        </div>

        <div className="coord-header-right">
          <div className="coord-telemetry-status" aria-label={`WebSocket ${isConnected ? 'connected' : 'disconnected'}`}>
            <span className={`coord-status-indicator ${isConnected ? 'online' : 'offline'}`} />
            <span>WebSocket: {isConnected ? 'Connected' : 'Disconnected'}</span>
          </div>

          <div className="coord-incident-pill" aria-label={`Active alerts: ${activeAlertsCount ?? 'unavailable'}`} title={`Active alerts: ${activeAlertsCount ?? 'unavailable'}`}>
            <span className="coord-incident-label">ACTIVE ALERTS:</span>
            <span>{activeAlertsCount ?? '—'}</span>
          </div>

          <div className="coord-clock">
            {formattedPhtTime} PHT
          </div>

          <div className="coordinator-profile-menu" ref={profileMenuRef}>
            <button
              type="button"
              className="coord-profile-badge"
              onClick={() => setIsProfileMenuOpen((open) => !open)}
              aria-label={`Account menu for ${displayName}`}
              aria-haspopup="menu"
              aria-expanded={isProfileMenuOpen}
            >
              <span className="coord-avatar-circle">{displayName.charAt(0).toUpperCase()}</span>
              <span className="coord-profile-meta">
                <span className="coord-profile-name">{displayName}</span>
                <span className="coord-profile-role">{userRole}</span>
              </span>
              <ChevronDown size={14} aria-hidden="true" />
            </button>
            {isProfileMenuOpen && (
              <div className="coordinator-profile-dropdown" role="menu">
                <span className="coordinator-dropdown-name">{displayName}</span>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsProfileMenuOpen(false)
                    onLogout()
                  }}
                >
                  <LogOut size={15} aria-hidden="true" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 2. Navigation Tabs */}
      <nav className="coord-nav-tabs">
        <button
          type="button"
          className={`coord-tab-btn ${activeTab === 'centers' ? 'active' : ''}`}
          onClick={() => setActiveTab('centers')}
        >
          CENTERS OVERVIEW
        </button>
        <button
          type="button"
          className={`coord-tab-btn ${activeTab === 'registry' ? 'active' : ''}`}
          onClick={() => setActiveTab('registry')}
        >
          EVACUEE REGISTRY
        </button>
        <button
          type="button"
          className={`coord-tab-btn ${activeTab === 'inventory' ? 'active' : ''}`}
          onClick={() => setActiveTab('inventory')}
        >
          RESOURCE INVENTORY
        </button>
      </nav>

      <section className="coord-report-toolbar" aria-label="Coordinator report exports">
        <div>
          <strong>COORDINATOR REPORT</strong>
          <span>Export current center, evacuee, inventory, shipment, and statistics data.</span>
        </div>
        <div className="coord-report-export-actions">
          <button type="button" onClick={exportCoordinatorReportPdf} disabled={isExportingReport}>
            <FileDown size={14} />
            {isExportingReport ? 'Preparing…' : 'Export PDF'}
          </button>
          <button type="button" onClick={exportCoordinatorReportXlsx} disabled={isExportingReport}>
            <FileSpreadsheet size={14} />
            {isExportingReport ? 'Preparing…' : 'Export XLSX'}
          </button>
        </div>
        {reportExportError && <span className="coord-report-export-error" role="alert">{reportExportError}</span>}
      </section>

      {/* 3. Main Dashboard Workspace */}
      <main className="coord-main-grid">
        {/* Left Interactive Panel */}
        <div className="coord-left-column">
          {/* TAB 1: CENTERS OVERVIEW */}
          {/* TAB 1: CENTERS OVERVIEW */}
          {activeTab === 'centers' && (
            <>
              <section className="coord-panel coord-sites-panel">
                <div className="coord-panel-header">
                  <h2 className="coord-panel-title">ACTIVE EVACUATION SITES</h2>
                  <span className="coord-count-tag">{centers.length} CENTERS LISTED</span>
                </div>

                <div className="coord-sites-scroll-grid">
                  {loading && centers.length === 0 ? (
                    <div className="coord-empty-state">Syncing evacuation facilities...</div>
                  ) : centers.length === 0 ? (
                    <div className="coord-empty-state">No evacuation facilities registered.</div>
                  ) : (
                    centers.map((center) => {
                      const cap = Number(center.capacity) || 100
                      const occ = Number(center.current_occupancy) || 0
                      const pct = Math.min(100, Math.round((occ / cap) * 100))

                      // Auto-close condition: if occupancy reaches capacity, it is automatically closed
                      const isFull = occ >= cap
                      const isManuallyClosed = center.is_active === false
                      const isClosed = isFull || isManuallyClosed

                      const statusLabel = isFull
                        ? 'FULL (CLOSED)'
                        : isManuallyClosed
                        ? 'CLOSED'
                        : pct >= 85
                        ? 'NEAR FULL'
                        : 'OPEN'

                      const statusStyleClass = isFull
                        ? 'is-full'
                        : isManuallyClosed
                        ? 'is-closed'
                        : pct >= 85
                        ? 'is-near-full'
                        : 'is-open'

                      const barColor = isFull || isManuallyClosed ? '#ef4444' : pct >= 85 ? '#f59e0b' : '#10b981'

                      return (
                        <div
                          className={`coord-site-card clickable-site-card ${selectedCenterId === center.id ? 'is-selected-center' : ''}`}
                          key={center.id}
                          onClick={() => setSelectedCenterId((prev) => (prev === center.id ? null : center.id))}
                        >
                          <div className="coord-site-top">
                            <div>
                              <h3 className="coord-site-name">{center.name}</h3>
                              <p className="coord-site-address">{center.address || 'Caloocan Sector'}</p>
                            </div>

                            {/* Dynamic Action Button */}
                            <button
                              type="button"
                              className={`coord-site-status-btn ${statusStyleClass}`}
                              onClick={(e) => {
                                e.stopPropagation() // Prevents triggering card click when toggling open/close
                                handleToggleCenterStatus(center)
                              }}
                              disabled={updatingCenterId === center.id}
                              title={
                                isFull
                                  ? 'Center is full and automatically closed'
                                  : isClosed
                                  ? 'Click to manually open shelter'
                                  : 'Click to manually close shelter'
                              }
                            >
                              <span className="coord-status-indicator-dot" />
                              <span>
                                {updatingCenterId === center.id ? 'UPDATING...' : statusLabel}
                              </span>
                            </button>
                          </div>

                          <div className="coord-site-occupancy-row">
                            <span>{occ} / {cap} BED OCCUPIED</span>
                            <span style={{ color: barColor }}>{pct}%</span>
                          </div>

                          <div className="coord-progress-track">
                            <div
                              className="coord-progress-bar"
                              style={{ width: `${pct}%`, backgroundColor: barColor }}
                            />
                          </div>

                          <div className="coord-demographics-grid">
                            <div className="coord-demo-box">
                              <strong>{occ}</strong>
                              <span>PERSONS</span>
                            </div>
                            <div className="coord-demo-box">
                              <strong>{center.families_count ?? Math.round(occ / 4.2)}</strong>
                              <span>FAMILIES</span>
                            </div>
                            <div className="coord-demo-box">
                              <strong>{center.infants_count ?? Math.round(occ * 0.08)}</strong>
                              <span>INFANTS</span>
                            </div>
                            <div className="coord-demo-box">
                              <strong>{center.elderly_count ?? Math.round(occ * 0.12)}</strong>
                              <span>ELDERLY</span>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </section>

              <section className="coord-panel coord-center-assignment-panel">
                <div className="coord-panel-header">
                  <h2 className="coord-panel-title">CENTER COORDINATOR ASSIGNMENTS</h2>
                  <span className="coord-count-tag">{coordinatorAssignments.filter((account) => account.assigned_center_id).length} ASSIGNED</span>
                </div>
                <p className="coord-center-assignment-note">
                  Assign registered coordinator accounts to one center. Assigned users must sign in again to access their center-only dashboard.
                </p>
                <form className="coord-center-assignment-form" onSubmit={handleAssignCoordinator}>
                  <select
                    className="coord-select"
                    aria-label="Coordinator account"
                    value={selectedCoordinatorId}
                    onChange={(event) => setSelectedCoordinatorId(event.target.value)}
                    required
                  >
                    <option value="">Select coordinator account</option>
                    {coordinatorAssignments
                      .filter((account) => account.username !== auth?.user?.username)
                      .map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.full_name || account.username} · {account.role === 'center_coordinator' ? account.center_name || 'Assigned' : 'Unassigned'}
                        </option>
                      ))}
                  </select>
                  <select
                    className="coord-select"
                    aria-label="Evacuation center"
                    value={selectedCoordinatorCenterId}
                    onChange={(event) => setSelectedCoordinatorCenterId(event.target.value)}
                    required
                  >
                    <option value="">Select evacuation center</option>
                    {centers.map((center) => (
                      <option key={center.id} value={center.id}>{center.name}</option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="coord-shipment-assign-btn"
                    disabled={savingCoordinatorAssignment || !coordinatorAssignments.length || !centers.length}
                  >
                    {savingCoordinatorAssignment ? 'Saving…' : 'Assign center'}
                  </button>
                </form>
                {coordinatorAssignmentError && <p className="coord-inventory-form-error" role="alert">{coordinatorAssignmentError}</p>}
                {coordinatorAssignmentNotice && <p className="coord-center-assignment-notice" role="status">{coordinatorAssignmentNotice}</p>}
                <div className="coord-center-assignment-list">
                  {coordinatorAssignments.filter((account) => account.assigned_center_id).length ? (
                    coordinatorAssignments
                      .filter((account) => account.assigned_center_id)
                      .map((account) => (
                        <div className="coord-center-assignment-row" key={account.id}>
                          <span>
                            <strong>{account.full_name || account.username}</strong>
                            <small>{account.username} · {account.center_name || 'Center unavailable'}</small>
                          </span>
                          <button
                            type="button"
                            className="coord-inventory-cancel-btn"
                            onClick={() => saveCoordinatorAssignment(account.id, null)}
                            disabled={savingCoordinatorAssignment || account.username === auth?.user?.username}
                          >
                            Unassign
                          </button>
                        </div>
                      ))
                  ) : (
                    <span className="coord-shipment-hint">
                      {coordinatorAssignmentError || coordinatorAssignments.length === 0
                        ? 'No coordinator assignments available.'
                        : 'No center coordinators are assigned yet.'}
                    </span>
                  )}
                </div>
              </section>

              <section className="coord-panel coord-logistics-panel">
                <div className="coord-panel-header">
                  <div className="coord-table-header-left">
                    <h2 className="coord-panel-title">
                      {activeCenterObj
                        ? `LOGISTICS STOCK STATUS — ${activeCenterObj.name.toUpperCase()}`
                        : 'CENTRAL LOGISTICS STOCK STATUS'}
                    </h2>
                    {activeCenterObj && (
                      <button
                        type="button"
                        className="coord-clear-filter-btn"
                        onClick={() => setSelectedCenterId(null)}
                      >
                        View All Centers (Reset)
                      </button>
                    )}
                  </div>
                  <div className="coord-inventory-header-actions">
                    <span className="coord-count-tag">{displayedInventory.length} ITEMS TRACKED</span>
                    <button
                      type="button"
                      className="coord-add-item-btn"
                      onClick={() => {
                        setInventoryFormError('')
                        setIsAddInventoryOpen(true)
                      }}
                    >
                      <Plus size={14} />
                      Add item
                    </button>
                  </div>
                </div>

                {shipmentError && <p className="coord-shipment-error" role="alert">{shipmentError}</p>}
                <div className="coord-table-scroll">
                  <table className="coord-data-table">
                    <thead>
                      <tr>
                        <th>ITEM DESCRIPTION</th>
                        <th>STOCK RATIO</th>
                        <th>STATUS</th>
                        <th>LAST SHIPMENT</th>
                        <th>SHIPMENT / CENTER</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedInventory.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="coord-empty-td">
                            {selectedCenterId
                              ? `No dedicated supply inventory found for ${activeCenterObj?.name || 'this center'}.`
                              : (loading ? 'Fetching supply levels...' : 'No inventory records available.')}
                          </td>
                        </tr>
                      ) : (
                        displayedInventory.map((item, idx) => {
                          const name = item.item_description || item.name || 'Unnamed Item'
                          const units = Number(item.current_stock ?? item.quantity ?? item.units ?? 0)
                          const maxUnits = Number(item.max_stock ?? item.max_capacity ?? item.target ?? 1000)
                          const pct = Math.min(100, Math.round((units / maxUnits) * 100))
                          
                          const target = Number(item.max_stock ?? item.max_capacity ?? item.target ?? 1000)
                          const statusRaw = String(item.status || getInventoryStatus(units, target)).toUpperCase()
                          const statusClass = statusRaw === 'OK' ? 'on' : statusRaw.toLowerCase()
                          const barColor = statusRaw === 'CRITICAL' ? '#ef4444' : statusRaw === 'LOW' ? '#f59e0b' : '#10b981'
                          const itemShipments = pendingShipments.filter(
                            (shipment) => String(shipment.inventory_id) === String(item.id)
                          )
                          const shipmentDraft = shipmentDrafts[item.id] || { centerId: '', quantity: '' }

                          return (
                            <tr key={item.id || idx}>
                              <td className="coord-item-name">{name}</td>
                              <td>
                                <div className="coord-stock-ratio-cell">
                                  <span>{units} units</span>
                                  <div className="coord-mini-track">
                                    <div
                                      className="coord-mini-bar"
                                      style={{ width: `${pct}%`, backgroundColor: barColor }}
                                    />
                                  </div>
                                </div>
                              </td>
                              <td>
                                <span className={`coord-table-status-pill ${statusClass}`}>
                                  {statusRaw}
                                </span>
                              </td>
                              <td className="coord-date-cell">
                                {item.last_shipment || item.updated_at
                                  ? new Date(item.last_shipment || item.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                  : 'Recent'}
                              </td>
                              <td>
                                {selectedCenterId ? (
                                  <span className="coord-shipment-hint">Assign shipments from the central inventory view.</span>
                                ) : (
                                  <div className="coord-shipment-cell">
                                    <form className="coord-shipment-form" onSubmit={(event) => handleAssignShipment(event, item)}>
                                      <select
                                        className="coord-select"
                                        aria-label={`Select destination for ${name}`}
                                        value={shipmentDraft.centerId}
                                        onChange={(event) => setShipmentDrafts((drafts) => ({
                                          ...drafts,
                                          [item.id]: { ...shipmentDraft, centerId: event.target.value }
                                        }))}
                                        required
                                      >
                                        <option value="">Select center</option>
                                        {centers.map((center) => (
                                          <option key={center.id} value={center.id}>{center.name}</option>
                                        ))}
                                      </select>
                                      <input
                                        className="coord-input coord-shipment-quantity"
                                        type="number"
                                        min="1"
                                        step="1"
                                        aria-label={`Shipment quantity for ${name}`}
                                        placeholder="Units"
                                        value={shipmentDraft.quantity}
                                        onChange={(event) => setShipmentDrafts((drafts) => ({
                                          ...drafts,
                                          [item.id]: { ...shipmentDraft, quantity: event.target.value }
                                        }))}
                                        required
                                      />
                                      <button
                                        className="coord-shipment-assign-btn"
                                        type="submit"
                                        disabled={!item.id || savingShipmentItemId === item.id}
                                      >
                                        {savingShipmentItemId === item.id ? 'Assigning…' : 'Assign'}
                                      </button>
                                    </form>
                                    {itemShipments.map((shipment) => (
                                      <div className="coord-pending-shipment" key={shipment.id}>
                                        <span>{shipment.quantity} units → {shipment.center_name}</span>
                                        <button
                                          type="button"
                                          onClick={() => handleShipmentArrival(shipment.id)}
                                          disabled={arrivingShipmentId === shipment.id}
                                        >
                                          {arrivingShipmentId === shipment.id ? 'Receiving…' : 'Mark arrived'}
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {/* TAB 2: EVACUEE REGISTRY */}
          {activeTab === 'registry' && (
            <section className="coord-panel coord-full-tab-panel">
              <div className="coord-panel-header">
                <h2 className="coord-panel-title">EVACUEE REGISTRY</h2>
                <span className="coord-count-tag">{filteredEvacuees.length} HOUSEHOLDS</span>
              </div>

              {/* Filters Bar */}
              <div className="coord-registry-filter-bar">
                <div className="coord-registry-search-box">
                  <input
                    type="text"
                    placeholder="Search the evacuee's name"
                    value={registrySearch}
                    onChange={(e) => setRegistrySearch(e.target.value)}
                    className="coord-input"
                  />
                </div>

                <select
                  className="coord-select"
                  value={selectedCenterFilter}
                  onChange={(e) => setSelectedCenterFilter(e.target.value)}
                >
                  <option value="all">All centers</option>
                  {centers.map((c) => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>

                <select
                  className="coord-select"
                  value={selectedPriorityFilter}
                  onChange={(e) => setSelectedPriorityFilter(e.target.value)}
                >
                  <option value="all">All priorities</option>
                  <option value="elderly">Elderly</option>
                  <option value="infant">Infant</option>
                  <option value="standard">Standard</option>
                </select>
              </div>

              {/* Registry Table */}
              <div className="coord-table-scroll">
                <table className="coord-data-table">
                  <thead>
                    <tr>
                      <th>HOUSEHOLD</th>
                      <th>HEAD</th>
                      <th>MEMBERS</th>
                      <th>CENTER</th>
                      <th>PRIORITY</th>
                      <th>CHECKED IN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEvacuees.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="coord-empty-td">
                          {loading ? 'Fetching registry roster...' : 'No matching registered evacuee households found.'}
                        </td>
                      </tr>
                    ) : (
                      filteredEvacuees.map((e, index) => {
                        const prio = (e.priority_level || e.priority || 'standard').toLowerCase()
                        return (
                          <tr key={e.id || index}>
                            <td className="coord-mono-id">{e.household_id || `HH-${1000 + index}`}</td>
                            <td className="coord-item-name">{e.head_of_household || e.head_name || e.name}</td>
                            <td>{e.members_count || e.family_size || 1}</td>
                            <td>{e.center_name || e.center || 'Main Gym'}</td>
                            <td>
                              <span className={`coord-priority-tag ${prio}`}>
                                {prio.toUpperCase()}
                              </span>
                            </td>
                            <td className="coord-time-cell">
                              {e.checked_in_at
                                ? new Date(e.checked_in_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
                                : '08:00'}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* TAB 3: RESOURCE INVENTORY */}
          {activeTab === 'inventory' && (
            <section className="coord-panel coord-full-tab-panel">
              <div className="coord-panel-header">
                <h2 className="coord-panel-title">RESOURCE INVENTORY</h2>
                <div className="coord-inventory-header-actions">
                  <span className="coord-count-tag">CONSOLIDATED VIEW — ALL CENTERS</span>
                  <button
                    type="button"
                    className="coord-add-item-btn"
                    onClick={() => {
                      setInventoryFormError('')
                      setIsAddInventoryOpen(true)
                    }}
                  >
                    <Plus size={14} />
                    Add item
                  </button>
                </div>
              </div>

              {shipmentError && <p className="coord-shipment-error" role="alert">{shipmentError}</p>}
              <div className="coord-inventory-cards-grid">
                {consolidatedInventory.length === 0 ? (
                  <div className="coord-empty-state">
                    {loading ? 'Loading resource inventory stocks...' : 'No inventory items currently tracked.'}
                  </div>
                ) : (
                  consolidatedInventory.map((item, idx) => {
                    const name = item.item_description
                    const units = Number(item.current_stock)
                    const maxUnits = Number(item.max_stock)
                    const pct = maxUnits > 0 ? Math.min(100, Math.round((units / maxUnits) * 100)) : 0

                    const statusRaw = String(item.status || getInventoryStatus(units, maxUnits)).toUpperCase()
                    const statusClass = statusRaw === 'OK' ? 'on' : statusRaw.toLowerCase()
                    const barColor = statusRaw === 'CRITICAL' ? '#ef4444' : statusRaw === 'LOW' ? '#f59e0b' : '#10b981'
                    const sourceItems = item.inventory_items.filter((sourceItem) => sourceItem.id)
                    const primaryItem = sourceItems[0]
                    const shipmentDraft = shipmentDrafts[primaryItem?.id] || {
                      centerId: '',
                      quantity: '',
                      inventoryId: primaryItem?.id || ''
                    }
                    const itemShipments = pendingShipments.filter((shipment) =>
                      sourceItems.some((sourceItem) => String(sourceItem.id) === String(shipment.inventory_id))
                    )

                    return (
                      <div className="coord-inventory-card" key={`${name}-${idx}`}>
                        <div className="coord-inv-top">
                          <h3 className="coord-inv-name">{name}</h3>
                          <span className={`coord-table-status-pill ${statusClass}`}>
                            {statusRaw}
                          </span>
                        </div>

                        <div className="coord-inv-count-row">
                          <strong>{units.toLocaleString()}</strong>
                          <span>/ {maxUnits.toLocaleString()}</span>
                        </div>

                        <div className="coord-progress-track">
                          <div
                            className="coord-progress-bar"
                            style={{ width: `${pct}%`, backgroundColor: barColor }}
                          />
                        </div>

                        <div className="coord-inv-footer">
                          <span>Last shipment</span>
                          <strong>
                            {item.last_shipment
                              ? new Date(item.last_shipment).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                              : 'Recent'}
                          </strong>
                        </div>

                        <div className="coord-card-shipment">
                          {primaryItem ? (
                            <>
                              <form
                                className="coord-card-shipment-form"
                                onSubmit={(event) => handleAssignShipment(event, primaryItem)}
                              >
                                {sourceItems.length > 1 && (
                                  <select
                                    className="coord-select"
                                    aria-label={`Select inventory record for ${name}`}
                                    value={shipmentDraft.inventoryId || primaryItem.id}
                                    onChange={(event) => setShipmentDrafts((drafts) => ({
                                      ...drafts,
                                      [primaryItem.id]: { ...shipmentDraft, inventoryId: event.target.value }
                                    }))}
                                  >
                                    {sourceItems.map((sourceItem) => (
                                      <option key={sourceItem.id} value={sourceItem.id}>
                                        {sourceItem.item_description} · {String(sourceItem.id).slice(0, 8)}
                                      </option>
                                    ))}
                                  </select>
                                )}
                                <select
                                  className="coord-select"
                                  aria-label={`Select destination for ${name}`}
                                  value={shipmentDraft.centerId}
                                  onChange={(event) => setShipmentDrafts((drafts) => ({
                                    ...drafts,
                                    [primaryItem.id]: { ...shipmentDraft, centerId: event.target.value }
                                  }))}
                                  required
                                >
                                  <option value="">Select center</option>
                                  {centers.map((center) => (
                                    <option key={center.id} value={center.id}>{center.name}</option>
                                  ))}
                                </select>
                                <input
                                  className="coord-input"
                                  type="number"
                                  min="1"
                                  step="1"
                                  aria-label={`Shipment quantity for ${name}`}
                                  placeholder="Units"
                                  value={shipmentDraft.quantity}
                                  onChange={(event) => setShipmentDrafts((drafts) => ({
                                    ...drafts,
                                    [primaryItem.id]: { ...shipmentDraft, quantity: event.target.value }
                                  }))}
                                  required
                                />
                                <button
                                  className="coord-shipment-assign-btn"
                                  type="submit"
                                  disabled={!centers.length || savingShipmentItemId === primaryItem.id}
                                >
                                  {savingShipmentItemId === primaryItem.id ? 'Assigning…' : 'Assign shipment'}
                                </button>
                              </form>
                              {itemShipments.map((shipment) => (
                                <div className="coord-pending-shipment" key={shipment.id}>
                                  <span>{shipment.quantity} units → {shipment.center_name}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleShipmentArrival(shipment.id)}
                                    disabled={arrivingShipmentId === shipment.id}
                                  >
                                    {arrivingShipmentId === shipment.id ? 'Receiving…' : 'Mark arrived'}
                                  </button>
                                </div>
                              ))}
                            </>
                          ) : (
                            <span className="coord-shipment-hint">Shipment unavailable: this item has no inventory record ID.</span>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </section>
          )}
        </div>

        {/* Right Fixed Analytics Sidebar */}
        <aside className="coord-right-column">
          {/* Consolidated Stats */}
          <section className="coord-panel coord-stats-panel">
            <h2 className="coord-sidebar-heading">CONSOLIDATED STATS</h2>

            <div className="coord-stat-metric-block">
              <span className="coord-stat-label">TOTAL SHELTERED EVACUEES</span>
              <strong className="coord-stat-number blue-text">
              {shelteredEvacueesCount?.toLocaleString() ?? '—'}
              </strong>
            </div>

            <div className="coord-stat-metric-block">
              <span className="coord-stat-label">ACTIVE CAPACITY UTILIZATION</span>
              <strong className="coord-stat-number amber-text">
              {hasCentersData ? `${activeUtilization}%` : '—'}
              </strong>
            </div>

            <div className="coord-stat-metric-block">
              <span className="coord-stat-label">STOCKED HUMANITARIAN PACKS</span>
              <strong className="coord-stat-number green-text">
              {hasInventoryData ? totalStockPacks.toLocaleString() : '—'}
              </strong>
            </div>
          </section>

          {/* Critical Supply Alerts (Derived Logistical Threshold Warnings) */}
          <section className="coord-panel coord-alerts-panel">
            <div className="coord-alert-header">
              <span className="coord-alert-dot" />
              <h2 className="coord-alert-heading">CRITICAL SUPPLY ALERTS</h2>
            </div>

            <div className="coord-alerts-feed">
              {supplyAlerts.length === 0 ? (
                <div className="coord-empty-state small">All inventory and shelter supplies normal.</div>
              ) : (
                supplyAlerts.map((message, idx) => (
                  <div className="coord-alert-row" key={idx}>
                    <span className="coord-alert-line-indicator" />
                    <p className="coord-alert-text">{message}</p>
                  </div>
                ))
              )}
            </div>
          </section>
        </aside>
      </main>
      {isAddInventoryOpen && (
        <div className="coord-inventory-modal-backdrop">
          <section
            className="coord-inventory-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="coord-add-item-title"
          >
            <div className="coord-inventory-modal-header">
              <div>
                <p>MASTER INVENTORY</p>
                <h2 id="coord-add-item-title">Add an item</h2>
              </div>
              <button
                type="button"
                className="coord-inventory-modal-close"
                aria-label="Close add item form"
                onClick={() => setIsAddInventoryOpen(false)}
                disabled={isSavingInventory}
              >
                <X size={18} />
              </button>
            </div>
            <p className="coord-inventory-modal-note">This creates a central inventory item. It will not be assigned to an evacuation center.</p>
            <form className="coord-inventory-form" onSubmit={handleAddInventoryItem}>
              <label>
                Item description
                <input
                  autoFocus
                  className="coord-input"
                  type="text"
                  maxLength={120}
                  placeholder="e.g. Emergency blankets"
                  value={newInventoryItem.item_description}
                  onChange={(event) => setNewInventoryItem((item) => ({ ...item, item_description: event.target.value }))}
                  required
                />
              </label>
              <div className="coord-inventory-number-fields">
                <label>
                  Current stock
                  <input
                    className="coord-input"
                    type="number"
                    min="0"
                    step="1"
                    value={newInventoryItem.current_stock}
                    onChange={(event) => setNewInventoryItem((item) => ({ ...item, current_stock: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Target stock
                  <input
                    className="coord-input"
                    type="number"
                    min="1"
                    step="1"
                    value={newInventoryItem.max_stock}
                    onChange={(event) => setNewInventoryItem((item) => ({ ...item, max_stock: event.target.value }))}
                    required
                  />
                </label>
              </div>
              {inventoryFormError && <p className="coord-inventory-form-error" role="alert">{inventoryFormError}</p>}
              <div className="coord-inventory-form-actions">
                <button
                  type="button"
                  className="coord-inventory-cancel-btn"
                  onClick={() => setIsAddInventoryOpen(false)}
                  disabled={isSavingInventory}
                >
                  Cancel
                </button>
                <button type="submit" className="coord-add-item-btn" disabled={isSavingInventory}>
                  <Plus size={14} />
                  {isSavingInventory ? 'Saving…' : 'Add item'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

export default CoordinatorDashboard 