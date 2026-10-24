import React, { useEffect, useState } from 'react'
import MapContainer from './MapContainer'

const EMPTY_FEATURE_COLLECTION = { type: 'FeatureCollection', features: [] }

const readJson = async (response, label) => {
  if (!response.ok) throw new Error(`${label} request failed (${response.status})`)
  return response.json()
}

const LiveHazardMap = ({ apiBaseUrl, active }) => {
  const [roadHazards, setRoadHazards] = useState(EMPTY_FEATURE_COLLECTION)
  const [hazardLayers, setHazardLayers] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!active) return undefined

    const controller = new AbortController()
    const baseUrl = String(apiBaseUrl || '').replace(/\/$/, '')

    const loadHazards = async () => {
      setStatus('loading')
      setError('')
      try {
        const [roadResponse, layerResponse] = await Promise.all([
          fetch(`${baseUrl}/api/v1/hazards/active`, { signal: controller.signal }),
          fetch(`${baseUrl}/api/v1/hazards/map-layers?status=published`, { signal: controller.signal })
        ])
        const [roadData, layerData] = await Promise.all([
          readJson(roadResponse, 'Active hazard'),
          readJson(layerResponse, 'Published hazard layer')
        ])
        if (roadData?.type !== 'FeatureCollection' || !Array.isArray(roadData.features)) {
          throw new Error('Active hazard response is not a GeoJSON FeatureCollection.')
        }
        const layers = Array.isArray(layerData) ? layerData : layerData?.layers
        if (!Array.isArray(layers)) throw new Error('Published hazard layer response is invalid.')
        setRoadHazards(roadData)
        setHazardLayers(layers)
        setStatus('ready')
      } catch (loadError) {
        if (loadError.name === 'AbortError') return
        setStatus('error')
        setError(loadError.message || 'Live hazard data could not be loaded.')
      }
    }

    loadHazards()
    const refreshId = window.setInterval(loadHazards, 30000)
    return () => {
      controller.abort()
      window.clearInterval(refreshId)
    }
  }, [active, apiBaseUrl])

  return (
    <div className="resilience-live-map" aria-busy={status === 'loading'}>
      <MapContainer
        hazardLayers={hazardLayers}
        roadHazardZones={roadHazards}
        trackDeviceLocation={false}
      />
      <div className="resilience-map-status" role={status === 'error' ? 'alert' : 'status'}>
        {status === 'loading' && 'Loading live hazard layers…'}
        {status === 'ready' && `${roadHazards.features.length} active hazard zones · ${hazardLayers.length} published NOAH layers`}
        {status === 'error' && error}
      </div>
    </div>
  )
}

export default LiveHazardMap
