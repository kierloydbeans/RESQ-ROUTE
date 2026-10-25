import { API_URL } from '../dataProvider'

const request = async (path, token, options = {}) => {
  if (!token) {
    throw new Error('Your session is missing. Sign in again to access coordinator data.')
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers
    }
  })

  if (!response.ok) {
    const errorMessage = await response.text()
    throw new Error(`Coordinator request failed (${response.status}): ${errorMessage}`)
  }

  return response.json()
}

export const fetchCoordinatorDashboard = (token) =>
  request('/coordinator-dashboard/', token)

export const fetchCoordinatorCenterInventory = (token, centerId) =>
  request(`/coordinator-dashboard/centers/${encodeURIComponent(centerId)}/inventory`, token)

export const createCoordinatorInventoryItem = (token, item) =>
  request('/inventory/', token, {
    method: 'POST',
    body: JSON.stringify(item)
  })

export const updateCoordinatorCenterStatus = (token, centerId, isActive) =>
  request(`/shelters/${encodeURIComponent(centerId)}`, token, {
    method: 'PUT',
    body: JSON.stringify({ is_active: isActive })
  })
