import AppShell from '../components/AppShell';
import MapPanel from '../components/MapPanel';
import {
  Bell, Navigation, PawPrint, BarChart2,
  ArrowRight, AlertTriangle, CheckCircle,
  ChevronRight, Camera, Wifi
} from 'lucide-react';
import { MOCK_OVERVIEW_STATS, MOCK_ALERTS } from '../data/mockData';
import { useNavigate } from 'react-router-dom';

function StatCard({ icon: Icon, iconClass, label, value, sub, onClick }: any) {
  return (
    <div className="stat-card" style={{ cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      <div className={`stat-card-icon ${iconClass}`}>
        <Icon />
      </div>
      <div>
        <div className="stat-card-label">{label}</div>
        <div className="stat-card-value">{String(value).padStart(2, '0')}</div>
        {sub && <div className="stat-card-sub">{sub}</div>}
      </div>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    high: { cls: 'badge critical', label: '● High' },
    medium: { cls: 'badge warning', label: '● Medium' },
    low: { cls: 'badge success', label: '● Low' },
  };
  const p = map[priority] ?? { cls: 'badge neutral', label: priority };
  return <span className={p.cls} style={{ fontSize: 11 }}>{p.label}</span>;
}

export default function OverviewPage() {
  const navigate = useNavigate();
  const s = MOCK_OVERVIEW_STATS;
  const recentAlerts = MOCK_ALERTS.filter(a => a.type === 'wildlife').slice(0, 3);

  return (
    <AppShell
      pageTitle="Operations Overview"
      pageSubtitle="Tadoba–Andhari Tiger Reserve · Live monitoring"
    >
      {/* Top stat cards */}
      <div className="responsive-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard
          icon={Bell} iconClass="red" label="Active alerts" value={s.activeAlerts}
          sub="Needs attention" onClick={() => navigate('/alerts')}
        />
        <StatCard
          icon={Navigation} iconClass="blue" label="Drones available" value={s.dronesAvailable}
          sub="Of 3 registered" onClick={() => navigate('/missions')}
        />
        <StatCard
          icon={PawPrint} iconClass="green" label="Registered animals" value={s.registeredAnimals}
          sub="In registry" onClick={() => navigate('/animals')}
        />
        <StatCard
          icon={BarChart2} iconClass="amber" label="Open missions" value={s.openMissions}
          sub="In progress" onClick={() => navigate('/missions')}
        />
      </div>

      {/* Main layout: Map left, panels right */}
      <div className="responsive-two-column" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 16, height: 'calc(100vh - 260px)', minHeight: 420 }}>
        {/* Live map */}
        <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid var(--color-card-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <div>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Live Map</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)', marginLeft: 8 }}>
                Real-time asset positions
              </span>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/map')}>
              <ArrowRight size={13} /> View full map
            </button>
          </div>
          <div style={{ height: 'calc(100% - 49px)' }}>
            <MapPanel height="100%" showControls={false} />
          </div>
        </div>

        {/* Right panels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
          {/* Priority Alerts */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Priority Alerts</span>
              <button className="btn btn-secondary btn-sm" onClick={() => navigate('/alerts')}>
                View all <ArrowRight size={12} />
              </button>
            </div>
            <div style={{ padding: '8px 0' }}>
              {recentAlerts.map((alert, i) => (
                <div
                  key={alert.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px',
                    borderBottom: i < recentAlerts.length - 1 ? '1px solid var(--color-card-border)' : 'none',
                    cursor: 'pointer', transition: 'background .12s'
                  }}
                  onClick={() => navigate('/alerts')}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-workspace-bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  {alert.image ? (
                    <img src={alert.image} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 40, height: 40, borderRadius: 6, background: 'var(--color-workspace-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Camera size={18} color="var(--color-text-muted)" />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{alert.id}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{alert.description} · {alert.source}</div>
                  </div>
                  <PriorityBadge priority={alert.priority} />
                  <ChevronRight size={14} color="var(--color-text-muted)" />
                </div>
              ))}
            </div>
          </div>

          {/* Drone Status */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Drone Status</span>
              <button className="btn btn-secondary btn-sm" onClick={() => navigate('/missions')}>
                Missions <ArrowRight size={12} />
              </button>
            </div>
            <div style={{ padding: '8px 16px' }}>
              {[
                { id: 'D-01', status: 'Airborne', mission: 'MSN-024', battery: 78, statusColor: 'var(--color-success)' },
                { id: 'D-02', status: 'Standby', mission: 'MSN-025', battery: 62, statusColor: 'var(--color-warning)' },
                { id: 'D-03', status: 'Available', mission: null, battery: 91, statusColor: 'var(--color-info)' },
              ].map((d, i, arr) => (
                <div key={d.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                  borderBottom: i < arr.length - 1 ? '1px solid var(--color-card-border)' : 'none'
                }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 8, background: 'var(--color-info-bg)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                  }}>
                    <Navigation size={16} color="var(--color-info)" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>Drone {d.id}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                      {d.mission ? `Mission ${d.mission}` : 'No active mission'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: d.statusColor }}>{d.status}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{d.battery}% bat</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Activity Feed */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Recent Activity</span>
            </div>
            <div style={{ padding: '12px 16px' }}>
              <div className="timeline">
                {[
                  { time: '10:28', label: 'Drone D-01 capturing images', desc: 'Mission MSN-024 in progress', icon: CheckCircle, iconColor: 'var(--color-success)' },
                  { time: '10:22', label: 'Tiger sighting — ALT-024', desc: 'Camera 07 · Buffer Zone · High priority', icon: AlertTriangle, iconColor: 'var(--color-critical)' },
                  { time: '10:06', label: 'Leopard detected — ALT-023', desc: 'Camera 12 · Core Zone · Medium', icon: AlertTriangle, iconColor: 'var(--color-warning)' },
                  { time: '09:55', label: 'Camera 03 offline', desc: 'Device alert · Buffer Zone', icon: Wifi, iconColor: 'var(--color-critical)' },
                ].map((item, i) => (
                  <div key={i} className="timeline-item">
                    <div className="timeline-dot" style={{ background: item.iconColor }} />
                    <div className="timeline-time">{item.time}</div>
                    <div className="timeline-label">{item.label}</div>
                    <div className="timeline-desc">{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
