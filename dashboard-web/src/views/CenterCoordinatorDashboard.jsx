import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BrowserQRCodeReader } from '@zxing/browser'
import { useWebSocket } from '../hooks/useWebSocket'
import { Activity, ChevronDown, LogOut, MapPin, Package, QrCode, Users } from 'lucide-react'
import Logo from '../components/Logo'
import {
  fetchAssignedCenter,
  fetchAssignedCenterEvacuees,
  fetchAssignedCenterInventory,
  checkInEvacuationHousehold
} from '../lib/centerCoordinator'
import {
  fetchPendingInventoryShipments,
  markInventoryShipmentArrived
} from '../lib/inventoryShipments'
import { fetchActiveAlertsCount } from '../lib/supabase'
import { WS_URL } from '../dataProvider'
import '../styles/coordinator-console.css'

const rawApiBase = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'https://resq-route.onrender.com').replace(/\/$/, '')
const API_BASE_URL = rawApiBase.endsWith('/api/v1') ? rawApiBase.replace(/\/api\/v1$/, '') : rawApiBase

const SkeletonLine = ({ className = '' }) => (
  <span className={`coord-skeleton ${className}`} aria-hidden="true" />
)

const SkeletonTableRows = ({ columns, prefix, count = 5 }) => (
  <>
    {Array.from({ length: count }, (_, rowIndex) => (
      <tr className="coord-skeleton-table-row" key={`${prefix}-${rowIndex}`} aria-hidden="true">
        {Array.from({ length: columns }, (_, cellIndex) => (
          <td key={cellIndex}>
            <SkeletonLine className={`coord-skeleton-cell ${cellIndex === 0 ? 'coord-skeleton-cell-short' : ''} ${cellIndex === 1 ? 'coord-skeleton-cell-long' : ''}`} />
          </td>
        ))}
      </tr>
    ))}
  </>
)

const CenterCoordinatorDashboard = ({ auth, onLogout }) => {
  const centerId = auth?.user?.assigned_center_id
  const token = auth?.token || auth?.access_token
  const [center, setCenter] = useState(null)
  const [evacuees, setEvacuees] = useState([])
  const [inventory, setInventory] = useState([])
  const [shipments, setShipments] = useState([])
  const [activeAlertsCount, setActiveAlertsCount] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [arrivingShipmentId, setArrivingShipmentId] = useState(null)
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false)
  const [isCheckingIn, setIsCheckingIn] = useState(false)
  const [scannerError, setScannerError] = useState('')
  const [checkInResult, setCheckInResult] = useState(null)
  const videoRef = useRef(null)
  const lastScannedValueRef = useRef('')
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const profileMenuRef = useRef(null)
  const { isConnected } = useWebSocket(WS_URL)

  const displayName = auth?.user?.full_name || auth?.user?.username || 'Center Coordinator'
  const formattedPhtTime = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(currentTime)

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

  const refreshCenterData = useCallback(async () => {
    if (!centerId) {
      setLoading(false)
      return
    }

    const [centerResult, evacueesResult, inventoryResult, shipmentsResult] = await Promise.allSettled([
      fetchAssignedCenter(token),
      fetchAssignedCenterEvacuees(token),
      fetchAssignedCenterInventory(token),
      fetchPendingInventoryShipments(token)
    ])

    const failures = []
    if (centerResult.status === 'fulfilled') setCenter(centerResult.value)
    else failures.push('center details')
    if (evacueesResult.status === 'fulfilled') setEvacuees(evacueesResult.value)
    else failures.push('evacuee records')
    if (inventoryResult.status === 'fulfilled') setInventory(inventoryResult.value)
    else failures.push('center inventory')
    if (shipmentsResult.status === 'fulfilled') {
      setShipments(shipmentsResult.value)
    } else {
      failures.push('pending shipments')
    }

    if (failures.length) {
      console.error('[RESQ Center Coordinator] Failed to refresh:', {
        center: centerResult.status === 'rejected' ? centerResult.reason : undefined,
        evacuees: evacueesResult.status === 'rejected' ? evacueesResult.reason : undefined,
        inventory: inventoryResult.status === 'rejected' ? inventoryResult.reason : undefined,
        shipments: shipmentsResult.status === 'rejected' ? shipmentsResult.reason : undefined
      })
      setError(`Could not load ${failures.join(', ')}. Check your connection and refresh.`)
    } else {
      setError('')
    }
    setLoading(false)
  }, [centerId, token])

  useEffect(() => {
    refreshCenterData()
    const interval = setInterval(refreshCenterData, 15000)
    return () => clearInterval(interval)
  }, [refreshCenterData])

  useEffect(() => {
    let isMounted = true

    const refreshActiveAlerts = async () => {
      try {
        const count = await fetchActiveAlertsCount()
        if (isMounted) setActiveAlertsCount(count)
      } catch (alertError) {
        console.error('[RESQ Center Coordinator] Failed to fetch active alert count:', alertError)
        if (isMounted) setActiveAlertsCount(null)
      }
    }

    refreshActiveAlerts()
    const interval = setInterval(refreshActiveAlerts, 30000)
    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [])

  const handleQrCodeDetected = useCallback(async (rawValue) => {
    if (lastScannedValueRef.current === rawValue) return
    lastScannedValueRef.current = rawValue
    setScannerError('')
    setCheckInResult(null)

    let payload
    try {
      payload = JSON.parse(rawValue)
    } catch {
      setScannerError('This is not a valid RESQ-ROUTE check-in QR code.')
      setIsQrScannerOpen(false)
      return
    }
    if (
      payload?.type !== 'resq-route-evacuation-check-in' ||
      payload?.version !== 1 ||
      Number(payload?.center?.id) !== Number(centerId)
    ) {
      setScannerError('This QR code is invalid or was created for a different evacuation center.')
      setIsQrScannerOpen(false)
      return
    }

    setIsCheckingIn(true)
    try {
      const result = await checkInEvacuationHousehold(token, payload)
      setCheckInResult(result)
      setIsQrScannerOpen(false)
      await refreshCenterData()
    } catch (checkInError) {
      console.error('[RESQ Center Coordinator] Household QR check-in failed:', checkInError)
      setScannerError(checkInError.message || 'Could not check in this household.')
      setIsQrScannerOpen(false)
    } finally {
      setIsCheckingIn(false)
    }
  }, [centerId, refreshCenterData, token])

  useEffect(() => {
    if (!isQrScannerOpen || activeTab !== 'evacuees' || !videoRef.current) return undefined
    let isActive = true
    let scannerControls
    const reader = new BrowserQRCodeReader()

    reader.decodeFromVideoDevice(undefined, videoRef.current, (result, decodeError) => {
      if (result && isActive) {
        isActive = false
        scannerControls?.stop()
        handleQrCodeDetected(result.getText())
      } else if (
        decodeError &&
        !['NotFoundException', 'ChecksumException', 'FormatException'].includes(decodeError.name)
      ) {
        console.error('[RESQ Center Coordinator] QR scanner error:', decodeError)
      }
    }).then((controls) => {
      scannerControls = controls
      if (!isActive) controls.stop()
    }).catch((cameraError) => {
      if (!isActive) return
      console.error('[RESQ Center Coordinator] Could not start QR scanner:', cameraError)
      setScannerError(cameraError.message || 'Could not access a camera. Check the browser permission and try again.')
      setIsQrScannerOpen(false)
    })

    return () => {
      isActive = false
      scannerControls?.stop()
    }
  }, [activeTab, handleQrCodeDetected, isQrScannerOpen])

  const activeOccupancy = Number(center?.current_occupancy) || 0
  const capacity = Number(center?.capacity) || 0
  const occupancyPercent = capacity
    ? Math.min(100, Math.round((activeOccupancy / capacity) * 100))
    : 0
  const totalStock = useMemo(
    () => inventory.reduce((sum, item) => sum + Number(item.current_stock ?? item.quantity ?? 0), 0),
    [inventory]
  )
  const centerShipments = useMemo(
    () => shipments.filter((shipment) => String(shipment.center_id) === String(centerId)),
    [shipments, centerId]
  )
  const supplyAlerts = useMemo(() => {
    const alerts = []
    if (capacity && occupancyPercent >= 85) {
      alerts.push(`${center?.name || 'This center'} is ${occupancyPercent}% full.`)
    }
    inventory.forEach((item) => {
      const current = Number(item.current_stock ?? item.quantity ?? 0)
      const target = Number(item.max_stock ?? item.target ?? 0)
      const status = String(item.status || (
        target > 0 && current / target >= 0.5 ? 'OK'
          : target > 0 && current / target >= 0.15 ? 'LOW'
            : 'CRITICAL'
      )).toUpperCase()
      const name = item.item_description || item.name || 'Supply item'
      if (status === 'CRITICAL') alerts.push(`${name}: critically low (${current} units).`)
      else if (status === 'LOW') alerts.push(`${name}: running low (${current} units).`)
    })
    return alerts
  }, [capacity, center?.name, inventory, occupancyPercent])

  const handleShipmentArrival = async (shipmentId) => {
    setError('')
    setArrivingShipmentId(shipmentId)
    try {
      await markInventoryShipmentArrived(token, shipmentId)
      await refreshCenterData()
    } catch (arrivalError) {
      console.error('[RESQ Center Coordinator] Failed to receive shipment:', arrivalError)
      setError('Could not mark this shipment as arrived. Center stock was not changed; try again.')
    } finally {
      setArrivingShipmentId(null)
    }
  }

  const renderInventoryCard = (item, index) => {
    const stock = Number(item.current_stock ?? item.quantity ?? 0)
    const target = Number(item.max_stock ?? item.target ?? 0)
    const percent = target > 0 ? Math.min(100, Math.round((stock / target) * 100)) : 0
    const status = String(item.status || (
      target > 0 && stock / target >= 0.5 ? 'OK'
        : target > 0 && stock / target >= 0.15 ? 'LOW'
          : 'CRITICAL'
    )).toUpperCase()
    const statusClass = status === 'OK' ? 'on' : status.toLowerCase()
    const barColor = status === 'CRITICAL' ? '#ef4444' : status === 'LOW' ? '#f59e0b' : '#10b981'

    return (
      <article className="coord-inventory-card" key={item.inventory_id || item.id || index}>
        <div className="coord-inv-top">
          <h3 className="coord-inv-name">{item.item_description || item.name || 'Unnamed item'}</h3>
          <span className={`coord-table-status-pill ${statusClass}`}>{status}</span>
        </div>
        <div className="coord-inv-count-row">
          <strong>{stock.toLocaleString()}</strong>
          <span>/ {target.toLocaleString()}</span>
        </div>
        <div className="coord-progress-track">
          <div className="coord-progress-bar" style={{ width: `${percent}%`, backgroundColor: barColor }} />
        </div>
        <div className="coord-inv-footer">
          <span>Last shipment</span>
          <strong>
            {item.last_shipment
              ? new Date(item.last_shipment).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' })
              : 'Not recorded'}
          </strong>
        </div>
      </article>
    )
  }

  const tabs = [
    { id: 'overview', label: 'CENTER OVERVIEW' },
    { id: 'evacuees', label: 'EVACUEE REGISTRY' },
    { id: 'inventory', label: 'RESOURCE INVENTORY' },
    { id: 'shipments', label: 'INCOMING SHIPMENTS' }
  ]

  return (
    <div className="coord-dashboard-wrapper center-coordinator-dashboard">
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
          <div
            className="coord-incident-pill"
            aria-label={`Active alerts: ${activeAlertsCount ?? 'unavailable'}`}
            title={`Active alerts: ${activeAlertsCount ?? 'unavailable'}`}
          >
            <span className="coord-incident-label">ACTIVE ALERTS:</span>
            <span>{loading && activeAlertsCount == null ? <SkeletonLine className="coord-skeleton-alert-count" /> : activeAlertsCount ?? '—'}</span>
          </div>
          <div className="coord-clock">{formattedPhtTime} PHT</div>
          <div className="center-coordinator-profile-menu" ref={profileMenuRef}>
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
                <span className="coord-profile-role">CENTER COORDINATOR</span>
              </span>
              <ChevronDown size={14} aria-hidden="true" />
            </button>
            {isProfileMenuOpen && (
              <div className="center-coordinator-profile-dropdown" role="menu">
                <span className="center-coordinator-dropdown-name">{displayName}</span>
                <button
                  type="button"
                  role="menuitem"
                  className="center-coordinator-logout"
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

      {centerId && (
        <nav className="coord-nav-tabs" aria-label="Center coordinator sections">
          {tabs.map((tab) => (
            <button
              type="button"
              key={tab.id}
              className={`coord-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      )}

      {!centerId ? (
        <main className="coord-main-grid center-coordinator-empty-grid">
          <section className="coord-panel center-coordinator-empty">
            <h2>No evacuation center assigned</h2>
            <p>Ask a global coordinator to assign your account to an evacuation center, then sign in again.</p>
          </section>
        </main>
      ) : (
        <main className="coord-main-grid center-coordinator-main-grid">
          <div className="coord-left-column coord-tab-panel-enter" key={activeTab}>
            {error && <p className="coord-shipment-error" role="alert">{error}</p>}

            {activeTab === 'overview' && (
              <>
                <section className="coord-panel coord-sites-panel">
                  <div className="coord-panel-header">
                    <h2 className="coord-panel-title">YOUR EVACUATION CENTER</h2>
                    <span className="coord-count-tag">CENTER #{centerId}</span>
                  </div>
                  {loading && !center ? (
                    <article className="coord-site-card center-coordinator-site-card coord-site-skeleton" role="status" aria-label="Loading assigned evacuation center">
                      <div className="coord-site-top">
                        <div className="coord-site-skeleton-copy">
                          <SkeletonLine className="coord-skeleton-title" />
                          <SkeletonLine className="coord-skeleton-address" />
                        </div>
                        <SkeletonLine className="coord-skeleton-status" />
                      </div>
                      <div className="coord-site-occupancy-row">
                        <SkeletonLine className="coord-skeleton-occupancy" />
                        <SkeletonLine className="coord-skeleton-percent" />
                      </div>
                      <SkeletonLine className="coord-skeleton-progress" />
                      <div className="coord-center-overview-metrics">
                        {Array.from({ length: 3 }, (_, index) => (
                          <div key={index}><SkeletonLine className="coord-skeleton-metric" /><SkeletonLine className="coord-skeleton-label" /></div>
                        ))}
                      </div>
                    </article>
                  ) : center ? (
                    <article className="coord-site-card center-coordinator-site-card">
                      <div className="coord-site-top">
                        <div>
                          <h3 className="coord-site-name">{center.name}</h3>
                          <p className="coord-site-address"><MapPin size={12} /> {center.address || 'Address unavailable'}</p>
                        </div>
                        <span className={`coord-site-status-btn ${center.is_active === false ? 'is-closed' : 'is-open'}`}>
                          <span className="coord-status-indicator-dot" />
                          {center.is_active === false ? 'CLOSED' : 'OPEN'}
                        </span>
                      </div>
                      <div className="coord-site-occupancy-row">
                        <span>{activeOccupancy.toLocaleString()} / {capacity.toLocaleString()} BED OCCUPIED</span>
                        <span>{capacity ? `${occupancyPercent}%` : '—'}</span>
                      </div>
                      <div className="coord-progress-track">
                        <div
                          className="coord-progress-bar"
                          style={{
                            width: `${occupancyPercent}%`,
                            backgroundColor: occupancyPercent >= 85 ? '#ef4444' : '#10b981'
                          }}
                        />
                      </div>
                      <div className="coord-center-overview-metrics">
                        <div><Users size={15} /><strong>{activeOccupancy.toLocaleString()}</strong><span>EVACUEES</span></div>
                        <div><Package size={15} /><strong>{totalStock.toLocaleString()}</strong><span>SUPPLY UNITS</span></div>
                        <div><Activity size={15} /><strong>{centerShipments.length}</strong><span>PENDING SHIPMENTS</span></div>
                      </div>
                    </article>
                  ) : (
                    <div className="coord-empty-state">{loading ? 'Loading assigned center…' : 'Assigned center could not be found.'}</div>
                  )}
                </section>

                <section className="coord-panel center-coordinator-section">
                  <div className="coord-panel-header">
                    <h2 className="coord-panel-title">INCOMING SHIPMENTS</h2>
                    <button type="button" className="coord-clear-filter-btn" onClick={() => setActiveTab('shipments')}>
                      View all shipments
                    </button>
                  </div>
                  {loading ? (
                    <div className="coord-center-shipment-skeletons" role="status" aria-label="Loading incoming shipments">
                      {Array.from({ length: 3 }, (_, index) => (
                        <div className="coord-center-shipment-row" key={index}>
                          <span><SkeletonLine className="coord-skeleton-shipment-title" /><SkeletonLine className="coord-skeleton-shipment-meta" /></span>
                          <SkeletonLine className="coord-skeleton-shipment-action" />
                        </div>
                      ))}
                    </div>
                  ) : centerShipments.length ? centerShipments.slice(0, 4).map((shipment) => (
                    <div className="coord-center-shipment-row" key={shipment.id}>
                      <span><strong>{shipment.item_description}</strong><small>{shipment.quantity} units · {shipment.created_at ? new Date(shipment.created_at).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' }) : 'Date unavailable'}</small></span>
                      <button
                        type="button"
                        className="coord-shipment-assign-btn"
                        onClick={() => handleShipmentArrival(shipment.id)}
                        disabled={arrivingShipmentId === shipment.id}
                      >
                        {arrivingShipmentId === shipment.id && <span className="coord-loading-spinner" aria-hidden="true" />}
                        {arrivingShipmentId === shipment.id ? 'Receiving…' : 'Mark arrived'}
                      </button>
                    </div>
                  )) : (
                    <div className="coord-empty-state">{loading ? 'Loading pending shipments…' : 'No pending shipments for this center.'}</div>
                  )}
                </section>
              </>
            )}

            {activeTab === 'evacuees' && (
              <section className="coord-panel coord-full-tab-panel">
                <div className="coord-panel-header">
                  <h2 className="coord-panel-title">EVACUEE REGISTRY — {center?.name?.toUpperCase() || 'ASSIGNED CENTER'}</h2>
                  <div className="coord-evacuee-header-actions">
                    <span className="coord-count-tag">{evacuees.length} CURRENT EVACUEES</span>
                    <button
                      type="button"
                      className="coord-evacuee-scan-btn"
                      onClick={() => {
                        setScannerError('')
                        setCheckInResult(null)
                        lastScannedValueRef.current = ''
                        setIsQrScannerOpen((open) => !open)
                      }}
                      disabled={isCheckingIn}
                      aria-busy={isCheckingIn}
                    >
                      <QrCode size={16} aria-hidden="true" />
                      {isCheckingIn && <span className="coord-loading-spinner" aria-hidden="true" />}
                      {isCheckingIn ? 'Recording check-in…' : isQrScannerOpen ? 'Close scanner' : 'Scan check-in QR'}
                    </button>
                  </div>
                </div>
                {checkInResult && (
                  <div className="coord-checkin-success" role="status">
                    <div className="coord-checkin-success-heading">
                      <div>
                        <strong>Household checked in successfully</strong>
                        <span>{checkInResult.household_name || 'Household'} · {checkInResult.checked_in_count} {checkInResult.checked_in_count === 1 ? 'person' : 'people'} checked in</span>
                      </div>
                      <button type="button" onClick={() => setCheckInResult(null)} aria-label="Dismiss check-in confirmation">×</button>
                    </div>
                    <ul>
                      {checkInResult.members.map((member) => (
                        <li key={member.id}>{member.name}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {scannerError && (
                  <div className="coord-checkin-error" role="alert">
                    <span>{scannerError}</span>
                    <button type="button" onClick={() => setScannerError('')} aria-label="Dismiss scanner error">×</button>
                  </div>
                )}
                {isQrScannerOpen && (
                  <div className="coord-qr-scanner">
                    <div className="coord-qr-scanner-copy">
                      <strong>{isCheckingIn ? 'Recording household check-in…' : 'Scan the resident’s check-in QR code'}</strong>
                      <span>Keep the QR code centered in the camera frame.</span>
                    </div>
                    <video ref={videoRef} className="coord-qr-scanner-video" muted playsInline aria-label="QR code camera preview" />
                  </div>
                )}
                <div className="coord-table-scroll">
                  <table className="coord-data-table">
                    <thead>
                      <tr><th>HOUSEHOLD / ID</th><th>NAME</th><th>MEMBERS</th><th>MEDICAL ATTENTION</th><th>CHECKED IN</th></tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <SkeletonTableRows columns={5} prefix="center-registry" />
                      ) : evacuees.length ? evacuees.map((evacuee, index) => (
                        <tr key={evacuee.id || index}>
                          <td className="coord-mono-id">{evacuee.household_id || evacuee.id || `HH-${1000 + index}`}</td>
                          <td className="coord-item-name">{evacuee.head_of_household || evacuee.head_name || evacuee.name || 'Not recorded'}</td>
                          <td>{evacuee.members_count || evacuee.family_size || 1}</td>
                          <td>{evacuee.needs_medical_attention ? 'Yes' : 'No'}</td>
                          <td className="coord-date-cell">
                            {evacuee.checked_in_at || evacuee.check_in_time
                              ? new Date(evacuee.checked_in_at || evacuee.check_in_time).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })
                              : 'Not recorded'}
                          </td>
                        </tr>
                      )) : (
                        <tr><td colSpan="5" className="coord-empty-td">{loading ? 'Loading evacuee records…' : 'No current evacuees recorded.'}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {activeTab === 'inventory' && (
              <section className="coord-panel coord-full-tab-panel">
                <div className="coord-panel-header">
                  <h2 className="coord-panel-title">RESOURCE INVENTORY — {center?.name?.toUpperCase() || 'ASSIGNED CENTER'}</h2>
                  <span className="coord-count-tag">{inventory.length} ITEMS TRACKED</span>
                </div>
                <div className="coord-inventory-cards-grid">
                  {loading ? (
                    <div className="coord-inventory-skeleton-grid" role="status" aria-label="Loading center inventory">
                      {Array.from({ length: 4 }, (_, index) => (
                        <div className="coord-inventory-card coord-inventory-skeleton" key={index}>
                          <div className="coord-inv-top">
                            <SkeletonLine className="coord-skeleton-title" />
                            <SkeletonLine className="coord-skeleton-status" />
                          </div>
                          <div className="coord-inv-count-row"><SkeletonLine className="coord-skeleton-inventory-count" /></div>
                          <SkeletonLine className="coord-skeleton-progress" />
                          <div className="coord-inv-footer">
                            <SkeletonLine className="coord-skeleton-label" />
                            <SkeletonLine className="coord-skeleton-date" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : inventory.length ? inventory.map(renderInventoryCard) : (
                    <div className="coord-empty-state">{loading ? 'Loading center inventory…' : 'No inventory assigned to this center.'}</div>
                  )}
                </div>
              </section>
            )}

            {activeTab === 'shipments' && (
              <section className="coord-panel coord-full-tab-panel">
                <div className="coord-panel-header">
                  <h2 className="coord-panel-title">INCOMING SHIPMENTS — {center?.name?.toUpperCase() || 'ASSIGNED CENTER'}</h2>
                  <span className="coord-count-tag">{centerShipments.length} AWAITING RECEIPT</span>
                </div>
                <div className="coord-table-scroll">
                  <table className="coord-data-table">
                    <thead>
                      <tr><th>ITEM</th><th>QUANTITY</th><th>ASSIGNED</th><th>ACTION</th></tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <SkeletonTableRows columns={4} prefix="center-shipments" />
                      ) : centerShipments.length ? centerShipments.map((shipment) => (
                        <tr key={shipment.id}>
                          <td className="coord-item-name">{shipment.item_description}</td>
                          <td>{Number(shipment.quantity).toLocaleString()}</td>
                          <td className="coord-date-cell">
                            {shipment.created_at
                              ? new Date(shipment.created_at).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })
                              : 'Not recorded'}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="coord-shipment-assign-btn"
                              onClick={() => handleShipmentArrival(shipment.id)}
                              disabled={arrivingShipmentId === shipment.id}
                            >
                              {arrivingShipmentId === shipment.id && <span className="coord-loading-spinner" aria-hidden="true" />}
                              {arrivingShipmentId === shipment.id ? 'Receiving…' : 'Mark arrived'}
                            </button>
                          </td>
                        </tr>
                      )) : (
                        <tr><td colSpan="4" className="coord-empty-td">{loading ? 'Loading pending shipments…' : 'No pending shipments for this center.'}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>

          <aside className="coord-right-column">
            <section className="coord-panel coord-stats-panel">
              <h2 className="coord-sidebar-heading">{center?.name?.toUpperCase() || 'CENTER'} STATS</h2>
              <div className="coord-stat-metric-block">
                <span className="coord-stat-label">TOTAL SHELTERED EVACUEES</span>
                <strong className="coord-stat-number blue-text">{loading ? <SkeletonLine className="coord-skeleton-stat" /> : activeOccupancy.toLocaleString()}</strong>
              </div>
              <div className="coord-stat-metric-block">
                <span className="coord-stat-label">ACTIVE CAPACITY UTILIZATION</span>
                <strong className="coord-stat-number amber-text">{loading ? <SkeletonLine className="coord-skeleton-stat" /> : capacity ? `${occupancyPercent}%` : '—'}</strong>
              </div>
              <div className="coord-stat-metric-block">
                <span className="coord-stat-label">STOCKED HUMANITARIAN PACKS</span>
                <strong className="coord-stat-number green-text">{loading ? <SkeletonLine className="coord-skeleton-stat" /> : totalStock.toLocaleString()}</strong>
              </div>
            </section>

            <section className="coord-panel coord-alerts-panel">
              <div className="coord-alert-header">
                <span className="coord-alert-dot" />
                <h2 className="coord-alert-heading">CENTER SUPPLY ALERTS</h2>
              </div>
              <div className="coord-alerts-feed">
                {loading ? (
                  <div className="coord-alert-skeletons" role="status" aria-label="Loading center supply alerts">
                    {Array.from({ length: 3 }, (_, index) => (
                      <div className="coord-alert-row" key={index}>
                        <span className="coord-alert-line-indicator" />
                        <SkeletonLine className="coord-skeleton-alert" />
                      </div>
                    ))}
                  </div>
                ) : supplyAlerts.length ? supplyAlerts.map((message, index) => (
                  <div className="coord-alert-row" key={`${message}-${index}`}>
                    <span className="coord-alert-line-indicator" />
                    <p className="coord-alert-text">{message}</p>
                  </div>
                )) : (
                  <div className="coord-empty-state small">
                    {loading ? 'Checking center status…' : 'Center capacity and inventory levels are normal.'}
                  </div>
                )}
              </div>
            </section>
          </aside>
        </main>
      )}
    </div>
  )
}

export default CenterCoordinatorDashboard
