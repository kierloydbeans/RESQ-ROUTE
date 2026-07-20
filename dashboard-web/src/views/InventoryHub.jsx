import React from 'react'
import { List, Datagrid, TextField, NumberField, BooleanField } from 'react-admin'

export const InventoryHub = (props) => (
  <List {...props}>
    <Datagrid>
      <TextField source="id" />
      <TextField source="name" label="Item" />
      <TextField source="category" />
      <NumberField source="quantity" />
      <NumberField source="threshold" label="Alert Threshold" />
      <BooleanField source="critical" label="Critical Stock" />
    </Datagrid>
  </List>
)
