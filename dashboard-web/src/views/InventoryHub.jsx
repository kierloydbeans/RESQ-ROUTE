import React from 'react'
import { List, Datagrid, TextField, NumberField, BooleanField } from 'react-admin'

const listStyles = {
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

export const InventoryHub = (props) => (
  <div style={{ padding: '1.5rem', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
    <div style={{ marginBottom: '1.5rem' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#111827', margin: 0 }}>
        Supply & Inventory Hub
      </h1>
      <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.25rem' }}>
        Track medical supplies, food rations, and critical shelter stock levels
      </p>
    </div>

    <List {...props} sx={listStyles} component="div" title="Inventory Stock">
      <Datagrid bulkActionButtons={false}>
        <TextField source="id" label="ID" />
        <TextField source="name" label="Item Name" sx={{ fontWeight: '600', color: '#111827' }} />
        <TextField source="category" label="Category" />
        <NumberField source="quantity" label="Current Stock" />
        <NumberField source="threshold" label="Alert Threshold" />
        <BooleanField source="critical" label="Critical Stock" />
      </Datagrid>
    </List>
  </div>
)

export default InventoryHub