import React, { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { LocateFixed } from 'lucide-react'
import 'maplibre-gl/dist/maplibre-gl.css'

const DEFAULT_LOCATION = [120.98, 14.65]
const VECTOR_STYLE_URL = import.meta.env.VITE_MAP_STYLE_URL || 'https://api.maptiler.com/maps/base-v4/style.json?key=mt7k9rWpGBUe5lFcSLZ1'
const NOAH_DATASET_URL = 'https://huggingface.co/datasets/bettergovph/project-noah-hazard-maps'

maplibregl.setWorkerUrl(maplibreWorkerUrl)
console.info('[RESQ map] MapLibre worker configured', { workerUrl: maplibreWorkerUrl })

const resolveDirectTileSources = (style) => {
  // Preserve the provider TileJSON source so MapLibre uses the provider's
  // metadata and tile template instead of a guessed direct PBF URL.
  const sources = style.sources || {}

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

const improveMapLabelReadability = (style) => ({
  ...style,
  layers: style.layers.map((layer) => {
    if (layer.type !== 'symbol' || !layer.layout?.['text-field']) return layer

    const existingHaloWidth = Number(layer.paint?.['text-halo-width'])
    const textSize = layer.layout['text-size']
    const isStreetLabel = /road|street|highway|transportation/i.test(layer.id)
    const readableTextSize = isStreetLabel && typeof textSize === 'number'
      ? textSize * 1.08
      : isStreetLabel && Array.isArray(textSize)
        ? ['*', textSize, 1.08]
        : textSize
    return {
      ...layer,
      layout: readableTextSize === textSize
        ? layer.layout
        : { ...layer.layout, 'text-size': readableTextSize },
      paint: {
        ...layer.paint,
        'text-halo-color': layer.paint?.['text-halo-color'] || '#ffffff',
        'text-halo-width': Number.isFinite(existingHaloWidth) ? Math.max(existingHaloWidth, 1.25) : 1.25,
        'text-halo-blur': layer.paint?.['text-halo-blur'] ?? 0.2,
      },
    }
  }),
})

const normalizeCoordinates = (position) => {
  if (!Array.isArray(position) || position.length < 2) {
    return DEFAULT_LOCATION
  }

  const [first, second] = position
  const normalizedFirst = Number(first)
  const normalizedSecond = Number(second)
  if (!Number.isFinite(normalizedFirst) || !Number.isFinite(normalizedSecond)) {
    return DEFAULT_LOCATION
  }

  if (Math.abs(normalizedFirst) > 90) {
    return [normalizedFirst, normalizedSecond]
  }

  return [normalizedSecond, normalizedFirst]
}

const normalizeRouteData = (route) => {
  if (!route) return { type: 'FeatureCollection', features: [] }
  if (route.type === 'Feature' || route.type === 'FeatureCollection') return route
  if (route.type === 'LineString' || route.type === 'MultiLineString') {
    return { type: 'Feature', properties: {}, geometry: route }
  }
  return { type: 'FeatureCollection', features: [] }
}

const getRouteCoordinates = (route) => {
  if (!route) return []
  if (route.type === 'Feature') return route.geometry?.coordinates || []
  if (route.type === 'FeatureCollection') return route.features?.flatMap((feature) => feature.geometry?.coordinates || []) || []
  return route.coordinates || []
}

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character])

const formatPopupDetails = (marker) => {
  const details = marker.details || {}
  const rows = Object.entries(details)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([label, value]) => `<div class="map-popup-row"><span>${escapeHtml(label.replace(/_/g, ' '))}</span><b>${escapeHtml(value)}</b></div>`)
    .join('')
  return `<div class="map-popup"><strong>${escapeHtml(marker.label || 'Map marker')}</strong>${rows}</div>`
}

const createMarkerElement = (color = '#dc2626', icon = null) => {
  const el = document.createElement('div')
  el.className = 'resq-map-marker'
  el.style.display = 'flex'
  el.style.alignItems = 'center'
  el.style.justifyContent = 'center'
  el.style.width = icon ? '28px' : '16px'
  el.style.height = icon ? '28px' : '16px'
  el.style.borderRadius = '50%'
  el.style.background = icon ? '#fff1ed' : color
  el.style.border = icon ? `2px solid ${color}` : '2px solid white'
  el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)'
  el.style.setProperty('--marker-color', color)
  el.style.color = icon ? color : '#ffffff'
  el.style.fontSize = icon ? '16px' : '0'
  el.style.fontWeight = '700'
  el.textContent = icon || ''
  return el
}

const MapContainer = ({
  markers = [], 
  route = null, 
  center = null,
  centerZoom = 14,
  focusMarkerId = null,
  highlightMarkerId = null,
  selectedAlertCategory = 'all',
  hazardLayers = [],
  roadHazardZones = { type: 'FeatureCollection', features: [] },
  pendingRoadHazardZones = { type: 'FeatureCollection', features: [] },
  centerRequestKey = 0,
  pinnedLocation = null, 
  onMapClick, 
  trackDeviceLocation = true 
}) => {
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const markerInstancesRef = useRef(new Map())
  const deviceMarkerRef = useRef(null)
  const devicePositionRef = useRef(null)
  const pinnedMarkerRef = useRef(null)
  const pinnedLocationRef = useRef(pinnedLocation)
  const watchIdRef = useRef(null)
  const hasCenteredOnDeviceRef = useRef(false)
  const locationMessageTimeoutRef = useRef(null)
  const [locationMessage, setLocationMessage] = useState('')
  const [isLocating, setIsLocating] = useState(false)
  const markersRef = useRef(markers)
  const routeRef = useRef(route)
  const centerRef = useRef(center)
  const focusMarkerIdRef = useRef(focusMarkerId)
  const highlightMarkerIdRef = useRef(highlightMarkerId)
  const selectedAlertCategoryRef = useRef(selectedAlertCategory)
  const hazardLayersRef = useRef(hazardLayers)
  const roadHazardZonesRef = useRef(roadHazardZones)
  const pendingRoadHazardZonesRef = useRef(pendingRoadHazardZones)
  const onMapClickRef = useRef(onMapClick)
  const markersSignature = JSON.stringify(markers)
  const centerSignature = JSON.stringify(center)
  const hazardLayersSignature = JSON.stringify(hazardLayers)
  const roadHazardZonesSignature = JSON.stringify(roadHazardZones)
  const pendingRoadHazardZonesSignature = JSON.stringify(pendingRoadHazardZones)
  pinnedLocationRef.current = pinnedLocation

  const showDeviceLocation = (map, longitude, latitude) => {
    const position = [longitude, latitude]
    devicePositionRef.current = position
    syncDeviceMarker(map, position)

    hasCenteredOnDeviceRef.current = true
    const selectedCenterOffset = highlightMarkerIdRef.current != null
      && window.matchMedia('(max-width: 768px)').matches
      ? [0, -Math.round(map.getContainer().clientHeight * 0.22)]
      : [0, 0]
    map.flyTo({ center: position, zoom: 15, offset: selectedCenterOffset, speed: 0.7 })
  }

  const syncDeviceMarker = (map, position) => {
    if (!position) return
    const [longitude, latitude] = position
    if (!deviceMarkerRef.current) {
      const markerElement = createMarkerElement('#2563eb')
      markerElement.classList.add('is-device-location-marker')
      markerElement.setAttribute('role', 'img')
      markerElement.setAttribute('aria-label', 'Your current location')
      markerElement.title = 'Your location'
      deviceMarkerRef.current = new maplibregl.Marker({ element: markerElement, anchor: 'center' })
        .setLngLat([longitude, latitude])
        .setPopup(new maplibregl.Popup({ offset: 18 }).setText('Your location'))
        .addTo(map)
    } else {
      deviceMarkerRef.current.setLngLat([longitude, latitude])
    }
  }

  const syncPinnedMarker = (map, location) => {
    const latitudeValue = location?.latitude
    const longitudeValue = location?.longitude
    const latitude = Number(latitudeValue)
    const longitude = Number(longitudeValue)
    const hasCoordinates = latitudeValue != null
      && longitudeValue != null
      && String(latitudeValue).trim() !== ''
      && String(longitudeValue).trim() !== ''
      && Number.isFinite(latitude)
      && Number.isFinite(longitude)
      && latitude >= -90
      && latitude <= 90
      && longitude >= -180
      && longitude <= 180
    if (!hasCoordinates) {
      pinnedMarkerRef.current?.remove()
      pinnedMarkerRef.current = null
      return
    }

    const coordinates = [longitude, latitude]
    if (!pinnedMarkerRef.current) {
      const markerElement = document.createElement('div')
      markerElement.className = 'resq-map-marker is-pinned-location-marker'
      markerElement.setAttribute('role', 'img')
      markerElement.setAttribute('aria-label', 'Pinned incident location')
      markerElement.title = 'Pinned incident location'
      markerElement.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 10.2c0 5.4-8.2 12-8.2 12S3.8 15.6 3.8 10.2a8.2 8.2 0 1 1 16.4 0Z"/><circle cx="12" cy="10" r="2.6"/></svg>'
      pinnedMarkerRef.current = new maplibregl.Marker({ element: markerElement, anchor: 'bottom' })
        .setLngLat(coordinates)
        .setPopup(new maplibregl.Popup({ offset: 28 }).setText('Pinned incident location'))
        .addTo(map)
    } else {
      pinnedMarkerRef.current.setLngLat(coordinates)
    }

    const markerElement = pinnedMarkerRef.current.getElement()
    markerElement.classList.remove('pin-dropping')
    void markerElement.offsetWidth
    markerElement.classList.add('pin-dropping')
  }

  const handleMyLocation = () => {
    const map = mapRef.current
    if (!map) return

    if (devicePositionRef.current) {
      const [longitude, latitude] = devicePositionRef.current
      showDeviceLocation(map, longitude, latitude)
      return
    }

    if (!navigator.geolocation) {
      setLocationMessage('Location is not available on this device.')
      return
    }

    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setIsLocating(false)
        setLocationMessage('')
        showDeviceLocation(map, coords.longitude, coords.latitude)
      },
      (error) => {
        setIsLocating(false)
        const message = error.code === error.PERMISSION_DENIED
          ? 'Allow location access to find your position.'
          : 'Could not get your location. Try again.'
        setLocationMessage(message)
        if (locationMessageTimeoutRef.current !== null) window.clearTimeout(locationMessageTimeoutRef.current)
        locationMessageTimeoutRef.current = window.setTimeout(() => setLocationMessage(''), 5000)
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    )
  }

  const splashHazardGeometry = (geometry, seedText = '') => {
    if (geometry?.type !== 'Polygon' || geometry.coordinates?.length !== 1) return geometry
    const ring = geometry.coordinates[0]
    if (ring.length !== 5) return geometry

    const longitudes = ring.map(([longitude]) => longitude)
    const latitudes = ring.map(([, latitude]) => latitude)
    const minLongitude = Math.min(...longitudes)
    const maxLongitude = Math.max(...longitudes)
    const minLatitude = Math.min(...latitudes)
    const maxLatitude = Math.max(...latitudes)
    const width = maxLongitude - minLongitude
    const height = maxLatitude - minLatitude
    const centerLongitude = (minLongitude + maxLongitude) / 2
    const centerLatitude = (minLatitude + maxLatitude) / 2
    let seed = [...String(seedText)].reduce((value, character) => value + character.charCodeAt(0), 0)
    const pointCount = 16
    const points = Array.from({ length: pointCount }, (_, index) => {
      seed = (seed * 9301 + 49297) % 233280
      const variation = 0.88 + (seed / 233280) * 0.22
      const angle = (Math.PI * 2 * index) / pointCount
      return [
        centerLongitude + Math.cos(angle) * width * 0.58 * variation,
        centerLatitude + Math.sin(angle) * height * 0.58 * variation,
      ]
    })
    points.push(points[0])

    return {
      ...geometry,
      coordinates: [points],
    }
  }

  const updateHazardLayers = (map, nextLayers) => {
    const source = map.getSource('resq-hazard-layers')
    if (!source) return
    source.setData({
      type: 'FeatureCollection',
      features: nextLayers.map((layer) => ({
        type: 'Feature',
        id: layer.id,
        geometry: splashHazardGeometry(layer.geometry, layer.source_grid_id || layer.id),
        properties: {
          hazard_level: layer.hazard_level,
          hazard_score: layer.hazard_score,
          hazard_label: `${String(layer.hazard_level || 'unknown').toUpperCase()}\n${(Number(layer.hazard_score || 0) * 100).toFixed(0)}%`,
          source: layer.source,
          is_published: layer.is_published,
        },
        })),
    })
  }

  useEffect(() => {
    onMapClickRef.current = onMapClick
  }, [onMapClick])

  const updateAlertMarkerEmphasis = () => {
    markerInstancesRef.current.forEach(({ marker }) => {
      const element = marker.getElement()
      const isAlertMarker = element.classList.contains('is-alert-marker')
      const isFocused = element.dataset.alertId === String(focusMarkerIdRef.current)
      const hasFocusedMarker = focusMarkerIdRef.current != null
      const isCategoryHighlighted = isAlertMarker
        && selectedAlertCategoryRef.current !== 'all'
        && element.dataset.alertCategory === selectedAlertCategoryRef.current

      element.classList.toggle('is-focused', isFocused)
      element.classList.toggle('is-category-highlighted', isCategoryHighlighted)
      element.classList.toggle('is-dimmed', isAlertMarker && hasFocusedMarker && !isFocused)
      element.style.zIndex = isFocused ? '1000' : ''
    })
  }

  const renderMarkers = (map, nextMarkers) => {
    const visibleMarkers = new Map()
    nextMarkers.forEach((marker, index) => {
      if (marker.kind === 'alert' && selectedAlertCategoryRef.current !== 'all'
        && (marker.category || 'other') !== selectedAlertCategoryRef.current) return
      const key = marker.id == null ? `${marker.kind || 'marker'}:${index}` : `${marker.kind || 'marker'}:${marker.id}`
      visibleMarkers.set(key, marker)
    })

    markerInstancesRef.current.forEach((entry, key) => {
      if (visibleMarkers.has(key)) {
        if (entry.removalTimer !== null) {
          window.clearTimeout(entry.removalTimer)
          entry.removalTimer = null
          entry.marker.getElement().classList.remove('is-exiting')
        }
        return
      }
      if (entry.removalTimer !== null) return
      const element = entry.marker.getElement()
      element.classList.remove('is-entering')
      element.classList.add('is-exiting')
      entry.removalTimer = window.setTimeout(() => {
        if (markerInstancesRef.current.get(key) !== entry) return
        entry.marker.remove()
        markerInstancesRef.current.delete(key)
      }, 180)
    })

    visibleMarkers.forEach((marker, key) => {
      const signature = JSON.stringify(marker)
      const existingEntry = markerInstancesRef.current.get(key)
      if (existingEntry && existingEntry.signature === signature) return
      if (existingEntry) {
        if (existingEntry.removalTimer !== null) window.clearTimeout(existingEntry.removalTimer)
        existingEntry.marker.remove()
        markerInstancesRef.current.delete(key)
      }

      const [lng, lat] = normalizeCoordinates(marker.position)
      const element = createMarkerElement(marker.color, marker.icon)
      element.classList.add('is-entering')
      const isAlertMarker = marker.kind === 'alert' && marker.id != null
      const isShelterHighlighted = marker.id != null && String(marker.id) === String(highlightMarkerIdRef.current)
      element.classList.toggle('is-center-marker', marker.kind === 'shelter')
      element.classList.toggle('is-closed-shelter', marker.kind === 'shelter' && marker.isClosed === true)
      element.classList.toggle('is-unverified-shelter', marker.kind === 'shelter' && marker.isUnverified === true)
      element.setAttribute('role', 'img')
      element.setAttribute('aria-label', marker.accessibilityLabel || marker.label || 'Map marker')
      element.title = marker.label || 'Map marker'
      if (marker.id != null) element.dataset.markerId = String(marker.id)
      if (isAlertMarker) {
        element.dataset.alertId = String(marker.id)
        element.dataset.alertCategory = marker.category || 'other'
      }
      element.classList.toggle('is-full-shelter', marker.kind === 'shelter' && marker.isFull === true)
      element.classList.toggle('is-alert-marker', isAlertMarker)
      element.classList.toggle('is-shelter-highlighted', isShelterHighlighted)
      const markerInstance = new maplibregl.Marker({ element, anchor: 'center' })
        .setLngLat([lng, lat])
        .setPopup(new maplibregl.Popup({ offset: 25, closeOnClick: false, closeOnMove: false, closeButton: true }).setHTML(formatPopupDetails(marker)))
        .addTo(map)
      const entry = { marker: markerInstance, signature, removalTimer: null }
      markerInstancesRef.current.set(key, entry)
      void element.offsetWidth
      window.requestAnimationFrame(() => {
        if (markerInstancesRef.current.get(key) === entry) element.classList.remove('is-entering')
      })
    })
    updateAlertMarkerEmphasis()
  }

  const updateRoute = (map, nextRoute) => {
    routeRef.current = nextRoute
    const source = map.getSource('citizen-route')
    if (!source) return
    const routeData = normalizeRouteData(nextRoute)
    source.setData(routeData)
    const coordinates = getRouteCoordinates(nextRoute).map(([longitude, latitude]) => [Number(longitude), Number(latitude)])
    if (!coordinates.length) return
    const bounds = coordinates.reduce((currentBounds, coordinate) => currentBounds.extend(coordinate), new maplibregl.LngLatBounds(coordinates[0], coordinates[0]))
    map.fitBounds(bounds, { padding: 70, maxZoom: 15, duration: 700 })
  }

  // Handle pinned location updates
  useEffect(() => {
    if (mapRef.current) syncPinnedMarker(mapRef.current, pinnedLocation)
  }, [pinnedLocation])

  // Initialize Map
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
        const style = improveMapLabelReadability(resolveDirectTileSources(await response.json()))
        if (disposed) return

        const map = new maplibregl.Map({
          container: mapContainerRef.current,
          style,
          center: normalizeCoordinates(centerRef.current),
          zoom: centerRef.current ? centerZoom : 13,
          transformRequest: (url, resourceType) => {
            const isVectorTile = resourceType === 'Tile' && url.includes('.pbf')
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

        // Handle Map Clicks
        map.on('click', (e) => {
          const target = e.originalEvent.target
          if (target instanceof Element && target.closest('.maplibregl-marker')) return

          const { lng, lat } = e.lngLat
          if (onMapClickRef.current) {
            onMapClickRef.current({
              latitude: lat,
              longitude: lng,
            })
          }
        })

        map.on('load', () => {
          if (fallbackTimer !== null) window.clearTimeout(fallbackTimer)
          map.resize()
          map.addSource('citizen-route', { type: 'geojson', data: normalizeRouteData(routeRef.current) })
          map.addLayer({ id: 'citizen-route-line', type: 'line', source: 'citizen-route', paint: { 'line-color': '#50a8ff', 'line-width': 5, 'line-opacity': 0.9 } })
          map.addSource('resq-road-hazard-zones', {
            type: 'geojson',
            data: roadHazardZonesRef.current,
          })
          map.addLayer({
            id: 'resq-road-hazard-fill',
            type: 'fill',
            source: 'resq-road-hazard-zones',
            paint: {
              'fill-color': ['match', ['get', 'severity'], 'critical', '#b91c1c', 'high', '#ef4444', 'medium', '#f97316', '#fbbf24'],
              'fill-opacity': 0.23,
            },
          }, 'citizen-route-line')
          map.addLayer({
            id: 'resq-road-hazard-outline',
            type: 'line',
            source: 'resq-road-hazard-zones',
            paint: { 'line-color': '#ea580c', 'line-width': 2, 'line-opacity': 0.85 },
          }, 'citizen-route-line')
          map.addSource('resq-pending-road-hazards', {
            type: 'geojson',
            data: pendingRoadHazardZonesRef.current,
          })
          map.addLayer({
            id: 'resq-pending-road-hazard-fill',
            type: 'fill',
            source: 'resq-pending-road-hazards',
            paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.16 },
          }, 'citizen-route-line')
          map.addLayer({
            id: 'resq-pending-road-hazard-outline',
            type: 'line',
            source: 'resq-pending-road-hazards',
            paint: { 'line-color': '#f59e0b', 'line-width': 2, 'line-dasharray': [2, 2] },
          }, 'citizen-route-line')
          map.addSource('resq-hazard-layers', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          })
          map.addLayer({
            id: 'resq-hazard-fill',
            type: 'fill',
            source: 'resq-hazard-layers',
            paint: {
              'fill-color': [
                'match',
                ['get', 'hazard_level'],
                'high', '#ef4444',
                'medium', '#e9654c',
                'low', '#facc15',
                '#94a3b8',
              ],
              'fill-opacity': 0.22,
            },
          })
          map.addLayer({
            id: 'resq-high-hazard-fill',
            type: 'fill',
            source: 'resq-hazard-layers',
            filter: ['==', ['get', 'hazard_level'], 'high'],
            paint: { 'fill-color': '#ef4444', 'fill-opacity': 0.32 },
          })
          map.addLayer({
            id: 'resq-high-hazard-outline',
            type: 'line',
            source: 'resq-hazard-layers',
            filter: ['==', ['get', 'hazard_level'], 'high'],
            paint: { 'line-color': '#b91c1c', 'line-width': 1.5, 'line-opacity': 0.8 },
          })
          map.addLayer({
            id: 'resq-hazard-labels',
            type: 'symbol',
            source: 'resq-hazard-layers',
            layout: {
              'text-field': ['get', 'hazard_label'],
              'text-size': ['interpolate', ['linear'], ['zoom'], 11, 8, 14, 11, 17, 14],
              'text-font': ['Open Sans Bold'],
              'text-anchor': 'center',
              'text-allow-overlap': true,
              'text-ignore-placement': true,
            },
            paint: {
              'text-opacity': 0.65,
              'text-color': [
                'match',
                ['get', 'hazard_level'],
                'high', '#991b1b',
                'medium', '#8f3024',
                'low', '#854d0e',
                '#334155',
              ],
              'text-halo-color': [
                'match',
                ['get', 'hazard_level'],
                'high', '#fecaca',
                'medium', '#f4c5b9',
                'low', '#fef08a',
                '#e2e8f0',
              ],
              'text-halo-width': 0.8,
              'text-halo-blur': 0.35,
            },
          })
          updateHazardLayers(map, hazardLayersRef.current)
          map.moveLayer('resq-pending-road-hazard-fill')
          map.moveLayer('resq-pending-road-hazard-outline')
          map.moveLayer('resq-road-hazard-fill')
          map.moveLayer('resq-road-hazard-outline')
          map.moveLayer('citizen-route-line')
          renderMarkers(map, markersRef.current)
          syncPinnedMarker(map, pinnedLocationRef.current)
          syncDeviceMarker(map, devicePositionRef.current)
          if (routeRef.current) updateRoute(map, routeRef.current)
        })

        map.on('idle', () => {
          const vectorSourceLoaded = Object.entries(map.getStyle().sources || {})
            .some(([sourceId, source]) => source.type === 'vector' && map.isSourceLoaded(sourceId))
          if (!vectorSourceLoaded) enableRasterFallback('vector source is not loaded')
        })

        map.on('error', (event) => {
          const resourceUrl = event.error?.url || ''
          if (resourceUrl.includes('.pbf')) enableRasterFallback('PBF request failed')
        })

        map.on('webglcontextlost', (event) => console.error('[RESQ map] WebGL context lost', event))

        fallbackTimer = window.setTimeout(() => {
          const vectorSourceLoaded = Object.entries(map.getStyle().sources || {})
            .some(([sourceId, source]) => source.type === 'vector' && map.isSourceLoaded(sourceId))
          if (!vectorSourceLoaded) enableRasterFallback('vector source startup timeout')
        }, 5000)

        if (trackDeviceLocation && 'geolocation' in navigator) {
          watchIdRef.current = navigator.geolocation.watchPosition(
            (position) => {
              const lng = position.coords.longitude
              const lat = position.coords.latitude
              devicePositionRef.current = [lng, lat]
              if (!mapRef.current?.isStyleLoaded()) return
              syncDeviceMarker(mapRef.current, devicePositionRef.current)

              if (!hasCenteredOnDeviceRef.current) {
                if (!centerRef.current) {
                  mapRef.current.flyTo({ center: [lng, lat], zoom: 14, speed: 0.7 })
                }
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
      if (locationMessageTimeoutRef.current !== null) window.clearTimeout(locationMessageTimeoutRef.current)
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
      deviceMarkerRef.current?.remove()
      pinnedMarkerRef.current?.remove()
      markerInstancesRef.current.forEach(({ marker, removalTimer }) => {
        if (removalTimer !== null) window.clearTimeout(removalTimer)
        marker.remove()
      })
      markerInstancesRef.current.clear()
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [trackDeviceLocation])

  useEffect(() => {
    if (!mapContainerRef.current || typeof ResizeObserver === 'undefined') return undefined

    const observer = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.resize()
      }
    })
    observer.observe(mapContainerRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    markersRef.current = markers
    if (mapRef.current) renderMarkers(mapRef.current, markers)
  }, [markersSignature])

  useEffect(() => {
    focusMarkerIdRef.current = focusMarkerId
    updateAlertMarkerEmphasis()
  }, [focusMarkerId])

  useEffect(() => {
    selectedAlertCategoryRef.current = selectedAlertCategory
    if (mapRef.current) renderMarkers(mapRef.current, markersRef.current)
  }, [selectedAlertCategory])

  useEffect(() => {
    highlightMarkerIdRef.current = highlightMarkerId
    markerInstancesRef.current.forEach(({ marker }) => {
      const element = marker.getElement()
      const isHighlighted = element.dataset.markerId === String(highlightMarkerId)
      element.classList.remove('is-shelter-highlighted')
      if (isHighlighted) {
        void element.offsetWidth
        element.classList.add('is-shelter-highlighted')
      }
    })
  }, [highlightMarkerId])

  useEffect(() => {
    centerRef.current = center
    if (centerRef.current && mapRef.current) {
      const selectedCenterOffset = highlightMarkerId != null
        && window.matchMedia('(max-width: 768px)').matches
        ? [0, -Math.round(mapRef.current.getContainer().clientHeight * 0.22)]
        : [0, 0]
      mapRef.current.flyTo({
        center: normalizeCoordinates(centerRef.current),
        zoom: focusMarkerId == null ? centerZoom : 16,
        offset: selectedCenterOffset,
        speed: 0.7,
      })
    }
  }, [centerSignature, centerRequestKey, centerZoom, focusMarkerId, highlightMarkerId])

  useEffect(() => {
    if (mapRef.current?.isStyleLoaded() && mapRef.current.getSource('citizen-route')) {
      updateRoute(mapRef.current, route)
    } else {
      routeRef.current = route
    }
  }, [route])

  useEffect(() => {
    hazardLayersRef.current = hazardLayers
    if (mapRef.current?.isStyleLoaded()) updateHazardLayers(mapRef.current, hazardLayers)
  }, [hazardLayersSignature])

  useEffect(() => {
    roadHazardZonesRef.current = roadHazardZones
    mapRef.current?.getSource('resq-road-hazard-zones')?.setData(roadHazardZones)
  }, [roadHazardZonesSignature])

  useEffect(() => {
    pendingRoadHazardZonesRef.current = pendingRoadHazardZones
    mapRef.current?.getSource('resq-pending-road-hazards')?.setData(pendingRoadHazardZones)
  }, [pendingRoadHazardZonesSignature])

  return (
    <div className="map-container" style={{ height: '100%', width: '100%', position: 'relative', zIndex: 1 }}>
      <div ref={mapContainerRef} style={{ height: '100%', width: '100%' }} />
      <div className="citizen-map-actions">
        {locationMessage && <span className="citizen-location-message" role="status">{locationMessage}</span>}
        <button
          type="button"
          className="citizen-my-location"
          onClick={handleMyLocation}
          aria-label="My location: center map on your current position"
          aria-busy={isLocating}
          disabled={isLocating}
          title="My location"
        >
          <LocateFixed size={19} aria-hidden="true" />
          <span>{isLocating ? 'Locating…' : 'My location'}</span>
        </button>
      </div>
      <div className="map-source-credit" aria-label="Hazard data attribution">
        Hazard data: <a href={NOAH_DATASET_URL} target="_blank" rel="noreferrer" title="University of the Philippines Nationwide Operational Assessment of Hazards">UP NOAH</a>
      </div>
    </div>
  )
}

export default MapContainer
