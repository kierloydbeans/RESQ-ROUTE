import React from 'react'
import { List, Datagrid, TextField, DateField, BooleanField, EditButton } from 'react-admin'

const listStyles = {
  margin: '1.5rem',
  '& .RaList-main': {
    borderRadius: '16px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
    border: '1px solid #e5e7eb',
    backgroundColor: '#ffffff',
    overflow: 'hidden'
  },
  '& .MuiTableCell-head': {
    fontWeight: '700',
    color: '#374151',
    backgroundColor: '#f9fafb'
  }
}

export const IncidentTriage = (props) => (
  <div style={{ padding: '1.5rem', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
    <div style={{ marginBottom: '1.5rem' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#111827', margin: 0 }}>
        Incident Triage
      </h1>
      <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.25rem' }}>
        Review and prioritize incoming emergency reports and dispatches
      </p>
    </div>

    <List {...props} sx={listStyles} component="div" title="Incident Reports">
      <Datagrid rowClick="edit" bulkActionButtons={false}>
        <TextField source="id" label="ID" />
        <TextField source="type" label="Incident Type" sx={{ fontWeight: '600', color: '#c52222' }} />
        <TextField source="location" label="Location" />
        <TextField source="severity" label="Severity" />
        <BooleanField source="active" label="Active Status" />
        <DateField source="reportedAt" label="Reported Time" showTime />
        <EditButton />
      </Datagrid>
    </List>
  </div>
)

export default IncidentTriage