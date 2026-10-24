import { useCallback, useEffect, useMemo, useState } from 'react'
import { BASE_URL } from '../dataProvider'

const EMPTY_COLLECTION = { type: 'FeatureCollection', features: [] }

export const useActiveRoadHazards = (lastMessage, isConnected) => {
  const [collection, setCollection] = useState(EMPTY_COLLECTION)

  const refresh = useCallback(async () => {
    const response = await fetch(`${BASE_URL}/api/v1/hazards/active`)
    if (!response.ok) throw new Error(`Road hazards could not be loaded (${response.status}).`)
    const next = await response.json()
    if (next.type !== 'FeatureCollection' || !Array.isArray(next.features)) {
      throw new Error('Invalid road hazard map response.')
    }
    setCollection(next)
  }, [])

  const applyFeature = useCallback((feature) => {
    if (!feature || feature.id == null) return
    setCollection((current) => ({
      type: 'FeatureCollection',
      features: [
        ...current.features.filter((item) => String(item.id) !== String(feature.id)),
        ...(feature.properties?.is_active === false || feature.properties?.is_resolved || feature.properties?.review_status !== 'approved' ? [] : [feature]),
      ],
    }))
  }, [])

  useEffect(() => {
    void refresh().catch(() => {})
    const timer = window.setInterval(() => void refresh().catch(() => {}), 30_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  useEffect(() => {
    if (isConnected) void refresh().catch(() => {})
  }, [isConnected, refresh])

  useEffect(() => {
    if (['road_hazard_created', 'road_hazard_updated'].includes(lastMessage?.type)) {
      applyFeature(lastMessage.data)
    }
  }, [lastMessage, applyFeature])

  const hazards = useMemo(() => collection.features.map((feature) => feature.properties), [collection])
  return { collection, hazards, applyFeature, refresh }
}
