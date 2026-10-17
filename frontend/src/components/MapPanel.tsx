/**
 * MapPanel — Interactive Leaflet/OpenStreetMap map
 *
 * Tile layers: Road (OSM) and Satellite (ESRI World Imagery).
 * No Google Maps API key required.
 *
 * GPS tracking:
 *  - "My Location" snaps view once (getCurrentPosition).
 *  - "Start Tracking" opens watchPosition; shows accuracy circle + trail polyline.
 *  - Stale detection: position older than STALE_MS is flagged.
 *  - Cleans up the watcher on Stop / unmount.
 *  - Never invents GPS data; never uses no-cors tricks for location.
 *
 * HTTPS note: Geolocation requires a secure context (https:// or localhost).
 * On LAN, serve over HTTPS (self-signed + allow in browser) or use localhost.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MapContainer, TileLayer, Marker, Popup,
  Circle, Polyline, useMap,
} from 'react-leaflet';
import L from 'leaflet';
import { MOCK_MAP_CAMERAS, MOCK_MAP_SIGHTINGS, MOCK_MAP_DRONES } from '../data/mockData';
import type { FeedSource } from '../media/contracts';
import type { GatewayDevice } from '../services/deviceApi';

// ─── Leaflet icon fix ────────────────────────────────────────────────────────
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:        'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:      'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ─── Icon helpers ─────────────────────────────────────────────────────────────
function makeIcon(svg: string, size = 32) {
  return L.divIcon({
    html: svg, className: '',
    iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2],
  });
}

const cameraOnlineIcon = makeIcon(`<div style="background:#2d6a4f;border:2px solid white;border-radius:6px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.35)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg></div>`, 30);
const cameraOfflineIcon = makeIcon(`<div style="background:#dc2626;border:2px solid white;border-radius:6px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.35)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg></div>`, 30);
const sightingHighIcon = makeIcon(`<div style="background:#dc2626;border:2px solid white;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.35)"><svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1-5.5h-2V7h2v4z"/></svg></div>`, 30);
const sightingMedIcon  = makeIcon(`<div style="background:#d97706;border:2px solid white;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.35)"><svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1-5.5h-2V7h2v4z"/></svg></div>`, 30);
const droneIcon        = makeIcon(`<div style="background:#1d4ed8;border:2px solid white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.35)"><svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 14a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"/></svg></div>`, 32);

function makeUserIcon(stale: boolean) {
  const bg = stale ? '#f59e0b' : '#2563eb';
  return makeIcon(`<div style="background:${bg};border:3px solid white;border-radius:50%;width:20px;height:20px;box-shadow:0 2px 8px rgba(0,0,0,.45);animation:pulse-loc 2s infinite"></div>`, 20);
}

// ─── Tile layer definitions ───────────────────────────────────────────────────
const TILES = {
  road: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    label: '🗺 Road (OSM)',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attr: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    label: '🛰 Satellite (ESRI)',
  },
} as const;
type TileKey = keyof typeof TILES;

// ─── Stale threshold ─────────────────────────────────────────────────────────
const STALE_MS = 30_000; // 30 s without update → stale

// ─── GPS position type ────────────────────────────────────────────────────────
interface GpsPoint {
  lat: number;
  lng: number;
  accuracy: number;   // metres
  timestamp: number;  // ms since epoch
}

// ─── Inner: fly-to helper (must be child of MapContainer) ────────────────────
function MapFlyTo({ pos }: { pos: GpsPoint | null }) {
  const map = useMap();
  const prevRef = useRef<GpsPoint | null>(null);
  useEffect(() => {
    if (pos && pos !== prevRef.current) {
      map.flyTo([pos.lat, pos.lng], Math.max(map.getZoom(), 16), { animate: true, duration: 1.2 });
      prevRef.current = pos;
    }
  }, [pos, map]);
  return null;
}

function SelectedDevice({ source, fallback }: { source?: FeedSource; fallback?: { lat: number; lng: number } }) {
  const map = useMap();
  const lat = source?.position?.lat ?? fallback?.lat;
  const lng = source?.position?.lng ?? fallback?.lng;
  useEffect(() => {
    if (lat !== undefined && lng !== undefined) map.panTo([lat, lng]);
  }, [source?.id, lat, lng, map]);
  if (lat === undefined || lng === undefined) return null;
  return <Circle center={[lat, lng]} radius={75} pathOptions={{ color: '#2563eb', weight: 3, fillOpacity: 0.12 }} />;
}

function MapResizeObserver() {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface MapPanelProps {
  height?: string;
  showControls?: boolean;
  selectedAlertLat?: number;
  selectedAlertLng?: number;
  compact?: boolean;
  selectedLayer?: 'all' | 'cameras' | 'sightings' | 'drones';
  mediaSources?: FeedSource[];
  liveDrone?: GatewayDevice;
  liveDroneFresh?: boolean;
  plannedRoute?: [number, number][];
  selectedDeviceId?: string;
  onDeviceSelect?: (id: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function MapPanel({
  height = '100%',
  showControls = true,
  selectedLayer = 'all',
  mediaSources,
  liveDrone,
  liveDroneFresh = false,
  plannedRoute,
  selectedDeviceId,
  onDeviceSelect,
}: MapPanelProps) {
  const CENTER: [number, number] = [20.3155, 79.3947]; // Tadoba–Andhari Tiger Reserve
  const selectedSource = mediaSources?.find(s => s.id === selectedDeviceId);
  const fallbackPosition = selectedSource?.demoMarker ? [...MOCK_MAP_CAMERAS, ...MOCK_MAP_DRONES].find(d => d.id === selectedDeviceId) : undefined;
  const visibleDevice = (kind: 'camera' | 'drone', id: string) => selectedLayer === 'all'
    || selectedLayer === (kind === 'camera' ? 'cameras' : 'drones') || id === selectedDeviceId;

  // Tile layer
  const [tileKey, setTileKey] = useState<TileKey>('road');

  // GPS state
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'requesting' | 'active' | 'denied' | 'error'>('idle');
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [currentPos, setCurrentPos] = useState<GpsPoint | null>(null);
  const [trail, setTrail] = useState<[number, number][]>([]);
  const [isTracking, setIsTracking] = useState(false);
  const [flyTarget, setFlyTarget] = useState<GpsPoint | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopWatch();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stale detection ──
  function resetStaleTimer() {
    if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
    staleTimerRef.current = setTimeout(() => {
      if (mountedRef.current) {
        setGpsError('⏱ Location signal stale — no update for 30 s. Move or retry.');
      }
    }, STALE_MS);
  }

  function stopWatch() {
    if (watchIdRef.current !== null) {
      navigator.geolocation?.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (staleTimerRef.current) {
      clearTimeout(staleTimerRef.current);
      staleTimerRef.current = null;
    }
  }

  // ── Error classifier ──
  function classifyError(err: GeolocationPositionError): string {
    switch (err.code) {
      case err.PERMISSION_DENIED:
        return 'Location permission denied. Enable in browser site settings and retry.';
      case err.POSITION_UNAVAILABLE:
        return 'Position unavailable. Check GPS/network signal.';
      case err.TIMEOUT:
        return 'Location request timed out. Try again.';
      default:
        return `Geolocation error: ${err.message}`;
    }
  }

  // ── My Location (one-shot) ──
  const handleMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by this browser.');
      return;
    }
    setGpsStatus('requesting');
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!mountedRef.current) return;
        const pt: GpsPoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        };
        setCurrentPos(pt);
        setFlyTarget(pt);
        setGpsStatus('idle');
      },
      (err) => {
        if (!mountedRef.current) return;
        setGpsStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'error');
        setGpsError(classifyError(err));
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 5_000 },
    );
  }, []);

  // ── Start GPS tracking ──
  const handleStartTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by this browser.');
      return;
    }
    if (watchIdRef.current !== null) return; // already watching
    setGpsStatus('requesting');
    setGpsError(null);
    setTrail([]);
    setIsTracking(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (!mountedRef.current) return;
        const pt: GpsPoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        };
        setCurrentPos(pt);
        setFlyTarget(pt);
        setTrail(prev => [...prev, [pt.lat, pt.lng]]);
        setGpsStatus('active');
        setGpsError(null);
        resetStaleTimer();
      },
      (err) => {
        if (!mountedRef.current) return;
        setGpsStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'error');
        setGpsError(classifyError(err));
        setIsTracking(false);
        stopWatch();
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stop GPS tracking ──
  const handleStopTracking = useCallback(() => {
    stopWatch();
    setIsTracking(false);
    setGpsStatus('idle');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stale check for current position age ──
  const posAgeMs = currentPos ? Date.now() - currentPos.timestamp : null;
  const isStale = posAgeMs !== null && posAgeMs > STALE_MS;

  // ── Button styles ──
  const btnBase: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '5px 11px', borderRadius: 6, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', border: '1px solid transparent', whiteSpace: 'nowrap',
    transition: 'all 0.12s',
  };
  const btnPrimary: React.CSSProperties = { ...btnBase, background: 'var(--color-brand-500)', color: 'white', borderColor: 'var(--color-brand-500)' };
  const btnSecondary: React.CSSProperties = { ...btnBase, background: 'rgba(255,255,255,0.92)', color: 'var(--color-text-primary)', borderColor: 'var(--color-card-border)' };
  const btnDanger: React.CSSProperties = { ...btnBase, background: '#fef2f2', color: '#dc2626', borderColor: '#fca5a5' };

  return (
    <div style={{ height, position: 'relative', borderRadius: 12, overflow: 'hidden' }}>
      {/* Pulse animation for user location dot */}
      <style>{`@keyframes pulse-loc { 0%,100%{box-shadow:0 0 0 0 rgba(37,99,235,0.4)} 50%{box-shadow:0 0 0 8px rgba(37,99,235,0)} }`}</style>

      <MapContainer
        center={CENTER}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
        zoomControl={showControls}
        attributionControl={true}
      >
        {/* Dynamic tile layer */}
        <TileLayer
          key={tileKey}
          url={TILES[tileKey].url}
          attribution={TILES[tileKey].attr}
          maxZoom={tileKey === 'satellite' ? 19 : 19}
        />

        {/* Fly-to helper */}
        <MapFlyTo pos={flyTarget} />
        <MapResizeObserver />
        {selectedSource && <SelectedDevice source={selectedSource} fallback={fallbackPosition} />}

        {/* Camera markers */}
        {MOCK_MAP_CAMERAS.filter(cam => visibleDevice('camera', cam.id) && !mediaSources?.some(s => s.id === cam.id && s.position)).map(cam => (
          <Marker key={cam.id} position={[cam.lat, cam.lng]} icon={cam.status === 'online' ? cameraOnlineIcon : cameraOfflineIcon}
            title={`${cam.label}${mediaSources ? ' — demo marker; select feed' : ''}`} eventHandlers={{ click: () => onDeviceSelect?.(cam.id) }}>
            <Popup>
              <div style={{ fontSize: 12, minWidth: 140 }}>
                <strong>{cam.label}</strong>
                {mediaSources && <div>Demo position · video status shown in footage panel</div>}
                <div style={{ color: cam.status === 'online' ? '#2d6a4f' : '#dc2626', marginTop: 2 }}>
                  {cam.status === 'online' ? '● Online' : '● Offline'}
                </div>
                <div style={{ color: '#6b7280', marginTop: 2 }}>{cam.zone}</div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Sighting markers */}
        {(selectedLayer === 'all' || selectedLayer === 'sightings') && MOCK_MAP_SIGHTINGS.map(sig => (
          <React.Fragment key={sig.id}>
            <Marker position={[sig.lat, sig.lng]} icon={sig.risk === 'high' ? sightingHighIcon : sightingMedIcon}>
              <Popup>
                <div style={{ fontSize: 12, minWidth: 140 }}>
                  <strong>{sig.species} sighting</strong>
                  <div style={{ color: '#6b7280', marginTop: 2 }}>{sig.alertId} • {sig.time}</div>
                  <div style={{
                    background: sig.risk === 'high' ? '#fef2f2' : '#fffbeb',
                    color: sig.risk === 'high' ? '#991b1b' : '#92400e',
                    padding: '2px 6px', borderRadius: 4, display: 'inline-block', marginTop: 4, fontSize: 11, fontWeight: 600,
                  }}>{sig.risk.toUpperCase()}</div>
                </div>
              </Popup>
            </Marker>
            <Circle center={[sig.lat, sig.lng]} radius={120} pathOptions={{
              color: sig.risk === 'high' ? '#dc2626' : '#d97706',
              fillColor: sig.risk === 'high' ? '#dc2626' : '#d97706',
              fillOpacity: 0.08, weight: 1.5, dashArray: '4 4',
            }} />
          </React.Fragment>
        ))}

        {/* Drone markers */}
        {liveDroneFresh && liveDrone?.telemetry.gps_fix && liveDrone.telemetry.timestamp &&
          liveDrone.telemetry.latitude !== null && liveDrone.telemetry.longitude !== null &&
          (selectedLayer === 'all' || selectedLayer === 'drones') && (
          <Marker position={[liveDrone.telemetry.latitude, liveDrone.telemetry.longitude]} icon={droneIcon} title={`${liveDrone.name} — ${liveDrone.telemetry.source}`}>
            <Popup><strong>{liveDrone.name}</strong><div>{liveDrone.telemetry.source === 'simulation' ? 'SIMULATED LOCATION' : 'Drone telemetry'}</div>
              <div>Updated {new Date(liveDrone.telemetry.timestamp).toLocaleString()}</div></Popup>
          </Marker>
        )}
        {liveDrone && liveDrone.trail.length > 1 && (selectedLayer === 'all' || selectedLayer === 'drones') &&
          <Polyline positions={liveDrone.trail} pathOptions={{ color: !liveDroneFresh ? '#94a3b8' : liveDrone.telemetry.source === 'simulation' ? '#d97706' : '#16a34a', weight: 3, dashArray: liveDroneFresh ? undefined : '4 4' }} />}
        {plannedRoute && plannedRoute.length > 1 && <Polyline positions={plannedRoute} pathOptions={{ color: '#2563eb', weight: 2, dashArray: '6 6' }} />}
        {MOCK_MAP_DRONES.filter(drone => visibleDevice('drone', drone.id) && !mediaSources?.some(s => s.id === drone.id && s.position)).map(drone => (
          <Marker key={drone.id} position={[drone.lat, drone.lng]} icon={droneIcon}
            title={`${drone.label}${mediaSources ? ' — demo marker; select feed' : ''}`} eventHandlers={{ click: () => onDeviceSelect?.(drone.id) }}>
            <Popup>
              <div style={{ fontSize: 12, minWidth: 140 }}>
                <strong>{drone.label}</strong>
                {mediaSources && <div>Demo position · video status shown in footage panel</div>}
                <div style={{ color: '#6b7280', marginTop: 2 }}>Demo marker only · no live flight or battery state</div>
              </div>
            </Popup>
          </Marker>
        ))}

        {mediaSources?.filter(s => s.position && s.kind !== 'webcam' && visibleDevice(s.kind as 'camera' | 'drone', s.id)).map(source => (
          <Marker key={`live-${source.id}`} position={[source.position!.lat, source.position!.lng]} icon={source.kind === 'drone' ? droneIcon : cameraOnlineIcon}
            title={`${source.name} — select feed`} eventHandlers={{ click: () => onDeviceSelect?.(source.id) }}>
            <Popup><strong>{source.name}</strong><p>Device GPS only · object location unknown</p><p>Position updated: {new Date(source.position!.timestamp).toLocaleString()}</p></Popup>
          </Marker>
        ))}

        {/* GPS: accuracy circle */}
        {currentPos && (
          <Circle
            center={[currentPos.lat, currentPos.lng]}
            radius={currentPos.accuracy}
            pathOptions={{
              color: isStale ? '#f59e0b' : '#2563eb',
              fillColor: isStale ? '#f59e0b' : '#2563eb',
              fillOpacity: 0.08, weight: 1.5,
            }}
          />
        )}

        {/* GPS: user marker */}
        {currentPos && (
          <Marker position={[currentPos.lat, currentPos.lng]} icon={makeUserIcon(isStale)}>
            <Popup>
              <div style={{ fontSize: 12, minWidth: 160 }}>
                <strong>📍 My Location</strong>
                <div style={{ marginTop: 4, color: '#374151' }}>
                  {currentPos.lat.toFixed(6)}, {currentPos.lng.toFixed(6)}
                </div>
                <div style={{ color: '#6b7280', marginTop: 2 }}>
                  Accuracy: ±{Math.round(currentPos.accuracy)} m
                </div>
                <div style={{ color: '#6b7280', marginTop: 2 }}>
                  {new Date(currentPos.timestamp).toLocaleTimeString('en-GB', { hour12: false })}
                  {isStale && <span style={{ color: '#f59e0b', marginLeft: 6, fontWeight: 600 }}>⚠ Stale</span>}
                </div>
                {!('geolocation' in navigator) && (
                  <div style={{ color: '#dc2626', marginTop: 4, fontSize: 11 }}>
                    Geolocation unavailable (requires HTTPS or localhost).
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        )}

        {/* GPS trail polyline */}
        {trail.length > 1 && (
          <Polyline
            positions={trail}
            pathOptions={{ color: '#2563eb', weight: 3, opacity: 0.7, dashArray: '6 4' }}
          />
        )}
      </MapContainer>

      {/* ── Overlay controls ── */}
      {showControls && (
        <>
          {/* Tile toggle — top-left */}
          <div style={{
            position: 'absolute', top: 10, left: 50, zIndex: 1000,
            display: 'flex', gap: 6, flexWrap: 'wrap',
          }}>
            {(Object.keys(TILES) as TileKey[]).map(k => (
              <button
                key={k}
                id={`map-tile-${k}`}
                style={{
                  ...btnSecondary,
                  background: tileKey === k ? 'var(--color-brand-500)' : 'rgba(255,255,255,0.92)',
                  color: tileKey === k ? 'white' : 'var(--color-text-primary)',
                  borderColor: tileKey === k ? 'var(--color-brand-500)' : 'var(--color-card-border)',
                }}
                onClick={() => setTileKey(k)}
              >
                {k === 'road' ? '🗺 Road' : '🛰 Satellite'}
              </button>
            ))}
          </div>

          {/* GPS controls — top-right */}
          <div style={{
            position: 'absolute', top: 10, right: 50, zIndex: 1000,
            display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end',
          }}>
            <button id="map-my-location" style={btnSecondary} onClick={handleMyLocation}
              disabled={gpsStatus === 'requesting' || isTracking}
              title="Snap to my current location (one-shot)"
            >
              {gpsStatus === 'requesting' && !isTracking ? '⌛' : '📍'} My Location
            </button>

            {!isTracking ? (
              <button id="map-start-tracking" style={btnPrimary} onClick={handleStartTracking}
                disabled={gpsStatus === 'requesting'}
              >
                ▶ Start Tracking
              </button>
            ) : (
              <button id="map-stop-tracking" style={btnDanger} onClick={handleStopTracking}>
                ■ Stop Tracking
              </button>
            )}
          </div>

          {/* GPS status / error banner */}
          {(gpsError || gpsStatus === 'requesting') && (
            <div style={{
              position: 'absolute', bottom: 60, left: '50%', transform: 'translateX(-50%)',
              zIndex: 1001, maxWidth: 480,
              background: gpsStatus === 'denied' ? '#fef2f2' : gpsStatus === 'requesting' ? '#eff6ff' : '#fffbeb',
              border: `1px solid ${gpsStatus === 'denied' ? '#fca5a5' : gpsStatus === 'requesting' ? '#93c5fd' : '#fcd34d'}`,
              borderRadius: 8, padding: '8px 14px', fontSize: 12,
              color: gpsStatus === 'denied' ? '#991b1b' : gpsStatus === 'requesting' ? '#1e40af' : '#78350f',
              display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            }}>
              {gpsStatus === 'requesting' ? '⌛ Requesting location…' : `⚠ ${gpsError}`}
              {gpsError && (
                <button onClick={() => setGpsError(null)}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'inherit' }}>
                  ×
                </button>
              )}
            </div>
          )}

          {/* Active tracking info pill */}
          {isTracking && currentPos && !gpsError && (
            <div style={{
              position: 'absolute', bottom: 60, left: 10, zIndex: 1000,
              background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(4px)',
              border: '1px solid var(--color-card-border)', borderRadius: 8,
              padding: '6px 12px', fontSize: 11, lineHeight: 1.6,
            }}>
              <div style={{ fontWeight: 700, color: '#2563eb' }}>● Tracking</div>
              <div style={{ color: '#374151' }}>±{Math.round(currentPos.accuracy)} m accuracy</div>
              <div style={{ color: '#6b7280' }}>{new Date(currentPos.timestamp).toLocaleTimeString('en-GB', { hour12: false })}</div>
              {trail.length > 1 && <div style={{ color: '#6b7280' }}>{trail.length} pts recorded</div>}
              {isStale && <div style={{ color: '#f59e0b', fontWeight: 600 }}>⚠ Stale signal</div>}
            </div>
          )}

          {/* Tile/attribution label — bottom-right */}
          <div style={{
            position: 'absolute', bottom: 28, right: 10, zIndex: 1000,
            background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(4px)',
            borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600,
            color: 'var(--color-text-secondary)', border: '1px solid var(--color-card-border)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {TILES[tileKey].label}
            <span style={{ color: '#9ca3af', fontWeight: 400 }}>(Dev)</span>
          </div>
        </>
      )}
    </div>
  );
}
