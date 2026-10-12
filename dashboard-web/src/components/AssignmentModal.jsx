import React, { useState } from 'react'

const recommendedVehicleTypes = {
  fire: ['firetruck', 'fireengine', 'firevehicle', 'truck'],
  flood: ['rubberboat', 'rescueboat', 'boat', 'waterrescue'],
  medical: ['ambulance'],
  trapped: ['rescuetruck', 'rescuevehicle', 'truck', 'van'],
  earthquake: ['rescuetruck', 'rescuevehicle', 'truck', 'van']
}

const normalizeVehicleType = (type) => String(type || '').toLowerCase().replace(/[^a-z0-9]/g, '')

const getRecommendedVehicleId = (alert, vehicles) => {
  const types = recommendedVehicleTypes[String(alert.disaster_type || '').toLowerCase()]
  if (!types) return null

  const availableVehicles = vehicles.filter((vehicle) => String(vehicle.status).toLowerCase() === 'available')
  for (const type of types) {
    const vehicle = availableVehicles.find((candidate) => normalizeVehicleType(candidate.vehicle_type).includes(type))
    if (vehicle) return vehicle.id
  }
  return null
}

const AssignmentModal = ({ alert, rescuers, hasAvailableRescuer, vehicles, getRescuerDistance, onConfirm, onClose }) => {
  const [selectedRescuer, setSelectedRescuer] = useState(() => rescuers[0] || null)
  const [selectedVehicleIds, setSelectedVehicleIds] = useState(() => {
    const recommendedVehicleId = getRecommendedVehicleId(alert, vehicles)
    return recommendedVehicleId == null ? [] : [recommendedVehicleId]
  })
  const availableVehicles = vehicles.filter((vehicle) => vehicle.status !== 'maintenance')

  const toggleVehicle = (vehicleId) => {
    setSelectedVehicleIds((current) => current.includes(vehicleId)
      ? current.filter((id) => id !== vehicleId)
      : [...current, vehicleId])
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="ops-modal assignment-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="panel-title">
            <h2>ASSIGN RESPONSE TEAM</h2>
            <span>ALERT #{alert.id}</span>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close assignment modal">×</button>
        </div>
        <div className="assignment-body">
          {!hasAvailableRescuer && (
            <p className="assignment-availability-warning" role="status">
              No rescuer is available. A recovering rescuer is selected as a fallback when possible.
            </p>
          )}
          {!selectedRescuer ? (
            <>
              <p>Choose a rescuer for <b>{alert.sender_name}</b>.</p>
              {rescuers.length === 0 ? <p className="modal-empty">No eligible rescuers are available.</p> : rescuers.map((rescuer) => (
                <button className="rescuer-choice" key={rescuer.id} onClick={() => setSelectedRescuer(rescuer)}>
                  <span><b>{rescuer.full_name || rescuer.username}</b><small>@{rescuer.username} · {rescuer.station_name || 'Unassigned station'}</small></span>
                  <em>{getRescuerDistance(rescuer) ?? 'Distance unavailable'}{getRescuerDistance(rescuer) !== null ? ' km away' : ''} · {String(rescuer.status).replace('_', ' ')}</em>
                </button>
              ))}
            </>
          ) : (
            <>
              <button className="assignment-back" type="button" onClick={() => setSelectedRescuer(null)}>← Choose another rescuer</button>
              <div className="assignment-selected-rescuer"><b>{selectedRescuer.full_name || selectedRescuer.username}</b><span>Selected rescuer</span></div>
              <p>Select vehicles to deploy with this rescuer.</p>
              <div className="vehicle-deployment-list">
                {availableVehicles.length === 0 ? <p className="modal-empty">No deployable vehicles available.</p> : availableVehicles.map((vehicle) => (
                  <label className={`vehicle-deployment-choice ${selectedVehicleIds.includes(vehicle.id) ? 'selected' : ''}`} key={vehicle.id}>
                    <input type="checkbox" checked={selectedVehicleIds.includes(vehicle.id)} onChange={() => toggleVehicle(vehicle.id)} />
                    <span><b>{vehicle.vehicle_type} · {vehicle.plate_number}</b><small>{vehicle.driver_name} · capacity {vehicle.capacity}</small></span>
                    <em>{String(vehicle.status).replace('_', ' ')}</em>
                  </label>
                ))}
              </div>
              <button className="assignment-confirm" type="button" onClick={() => onConfirm(selectedRescuer, selectedVehicleIds)}>CONFIRM DEPLOYMENT</button>
            </>
          )}
        </div>
      </section>
    </div>
  )
}

export default AssignmentModal
