import { API_URL } from '../dataProvider'

const request = async (path, token, options = {}) => {
  if (!token) {
    throw new Error('Your session is missing. Sign in again to access your center dashboard.')
  }

  const response = await fetch(`${API_URL}/center-coordinator/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  })

  if (!response.ok) {
    const message = await response.text()
    let detail = message
    try {
      detail = JSON.parse(message).detail || message
    } catch {
      detail = message
    }
    throw new Error(typeof detail === 'string' ? detail : `Center dashboard request failed (${response.status})`)
  }

  return response.json()
}

export const fetchAssignedCenter = (token) => request('center', token)
export const uploadAssignedCenterImage = (token, file) => {
  const body = new FormData()
  body.append('file', file)
  return request('center/images', token, { method: 'POST', body })
}
export const fetchAssignedCenterEvacuees = (token) => request('evacuees', token)
export const fetchAssignedCenterInventory = (token) => request('inventory', token)
export const checkInEvacuationHousehold = (token, payload) =>
  request('evacuees/check-in', token, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
