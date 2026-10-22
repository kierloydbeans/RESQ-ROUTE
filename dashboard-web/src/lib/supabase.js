const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://wsqbushgpximssghrsmh.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

function assertPublicSupabaseKey() {
  if (!supabaseAnonKey) {
    throw new Error('VITE_SUPABASE_ANON_KEY is not configured.')
  }

  const tokenPayload = supabaseAnonKey.split('.')[1]
  if (!tokenPayload) return

  try {
    const base64 = tokenPayload.replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')))
    if (payload.role === 'service_role') {
      throw new Error('VITE_SUPABASE_ANON_KEY must be a public anon key, not a service-role key.')
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('service-role')) throw error
  }
}

export const supabaseHeaders = {
  apikey: supabaseAnonKey,
  Authorization: `Bearer ${supabaseAnonKey}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation'
}

export const supabaseBaseUrl = supabaseUrl.replace(/\/rest\/v1\/?$/, '')

export async function supabaseFetch(endpoint, options = {}) {
  assertPublicSupabaseKey()
  const url = `${supabaseBaseUrl}/rest/v1/${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers: {
      ...supabaseHeaders,
      ...options.headers
    }
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Supabase error: ${response.status} - ${error}`)
  }

  const contentType = response.headers.get('content-type')
  if (contentType && contentType.includes('application/json')) {
    return response.json()
  }

  return response.text()
}

export async function fetchCenters(limit = 100) {
  return supabaseFetch(`center?limit=${limit}&order=name.asc`)
}

export async function fetchEvacuees(limit = 500) {
  return supabaseFetch(`evacuee?limit=${limit}`)
}

export async function fetchShelteredEvacueesCount() {
  assertPublicSupabaseKey()
  const response = await fetch(
    `${supabaseBaseUrl}/rest/v1/evacuee?select=id&check_out_time=is.null`,
    {
      headers: {
        ...supabaseHeaders,
        Prefer: 'count=exact',
        Range: '0-0'
      }
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to fetch sheltered evacuee count: ${response.status} - ${error}`)
  }

  const contentRange = response.headers.get('content-range')
  const count = contentRange?.match(/\/(\d+)$/)?.[1]
  if (count === undefined) {
    throw new Error(`Supabase did not return an exact sheltered evacuee count (Content-Range: ${contentRange || 'missing'}).`)
  }

  return Number(count)
}

export async function fetchActiveAlertsCount() {
  assertPublicSupabaseKey()
  const response = await fetch(
    `${supabaseBaseUrl}/rest/v1/emergency_alert?select=id&status=neq.CLOSED`,
    {
      headers: {
        ...supabaseHeaders,
        Prefer: 'count=exact',
        Range: '0-0'
      }
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to fetch active alerts: ${response.status} - ${error}`)
  }

  const contentRange = response.headers.get('content-range')
  const count = contentRange?.match(/\/(\d+)$/)?.[1]
  if (count === undefined) {
    throw new Error(`Supabase did not return an exact active-alert count (Content-Range: ${contentRange || 'missing'}).`)
  }

  return Number(count)
}

export async function updateCenterStatus(centerId, isActive) {
  return supabaseFetch(`center?id=eq.${centerId}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: isActive })
  })
}

export async function fetchInventory(limit = 100) {
  return supabaseFetch(`inventory?limit=${limit}&order=item_description.asc`)
}

export async function createInventoryItem(item) {
  return supabaseFetch('inventory', {
    method: 'POST',
    body: JSON.stringify(item)
  })
}

export async function fetchCenterInventory(centerId, limit = 200) {
  return supabaseFetch(`center_inventory_detail?center_id=eq.${centerId}&limit=${limit}&order=item_description.asc`)
}

export async function fetchInventoryWithCenters(limit = 100) {
  return supabaseFetch(`inventory_with_centers?limit=${limit}&order=item_description.asc`)
}

export async function fetchInventoryByCenter(centerId, limit = 200) {
  return fetchCenterInventory(centerId, limit)
}
