import React, { useState } from 'react'

const AssignmentModal = ({ alert, rescuers, vehicles, getRescuerDistance, onConfirm, onClose }) => {
  const [selectedRescuer, setSelectedRescuer] = useState(null)
  const [selectedVehicleIds, setSelectedVehicleIds] = useState([])
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
          {!selectedRescuer ? (
            <>
              <p>Choose a rescuer for <b>{alert.sender_name}</b>.</p>
              {rescuers.length === 0 ? <p className="modal-empty">No rescuer profiles found.</p> : rescuers.map((rescuer) => (
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
