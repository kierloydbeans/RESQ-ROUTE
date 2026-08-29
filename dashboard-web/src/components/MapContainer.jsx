import React, { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const DEFAULT_LOCATION = [120.98, 14.65]
const VECTOR_STYLE_URL = import.meta.env.VITE_MAP_STYLE_URL || 'https://demotiles.maplibre.org/style.json'

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

    mapRef.current = new maplibregl.Map({
      container: mapContainerRef.current,
      style: VECTOR_STYLE_URL,
      center: DEFAULT_LOCATION,
      zoom: 13,
    })

    mapRef.current.on('error', (event) => {
      console.error('Map vector style failed to load:', event.error || event)
    })

    mapRef.current.addControl(new maplibregl.NavigationControl(), 'top-right')

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
        (error) => {
          console.warn('Geolocation watch failed:', error.message)
        },
        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 10000,
        }
      )
    }

    return () => {
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
    if (!mapContainerRef.current || !mapRef.current || typeof ResizeObserver === 'undefined') return undefined

    const observer = new ResizeObserver(() => mapRef.current?.resize())
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
