import React, { useState } from 'react';
import {
  AlertTriangle,
  Map,
  ClipboardList,
  Bluetooth,
  UploadCloud,
  Menu,
  ChevronDown,
  User,
  MapPin,
  Users,
  Waves,
  Navigation,
  ExternalLink,
  Check,
  RotateCcw,
  MessageSquare,
} from 'lucide-react';

const RescuerDashboard = () => {
  const [activeView, setActiveView] = useState('alert');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const navItems = [
    { id: 'alert', label: 'Assignment Alert', icon: AlertTriangle },
    { id: 'nav', label: 'Tactical Map', icon: Map },
    { id: 'status', label: 'Status Report', icon: ClipboardList },
    { id: 'scanner', label: 'BLE Scanner', icon: Bluetooth },
    { id: 'sync', label: 'Sync & Upload', icon: UploadCloud },
  ];

  const quickActions = [
    { icon: Map, label: 'Open Tactical Map', subtext: 'View route and hazards' },
    { icon: MessageSquare, label: 'Team Communication', subtext: 'Send message to team' },
    { icon: UploadCloud, label: 'Sync & Upload', subtext: 'Upload latest tracking data' },
  ];

  return (
    <div style={{ backgroundColor: '#070b14', color: '#cbd5e1', height: '100vh', width: '100%', display: 'flex', overflow: 'hidden', fontFamily: 'sans-serif', fontSize: '14px' }}>

      {/* SIDEBAR NAVIGATION */}
      <aside
        style={{
          backgroundColor: '#070b14',
          borderRight: '1px solid #1e293b',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 20,
          flexShrink: 0,
          transition: 'width 300ms',
          width: isSidebarOpen ? '240px' : '64px'
        }}
      >
        <div style={{ height: '64px', padding: '0 16px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden', opacity: isSidebarOpen ? 1 : 0, width: isSidebarOpen ? 'auto' : 0, transition: 'opacity 300ms' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '9999px', backgroundColor: '#f59e0b', boxShadow: '0 0 8px #f59e0b', flexShrink: 0 }} />
            <div style={{ whiteSpace: 'nowrap', lineHeight: 1.2 }}>
              <h1 style={{ fontSize: '13px', fontWeight: 'bold', color: '#f1f5f9', letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>Resilience</h1>
              <p style={{ fontSize: '9px', color: '#64748b', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '2px', margin: 0 }}>Field Command UI</p>
            </div>
          </div>
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: '6px', borderRadius: '6px' }}
            title={isSidebarOpen ? 'Collapse Sidebar' : 'Expand Sidebar'}
          >
            <Menu style={{ width: '16px', height: '16px' }} />
          </button>
        </div>

        <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto', overflowX: 'hidden' }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                title={!isSidebarOpen ? item.label : ''}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  border: isActive ? '1px solid rgba(245, 158, 11, 0.7)' : '1px solid transparent',
                  backgroundColor: isActive ? 'rgba(30, 41, 59, 0.7)' : 'transparent',
                  color: isActive ? '#f59e0b' : '#94a3b8',
                  transition: 'all 150ms'
                }}
              >
                <Icon style={{ width: '16px', height: '16px', flexShrink: 0, marginRight: isSidebarOpen ? '12px' : 'auto', marginLeft: isSidebarOpen ? 0 : 'auto', color: isActive ? '#f59e0b' : '#64748b' }} />
                {isSidebarOpen && (
                  <span style={{ fontWeight: 'bold', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '11px', whiteSpace: 'nowrap' }}>
                    {item.label}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* ACTIVE UNIT FOOTER */}
        {isSidebarOpen && (
          <div style={{ padding: '16px', borderTop: '1px solid #1e293b', backgroundColor: 'rgba(15, 23, 42, 0.4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <User style={{ width: '16px', height: '16px', color: '#22d3ee' }} />
                <div>
                  <p style={{ fontSize: '9px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold', margin: '0 0 2px 0' }}>Active Unit</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '9999px', backgroundColor: '#06b6d4' }} />
                    <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#22d3ee' }}>Unit Bravo</span>
                  </div>
                </div>
              </div>
              <ChevronDown style={{ width: '16px', height: '16px', color: '#64748b' }} />
            </div>
            <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', fontWeight: 500, color: '#64748b' }}>
              <p style={{ margin: 0 }}>Medic · Rescue Ops 2</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '9999px', backgroundColor: '#06b6d4' }} />
                <span style={{ color: '#22d3ee' }}>Uplink Secure</span>
              </div>
              <p style={{ fontFamily: 'monospace', color: '#475569', margin: 0 }}>14:32:00 PHT</p>
            </div>
          </div>
        )}
      </aside>

      {/* MAIN CONTENT AREA */}
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', backgroundColor: '#070b14' }}>

        {/* Top Header */}
        <header style={{ height: '64px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', zIndex: 10, flexShrink: 0 }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#f1f5f9', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>Assignment Alert</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', fontSize: '12px', fontWeight: 600 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '9999px', backgroundColor: '#06b6d4' }} />
              <span style={{ color: '#22d3ee' }}>Uplink Secure</span>
            </div>
            <div style={{ fontFamily: 'monospace', color: '#64748b' }}>14:32:00 PHT</div>
            <div style={{ width: '28px', height: '28px', borderRadius: '9999px', backgroundColor: '#1e293b', border: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 'bold', color: '#cbd5e1' }}>
              A
            </div>
          </div>
        </header>

        {/* Scrollable Viewport */}
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '20px' }}>
          {activeView === 'alert' && (
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', alignItems: 'start', width: '100%' }}>

              {/* LEFT COLUMN */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>

                {/* New Assignment Banner */}
                <div style={{
                  border: '1px solid rgba(245, 158, 11, 0.5)',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  backgroundColor: 'rgba(245, 158, 11, 0.05)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <AlertTriangle style={{ width: '24px', height: '24px', color: '#f59e0b', flexShrink: 0 }} />
                    <div>
                      <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#fbbf24', letterSpacing: '0.025em', textTransform: 'uppercase', margin: 0 }}>New Assignment</h3>
                      <p style={{ fontSize: '12px', color: 'rgba(252, 211, 77, 0.7)', fontWeight: 600, marginTop: '2px', margin: 0 }}>Acknowledge required within 60 seconds.</p>
                    </div>
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: '800', color: '#ef4444', border: '1px solid #dc2626', padding: '4px 12px', borderRadius: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Critical
                  </span>
                </div>

                {/* MAIN INCIDENT CARD */}
                <div style={{ backgroundColor: '#0b1120', borderRadius: '8px', padding: '16px', border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: '16px' }}>

                  {/* Incident Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid #1e293b' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#22d3ee' }}>
                      <ClipboardList style={{ width: '20px', height: '20px' }} />
                      <span style={{ fontSize: '18px', fontWeight: '900', letterSpacing: '0.05em' }}>#INC-1847</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px', fontWeight: 600, color: '#94a3b8' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <MapPin style={{ width: '16px', height: '16px' }} />
                        <span>0.8 km away</span>
                      </span>
                      <span style={{ color: '#cbd5e1' }}>Est. 3 min</span>
                    </div>
                  </div>

                  {/* Location & Victim Count */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <h4 style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', margin: '0 0 6px 0' }}>Location</h4>
                      <p style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff', margin: 0 }}>Brgy. San Miguel, Zone 4</p>
                    </div>
                    <div>
                      <h4 style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', margin: '0 0 6px 0' }}>Victim Count</h4>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Users style={{ width: '16px', height: '16px', color: '#64748b' }} />
                        <p style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff', margin: 0 }}>3 Persons Trapped</p>
                      </div>
                    </div>
                  </div>

                  {/* Info Grid */}
                  <div style={{ border: '1px solid #1e293b', borderRadius: '8px', padding: '14px', backgroundColor: '#070b14', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '16px', alignItems: 'center', fontSize: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <Waves style={{ width: '20px', height: '20px', color: '#f59e0b', flexShrink: 0 }} />
                      <div>
                        <p style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 'bold', margin: 0 }}>Mobility</p>
                        <p style={{ color: '#e2e8f0', margin: '2px 0 0 0' }}>Elderly, wheelchair-bound</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <Waves style={{ width: '20px', height: '20px', color: '#60a5fa', flexShrink: 0 }} />
                      <div>
                        <p style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 'bold', margin: 0 }}>Water Level</p>
                        <p style={{ color: '#60a5fa', margin: '2px 0 0 0' }}>Rising Fast</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <Navigation style={{ width: '20px', height: '20px', color: '#22d3ee', flexShrink: 0 }} />
                      <div>
                        <p style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 'bold', margin: 0 }}>Live Navigation</p>
                        <p style={{ color: '#22d3ee', margin: '2px 0 0 0' }}>Path Active</p>
                      </div>
                    </div>
                    <div style={{ gridColumn: 'span 3', display: 'flex', justifyContent: 'flex-end', marginTop: '-4px' }}>
                      <button style={{ color: '#22d3ee', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid rgba(8, 145, 178, 0.5)', padding: '6px 12px', borderRadius: '6px', backgroundColor: 'transparent', cursor: 'pointer' }}>
                        <span>View Map</span>
                        <ExternalLink style={{ width: '14px', height: '14px' }} />
                      </button>
                    </div>
                  </div>

                  {/* Special Instructions */}
                  <div style={{ position: 'relative', paddingTop: '12px', borderTop: '1px solid #1e293b' }}>
                    <h4 style={{ fontSize: '11px', fontWeight: 'bold', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', margin: '0 0 6px 0' }}>Special Instructions</h4>
                    <p style={{ fontSize: '14px', color: 'rgba(245, 158, 11, 0.9)', fontWeight: 600, lineHeight: 1.6, width: '83%', margin: 0 }}>
                      Elderly person, wheelchair-bound. Water level rising fast. Approach with heavy-duty raft.
                    </p>
                    <ClipboardList style={{ width: '20px', height: '20px', color: '#475569', position: 'absolute', top: '12px', right: '8px' }} />
                  </div>

                  {/* Trend Chart */}
                  <div style={{ paddingTop: '16px', borderTop: '1px solid #1e293b' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <h4 style={{ fontSize: '11px', fontWeight: 'bold', color: '#f1f5f9', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                        Live Elevation &amp; Water Level Trend
                      </h4>
                      <p style={{ fontSize: '12px', fontWeight: 500, color: '#64748b', margin: 0 }}>Est. 3 min to location</p>
                    </div>
                    <div style={{ height: '144px', backgroundColor: '#070b14', border: '1px solid #1e293b', borderRadius: '8px', position: 'relative', padding: '16px', display: 'flex', alignItems: 'flex-end' }}>
                      <span style={{ position: 'absolute', top: '12px', left: '12px', fontSize: '10px', color: '#475569', fontWeight: 600 }}>High</span>
                      <span style={{ position: 'absolute', top: '50%', left: '12px', transform: 'translateY(-50%)', fontSize: '10px', color: '#475569', fontWeight: 600 }}>Med</span>
                      <span style={{ position: 'absolute', bottom: '36px', left: '12px', fontSize: '10px', color: '#475569', fontWeight: 600 }}>Low</span>
                      <svg style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, color: '#22d3ee', padding: '24px 40px 32px 40px', boxSizing: 'border-box' }} viewBox="0 0 100 100" preserveAspectRatio="none">
                        <path
                          d="M 0,80 L 10,75 L 20,70 L 30,75 L 40,80 L 50,70 L 60,65 L 70,70 L 80,75 L 90,80"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        />
                        {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90].map((x, i) => {
                          const ys = [80, 75, 70, 75, 80, 70, 65, 70, 75, 80];
                          return <circle key={i} cx={x} cy={ys[i]} r="1.5" fill="currentColor" />;
                        })}
                      </svg>
                      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', fontWeight: 600, color: '#475569', padding: '0 40px', zIndex: 10, boxSizing: 'border-box' }}>
                        <span>-3m</span>
                        <span>-2m</span>
                        <span>-1m</span>
                        <span style={{ color: '#ffffff' }}>Now</span>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', paddingTop: '4px' }}>
                    <button style={{ backgroundColor: '#10b981', color: '#ffffff', fontWeight: 800, padding: '12px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '12px', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <Check style={{ width: '16px', height: '16px' }} strokeWidth={2.5} />
                      <span>Acknowledge Assignment</span>
                    </button>
                    <button style={{ backgroundColor: '#1f2937', border: '1px solid #334155', color: '#e2e8f0', fontWeight: 800, padding: '12px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <RotateCcw style={{ width: '16px', height: '16px', color: '#94a3b8' }} />
                      <span>Decline &amp; Re-Route</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>

                {/* Timer / Team / Log Card */}
                <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                  {/* Acknowledgment Window */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h4 style={{ fontSize: '11px', fontWeight: 'bold', color: '#f1f5f9', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', margin: '0 0 6px 0' }}>
                        Acknowledgment Window
                      </h4>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                        <p style={{ fontSize: '30px', fontWeight: 800, color: '#f59e0b', fontFamily: 'monospace', letterSpacing: '-0.05em', margin: 0 }}>00:48</p>
                        <p style={{ fontSize: '12px', color: '#64748b', fontWeight: 500, marginBottom: '4px', margin: 0 }}>Remaining</p>
                      </div>
                    </div>
                    <div style={{ width: '44px', height: '44px', borderRadius: '9999px', border: '2px solid #1e293b', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }} viewBox="0 0 36 36">
                        <path
                          style={{ color: '#f59e0b' }}
                          strokeDasharray="60, 100"
                          strokeWidth="4"
                          stroke="currentColor"
                          fill="none"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                      </svg>
                    </div>
                  </div>

                  {/* Assigned Team */}
                  <div style={{ paddingTop: '16px', borderTop: '1px solid #1e293b' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <h4 style={{ fontSize: '11px', fontWeight: 'bold', color: '#f1f5f9', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Assigned Team</h4>
                      <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#22d3ee', backgroundColor: 'rgba(8, 145, 178, 0.2)', padding: '2px 10px', borderRadius: '9999px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Unit Bravo
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontFamily: 'monospace', fontSize: '11px', fontWeight: 500 }}>
                      <div style={{ backgroundColor: '#070b14', border: '1px solid #1e293b', padding: '10px', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <p style={{ margin: 0 }}>
                          <span style={{ color: '#64748b', marginRight: '6px' }}>Lead:</span>
                          <span style={{ color: '#f1f5f9' }}>Armand S.</span>
                        </p>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ready</span>
                      </div>
                      <div style={{ backgroundColor: '#070b14', border: '1px solid #1e293b', padding: '10px', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <p style={{ margin: 0 }}>
                          <span style={{ color: '#64748b', marginRight: '6px' }}>Medic:</span>
                          <span style={{ color: '#f1f5f9' }}>Rescue Ops 2</span>
                        </p>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ready</span>
                      </div>
                    </div>
                  </div>

                  {/* HQ Dispatch Log */}
                  <div style={{ paddingTop: '16px', borderTop: '1px solid #1e293b' }}>
                    <h4 style={{ fontSize: '11px', fontWeight: 'bold', color: '#f1f5f9', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px', margin: '0 0 12px 0' }}>HQ Dispatch Log</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontFamily: 'monospace', fontSize: '11px', fontWeight: 500, color: 'rgba(245, 158, 11, 0.9)', lineHeight: 1.5 }}>
                      <p style={{ margin: 0 }}>
                        <span style={{ color: '#64748b', marginRight: '6px' }}>14:30 PHT</span>
                        Sector 4 flood gates reported operational surge.
                      </p>
                      <p style={{ margin: 0 }}>
                        <span style={{ color: '#64748b', marginRight: '6px' }}>14:31 PHT</span>
                        Priority reroute issued for Unit Bravo.
                      </p>
                    </div>
                    <button style={{ marginTop: '16px', fontSize: '12px', fontWeight: 'bold', color: '#22d3ee', display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                      <span>View Full Log</span>
                      <ExternalLink style={{ width: '14px', height: '14px' }} />
                    </button>
                  </div>
                </div>

                {/* Quick Actions */}
                <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <h4 style={{ fontSize: '11px', fontWeight: 'bold', color: '#f1f5f9', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', margin: '0 0 4px 0' }}>Quick Actions</h4>
                  {quickActions.map((item, idx) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={idx}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          backgroundColor: '#1f2937',
                          padding: '14px',
                          borderRadius: '8px',
                          border: '1px solid #1e293b',
                          cursor: 'pointer',
                          color: '#cbd5e1'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                          <Icon style={{ width: '20px', height: '20px', color: '#22d3ee', flexShrink: 0 }} />
                          <div style={{ textAlign: 'left' }}>
                            <p style={{ fontSize: '12px', fontWeight: 600, color: '#ffffff', letterSpacing: '0.025em', margin: 0 }}>{item.label}</p>
                            <p style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', margin: 0 }}>{item.subtext}</p>
                          </div>
                        </div>
                        <ExternalLink style={{ width: '16px', height: '16px', color: '#475569', flexShrink: 0 }} />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeView !== 'alert' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '70vh', border: '1px solid #1e293b', backgroundColor: '#0b1120', borderRadius: '8px', padding: '40px' }}>
              <p style={{ color: '#64748b', fontSize: '16px', fontWeight: 500, margin: 0 }}>
                Content for{' '}
                <span style={{ color: '#f59e0b', fontWeight: 'bold', textTransform: 'uppercase' }}>
                  {navItems.find((n) => n.id === activeView)?.label}
                </span>{' '}
                view placeholder.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default RescuerDashboard;