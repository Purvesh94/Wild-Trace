import { useState, useSyncExternalStore } from 'react';
import AppShell from '../components/AppShell';
import {
  Search, Filter, ChevronDown, ChevronRight, Camera,
  CheckCircle, AlertTriangle, Clock, Eye, X
} from 'lucide-react';
import { getAlerts, subscribeEvents } from '../media/stores';

type AlertStatus = 'all' | 'needs_verification' | 'in_review' | 'assigned' | 'new' | 'resolved';

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  needs_verification: { label: 'Needs Verification', cls: 'badge warning' },
  in_review: { label: 'In Review', cls: 'badge info' },
  assigned: { label: 'Assigned', cls: 'badge brand' },
  new: { label: 'New', cls: 'badge neutral' },
  resolved: { label: 'Resolved', cls: 'badge success' },
};

const PRIORITY_LABELS: Record<string, { label: string; cls: string }> = {
  high: { label: '● High', cls: 'badge critical' },
  medium: { label: '● Medium', cls: 'badge warning' },
  low: { label: '● Low', cls: 'badge success' },
};

export default function AlertsPage() {
  const alerts = useSyncExternalStore(subscribeEvents, getAlerts);
  const [statusFilter, setStatusFilter] = useState<AlertStatus>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(alerts[0]?.id ?? null);

  const filtered = alerts.filter(a => {
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    if (searchTerm && !a.id.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !(a.species ?? '').toLowerCase().includes(searchTerm.toLowerCase()) &&
        !a.description.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const selected = filtered.find(a => a.id === selectedId) ?? filtered[0] ?? null;

  const statusTabs: { key: AlertStatus; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: alerts.length },
    { key: 'needs_verification', label: 'Needs Verification', count: alerts.filter(a => a.status === 'needs_verification').length },
    { key: 'in_review', label: 'In Review', count: alerts.filter(a => a.status === 'in_review').length },
    { key: 'assigned', label: 'Assigned', count: alerts.filter(a => a.status === 'assigned').length },
    { key: 'new', label: 'New', count: alerts.filter(a => a.status === 'new').length },
    { key: 'resolved', label: 'Resolved', count: alerts.filter(a => a.status === 'resolved').length },
  ];

  return (
    <AppShell pageTitle="Alerts" pageSubtitle="Wildlife detection events and camera alerts">
      {/* Tabs */}
      <div className="tabs">
        {statusTabs.map(t => (
          <div
            key={t.key}
            className={`tab${statusFilter === t.key ? ' active' : ''}`}
            onClick={() => setStatusFilter(t.key)}
          >
            {t.label}
            <span className="tab-count">{t.count}</span>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="filter-bar">
        <div className="filter-search">
          <Search size={15} />
          <input
            type="text"
            placeholder="Search alerts by ID, species, description..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Master-detail layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 16, height: 'calc(100vh - 280px)', minHeight: 300 }}>
        {/* Alert list */}
        <div className="card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Alert ID</th>
                  <th>Type</th>
                  <th>Source</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(alert => (
                  <tr
                    key={alert.id}
                    className={selected?.id === alert.id ? 'selected' : ''}
                    onClick={() => setSelectedId(alert.id)}
                  >
                    <td style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{alert.id}</td>
                    <td>
                      <span className={`badge ${alert.type === 'wildlife' ? 'warning' : 'neutral'}`} style={{ fontSize: 10 }}>
                        {alert.type === 'device' ? '📡 Device' : `${alert.testSource ? 'WEBCAM TEST · ' : ''}${alert.species}`}
                      </span>
                    </td>
                    <td>{alert.source}</td>
                    <td>
                      {PRIORITY_LABELS[alert.priority] && (
                        <span className={PRIORITY_LABELS[alert.priority].cls} style={{ fontSize: 11 }}>
                          {PRIORITY_LABELS[alert.priority].label}
                        </span>
                      )}
                    </td>
                    <td>
                      {STATUS_LABELS[alert.status] && (
                        <span className={STATUS_LABELS[alert.status].cls} style={{ fontSize: 11 }}>
                          {STATUS_LABELS[alert.status].label}
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{alert.time}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)' }}>No alerts match your filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail panel */}
        <div className="card" style={{ overflow: 'auto' }}>
          {selected ? (
            <div>
              {/* Header */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-card-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{selected.id}</span>
                  {STATUS_LABELS[selected.status] && (
                    <span className={STATUS_LABELS[selected.status].cls}>{STATUS_LABELS[selected.status].label}</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  {selected.description} · {selected.source} · {selected.zone}
                </div>
              </div>

              {/* Image */}
              {selected.image && (
                <div style={{ padding: '12px 20px' }}>
                  <img
                    src={selected.image}
                    alt={`Alert ${selected.id}`}
                    style={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 8 }}
                  />
                </div>
              )}

              {/* Details grid */}
              <div style={{ padding: '12px 20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', fontSize: 13 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 2 }}>PRIORITY</div>
                    {PRIORITY_LABELS[selected.priority] && (
                      <span className={PRIORITY_LABELS[selected.priority].cls}>{PRIORITY_LABELS[selected.priority].label}</span>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 2 }}>TIME</div>
                    <div>{selected.time} · {selected.date}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 2 }}>LOCATION</div>
                    <div>{selected.lat !== null && selected.lng !== null ? `${selected.lat.toFixed(4)}, ${selected.lng.toFixed(4)}` : 'Object location unknown'}</div>
                    {selected.platformPosition && <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Source device GPS: {selected.platformPosition.lat.toFixed(4)}, {selected.platformPosition.lng.toFixed(4)} (not object location)</div>}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 2 }}>IDENTITY</div>
                    <div>
                      {selected.identityStatus === 'confirmed'
                        ? <span className="badge success">✓ {selected.candidateId}</span>
                        : selected.identityStatus === 'not_confirmed'
                        ? <span className="badge warning">Pending — {selected.candidateId}</span>
                        : <span className="badge neutral">N/A</span>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Timeline */}
              {selected.timeline.length > 0 && (
                <div style={{ padding: '12px 20px' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Timeline</div>
                  <div className="timeline">
                    {selected.timeline.map((item, i) => (
                      <div key={i} className="timeline-item">
                        <div className={`timeline-dot${item.done ? '' : ' pending'}`} />
                        {item.time && <div className="timeline-time">{item.time}</div>}
                        <div className="timeline-label">{item.label}</div>
                        <div className="timeline-desc">{item.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--color-card-border)', display: 'flex', gap: 8 }}>
                {selected.status !== 'resolved' && (
                  <>
                    <button className="btn btn-primary btn-sm"><Eye size={13} /> Review</button>
                    <button className="btn btn-secondary btn-sm"><CheckCircle size={13} /> Acknowledge</button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)' }}>
              Select an alert to view details
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
