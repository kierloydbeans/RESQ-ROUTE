import React, { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'

const DEFAULT_LOCATION = [120.98, 14.65]
const VECTOR_STYLE_URL = import.meta.env.VITE_MAP_STYLE_URL || 'https://api.maptiler.com/maps/base-v4/style.json?key=mt7k9rWpGBUe5lFcSLZ1'

maplibregl.setWorkerUrl(maplibreWorkerUrl)
console.info('[RESQ map] MapLibre worker configured', { workerUrl: maplibreWorkerUrl })

const resolveDirectTileSources = (style) => {
  const sources = Object.fromEntries(Object.entries(style.sources || {}).map(([sourceId, source]) => {
    if (source.type !== 'vector' || !source.url?.includes('/tiles/v3/tiles.json')) {
      return [sourceId, source]
    }

    const tileUrl = source.url.replace('/tiles/v3/tiles.json', '/tiles/v3/{z}/{x}/{y}.pbf')
    const { url, ...sourceWithoutTileJsonUrl } = source
    console.info('[RESQ map] Replacing TileJSON source with direct PBF template', { sourceId, tileUrl })
    return [sourceId, { ...sourceWithoutTileJsonUrl, tiles: [tileUrl] }]
  }))

  const rasterUrl = VECTOR_STYLE_URL.replace(/\/style\.json(\?.*)?$/, '/{z}/{x}/{y}.png$1')
  const backgroundIndex = style.layers.findIndex((layer) => layer.type === 'background')
  const rasterLayer = {
    id: 'resq-raster-fallback',
    type: 'raster',
    source: 'resq-raster-fallback',
    layout: { visibility: 'none' },
    paint: { 'raster-opacity': 1 },
  }

  console.info('[RESQ map] Configuring PNG fallback', { rasterUrl })
  return {
    ...style,
    sources: {
      ...sources,
      'resq-raster-fallback': { type: 'raster', tiles: [rasterUrl], tileSize: 256 },
    },
    layers: [
      ...style.layers.slice(0, backgroundIndex + 1),
      rasterLayer,
      ...style.layers.slice(backgroundIndex + 1),
    ],
  }
}

const normalizeCoordinates = (position) => {
  if (!Array.isArray(position) || position.length < 2) {
    return DEFAULT_LOCATION
  }

  const [first, second] = position

  if (typeof first !== 'number' || typeof second !== 'number') {
    return DEFAULT_LOCATION
  }

  if (Math.abs(first) > 90) {
    return [first, second]
  }

  return [second, first]
}

const createMarkerElement = (color = '#dc2626', icon = null) => {
  const el = document.createElement('div')
  el.style.display = 'flex'
  el.style.alignItems = 'center'
  el.style.justifyContent = 'center'
  el.style.width = icon ? '28px' : '16px'
  el.style.height = icon ? '28px' : '16px'
  el.style.borderRadius = icon ? '50%' : '50%'
  el.style.background = icon ? '#fff7ed' : color
  el.style.border = icon ? '2px solid #f59e0b' : '2px solid white'
  el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)'
  el.style.color = icon ? '#b45309' : '#ffffff'
  el.style.fontSize = icon ? '16px' : '0'
  el.style.fontWeight = '700'
  el.textContent = icon || ''
  return el
}

const MapContainer = ({ markers = [] }) => {
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const markerInstancesRef = useRef([])
  const deviceMarkerRef = useRef(null)
  const watchIdRef = useRef(null)
  const hasCenteredOnDeviceRef = useRef(false)

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    let disposed = false
    let fallbackTimer = null

    const initializeMap = async () => {
      try {
        console.info('[RESQ map] Fetching style', {
          styleUrl: VECTOR_STYLE_URL,
          location: window.location.href,
          mode: import.meta.env.MODE,
        })
        const response = await fetch(VECTOR_STYLE_URL)
        if (!response.ok) throw new Error(`Style request failed with HTTP ${response.status}`)
        const style = resolveDirectTileSources(await response.json())
        if (disposed) return

        const map = new maplibregl.Map({
          container: mapContainerRef.current,
          style,
          center: DEFAULT_LOCATION,
          zoom: 13,
          transformRequest: (url, resourceType) => {
            const isVectorTile = resourceType === 'Tile' && url.includes('.pbf')
            console.debug('[RESQ map] Requesting resource', { resourceType, url, isVectorTile })
            return { url }
          },
        })
        mapRef.current = map
        let rasterFallbackShown = false
        const enableRasterFallback = (reason) => {
          if (rasterFallbackShown || !map.getLayer('resq-raster-fallback')) return
          rasterFallbackShown = true
          map.setLayoutProperty('resq-raster-fallback', 'visibility', 'visible')
          console.warn('[RESQ map] Enabling PNG fallback', { reason })
        }
        map.resize()
        console.info('[RESQ map] Map dimensions initialized', {
          width: mapContainerRef.current.clientWidth,
          height: mapContainerRef.current.clientHeight,
        })

        map.on('load', () => {
          if (fallbackTimer !== null) window.clearTimeout(fallbackTimer)
          map.resize()
          console.info('[RESQ map] Map loaded successfully', { sources: Object.keys(map.getStyle().sources || {}) })
        })
        map.on('styledata', () => console.info('[RESQ map] Style data received'))
        map.on('sourcedataloading', (event) => {
          if (event.sourceId) console.debug('[RESQ map] Source data loading', { sourceId: event.sourceId })
        })
        map.on('sourcedata', (event) => {
          if (event.sourceId) console.debug('[RESQ map] Source data received', {
            sourceId: event.sourceId,
            sourceDataType: event.sourceDataType,
            isSourceLoaded: event.isSourceLoaded,
          })
        })
        map.on('idle', () => {
          const loadedSources = Object.keys(map.getStyle().sources || {}).filter((sourceId) => map.isSourceLoaded(sourceId))
          console.info('[RESQ map] Map idle', { loadedSources })
          if (!loadedSources.includes('maptiler_planet')) enableRasterFallback('vector source is not loaded')
        })
        map.on('error', (event) => {
          const resourceUrl = event.error?.url || ''
          console.error('[RESQ map] Resource failed', { error: event.error || event, resourceUrl })
          if (resourceUrl.includes('.pbf')) enableRasterFallback('PBF request failed')
        })
        map.on('webglcontextlost', (event) => console.error('[RESQ map] WebGL context lost', event))
        map.addControl(new maplibregl.NavigationControl(), 'top-right')
        fallbackTimer = window.setTimeout(() => {
          if (!map.isSourceLoaded('maptiler_planet')) enableRasterFallback('vector source startup timeout')
        }, 5000)

        if ('geolocation' in navigator) {
          watchIdRef.current = navigator.geolocation.watchPosition(
            (position) => {
              const lng = position.coords.longitude
              const lat = position.coords.latitude

              if (!mapRef.current) return

              if (!deviceMarkerRef.current) {
                deviceMarkerRef.current = new maplibregl.Marker({ element: createMarkerElement('#0f766e') })
                  .setLngLat([lng, lat])
                  .setPopup(new maplibregl.Popup({ offset: 25 }).setText('Current device location'))
                  .addTo(mapRef.current)
              } else {
                deviceMarkerRef.current.setLngLat([lng, lat])
              }

              if (!hasCenteredOnDeviceRef.current) {
                mapRef.current.flyTo({ center: [lng, lat], zoom: 14, speed: 0.7 })
                hasCenteredOnDeviceRef.current = true
              }
            },
            (error) => console.warn('Geolocation watch failed:', error.message),
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
          )
        }
      } catch (error) {
        console.error('[RESQ map] Map initialization failed', error)
      }
    }

    initializeMap()

    return () => {
      disposed = true
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer)
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
      deviceMarkerRef.current?.remove()
      markerInstancesRef.current.forEach((marker) => marker.remove())
      markerInstancesRef.current = []
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!mapContainerRef.current || typeof ResizeObserver === 'undefined') return undefined

    const observer = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.resize()
        console.debug('[RESQ map] Map resized', {
          width: mapContainerRef.current.clientWidth,
          height: mapContainerRef.current.clientHeight,
        })
      }
    })
    observer.observe(mapContainerRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!mapRef.current) return

    markerInstancesRef.current.forEach((marker) => marker.remove())
    markerInstancesRef.current = []

    const map = mapRef.current

    markers.forEach((marker) => {
      const [lng, lat] = normalizeCoordinates(marker.position)
      const markerInstance = new maplibregl.Marker({ element: createMarkerElement(marker.color, marker.icon) })
        .setLngLat([lng, lat])
        .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(`<strong>${marker.label}</strong>`))
        .addTo(map)

      markerInstancesRef.current.push(markerInstance)
    })
  }, [markers])

  return (
    <div className="map-container" style={{ height: '100%', width: '100%', position: 'relative', zIndex: 1 }}>
      <div ref={mapContainerRef} style={{ height: '100%', width: '100%' }} />
    </div>
  )
}

export default MapContainer
