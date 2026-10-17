import { useState } from 'react';
import AppShell from '../components/AppShell';
import MapPanel from '../components/MapPanel';
import DroneControlPanel from '../components/DroneControlPanel';
import ManualMissionRegistry from '../components/ManualMissionRegistry';
import {
  CheckCircle, Clock, AlertTriangle, Image
} from 'lucide-react';
import { MOCK_MISSIONS } from '../data/mockData';

const STAGE_LABELS = ['Approved', 'En Route', 'Capture', 'Return', 'Review'];

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  in_progress: { label: 'In Progress', cls: 'badge info' },
  awaiting_readiness: { label: 'Awaiting Readiness', cls: 'badge warning' },
  completed: { label: 'Completed', cls: 'badge success' },
  failed: { label: 'Failed', cls: 'badge critical' },
};

export default function MissionsPage() {
  const [selectedId, setSelectedId] = useState<string>(MOCK_MISSIONS[0]?.id ?? '');
  const selected = MOCK_MISSIONS.find(m => m.id === selectedId) ?? null;

  return (
    <AppShell pageTitle="Missions" pageSubtitle="Drone missions and task management">
      <DroneControlPanel />
      <ManualMissionRegistry />
      <div className="responsive-two-column mission-layout" style={{ display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', gap: 16, height: 'calc(100vh - 160px)', minHeight: 400 }}>
        {/* Mission list */}
        <div className="card" style={{ overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div className="card-header">
            <span className="card-title">Missions</span>
            <span className="badge neutral">{MOCK_MISSIONS.length}</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {MOCK_MISSIONS.map(mission => (
              <div
                key={mission.id}
                onClick={() => setSelectedId(mission.id)}
                style={{
                  padding: '14px 16px',
                  borderBottom: '1px solid var(--color-card-border)',
                  cursor: 'pointer',
                  background: selectedId === mission.id ? '#f0f9f1' : 'transparent',
                  borderLeft: selectedId === mission.id ? '3px solid var(--color-brand-400)' : '3px solid transparent',
                  transition: 'all 0.12s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{mission.id}</span>
                  {STATUS_MAP[mission.status] && (
                    <span className={STATUS_MAP[mission.status].cls} style={{ fontSize: 10 }}>{STATUS_MAP[mission.status].label}</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{mission.title}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                  {mission.drone} · {mission.zone}
                  {mission.alertId && <> · Alert {mission.alertId}</>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Mission detail */}
        {selected ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>
            {/* Mission Header Card */}
            <div className="card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{selected.id} — {selected.title}</h2>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
                    {selected.drone} · {selected.zone}
                    {selected.alertId && <> · Triggered by {selected.alertId}</>}
                  </div>
                </div>
                {STATUS_MAP[selected.status] && (
                  <span className={STATUS_MAP[selected.status].cls}>{STATUS_MAP[selected.status].label}</span>
                )}
              </div>

              {/* Progress steps */}
              <div className="progress-steps">
                {STAGE_LABELS.map((label, i) => (
                  <div key={label} className="progress-step">
                    <div className={`progress-step-circle ${i < selected.stage ? 'done' : i === selected.stage ? 'active' : ''}`}>
                      {i < selected.stage ? <CheckCircle size={14} /> : i + 1}
                    </div>
                    {i < STAGE_LABELS.length - 1 && (
                      <div className={`progress-step-connector ${i < selected.stage ? 'done' : ''}`} />
                    )}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                {STAGE_LABELS.map(label => (
                  <span key={label} className="progress-step-label">{label}</span>
                ))}
              </div>
            </div>

            {/* Drone telemetry + Map */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {/* Telemetry */}
              <div className="card" style={{ padding: '16px 20px' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                  Drone Telemetry
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
                  {[
                    { label: 'Status', value: selected.droneStatus, color: selected.droneStatus === 'connected' ? 'var(--color-success)' : 'var(--color-critical)' },
                    { label: 'Mode', value: selected.mode },
                    { label: 'Battery', value: `${selected.battery}%`, color: selected.battery > 50 ? 'var(--color-success)' : 'var(--color-warning)' },
                    { label: 'Altitude', value: `${selected.altitude}m` },
                    { label: 'Speed', value: `${selected.speed} m/s` },
                    { label: 'Sim Mode', value: selected.droneMode, color: 'var(--color-info)' },
                  ].map(item => (
                    <div key={item.label}>
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600 }}>{item.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: item.color ?? 'var(--color-text-primary)' }}>{item.value}</div>
                    </div>
                  ))}
                </div>

                <div className="demo-alert-banner" style={{ marginTop: 12, marginBottom: 0 }}>
                  <AlertTriangle size={16} />
                  This archived mission card contains demo telemetry. Use ESP32 manual control above for connected hardware. Hold and RTL are unsupported by the E88 remote bridge.
                </div>
              </div>

              {/* Mini map */}
              <div className="card" style={{ padding: 0, overflow: 'hidden', minHeight: 240 }}>
                <MapPanel height="100%" showControls={false} compact />
              </div>
            </div>

            {/* Bottom: Checklist + Captured Images + Activity */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              {/* Checklist */}
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Checklist</span>
                </div>
                <div style={{ padding: '8px 16px' }}>
                  {selected.checklist.length === 0 ? (
                    <div style={{ padding: 16, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 12 }}>No checklist items</div>
                  ) : selected.checklist.map(item => (
                    <div key={item.id} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0',
                      borderBottom: '1px solid var(--color-card-border)',
                    }}>
                      <div style={{ marginTop: 2 }}>
                        {item.done
                          ? <CheckCircle size={15} color="var(--color-success)" />
                          : 'active' in item && item.active
                          ? <Clock size={15} color="var(--color-warning)" />
                          : <div style={{ width: 15, height: 15, borderRadius: '50%', border: '2px solid var(--color-neutral-border)' }} />}
                      </div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: item.done ? 'var(--color-text-muted)' : 'var(--color-text-primary)' }}>{item.label}</div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{item.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Captured Images */}
              <div className="card">
                <div className="card-header">
                  <span className="card-title"><Image size={13} style={{ marginRight: 4 }} /> Captures</span>
                  <span className="badge neutral">{selected.capturedImages.length}</span>
                </div>
                <div style={{ padding: '8px 16px' }}>
                  {selected.capturedImages.length === 0 ? (
                    <div style={{ padding: 16, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 12 }}>No images captured yet</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {selected.capturedImages.map(img => (
                        <div key={img.id} style={{ borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
                          <img src={img.url} alt={img.label} style={{ width: '100%', height: 70, objectFit: 'cover' }} />
                          <div style={{
                            position: 'absolute', bottom: 0, left: 0, right: 0,
                            background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                            padding: '12px 6px 4px',
                            color: 'white', fontSize: 10, fontWeight: 600,
                          }}>
                            {img.label} · {img.time}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Activity Log */}
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Activity</span>
                </div>
                <div style={{ padding: '12px 16px' }}>
                  {selected.activityLog.length === 0 ? (
                    <div style={{ padding: 16, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 12 }}>No activity yet</div>
                  ) : (
                    <div className="timeline">
                      {selected.activityLog.map((item, i) => (
                        <div key={i} className="timeline-item">
                          <div className={`timeline-dot${item.done ? '' : ' pending'}`} />
                          <div className="timeline-time">{item.time}</div>
                          <div className="timeline-label">{item.label}</div>
                          <div className="timeline-desc">{item.desc}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
            Select a mission to view details
          </div>
        )}
      </div>
    </AppShell>
  );
}
