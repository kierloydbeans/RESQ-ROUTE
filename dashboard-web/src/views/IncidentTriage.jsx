import React from 'react'
import { List, Datagrid, TextField, DateField, BooleanField, EditButton } from 'react-admin'

export const IncidentTriage = (props) => (
  <List {...props}>
    <Datagrid>
      <TextField source="id" />
      <TextField source="type" label="Incident Type" />
      <TextField source="location" />
      <TextField source="severity" />
      <BooleanField source="active" label="Active" />
      <DateField source="reportedAt" label="Reported Time" />
      <EditButton />
    </Datagrid>
  </List>
)
