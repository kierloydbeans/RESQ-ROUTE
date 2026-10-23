import React, { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'

const DEFAULT_LOCATION = [120.98, 14.65]
const VECTOR_STYLE_URL = import.meta.env.VITE_MAP_STYLE_URL || 'https://api.maptiler.com/maps/base-v4/style.json?key=mt7k9rWpGBUe5lFcSLZ1'
const NOAH_DATASET_URL = 'https://huggingface.co/datasets/bettergovph/project-noah-hazard-maps'

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
  el.style.background = icon ? '#fff7ed' : color
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
  centerRequestKey = 0,
  pinnedLocation = null, 
  onMapClick, 
  trackDeviceLocation = true 
}) => {
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const markerInstancesRef = useRef(new Map())
  const deviceMarkerRef = useRef(null)
  const pinnedMarkerRef = useRef(null)
  const watchIdRef = useRef(null)
  const hasCenteredOnDeviceRef = useRef(false)
  const markersRef = useRef(markers)
  const routeRef = useRef(route)
  const centerRef = useRef(center)
  const focusMarkerIdRef = useRef(focusMarkerId)
  const highlightMarkerIdRef = useRef(highlightMarkerId)
  const selectedAlertCategoryRef = useRef(selectedAlertCategory)
  const hazardLayersRef = useRef(hazardLayers)
  const onMapClickRef = useRef(onMapClick)
  const markersSignature = JSON.stringify(markers)
  const centerSignature = JSON.stringify(center)
  const hazardLayersSignature = JSON.stringify(hazardLayers)

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
      features: nextLayers
        .filter((layer) => ['medium', 'high'].includes(String(layer.hazard_level).toLowerCase()))
        .map((layer) => ({
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
    if (!mapRef.current) return

    if (pinnedLocation?.latitude && pinnedLocation?.longitude) {
      const coords = [pinnedLocation.longitude, pinnedLocation.latitude]

      if (!pinnedMarkerRef.current) {
        pinnedMarkerRef.current = new maplibregl.Marker({ color: '#ea580c' })
          .setLngLat(coords)
          .setPopup(new maplibregl.Popup({ offset: 25 }).setText('Pinned incident location'))
          .addTo(mapRef.current)
        pinnedMarkerRef.current.getElement().classList.add('citizen-pinned-marker')
      } else {
        pinnedMarkerRef.current.setLngLat(coords)
      }

      const markerElement = pinnedMarkerRef.current.getElement()
      markerElement.classList.remove('pin-dropping')
      void markerElement.offsetWidth
      markerElement.classList.add('pin-dropping')
    } else if (pinnedMarkerRef.current) {
      pinnedMarkerRef.current.remove()
      pinnedMarkerRef.current = null
    }
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
        const style = resolveDirectTileSources(await response.json())
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
                'medium', '#fb923c',
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
                'medium', '#9a3412',
                'low', '#854d0e',
                '#334155',
              ],
              'text-halo-color': [
                'match',
                ['get', 'hazard_level'],
                'high', '#fecaca',
                'medium', '#fed7aa',
                'low', '#fef08a',
                '#e2e8f0',
              ],
              'text-halo-width': 0.8,
              'text-halo-blur': 0.35,
            },
          })
          updateHazardLayers(map, hazardLayersRef.current)
          renderMarkers(map, markersRef.current)
          if (routeRef.current) updateRoute(map, routeRef.current)
        })

        map.on('idle', () => {
          const loadedSources = Object.keys(map.getStyle().sources || {}).filter((sourceId) => map.isSourceLoaded(sourceId))
          if (!loadedSources.includes('maptiler_planet')) enableRasterFallback('vector source is not loaded')
        })

        map.on('error', (event) => {
          const resourceUrl = event.error?.url || ''
          if (resourceUrl.includes('.pbf')) enableRasterFallback('PBF request failed')
        })

        map.on('webglcontextlost', (event) => console.error('[RESQ map] WebGL context lost', event))

        fallbackTimer = window.setTimeout(() => {
          if (!map.isSourceLoaded('maptiler_planet')) enableRasterFallback('vector source startup timeout')
        }, 5000)

        if (trackDeviceLocation && 'geolocation' in navigator) {
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
      mapRef.current.flyTo({ center: normalizeCoordinates(centerRef.current), zoom: focusMarkerId == null ? centerZoom : 16, speed: 0.7 })
    }
  }, [centerSignature, centerRequestKey, centerZoom, focusMarkerId])

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

  return (
    <div className="map-container" style={{ height: '100%', width: '100%', position: 'relative', zIndex: 1 }}>
      <div ref={mapContainerRef} style={{ height: '100%', width: '100%' }} />
      <div className="map-source-credit" aria-label="Hazard data attribution">
        Hazard data: <a href={NOAH_DATASET_URL} target="_blank" rel="noreferrer" title="University of the Philippines Nationwide Operational Assessment of Hazards">UP NOAH</a>
      </div>
    </div>
  )
}

export default MapContainer
