import AppShell from '../components/AppShell';
import MapPanel from '../components/MapPanel';
import { useState } from 'react';
import { Layers, Crosshair, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { MOCK_MAP_CAMERAS, MOCK_MAP_SIGHTINGS, MOCK_MAP_DRONES } from '../data/mockData';

export default function LiveMapPage() {
  const [selectedLayer, setSelectedLayer] = useState<'all' | 'cameras' | 'sightings' | 'drones'>('all');

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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, height: 'calc(100vh - 140px)' }}>
        {/* Full map */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <MapPanel height="100%" showControls={true} />
        </div>

        {/* Right panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
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
              <span className="card-title">Camera Status</span>
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
              <span className="card-title">Active Sightings</span>
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
