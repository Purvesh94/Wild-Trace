import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { MOCK_MAP_CAMERAS, MOCK_MAP_SIGHTINGS, MOCK_MAP_DRONES } from '../data/mockData';

// Fix leaflet default icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom SVG icon factory
function makeIcon(svg: string, size = 32) {
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

const cameraOnlineIcon = makeIcon(`
  <div style="background:#2d6a4f;border:2px solid white;border-radius:6px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.35)">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
  </div>`, 30);

const cameraOfflineIcon = makeIcon(`
  <div style="background:#dc2626;border:2px solid white;border-radius:6px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.35)">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
  </div>`, 30);

const sightingHighIcon = makeIcon(`
  <div style="background:#dc2626;border:2px solid white;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.35)">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1-5.5h-2V7h2v4z"/></svg>
  </div>`, 30);

const sightingMedIcon = makeIcon(`
  <div style="background:#d97706;border:2px solid white;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.35)">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1-5.5h-2V7h2v4z"/></svg>
  </div>`, 30);

const droneIcon = makeIcon(`
  <div style="background:#1d4ed8;border:2px solid white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.35)">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 14a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"/></svg>
  </div>`, 32);

interface MapPanelProps {
  height?: string;
  showControls?: boolean;
  selectedAlertLat?: number;
  selectedAlertLng?: number;
  compact?: boolean;
}

export default function MapPanel({
  height = '100%',
  showControls = true,
  selectedAlertLat,
  selectedAlertLng,
  compact = false,
}: MapPanelProps) {
  const CENTER: [number, number] = [20.3155, 79.3947];

  return (
    <div style={{ height, position: 'relative', borderRadius: 12, overflow: 'hidden' }}>
      <MapContainer
        center={CENTER}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
        zoomControl={showControls}
        attributionControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Camera markers */}
        {MOCK_MAP_CAMERAS.map(cam => (
          <Marker
            key={cam.id}
            position={[cam.lat, cam.lng]}
            icon={cam.status === 'online' ? cameraOnlineIcon : cameraOfflineIcon}
          >
            <Popup>
              <div style={{ fontSize: 12, minWidth: 140 }}>
                <strong>{cam.label}</strong>
                <div style={{ color: cam.status === 'online' ? '#2d6a4f' : '#dc2626', marginTop: 2 }}>
                  {cam.status === 'online' ? '● Online' : '● Offline'}
                </div>
                <div style={{ color: '#6b7280', marginTop: 2 }}>{cam.zone}</div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Sighting markers */}
        {MOCK_MAP_SIGHTINGS.map(sig => (
          <React.Fragment key={sig.id}>
            <Marker
              position={[sig.lat, sig.lng]}
              icon={sig.risk === 'high' ? sightingHighIcon : sightingMedIcon}
            >
              <Popup>
                <div style={{ fontSize: 12, minWidth: 140 }}>
                  <strong>{sig.species} sighting</strong>
                  <div style={{ color: '#6b7280', marginTop: 2 }}>{sig.alertId} • {sig.time}</div>
                  <div style={{
                    background: sig.risk === 'high' ? '#fef2f2' : '#fffbeb',
                    color: sig.risk === 'high' ? '#991b1b' : '#92400e',
                    padding: '2px 6px', borderRadius: 4, display: 'inline-block', marginTop: 4, fontSize: 11, fontWeight: 600
                  }}>
                    {sig.risk.toUpperCase()}
                  </div>
                </div>
              </Popup>
            </Marker>
            {/* Uncertainty circle */}
            <Circle
              center={[sig.lat, sig.lng]}
              radius={120}
              pathOptions={{
                color: sig.risk === 'high' ? '#dc2626' : '#d97706',
                fillColor: sig.risk === 'high' ? '#dc2626' : '#d97706',
                fillOpacity: 0.08,
                weight: 1.5,
                dashArray: '4 4',
              }}
            />
          </React.Fragment>
        ))}

        {/* Drone markers */}
        {MOCK_MAP_DRONES.map(drone => (
          <Marker key={drone.id} position={[drone.lat, drone.lng]} icon={droneIcon}>
            <Popup>
              <div style={{ fontSize: 12, minWidth: 140 }}>
                <strong>{drone.label}</strong>
                <div style={{ color: drone.status === 'airborne' ? '#2d6a4f' : '#6b7280', marginTop: 2 }}>
                  {drone.status === 'airborne' ? '↑ Airborne' : '◉ Standby'}
                </div>
                <div style={{ color: '#6b7280', marginTop: 2 }}>Battery: {drone.battery}%</div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Map type label */}
      <div style={{
        position: 'absolute', bottom: 28, right: 10, zIndex: 1000,
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(4px)',
        borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600,
        color: 'var(--color-text-secondary)', border: '1px solid var(--color-card-border)',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span>🗺</span> OpenStreetMap <span style={{ color: '#9ca3af', fontWeight: 400 }}>(Dev)</span>
      </div>
    </div>
  );
}
