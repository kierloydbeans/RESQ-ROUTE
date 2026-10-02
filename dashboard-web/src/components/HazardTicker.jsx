import React, { useState } from 'react'
import { Gauge } from 'lucide-react'

const formatHazardType = (value) => String(value || 'other').replace(/_/g, ' ').toUpperCase()
const formatTime = (value) => value
  ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  : '--:--'
const speedOptions = [
  { label: 'Slow', seconds: 52 },
  { label: 'Normal', seconds: 34 },
  { label: 'Fast', seconds: 18 }
]

const HazardTicker = ({ hazards = [] }) => {
  const [speedIndex, setSpeedIndex] = useState(() => {
    const storedSpeed = Number(localStorage.getItem('resq-hazard-speed'))
    return Number.isInteger(storedSpeed) && storedSpeed >= 0 && storedSpeed < speedOptions.length ? storedSpeed : 1
  })
  const activeHazards = hazards.filter((hazard) => hazard.is_active !== false && !hazard.is_resolved)
  const items = activeHazards.length ? activeHazards : [{ id: 'empty', reported_at: null, road_name: 'No active road hazards', description: 'Monitoring response network' }]
  const speed = speedOptions[speedIndex]
  const cycleSpeed = () => {
    setSpeedIndex((currentIndex) => {
      const nextIndex = (currentIndex + 1) % speedOptions.length
      localStorage.setItem('resq-hazard-speed', String(nextIndex))
      return nextIndex
    })
  }

  return (
    <div className="incident-ticker">
      <b>LIVE ROAD HAZARD STREAM</b>
      <button className="incident-ticker-speed" type="button" onClick={cycleSpeed} aria-label={`Hazard stream speed: ${speed.label}`} title={`Speed: ${speed.label}. Click to change`}>
        <Gauge size={12} />
        <span>{speed.label}</span>
      </button>
      <div className="incident-ticker-track" style={{ '--ticker-duration': `${speed.seconds}s` }}>
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
