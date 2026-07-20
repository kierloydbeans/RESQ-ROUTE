import React from 'react'

const IntakeStats = ({ stats }) => {
  return (
    <div style={{ padding: '1.5rem' }}>
      <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Shelter Intake Statistics</h3>
      <div className="grid grid-cols-2" style={{ gap: '1rem' }}>
        <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--color-primary)', marginBottom: '0.25rem' }}>
            {stats?.totalEvacuees || 0}
          </div>
          <div style={{ fontSize: '0.875rem', color: 'var(--color-gray-600)', fontWeight: '500' }}>
            Total Evacuees
          </div>
        </div>
        <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--color-accent)', marginBottom: '0.25rem' }}>
            {stats?.capacityUsed || 0}%
          </div>
          <div style={{ fontSize: '0.875rem', color: 'var(--color-gray-600)', fontWeight: '500' }}>
            Capacity Used
          </div>
        </div>
        <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--color-secondary)', marginBottom: '0.25rem' }}>
            {stats?.activeShelters || 0}
          </div>
          <div style={{ fontSize: '0.875rem', color: 'var(--color-gray-600)', fontWeight: '500' }}>
            Active Shelters
          </div>
        </div>
        <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--color-dark)', marginBottom: '0.25rem' }}>
            {stats?.criticalNeeds || 0}
          </div>
          <div style={{ fontSize: '0.875rem', color: 'var(--color-gray-600)', fontWeight: '500' }}>
            Critical Needs
          </div>
        </div>
      </div>
    </div>
  )
}

export default IntakeStats
