import React, { useState } from 'react'
import { Gauge } from 'lucide-react'

const formatHazardType = (value) => String(value || 'other').replace(/_/g, ' ').toUpperCase()
const formatTime = (value) => value
  ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  : '--:--'
const MIN_SPEED = 0.01
const MAX_SPEED = 2
const BASE_TICKER_DURATION_SECONDS = 34
const SPEED_STORAGE_KEY = 'resq-hazard-speed-multiplier'
const LEGACY_SPEED_STORAGE_KEY = 'resq-hazard-speed'

const HazardTicker = ({ hazards = [], className = '' }) => {
  const [speed, setSpeed] = useState(() => {
    const storedSpeedValue = localStorage.getItem(SPEED_STORAGE_KEY)
    const storedSpeed = storedSpeedValue === null ? Number.NaN : Number(storedSpeedValue)
    if (Number.isFinite(storedSpeed) && storedSpeed >= MIN_SPEED && storedSpeed <= MAX_SPEED) return storedSpeed

    const legacySpeedValue = localStorage.getItem(LEGACY_SPEED_STORAGE_KEY)
    const legacySpeedIndex = legacySpeedValue === null ? Number.NaN : Number(legacySpeedValue)
    const legacySpeedMultipliers = [BASE_TICKER_DURATION_SECONDS / 52, 1, BASE_TICKER_DURATION_SECONDS / 18]
    return Number.isInteger(legacySpeedIndex) && legacySpeedIndex >= 0 && legacySpeedIndex < legacySpeedMultipliers.length
      ? legacySpeedMultipliers[legacySpeedIndex]
      : 1
  })
  const activeHazards = hazards.filter((hazard) => hazard.is_active !== false && !hazard.is_resolved)
  const items = activeHazards.length ? activeHazards : [{ id: 'empty', reported_at: null, road_name: 'No active road hazards', description: 'Monitoring response network' }]
  const updateSpeed = (event) => {
    const nextSpeed = Number(event.target.value)
    setSpeed(nextSpeed)
    localStorage.setItem(SPEED_STORAGE_KEY, String(nextSpeed))
  }

  return (
    <div className={`incident-ticker ${className}`.trim()}>
      <b>LIVE ROAD HAZARD STREAM</b>
      <label className="incident-ticker-speed">
        <Gauge size={12} />
        <input
          type="range"
          min={MIN_SPEED}
          max={MAX_SPEED}
          step="0.01"
          value={speed}
          onChange={updateSpeed}
          aria-label="Hazard stream speed"
          aria-valuetext={`${speed.toFixed(2)} times speed`}
          title="Adjust hazard stream speed"
        />
        <output>{speed.toFixed(2)}x</output>
      </label>
      <div className="incident-ticker-track" style={{ '--ticker-duration': `${BASE_TICKER_DURATION_SECONDS / speed}s` }}>
        {[...items, ...items].map((hazard, index) => (
          <span className="incident-ticker-item" key={`${hazard.id}-${index}`}>
            <i className={`hazard-severity-dot ${String(hazard.severity || 'high').toLowerCase()}`} />
            [{formatTime(hazard.reported_at || hazard.created_at)}] {formatHazardType(hazard.hazard_type)} · {hazard.road_name || 'Unspecified road'} · {hazard.description || 'No description'}
          </span>
        ))}
      </div>
    </div>
  )
}

export default HazardTicker
