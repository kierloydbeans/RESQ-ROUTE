import {WS_URL} from './dataProvider'
import React from 'react'
import { MapContainer as LeafletMap, TileLayer, Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const socket = new WebSocket(WS_URL)

const MapContainer = ({ markers = [] }) => {
  return (
    // Explicit height and z-index are crucial here
    <div style={{ height: '400px', width: '100%', position: 'relative', zIndex: 1 }}>
      <LeafletMap 
        center={[14.65, 120.98]} 
        zoom={13} 
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        {markers.map((marker, idx) => (
          <Marker key={idx} position={marker.position}>
            <Popup>{marker.label}</Popup>
          </Marker>
        ))}
      </LeafletMap>
    </div>
  )
}

export default MapContainer
