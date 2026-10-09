import React, { useEffect, useState, useMemo } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import '../styles/coordinator-console.css'

const rawApiBase = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'https://resq-route.onrender.com').replace(/\/$/, '')
const API_BASE_URL = rawApiBase.endsWith('/api/v1') ? rawApiBase.replace(/\/api\/v1$/, '') : rawApiBase
const WS_BASE_URL = API_BASE_URL.replace(/^http/, 'ws')

export const CoordinatorDashboard = ({ auth, onLogout }) => {
  // Navigation tabs: 'centers' | 'registry' | 'inventory'
  const [activeTab, setActiveTab] = useState('centers')

  // Live Backend Data States
  const [centers, setCenters] = useState([])
  const [inventory, setInventory] = useState([])
  const [evacuees, setEvacuees] = useState([])
  const [activeIncidentsCount, setActiveIncidentsCount] = useState(0)
  const [loading, setLoading] = useState(true)

  // Evacuee Registry Filter States
  const [registrySearch, setRegistrySearch] = useState('')
  const [selectedCenterFilter, setSelectedCenterFilter] = useState('all')
  const [selectedPriorityFilter, setSelectedPriorityFilter] = useState('all')

  // Clock & Realtime Telemetry
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const { isConnected } = useWebSocket(`${WS_BASE_URL}/api/v1/ws`)

  const displayName = auth?.user?.full_name || auth?.user?.username || 'Cmdr. Reyes, J.'
  const userRole = auth?.user?.role?.toUpperCase() || 'COMMAND DIRECTOR'
  const [isDark, setIsDark] = useState(() => localStorage.getItem('resq-theme') !== 'light')

useEffect(() => {
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light'
  localStorage.setItem('resq-theme', isDark ? 'dark' : 'light')
}, [isDark])

  // 1-second Philippine Standard Time (PHT) ticker
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const formattedPhtTime = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(currentTime)

  // Fetch live telemetry from backend
  useEffect(() => {
    let isMounted = true

    const fetchAllData = async () => {
      try {
        const [centersRes, invRes, evacRes, incRes] = await Promise.allSettled([
          fetch(`${API_BASE_URL}/api/v1/shelters/?limit=100`),
          fetch(`${API_BASE_URL}/api/v1/inventory/?limit=100`),
          fetch(`${API_BASE_URL}/api/v1/evacuees/?limit=500`),
          fetch(`${API_BASE_URL}/api/v1/incidents/active/count`)
        ])

        if (!isMounted) return

        if (centersRes.status === 'fulfilled' && centersRes.value.ok) {
          const data = await centersRes.value.json()
          setCenters(Array.isArray(data) ? data : [])
        }

        if (invRes.status === 'fulfilled' && invRes.value.ok) {
          const data = await invRes.value.json()
          setInventory(Array.isArray(data) ? data : [])
        }

        if (evacRes.status === 'fulfilled' && evacRes.value.ok) {
          const data = await evacRes.value.json()
          setEvacuees(Array.isArray(data) ? data : [])
        }

        if (incRes.status === 'fulfilled' && incRes.value.ok) {
          const data = await incRes.value.json()
          setActiveIncidentsCount(data.count ?? data.total ?? 0)
        }
      } catch (error) {
        console.error('[RESQ Coordinator] Telemetry sync error:', error)
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
  }, [])

  // Consolidated Math Calculations
  const totalSheltered = useMemo(() => {
    return centers.reduce((sum, c) => sum + (Number(c.current_occupancy) || 0), 0)
  }, [centers])

  const totalCapacity = useMemo(() => {
    return centers.reduce((sum, c) => sum + (Number(c.capacity) || 0), 0)
  }, [centers])

  const activeUtilization = useMemo(() => {
    if (!totalCapacity) return 0
    return Math.min(100, Math.round((totalSheltered / totalCapacity) * 100))
  }, [totalSheltered, totalCapacity])

  const totalStockPacks = useMemo(() => {
    return inventory.reduce((sum, item) => sum + (Number(item.current_stock) || Number(item.quantity) || 0), 0)
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
      const name = item.item_description || item.name || 'Supply Item'
      const status = String(item.status || '').toUpperCase()

      if (status === 'CRITICAL' || current <= 100) {
        alertsList.push(`${name}: only ${current} units left`)
      } else if (status === 'LOW' || current <= 300) {
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

// Derive inventory items filtered by the active center selection
const displayedInventory = useMemo(() => {
  if (!selectedCenterId) return inventory

  return inventory.filter((item) => {
    // Matches center_id or shelter_id from Supabase inventory / center relation
    return (
      item.center_id === selectedCenterId ||
      item.shelter_id === selectedCenterId ||
      String(item.center_id) === String(selectedCenterId)
    )
  })
}, [inventory, selectedCenterId])

// Find active center details for banner display
const activeCenterObj = useMemo(() => {
  return centers.find((c) => c.id === selectedCenterId)
}, [centers, selectedCenterId])






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
    const res = await fetch(`${API_BASE_URL}/api/v1/shelters/${center.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth?.token ? `Bearer ${auth.token}` : undefined
      },
      body: JSON.stringify({
        is_active: newActiveState
      })
    })

    if (!res.ok) throw new Error('Failed to update status')

    setCenters((prev) =>
      prev.map((c) => (c.id === center.id ? { ...c, is_active: newActiveState } : c))
    )
  } catch (err) {
    console.error('Failed to toggle status:', err)
  } finally {
    setUpdatingCenterId(null)
  }
}

  return (
    <div className="coord-dashboard-wrapper">
      {/* 1. Header Bar */}
      <header className="coord-header">
        <div className="coord-header-left">
          <span className="coord-brand-pill">
            <span className="coord-pulse-dot" />
            RESILIENCE
          </span>
          <h1 className="coord-system-title">CSWD EVACUATION &amp; RELIEF LOGISTICS</h1>
        </div>

        <div className="coord-header-right">
            <button
                type="button"
                className="coord-theme-toggle-btn"
                onClick={() => setIsDark((prev) => !prev)}
                title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                aria-label="Toggle Theme"
                >
                {isDark ? '☼' : '☾'}
                </button>
          <div className="coord-telemetry-status">
            <span className={`coord-status-indicator ${isConnected ? 'online' : 'offline'}`} />
            <span>WebSocket: {isConnected ? 'Connected' : 'Disconnected'}</span>
          </div>

          <div className="coord-incident-pill">
            ACTIVE INCIDENTS: {activeIncidentsCount}
          </div>

          <div className="coord-clock">
            {formattedPhtTime} PHT
          </div>

          <div className="coord-profile-badge" onClick={onLogout} title="Click to Logout">
            <div className="coord-avatar-circle">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="coord-profile-meta">
              <span className="coord-profile-name">{displayName}</span>
              <span className="coord-profile-role">{userRole}</span>
            </div>
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
                  <span className="coord-count-tag">{displayedInventory.length} ITEMS TRACKED</span>
                </div>

                <div className="coord-table-scroll">
                  <table className="coord-data-table">
                    <thead>
                      <tr>
                        <th>ITEM DESCRIPTION</th>
                        <th>STOCK RATIO</th>
                        <th>STATUS</th>
                        <th>LAST SHIPMENT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedInventory.length === 0 ? (
                        <tr>
                          <td colSpan="4" className="coord-empty-td">
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
                          
                          const statusRaw = String(item.status || (units <= 100 ? 'CRITICAL' : units <= 300 ? 'LOW' : 'OK')).toUpperCase()
                          const status = statusRaw === 'OK' ? 'ON' : statusRaw
                          const barColor = status === 'CRITICAL' ? '#ef4444' : status === 'LOW' ? '#f59e0b' : '#10b981'

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
                                <span className={`coord-table-status-pill ${status.toLowerCase()}`}>
                                  {status}
                                </span>
                              </td>
                              <td className="coord-date-cell">
                                {item.last_shipment || item.updated_at
                                  ? new Date(item.last_shipment || item.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                  : 'Recent'}
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
                    placeholder="Search name, household ID, or center..."
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
                <span className="coord-count-tag">ALL WAREHOUSES</span>
              </div>

              <div className="coord-inventory-cards-grid">
                {inventory.length === 0 ? (
                  <div className="coord-empty-state">
                    {loading ? 'Loading resource inventory stocks...' : 'No inventory items currently tracked.'}
                  </div>
                ) : (
                  inventory.map((item, idx) => {
                    const name = item.item_description || item.name || 'Unnamed Item'
                    const units = Number(item.current_stock ?? item.quantity ?? item.units ?? 0)
                    const maxUnits = Number(item.max_stock ?? item.max_capacity ?? item.target ?? 1000)
                    const pct = Math.min(100, Math.round((units / maxUnits) * 100))
                    
                    const statusRaw = String(item.status || (units <= 100 ? 'CRITICAL' : units <= 300 ? 'LOW' : 'OK')).toUpperCase()
                    const status = statusRaw === 'OK' ? 'ON' : statusRaw
                    const barColor = status === 'CRITICAL' ? '#ef4444' : status === 'LOW' ? '#f59e0b' : '#10b981'

                    return (
                      <div className="coord-inventory-card" key={item.id || idx}>
                        <div className="coord-inv-top">
                          <h3 className="coord-inv-name">{name}</h3>
                          <span className={`coord-table-status-pill ${status.toLowerCase()}`}>
                            {status}
                          </span>
                        </div>

                        <div className="coord-inv-count-row">
                          <strong>{units}</strong>
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
                            {item.last_shipment || item.updated_at
                              ? new Date(item.last_shipment || item.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                              : 'Recent'}
                          </strong>
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
                {totalSheltered.toLocaleString()}
              </strong>
            </div>

            <div className="coord-stat-metric-block">
              <span className="coord-stat-label">ACTIVE CAPACITY UTILIZATION</span>
              <strong className="coord-stat-number amber-text">
                {activeUtilization}%
              </strong>
            </div>

            <div className="coord-stat-metric-block">
              <span className="coord-stat-label">STOCKED HUMANITARIAN PACKS</span>
              <strong className="coord-stat-number green-text">
                {totalStockPacks.toLocaleString()}
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
    </div>
  )
}

export default CoordinatorDashboard 