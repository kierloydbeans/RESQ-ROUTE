import React from 'react'
import { MapContainer as LeafletMap, TileLayer, Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const MapContainer = ({ center = [14.65, 120.98], zoom = 13, markers = [] }) => {
  return (
    <LeafletMap center={center} zoom={zoom} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {markers.map((marker, index) => (
        <Marker key={index} position={marker.position}>
          <Popup>{marker.label}</Popup>
        </Marker>
      ))}
    </LeafletMap>
  )
}

export default MapContainer
