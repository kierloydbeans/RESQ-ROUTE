import { API_URL } from '../dataProvider'

const request = async (path, token, options = {}) => {
  if (!token) {
    throw new Error('Your session is missing. Sign in again to manage center assignments.')
  }

  const response = await fetch(`${API_URL}/auth/${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers
    }
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Coordinator assignment request failed (${response.status}): ${message}`)
  }

  return response.json()
}

export const fetchCoordinatorAssignments = (token) =>
  request('coordinator-assignments', token)

export const assignCoordinatorToCenter = (token, userId, centerId) =>
  request(`coordinator-assignments/${encodeURIComponent(userId)}`, token, {
    method: 'PUT',
    body: JSON.stringify({ center_id: centerId })
  })
