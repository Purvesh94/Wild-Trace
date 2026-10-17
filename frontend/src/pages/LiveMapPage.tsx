import AppShell from '../components/AppShell';
import MapPanel from '../components/MapPanel';
import { useState, useSyncExternalStore } from 'react';
import { Layers } from 'lucide-react';
import { MOCK_MAP_CAMERAS, MOCK_MAP_SIGHTINGS, MOCK_MAP_DRONES } from '../data/mockData';
import LiveDroneFootage from '../components/LiveDroneFootage';
import { getFeeds, subscribeFeeds } from '../media/stores';
import { useGatewayDevices } from '../hooks/useGatewayDevices';
import { hasFreshDronePosition } from '../services/deviceState';

export default function LiveMapPage() {
  const [selectedLayer, setSelectedLayer] = useState<'all' | 'cameras' | 'sightings' | 'drones'>('all');
  const sources = useSyncExternalStore(subscribeFeeds, getFeeds);
  const { devices: gatewayDevices, checkedAt } = useGatewayDevices();
  const [selectedGatewayId, setSelectedGatewayId] = useState('');
  const [selectedMissionId, setSelectedMissionId] = useState('');
  const missionRoutes: { id: string; name: string; waypoints: [number, number][] }[] = (() => {
    try { const value = JSON.parse(localStorage.getItem('tadoba_manual_missions') || '[]'); return Array.isArray(value) ? value : []; }
    catch { return []; }
  })();
  const plannedRoute = missionRoutes.find(m => m.id === selectedMissionId)?.waypoints;
  const liveDrone = gatewayDevices.find(d => d.id === selectedGatewayId) || gatewayDevices[0];
  const fresh = hasFreshDronePosition(liveDrone?.telemetry, checkedAt);
  const [selectedDeviceId, setSelectedDeviceId] = useState('D-01');

  const layers = [
    { key: 'all', label: 'All Layers', count: MOCK_MAP_CAMERAS.length + MOCK_MAP_SIGHTINGS.length + MOCK_MAP_DRONES.length },
    { key: 'cameras', label: 'Cameras', count: MOCK_MAP_CAMERAS.length },
    { key: 'sightings', label: 'Sightings', count: MOCK_MAP_SIGHTINGS.length },
    { key: 'drones', label: 'Drones', count: MOCK_MAP_DRONES.length },
  ] as const;

  return (
    <AppShell
      pageTitle="Live Map"
      pageSubtitle="Real-time asset and wildlife tracking"
    >
      <div className="live-map-workspace">
        {/* Full map */}
        <div className="card live-map-canvas" style={{ padding: 0, overflow: 'hidden' }}>
          <MapPanel height="100%" showControls={true} selectedLayer={selectedLayer} mediaSources={sources} liveDrone={liveDrone} liveDroneFresh={fresh} plannedRoute={plannedRoute}
            selectedDeviceId={selectedDeviceId} onDeviceSelect={setSelectedDeviceId} />
        </div>

        <LiveDroneFootage sources={sources} selectedId={selectedDeviceId} onSelect={setSelectedDeviceId} />

        {/* Right panel */}
        <div className="live-map-status-panels">
          <div className="card" style={{ padding: 16, fontSize: 12 }}>
            <div className="card-title" style={{ marginBottom: 8 }}>Live drone telemetry</div>
            {gatewayDevices.length > 0 && <select className="form-input" aria-label="Telemetry device" value={liveDrone?.id || ''} onChange={e => setSelectedGatewayId(e.target.value)}>
              {gatewayDevices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>}
            {fresh && liveDrone?.telemetry.gps_fix && liveDrone.telemetry.latitude !== null && liveDrone.telemetry.longitude !== null ? <div style={{ marginTop: 8, lineHeight: 1.8 }}>
              <div>{liveDrone.telemetry.source === 'simulation' ? 'SIMULATED LOCATION' : 'Live drone position'} · {liveDrone.connected ? 'Device connected' : 'Device disconnected'}</div>
              <div>{liveDrone.telemetry.latitude.toFixed(6)}, {liveDrone.telemetry.longitude.toFixed(6)}</div>
              <div>Altitude: {liveDrone.telemetry.altitude_m ?? 'Unavailable'} m · Heading: {liveDrone.telemetry.heading_deg ?? 'Unavailable'}°</div>
              <div>Battery: {liveDrone.telemetry.battery_percent ?? 'Unavailable'}% · GPS fix: yes</div>
              <div>Updated {new Date(liveDrone.telemetry.timestamp!).toLocaleString()} · Route points: {liveDrone.trail.length}</div>
            </div> : <p style={{ marginTop: 8 }}>Live drone location unavailable — GPS telemetry not connected{liveDrone?.telemetry.timestamp ? ' or stale' : ''}.</p>}
            <p style={{ color: 'var(--color-text-muted)', marginTop: 8 }}>The ESP32 remote bridge has no drone GPS link. Demo markers elsewhere on this map are labeled as demo positions.</p>
            {missionRoutes.some(m => m.waypoints?.length > 1) && <label style={{ display: 'block', marginTop: 8 }}>Planned route (display only)
              <select className="form-input" value={selectedMissionId} onChange={e => setSelectedMissionId(e.target.value)}>
                <option value="">None</option>{missionRoutes.filter(m => m.waypoints?.length > 1).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>}
          </div>
          {/* Layer toggles */}
          <div className="card">
            <div className="card-header">
              <span className="card-title"><Layers size={14} style={{ marginRight: 6 }} />Map Layers</span>
            </div>
            <div style={{ padding: '8px 16px' }}>
              {layers.map(l => (
                <div
                  key={l.key}
                  onClick={() => setSelectedLayer(l.key)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 0',
                    borderBottom: l.key !== 'drones' ? '1px solid var(--color-card-border)' : 'none',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: selectedLayer === l.key || selectedLayer === 'all' ? 'var(--color-success)' : '#d1d5db',
                    }} />
                    <span style={{ fontSize: 13, fontWeight: selectedLayer === l.key ? 600 : 400 }}>{l.label}</span>
                  </div>
                  <span className="badge neutral" style={{ fontSize: 10 }}>{l.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Camera List */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Camera Status <span className="badge neutral">Demo data</span></span>
            </div>
            <div style={{ padding: '4px 0' }}>
              {MOCK_MAP_CAMERAS.map((cam, i) => (
                <div key={cam.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 16px',
                  borderBottom: i < MOCK_MAP_CAMERAS.length - 1 ? '1px solid var(--color-card-border)' : 'none',
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{cam.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{cam.zone}</div>
                  </div>
                  <span className={`badge ${cam.status === 'online' ? 'success' : 'critical'}`} style={{ fontSize: 10 }}>
                    ● {cam.status === 'online' ? 'Online' : 'Offline'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Active sightings */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Active Sightings <span className="badge neutral">Demo data</span></span>
            </div>
            <div style={{ padding: '4px 0' }}>
              {MOCK_MAP_SIGHTINGS.map((sig, i) => (
                <div key={sig.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 16px',
                  borderBottom: i < MOCK_MAP_SIGHTINGS.length - 1 ? '1px solid var(--color-card-border)' : 'none',
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{sig.species}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{sig.alertId} · {sig.time}</div>
                  </div>
                  <span className={`badge ${sig.risk === 'high' ? 'critical' : 'warning'}`} style={{ fontSize: 10 }}>
                    {sig.risk.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
