import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Logo from '../components/Logo';
import MapContainer from '../components/MapContainer';
import { useWebSocket } from '../hooks/useWebSocket';
import { API_URL, WS_URL } from '../dataProvider';
import {
  AlertTriangle,Map,ClipboardList,Bluetooth,UploadCloud,Menu,ChevronDown,User,MapPin,Users,Waves,Navigation,ExternalLink,Check,RotateCcw,MessageSquare,LogOut,} from 'lucide-react';

const alertMarkerColors = { flood: '#3298df', earthquake: '#d18c48', fire: '#f04444', medical: '#dd5ca8', trapped: '#a56ee7', other: '#dc2626' };
const disasterIcons = { flood: '⌁', earthquake: '⌂', fire: '♨', medical: '+', trapped: '!', other: '•' };
const disasterLabels = { flood: 'Flood', earthquake: 'Earthquake', fire: 'Fire', medical: 'Medical', trapped: 'Rescue', other: 'Other' };

const RescuerDashboard = () => {
  const auth = JSON.parse(localStorage.getItem('auth') || '{}');
  const [activeView, setActiveView] = useState('alert');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [currentUser, setCurrentUser] = useState(auth?.user || null);
  const [rescuerLocation, setRescuerLocation] = useState(null);
  const [acknowledgementSecondsLeft, setAcknowledgementSecondsLeft] = useState(60);
  const [isAcknowledged, setIsAcknowledged] = useState(false);
  const [assignedAlerts, setAssignedAlerts] = useState([]);
  const [selectedAlertId, setSelectedAlertId] = useState(null);
  const [isAlertsLoading, setIsAlertsLoading] = useState(true);
  const [alertsError, setAlertsError] = useState('');
  const [alertRefreshKey, setAlertRefreshKey] = useState(0);
  const [walkingRoute, setWalkingRoute] = useState(null);
  const [isRouteLoading, setIsRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState('');
  const [statusReports, setStatusReports] = useState([]);
  const [selectedReportAction, setSelectedReportAction] = useState('');
  const [otherReportMessage, setOtherReportMessage] = useState('');
  const [additionalReportNotes, setAdditionalReportNotes] = useState('');
  const [isStatusReportSubmitting, setIsStatusReportSubmitting] = useState(false);
  const [statusReportError, setStatusReportError] = useState('');
  const [statusReportSuccess, setStatusReportSuccess] = useState('');
  const [rescuerStatusInfo, setRescuerStatusInfo] = useState(null);
  const [isUpdatingRescuerStatus, setIsUpdatingRescuerStatus] = useState(false);
  const [rescuerStatusError, setRescuerStatusError] = useState('');
  const navigate = useNavigate();
  const { isConnected, lastMessage } = useWebSocket(WS_URL);
  const authToken = auth?.token || auth?.access_token;
  const displayName = currentUser?.full_name || currentUser?.username || 'Rescuer';
  const recoveryDeadline = Date.parse(rescuerStatusInfo?.recovering_until || '');
  const recoveryRemainingMs = Number.isFinite(recoveryDeadline)
    ? Math.max(0, recoveryDeadline - currentTime.getTime())
    : 0;
  const recoveryRemainingLabel = `${Math.floor(recoveryRemainingMs / 60_000)}:${String(Math.floor((recoveryRemainingMs % 60_000) / 1000)).padStart(2, '0')}`;
  const criticalAssignment = assignedAlerts.find((alert) => (
    String(alert.severity).toLowerCase() === 'critical'
    && String(alert.status).toLowerCase() === 'assigned'
  ));
  const activeAlert = criticalAssignment
    || assignedAlerts.find((alert) => alert.id === selectedAlertId)
    || assignedAlerts[0]
    || null;
  const alertType = String(activeAlert?.disaster_type || 'other').toLowerCase();
  const hasRescuerLocation = rescuerLocation?.latitude != null
    && rescuerLocation?.longitude != null
    && Number.isFinite(Number(rescuerLocation.latitude))
    && Number.isFinite(Number(rescuerLocation.longitude));
  const alertMapMarkers = activeAlert ? [{
    position: [activeAlert.longitude, activeAlert.latitude],
    label: `Alert #${activeAlert.id} · ${activeAlert.sender_name}`,
    color: alertMarkerColors[alertType] || alertMarkerColors.other,
    icon: disasterIcons[alertType] || disasterIcons.other,
    details: {
      type: disasterLabels[alertType] || 'Other',
      status: activeAlert.status,
      severity: activeAlert.severity,
      reported_by: activeAlert.sender_name,
      location: `${activeAlert.latitude}, ${activeAlert.longitude}`,
      message: activeAlert.message,
    },
  }] : [];
  const rescuerMapMarkers = hasRescuerLocation ? [{
    position: [rescuerLocation.longitude, rescuerLocation.latitude],
    label: `${displayName} · LIVE LOCATION`,
    color: '#00d6a0',
    icon: '♟',
    details: {
      type: 'Rescuer',
      name: displayName,
      location: `${rescuerLocation.latitude}, ${rescuerLocation.longitude}`,
      accuracy: rescuerLocation.accuracy,
    },
  }] : [];
  const alertMapCenter = activeAlert
    ? [activeAlert.longitude, activeAlert.latitude]
    : hasRescuerLocation ? [rescuerLocation.longitude, rescuerLocation.latitude] : null;
  const profileInitial = (auth?.user?.full_name || auth?.user?.username || 'U').charAt(0).toUpperCase();

  useEffect(() => {
    if (!authToken) return undefined;

    const controller = new AbortController();
    const loadCurrentUser = async () => {
      try {
        const response = await fetch(`${API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${authToken}` },
          signal: controller.signal,
        });
        if (!response.ok) return;
        const result = await response.json();
        if (result.user) setCurrentUser(result.user);
      } catch (error) {
        if (error.name !== 'AbortError') console.error('Unable to load rescuer profile.', error);
      }
    };

    loadCurrentUser();
    return () => controller.abort();
  }, [authToken]);

  useEffect(() => {
    if (currentUser?.id == null) return undefined;

    const controller = new AbortController();
    fetch(`${API_URL}/gps`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Unable to load GPS locations (${response.status}).`);
        return response.json();
      })
      .then((result) => {
        const locations = result.locations || [];
        const userLocation = locations.find((location) => String(location.user_id) === String(currentUser.id))
          || (String(result.gps?.user_id) === String(currentUser.id) ? result.gps : null);
        if (userLocation) setRescuerLocation(userLocation);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') console.error('Unable to load rescuer GPS location.', error);
      });

    return () => controller.abort();
  }, [currentUser?.id]);

  useEffect(() => {
    const location = lastMessage?.type === 'gps_update' ? lastMessage.data : null;
    if (location && String(location.user_id) === String(currentUser?.id)) {
      setRescuerLocation(location);
    }
  }, [lastMessage, currentUser?.id]);

  useEffect(() => {
    if (['alert_created', 'alert_updated'].includes(lastMessage?.type)) {
      setAlertRefreshKey((currentKey) => currentKey + 1);
    }
  }, [lastMessage]);

  useEffect(() => {
    if (!authToken) {
      setAlertsError('Your session has expired. Please log in again.');
      setIsAlertsLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    let requestTimedOut = false;
    const requestTimeout = window.setTimeout(() => {
      requestTimedOut = true;
      controller.abort();
    }, 15000);
    const loadAssignedAlerts = async () => {
      setIsAlertsLoading(true);
      try {
        const response = await fetch(`${API_URL}/auth/alerts/assigned-to-me`, {
          headers: { Authorization: `Bearer ${authToken}` },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Unable to load assignments (${response.status}).`);
        const alerts = await response.json();
        setAssignedAlerts(alerts);
        setSelectedAlertId((currentId) => (
          alerts.some((alert) => alert.id === currentId) ? currentId : alerts[0]?.id ?? null
        ));
        setAlertsError('');
      } catch (error) {
        if (requestTimedOut) {
          setAlertsError('Loading assigned alerts timed out. Check the API or database connection and try again.');
        } else if (error.name !== 'AbortError') {
          setAlertsError(error.message || 'Unable to load assignments.');
        }
      } finally {
        window.clearTimeout(requestTimeout);
        if (!controller.signal.aborted || requestTimedOut) setIsAlertsLoading(false);
      }
    };

    loadAssignedAlerts();
    return () => {
      window.clearTimeout(requestTimeout);
      controller.abort();
    };
  }, [authToken, alertRefreshKey]);

  useEffect(() => {
    if (!authToken) return undefined;
    const controller = new AbortController();
    fetch(`${API_URL}/auth/rescuers/me/status`, {
      headers: { Authorization: `Bearer ${authToken}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Unable to load rescuer availability (${response.status}).`);
        setRescuerStatusInfo(await response.json());
        setRescuerStatusError('');
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setRescuerStatusError(error.message || 'Unable to load rescuer availability.');
        }
      });
    return () => controller.abort();
  }, [authToken, alertRefreshKey]);

  useEffect(() => {
    if (!authToken) return undefined;
    let disposed = false;
    const sendPresence = async () => {
      try {
        const response = await fetch(`${API_URL}/auth/rescuers/me/presence`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!response.ok) throw new Error(`Unable to update rescuer presence (${response.status}).`);
        const result = await response.json();
        if (!disposed) {
          setRescuerStatusInfo((current) => ({ ...current, ...result }));
          setRescuerStatusError('');
        }
      } catch (error) {
        if (!disposed) {
          setRescuerStatusError(error.message || 'Unable to update rescuer presence.');
          console.error('Unable to update rescuer presence.', error);
        }
      }
    };

    sendPresence();
    const presenceInterval = window.setInterval(sendPresence, 30_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') sendPresence();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      disposed = true;
      window.clearInterval(presenceInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [authToken]);

  useEffect(() => {
    const clock = window.setInterval(() => setCurrentTime(new Date()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    if (!activeAlert || isAcknowledged || acknowledgementSecondsLeft <= 0) return undefined;

    const countdown = window.setInterval(() => {
      setAcknowledgementSecondsLeft((previous) => {
        if (previous <= 1) {
          window.clearInterval(countdown);
          return 0;
        }
        return previous - 1;
      });
    }, 1000);

    return () => window.clearInterval(countdown);
  }, [activeAlert?.id, isAcknowledged, acknowledgementSecondsLeft]);

  useEffect(() => {
    setIsAcknowledged(false);
    setAcknowledgementSecondsLeft(60);
    setWalkingRoute(null);
    setRouteError('');
    setStatusReports([]);
    setSelectedReportAction('');
    setOtherReportMessage('');
    setAdditionalReportNotes('');
    setStatusReportError('');
    setStatusReportSuccess('');
  }, [activeAlert?.id]);

  useEffect(() => {
    if (!activeAlert?.id || !authToken) return undefined;
    const controller = new AbortController();
    fetch(`${API_URL}/auth/alerts/${activeAlert.id}/status-reports`, {
      headers: { Authorization: `Bearer ${authToken}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Unable to load status reports (${response.status}).`);
        const reports = await response.json();
        setStatusReports((currentReports) => {
          const reportsById = new globalThis.Map([...currentReports, ...reports].map((report) => [report.id, report]));
          return [...reportsById.values()]
            .sort((first, second) => new Date(second.created_at) - new Date(first.created_at))
            .slice(0, 50);
        });
      })
      .catch((error) => {
        if (error.name !== 'AbortError') console.error('Unable to load alert status reports.', error);
      });
    return () => controller.abort();
  }, [activeAlert?.id, authToken]);

  const formattedCurrentTime = currentTime.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Manila'
  }) + ' PHT';

  const handleLogout = async () => {
    if (authToken) {
      try {
        const response = await fetch(`${API_URL}/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${authToken}` },
          keepalive: true,
        });
        if (!response.ok) throw new Error(`Logout presence update failed (${response.status}).`);
      } catch (error) {
        console.error('Unable to mark rescuer off duty during logout.', error);
      }
    }
    localStorage.removeItem('auth');
    navigate('/login/rescuer', { replace: true });
  };

  const handleRouteToAlert = async () => {
    if (!activeAlert) {
      setRouteError('There is no assigned alert to route to.');
      return;
    }

    setIsRouteLoading(true);
    setRouteError('');
    try {
      let origin = rescuerLocation;
      if (!hasRescuerLocation) {
        if (!navigator.geolocation) throw new Error('Location access is unavailable in this browser.');
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            maximumAge: 5000,
            timeout: 15000,
          });
        }).catch((error) => {
          if (error.code === 1) throw new Error('Allow location access to route to the alert.');
          if (error.code === 3) throw new Error('Timed out getting your location. Try again.');
          throw new Error('Unable to get your location. Check your device location settings and try again.');
        });
        origin = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          user_id: currentUser?.id,
          role: 'rescuer',
          display_name: displayName,
        };
        const gpsResponse = await fetch(`${API_URL}/gps`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(origin),
        });
        if (!gpsResponse.ok) throw new Error(`Unable to publish your GPS location (${gpsResponse.status}).`);
        setRescuerLocation(origin);
      }

      const response = await fetch(`${API_URL}/routing/walk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin_latitude: Number(origin.latitude),
          origin_longitude: Number(origin.longitude),
          destination_latitude: Number(activeAlert.latitude),
          destination_longitude: Number(activeAlert.longitude),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || `Unable to calculate route (${response.status}).`);
      if (!result.geometry?.coordinates?.length) throw new Error('The routing service returned no route geometry.');

      setWalkingRoute(result);
      setActiveView('nav');
    } catch (error) {
      setRouteError(error.message || 'Unable to calculate a route to the alert.');
    } finally {
      setIsRouteLoading(false);
    }
  };

  const submitStatusReport = async (reportType) => {
    if (!activeAlert || isStatusReportSubmitting) return;
    const message = reportType === 'other' ? otherReportMessage.trim() : '';
    if (reportType === 'other' && !message) {
      setStatusReportError('Describe the situation before sending an other report.');
      return;
    }

    setIsStatusReportSubmitting(true);
    setStatusReportError('');
    setStatusReportSuccess('');
    try {
      const response = await fetch(`${API_URL}/auth/alerts/${activeAlert.id}/status-reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          report_type: reportType,
          message,
          additional_notes: additionalReportNotes.trim() || null,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || `Unable to send status report (${response.status}).`);

      setStatusReports((reports) => [result, ...reports.filter((report) => report.id !== result.id)]);
      if (['resolving', 'going_to_evacuation_center', 'resolved'].includes(reportType)) {
        const nextStatus = {
          resolving: 'resolving',
          going_to_evacuation_center: 'evacuating',
          resolved: 'closed',
        }[reportType];
        setAssignedAlerts((alerts) => alerts.map((alert) => (
          alert.id === activeAlert.id ? { ...alert, status: nextStatus } : alert
        )));
        setStatusReportSuccess(
          reportType === 'resolved'
            ? 'Alert marked as resolved and dispatcher notified.'
            : reportType === 'going_to_evacuation_center'
              ? 'Evacuation-center transit reported to the dispatcher.'
              : 'Alert marked as resolving and dispatcher notified.'
        );
      } else if (reportType === 'need_backup') {
        setStatusReportSuccess('Backup request sent to the dispatcher.');
      } else {
        setStatusReportSuccess('Status report sent to the dispatcher.');
        setOtherReportMessage('');
        setSelectedReportAction('');
      }
      setAdditionalReportNotes('');
    } catch (error) {
      setStatusReportError(error.message || 'Unable to send status report.');
    } finally {
      setIsStatusReportSubmitting(false);
    }
  };

  const choosePostAlertStatus = async (nextStatus) => {
    if (!['available', 'recovering'].includes(nextStatus) || isUpdatingRescuerStatus) return;
    setIsUpdatingRescuerStatus(true);
    setRescuerStatusError('');
    try {
      const response = await fetch(`${API_URL}/auth/rescuers/me/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || `Unable to update availability (${response.status}).`);
      setRescuerStatusInfo((current) => ({
        ...current,
        status: result.status,
        recovering_until: result.recovering_until,
        pending_alert: null,
      }));
    } catch (error) {
      setRescuerStatusError(error.message || 'Unable to update availability.');
    } finally {
      setIsUpdatingRescuerStatus(false);
    }
  };

  const formattedAcknowledgementTime = `${String(Math.floor(acknowledgementSecondsLeft / 60)).padStart(2, '0')}:${String(acknowledgementSecondsLeft % 60).padStart(2, '0')}`;

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
    <div style={{ backgroundColor: '#070b14', color: '#cbd5e1', height: '100vh', width: '100%', display: 'flex', overflow: 'hidden', fontFamily: 'var(--ops-font)', fontSize: '14px' }}>

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
            <Logo size="small" />
            <div style={{ whiteSpace: 'nowrap', lineHeight: 1.2 }}>
              <h1 style={{ fontSize: '13px', fontWeight: 'bold', color: '#f23e4f', letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>RESQ-ROUTE</h1>
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
                  <p style={{ fontSize: '9px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold', margin: '0 0 2px 0' }}>Logged In Rescuer</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '9999px', backgroundColor: '#06b6d4' }} />
                    <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#22d3ee' }}>{displayName}</span>
                  </div>
                </div>
              </div>
              <ChevronDown style={{ width: '16px', height: '16px', color: '#64748b' }} />
            </div>
            <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', fontWeight: 500, color: '#64748b' }}>
              <p style={{ margin: 0 }}>{currentUser?.username ? `@${currentUser.username}` : 'Rescuer account'}</p>
              <p style={{ fontFamily: 'var(--ops-font)', color: '#475569', margin: 0 }}>{formattedCurrentTime}</p>
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
              <span style={{ width: '8px', height: '8px', borderRadius: '9999px', backgroundColor: isConnected ? '#22c55e' : '#ef4444', boxShadow: isConnected ? '0 0 8px rgba(34, 197, 94, 0.8)' : '0 0 8px rgba(239, 68, 68, 0.8)' }} />
              <span style={{ color: isConnected ? '#64f573' : '#fca5a5' }}>{isConnected ? 'Websocket: Connected' : 'Reconnecting'}</span>
            </div>
            <div style={{ fontFamily: 'var(--ops-font)', color: '#64748b' }}>{formattedCurrentTime}</div>
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setIsProfileMenuOpen((isOpen) => !isOpen)}
                aria-label="Open profile menu"
                aria-haspopup="menu"
                aria-expanded={isProfileMenuOpen}
                style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#1e293b', border: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 'bold', color: '#cbd5e1', cursor: 'pointer' }}
              >
                {profileInitial}
              </button>
              {isProfileMenuOpen && (
                <div role="menu" style={{ position: 'absolute', top: '40px', right: 0, minWidth: '160px', padding: '6px', backgroundColor: '#0b1120', border: '1px solid #334155', borderRadius: '6px', boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)' }}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '9px', padding: '9px 10px', background: 'transparent', border: 'none', borderRadius: '4px', color: '#f1f5f9', fontSize: '12px', textAlign: 'left', cursor: 'pointer' }}
                  >
                    <LogOut size={15} />
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Scrollable Viewport */}
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '20px' }}>
          {(rescuerStatusInfo?.pending_alert || rescuerStatusInfo?.status === 'recovering') && (
            <section role="status" aria-live="polite" style={{ maxWidth: '860px', margin: '0 auto 16px', padding: '16px', border: '1px solid #f59e0b', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.1)', color: '#fef3c7' }}>
              <strong>
                {rescuerStatusInfo.status === 'recovering'
                  ? 'Recovery period'
                  : `Alert #${rescuerStatusInfo.pending_alert.id} closed — choose your availability`}
              </strong>
              <p style={{ margin: '6px 0 12px', color: '#cbd5e1', fontSize: '13px' }}>
                {rescuerStatusInfo.status === 'recovering'
                  ? `Rest timer: ${recoveryRemainingLabel} remaining. You can return to duty whenever you feel ready.`
                  : 'Choose whether you are ready for another assignment or need time to recover.'}
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {rescuerStatusInfo.status !== 'recovering' && (
                  <>
                    <button type="button" disabled={isUpdatingRescuerStatus || assignedAlerts.length > 0} onClick={() => choosePostAlertStatus('available')} style={{ padding: '9px 14px', border: '1px solid #059669', borderRadius: '6px', background: '#064e3b', color: '#d1fae5', fontWeight: 700, cursor: 'pointer', opacity: isUpdatingRescuerStatus || assignedAlerts.length > 0 ? 0.55 : 1 }}>Available</button>
                    <button type="button" disabled={isUpdatingRescuerStatus || assignedAlerts.length > 0} onClick={() => choosePostAlertStatus('recovering')} style={{ padding: '9px 14px', border: '1px solid #d97706', borderRadius: '6px', background: '#78350f', color: '#fef3c7', fontWeight: 700, cursor: 'pointer', opacity: isUpdatingRescuerStatus || assignedAlerts.length > 0 ? 0.55 : 1 }}>Recovering (30 min)</button>
                  </>
                )}
                {rescuerStatusInfo.status === 'recovering' && (
                  <button type="button" disabled={isUpdatingRescuerStatus || assignedAlerts.length > 0} onClick={() => choosePostAlertStatus('available')} style={{ padding: '9px 14px', border: '1px solid #059669', borderRadius: '6px', background: '#064e3b', color: '#d1fae5', fontWeight: 700, cursor: 'pointer', opacity: isUpdatingRescuerStatus || assignedAlerts.length > 0 ? 0.55 : 1 }}>Available now</button>
                )}
              </div>
              {assignedAlerts.length > 0 && <small style={{ display: 'block', marginTop: '8px', color: '#fbbf24' }}>Finish your current assignment before changing availability.</small>}
              {rescuerStatusError && <p role="alert" style={{ margin: '8px 0 0', color: '#fca5a5' }}>{rescuerStatusError}</p>}
            </section>
          )}
          {activeView === 'alert' && (
            isAlertsLoading ? (
              <div style={{ padding: '24px', color: '#94a3b8' }}>Loading assigned alerts...</div>
            ) : alertsError ? (
              <div role="alert" style={{ padding: '24px', color: '#fca5a5' }}>
                <p style={{ margin: '0 0 12px' }}>{alertsError}</p>
                <button
                  type="button"
                  onClick={() => setAlertRefreshKey((currentKey) => currentKey + 1)}
                  style={{ padding: '8px 12px', border: '1px solid #334155', borderRadius: '6px', background: '#0b1120', color: '#e2e8f0', cursor: 'pointer' }}
                >
                  Retry
                </button>
              </div>
            ) : !activeAlert ? (
              <div style={{ padding: '24px', color: '#94a3b8', border: '1px solid #1e293b', borderRadius: '8px' }}>
                No emergency alerts are assigned to your account.
              </div>
            ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', alignItems: 'start', width: '100%' }}>

              {/* LEFT COLUMN */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>

                {/* New Assignment Banner */}
                <div style={{
                  border: `1px solid ${criticalAssignment?.id === activeAlert.id ? 'rgba(239, 68, 68, 0.8)' : 'rgba(245, 158, 11, 0.5)'}`,
                  borderRadius: '8px',
                  padding: '12px 16px',
                  backgroundColor: criticalAssignment?.id === activeAlert.id ? 'rgba(127, 29, 29, 0.28)' : 'rgba(245, 158, 11, 0.05)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <AlertTriangle style={{ width: '24px', height: '24px', color: '#f59e0b', flexShrink: 0 }} />
                    <div>
                      <h3 style={{ fontSize: '16px', fontWeight: '800', color: criticalAssignment?.id === activeAlert.id ? '#fca5a5' : '#fbbf24', letterSpacing: '0.025em', textTransform: 'uppercase', margin: 0 }}>{criticalAssignment?.id === activeAlert.id ? 'CRITICAL DISPATCH — PROCEED TO ALERT' : isAcknowledged ? 'Assignment Acknowledged' : 'New Assignment'}</h3>
                      <p style={{ fontSize: '12px', color: 'rgba(252, 211, 77, 0.7)', fontWeight: 600, marginTop: '2px', margin: 0 }}>
                        {activeAlert.message || 'No additional details provided.'}
                      </p>
                    </div>
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: '800', color: '#ef4444', border: '1px solid #dc2626', padding: '4px 12px', borderRadius: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {activeAlert.severity || activeAlert.status}
                  </span>
                </div>

                {/* MAIN INCIDENT CARD */}
                <div style={{ backgroundColor: '#0b1120', borderRadius: '8px', padding: '16px', border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: '16px' }}>

                  {/* Incident Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid #1e293b' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#22d3ee' }}>
                      <ClipboardList style={{ width: '20px', height: '20px' }} />
                      <span style={{ fontSize: '18px', fontWeight: '900', letterSpacing: '0.05em' }}>Alert #{activeAlert.id}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px', fontWeight: 600, color: '#94a3b8' }}>
                      <span>{new Date(activeAlert.created_at).toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Location & Victim Count */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <h4 style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', margin: '0 0 6px 0' }}>Coordinates</h4>
                      <p style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff', margin: 0 }}>{activeAlert.latitude}, {activeAlert.longitude}</p>
                    </div>
                    <div>
                      <h4 style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', margin: '0 0 6px 0' }}>Reported By</h4>
                      <p style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff', margin: 0 }}>{activeAlert.sender_name} ({activeAlert.sender_role})</p>
                    </div>
                  </div>

                  {/* Info Grid */}
                  <div style={{ border: '1px solid #1e293b', borderRadius: '8px', padding: '14px', backgroundColor: '#070b14', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '16px', alignItems: 'center', fontSize: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <Waves style={{ width: '20px', height: '20px', color: '#f59e0b', flexShrink: 0 }} />
                      <div>
                        <p style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 'bold', margin: 0 }}>Emergency Type</p>
                        <p style={{ color: '#e2e8f0', margin: '2px 0 0 0' }}>{activeAlert.disaster_type}</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <Waves style={{ width: '20px', height: '20px', color: '#60a5fa', flexShrink: 0 }} />
                      <div>
                        <p style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 'bold', margin: 0 }}>Severity</p>
                        <p style={{ color: '#60a5fa', margin: '2px 0 0 0' }}>{activeAlert.severity}</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <Navigation style={{ width: '20px', height: '20px', color: '#22d3ee', flexShrink: 0 }} />
                      <div>
                        <p style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 'bold', margin: 0 }}>Alert Status</p>
                        <p style={{ color: '#22d3ee', margin: '2px 0 0 0' }}>{activeAlert.status}</p>
                      </div>
                    </div>
                    <div style={{ gridColumn: 'span 3', display: 'flex', justifyContent: 'flex-end', marginTop: '-4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={handleRouteToAlert}
                          disabled={!hasRescuerLocation || isRouteLoading}
                          style={{ color: hasRescuerLocation ? '#22d3ee' : '#64748b', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid rgba(8, 145, 178, 0.5)', padding: '6px 12px', borderRadius: '6px', backgroundColor: 'transparent', cursor: hasRescuerLocation && !isRouteLoading ? 'pointer' : 'not-allowed' }}
                        >
                          <Navigation style={{ width: '14px', height: '14px' }} />
                          {isRouteLoading ? 'Calculating route...' : 'Route to the alert'}
                        </button>
                        <a href={`https://www.google.com/maps?q=${activeAlert.latitude},${activeAlert.longitude}`} target="_blank" rel="noreferrer" style={{ color: '#22d3ee', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid rgba(8, 145, 178, 0.5)', padding: '6px 12px', borderRadius: '6px', backgroundColor: 'transparent', cursor: 'pointer', textDecoration: 'none' }}>
                        <span>View Map</span>
                        <ExternalLink style={{ width: '14px', height: '14px' }} />
                        </a>
                      </div>
                    </div>
                    {routeError && (
                      <p role="alert" style={{ gridColumn: 'span 3', color: '#fca5a5', textAlign: 'right', margin: '-8px 0 0' }}>
                        {routeError}
                      </p>
                    )}
                    {!hasRescuerLocation && (
                      <p style={{ gridColumn: 'span 3', color: '#64748b', textAlign: 'right', margin: '-8px 0 0' }}>
                        Waiting for your live location from telemetry.
                      </p>
                    )}
                  </div>

                  {/* Special Instructions */}
                  <div style={{ position: 'relative', paddingTop: '12px', borderTop: '1px solid #1e293b' }}>
                    <h4 style={{ fontSize: '11px', fontWeight: 'bold', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', margin: '0 0 6px 0' }}>Special Instructions</h4>
                    <p style={{ fontSize: '14px', color: 'rgba(245, 158, 11, 0.9)', fontWeight: 600, lineHeight: 1.6, width: '83%', margin: 0 }}>
                      {activeAlert.message || 'No additional instructions provided.'}
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
                    <button
                      onClick={() => setIsAcknowledged(true)}
                      disabled={isAcknowledged || acknowledgementSecondsLeft === 0}
                      style={{
                        backgroundColor: isAcknowledged ? '#1f2937' : '#10b981',
                        color: '#ffffff',
                        fontWeight: 800,
                        padding: '12px 20px',
                        borderRadius: '8px',
                        border: 'none',
                        cursor: isAcknowledged || acknowledgementSecondsLeft === 0 ? 'not-allowed' : 'pointer',
                        fontSize: '12px',
                        letterSpacing: '0.05em',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        opacity: isAcknowledged || acknowledgementSecondsLeft === 0 ? 0.6 : 1
                      }}
                    >
                      <Check style={{ width: '16px', height: '16px' }} strokeWidth={2.5} />
                      <span>{isAcknowledged ? 'Assignment Acknowledged' : 'Acknowledge Assignment'}</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsAcknowledged(false);
                        setAcknowledgementSecondsLeft(60);
                      }}
                      style={{ backgroundColor: '#1f2937', border: '1px solid #334155', color: '#e2e8f0', fontWeight: 800, padding: '12px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    >
                      <RotateCcw style={{ width: '16px', height: '16px', color: '#94a3b8' }} />
                      <span>Decline &amp; Re-Route</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>

                {/* Team / Log Card */}
                <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                  {/* Assigned Team */}
                  <div style={{ paddingTop: '0px', borderTop: 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <h4 style={{ fontSize: '11px', fontWeight: 'bold', color: '#f1f5f9', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Assigned Team</h4>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontFamily: 'var(--ops-font)', fontSize: '11px', fontWeight: 500 }}>
                      <div style={{ backgroundColor: '#070b14', border: '1px solid #1e293b', padding: '10px', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <p style={{ margin: 0 }}>
                          <span style={{ color: '#64748b', marginRight: '6px' }}>Lead:</span>
                          <span style={{ color: '#f1f5f9' }}>{activeAlert.assigned_rescuer_name || ''}</span>
                        </p>
                      </div>
                      <div style={{ backgroundColor: '#070b14', border: '1px solid #1e293b', padding: '10px', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <p style={{ margin: 0 }}>
                          <span style={{ color: '#64748b', marginRight: '6px' }}>Medic:</span>
                          <span style={{ color: '#f1f5f9' }}></span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* HQ Dispatch Log */}
                  <div style={{ paddingTop: '16px', borderTop: '1px solid #1e293b' }}>
                    <h4 style={{ fontSize: '11px', fontWeight: 'bold', color: '#f1f5f9', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px', margin: '0 0 12px 0' }}>HQ Dispatch Log</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontFamily: 'var(--ops-font)', fontSize: '11px', fontWeight: 500, color: 'rgba(245, 158, 11, 0.9)', lineHeight: 1.5 }}>
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
            ))}

          {activeView === 'status' ? (
            <section style={{ maxWidth: '860px', margin: '0 auto', padding: '22px', border: '1px solid #1e293b', borderRadius: '10px', background: '#0b1120', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ margin: 0, color: '#f1f5f9', fontSize: '18px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Alert status report</h3>
                <p style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: '13px' }}>Update the dispatcher on your progress or request additional support.</p>
              </div>
              {!activeAlert ? (
                <p style={{ margin: 0, padding: '14px', borderRadius: '6px', background: '#070b14', color: '#94a3b8' }}>There is no active alert assigned to your account.</p>
              ) : (
                <>
                  <div style={{ padding: '14px', border: '1px solid #1e293b', borderRadius: '6px', background: '#070b14', display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                    <div>
                      <strong style={{ color: '#e2e8f0' }}>Alert #{activeAlert.id}</strong>
                      <span style={{ marginLeft: '10px', color: '#94a3b8' }}>{activeAlert.sender_name} · {activeAlert.disaster_type}</span>
                    </div>
                    <span style={{ color: ['resolving', 'evacuating'].includes(activeAlert.status) ? '#fbbf24' : '#67e8f9', fontWeight: 700, textTransform: 'uppercase' }}>
                      Current status: {activeAlert.status === 'evacuating' ? 'Going to evacuation center' : activeAlert.status}
                    </span>
                  </div>

                  <div>
                    <h4 style={{ margin: '0 0 10px', color: '#cbd5e1', fontSize: '13px' }}>Send an update</h4>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => {
                          const nextAction = {
                            assigned: 'resolving',
                            pending: 'resolving',
                            resolving: 'going_to_evacuation_center',
                            evacuating: 'resolved',
                          }[activeAlert.status];
                          if (nextAction) submitStatusReport(nextAction);
                        }}
                        disabled={isStatusReportSubmitting || activeAlert.status === 'closed'}
                        style={{ padding: '10px 14px', border: '1px solid #047857', borderRadius: '6px', background: '#064e3b', color: '#d1fae5', fontWeight: 700, cursor: 'pointer', opacity: isStatusReportSubmitting || activeAlert.status === 'closed' ? 0.55 : 1 }}
                      >
                        {activeAlert.status === 'closed'
                          ? 'Resolved'
                          : ({
                            assigned: 'Mark as resolving',
                            pending: 'Mark as resolving',
                            resolving: 'Going to evacuation center',
                            evacuating: 'Mark as resolved',
                          })[activeAlert.status] || 'Update alert status'}
                      </button>
                      <button
                        type="button"
                        onClick={() => submitStatusReport('need_backup')}
                        disabled={isStatusReportSubmitting}
                        style={{ padding: '10px 14px', border: '1px solid #b45309', borderRadius: '6px', background: '#78350f', color: '#fef3c7', fontWeight: 700, cursor: 'pointer', opacity: isStatusReportSubmitting ? 0.55 : 1 }}
                      >
                        Request backup
                      </button>
                      <button
                        type="button"
                        aria-pressed={selectedReportAction === 'other'}
                        onClick={() => { setSelectedReportAction('other'); setStatusReportError(''); setStatusReportSuccess(''); }}
                        style={{ padding: '10px 14px', border: `1px solid ${selectedReportAction === 'other' ? '#0891b2' : '#334155'}`, borderRadius: '6px', background: selectedReportAction === 'other' ? '#164e63' : '#1f2937', color: '#e2e8f0', fontWeight: 700, cursor: 'pointer' }}
                      >
                        Others
                      </button>
                    </div>
                  </div>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: '7px', color: '#cbd5e1', fontSize: '12px', fontWeight: 600 }}>
                    Additional details (optional)
                    <textarea
                      value={additionalReportNotes}
                      onChange={(event) => setAdditionalReportNotes(event.target.value)}
                      maxLength={2000}
                      rows={3}
                      placeholder="Add useful context, patient count, hazards, or resources needed."
                      style={{ width: '100%', resize: 'vertical', padding: '10px 12px', border: '1px solid #334155', borderRadius: '6px', background: '#070b14', color: '#e2e8f0', font: 'inherit' }}
                    />
                  </label>

                  {selectedReportAction === 'other' && (
                    <form
                      onSubmit={(event) => { event.preventDefault(); submitStatusReport('other'); }}
                      style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
                    >
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '7px', color: '#cbd5e1', fontSize: '12px', fontWeight: 600 }}>
                        What is happening? <span style={{ color: '#f87171' }}>Required</span>
                        <textarea
                          value={otherReportMessage}
                          onChange={(event) => setOtherReportMessage(event.target.value)}
                          required
                          maxLength={1000}
                          rows={3}
                          placeholder="Describe the situation for the dispatcher."
                          style={{ width: '100%', resize: 'vertical', padding: '10px 12px', border: '1px solid #334155', borderRadius: '6px', background: '#070b14', color: '#e2e8f0', font: 'inherit' }}
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={isStatusReportSubmitting}
                        style={{ alignSelf: 'flex-start', padding: '10px 16px', border: '1px solid #0e7490', borderRadius: '6px', background: '#082f49', color: '#cffafe', fontWeight: 700, cursor: 'pointer' }}
                      >
                        {isStatusReportSubmitting ? 'Sending report...' : 'Send other report'}
                      </button>
                    </form>
                  )}

                  {statusReportError && <p role="alert" style={{ margin: 0, color: '#fca5a5' }}>{statusReportError}</p>}
                  {statusReportSuccess && <p role="status" style={{ margin: 0, color: '#86efac' }}>{statusReportSuccess}</p>}

                  <div style={{ borderTop: '1px solid #1e293b', paddingTop: '16px' }}>
                    <h4 style={{ margin: '0 0 10px', color: '#cbd5e1', fontSize: '13px' }}>Recent reports</h4>
                    {statusReports.length === 0 ? (
                      <p style={{ margin: 0, color: '#64748b', fontSize: '12px' }}>No status reports have been sent for this alert.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {statusReports.map((report) => (
                          <article key={report.id} style={{ padding: '11px 12px', border: '1px solid #1e293b', borderRadius: '6px', background: '#070b14' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                              <strong style={{ color: report.report_type === 'need_backup' ? '#fbbf24' : '#67e8f9', fontSize: '12px', textTransform: 'uppercase' }}>{report.report_type.replace('_', ' ')}</strong>
                              <time style={{ color: '#64748b', fontSize: '11px' }}>{new Date(report.created_at).toLocaleString()}</time>
                            </div>
                            <p style={{ margin: '6px 0 0', color: '#cbd5e1', fontSize: '13px' }}>{report.message}</p>
                            {report.additional_notes && <p style={{ margin: '5px 0 0', color: '#94a3b8', fontSize: '12px' }}>{report.additional_notes}</p>}
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>
          ) : activeView === 'nav' ? (
            <div style={{ height: '70vh', minHeight: '320px', border: '1px solid #1e293b', borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
              <MapContainer
                markers={[...alertMapMarkers, ...rescuerMapMarkers]}
                center={alertMapCenter}
                route={walkingRoute?.geometry}
                trackDeviceLocation={false}
              />
              <div style={{ position: 'absolute', top: '12px', right: '12px', zIndex: 2, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  type="button"
                  onClick={handleRouteToAlert}
                  disabled={!activeAlert || isRouteLoading}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', border: '1px solid #0e7490', borderRadius: '6px', background: '#082f49', color: '#cffafe', fontWeight: 700, cursor: activeAlert && !isRouteLoading ? 'pointer' : 'not-allowed', opacity: activeAlert && !isRouteLoading ? 1 : 0.65 }}
                >
                  <Navigation size={16} />
                  {isRouteLoading ? 'Calculating route...' : walkingRoute ? 'Refresh route to alert' : 'Route to the alert'}
                </button>
              </div>
              {routeError && (
                <div role="alert" style={{ position: 'absolute', top: '60px', right: '12px', zIndex: 2, maxWidth: 'min(360px, calc(100% - 24px))', padding: '10px 12px', border: '1px solid #7f1d1d', borderRadius: '6px', background: 'rgba(69, 10, 10, 0.95)', color: '#fecaca', fontSize: '12px' }}>
                  {routeError}
                </div>
              )}
              {walkingRoute && (
                <div role="status" style={{ position: 'absolute', bottom: '12px', left: '12px', right: '12px', zIndex: 2, padding: '10px 14px', border: '1px solid #334155', borderRadius: '6px', background: 'rgba(7, 11, 20, 0.92)', color: '#cbd5e1', fontSize: '12px' }}>
                  {walkingRoute.message}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
};

export default RescuerDashboard;