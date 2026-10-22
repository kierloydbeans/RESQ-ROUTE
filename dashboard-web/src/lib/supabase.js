const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://wsqbushgpximssghrsmh.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzcWJ1c2hncHhpbXNzZ2hyc21oIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDUzMjMyMiwiZXhwIjoyMTAwMTA4MzIyfQ.toAlN3fN1ey-VBIIWxxznuZUXxMkC6XSovtrxPtrTvk'

// Create a Supabase client with REST API configuration
// Note: This uses the REST API endpoint directly, not the standard Supabase JS client
// For direct REST API calls, we'll use fetch with the Supabase headers

export const supabaseHeaders = {
  'apikey': supabaseAnonKey,
  'Authorization': `Bearer ${supabaseAnonKey}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
}

export const supabaseBaseUrl = supabaseUrl.replace(/\/rest\/v1\/?$/, '')

export async function supabaseFetch(endpoint, options = {}) {
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

  // Handle empty responses
  const contentType = response.headers.get('content-type')
  if (contentType && contentType.includes('application/json')) {
    return response.json()
  }

  return response.text()
}

// Helper functions for common queries
export async function fetchCenters(limit = 100) {
  return supabaseFetch(`center?limit=${limit}&order=name.asc`)
}

export async function fetchEvacuees(limit = 500) {
  // Use 'evacuee' (singular) table; removed order clause to avoid 400 if column name differs
  return supabaseFetch(`evacuee?limit=${limit}`)
}

export async function fetchShelteredEvacueesCount() {
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

// Inventory functions - using junction table design

// Consolidated view: fetch master inventory with total quantities (summed across centers)
export async function fetchInventory(limit = 100) {
  return supabaseFetch(`inventory?limit=${limit}&order=item_description.asc`)
}

export async function createInventoryItem(item) {
  return supabaseFetch('inventory', {
    method: 'POST',
    body: JSON.stringify(item)
  })
}

// Per-center view: fetch inventory items allocated to a specific center
export async function fetchCenterInventory(centerId, limit = 200) {
  return supabaseFetch(`center_inventory_detail?center_id=eq.${centerId}&limit=${limit}&order=item_description.asc`)
}

// Inventory with center allocations: fetch master items with their center breakdown
export async function fetchInventoryWithCenters(limit = 100) {
  return supabaseFetch(`inventory_with_centers?limit=${limit}&order=item_description.asc`)
}

// Center inventory detail for specific center (alias for fetchCenterInventory)
export async function fetchInventoryByCenter(centerId, limit = 200) {
  return fetchCenterInventory(centerId, limit)
}