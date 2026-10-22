import { API_URL } from '../dataProvider'

const request = async (path, token, options = {}) => {
  if (!token) {
    throw new Error('Your session is missing. Sign in again to manage shipments.')
  }

  const response = await fetch(`${API_URL}/inventory/${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers
    }
  })

  if (!response.ok) {
    const errorMessage = await response.text()
    throw new Error(`Inventory shipment request failed (${response.status}): ${errorMessage}`)
  }

  return response.json()
}

export const fetchPendingInventoryShipments = (token) =>
  request('shipments', token)

export const createInventoryShipment = (token, shipment) =>
  request('shipments', token, {
    method: 'POST',
    body: JSON.stringify(shipment)
  })

export const markInventoryShipmentArrived = (token, shipmentId) =>
  request(`shipments/${encodeURIComponent(shipmentId)}/arrive`, token, {
    method: 'POST'
  })
