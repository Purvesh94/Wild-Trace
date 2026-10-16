import { useState } from 'react';
import AppShell from '../components/AppShell';
import {
  Search, Eye, ChevronRight, MapPin, Camera,
  Clock, CheckCircle, AlertTriangle, History
} from 'lucide-react';
import { MOCK_ANIMALS } from '../data/mockData';

const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  verified: { cls: 'badge success', label: '✓ Verified' },
  pending: { cls: 'badge warning', label: '⏳ Pending' },
  unknown: { cls: 'badge neutral', label: '? Unknown' },
};

export default function AnimalsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [speciesFilter, setSpeciesFilter] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string>(MOCK_ANIMALS[0]?.id ?? '');

  const species = ['all', ...Array.from(new Set(MOCK_ANIMALS.map(a => a.species)))];

  const filtered = MOCK_ANIMALS.filter(a => {
    if (speciesFilter !== 'all' && a.species !== speciesFilter) return false;
    if (searchTerm && !a.id.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !a.species.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !a.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const selected = MOCK_ANIMALS.find(a => a.id === selectedId) ?? null;

  return (
    <AppShell pageTitle="Animals" pageSubtitle="Wildlife registry and Re-ID tracking">
      {/* Filters */}
      <div className="filter-bar">
        <div className="filter-search">
          <Search size={15} />
          <input
            type="text"
            placeholder="Search animal ID, species or name..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <select
          className="filter-select-native"
          value={speciesFilter}
          onChange={e => setSpeciesFilter(e.target.value)}
        >
          {species.map(s => (
            <option key={s} value={s}>{s === 'all' ? 'All Species' : s}</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 16, height: 'calc(100vh - 240px)', minHeight: 350 }}>
        {/* Animal grid */}
        <div style={{ overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, alignContent: 'start' }}>
          {filtered.map(animal => (
            <div
              key={animal.id}
              className="card"
              onClick={() => setSelectedId(animal.id)}
              style={{
                cursor: 'pointer',
                border: selectedId === animal.id ? '2px solid var(--color-brand-400)' : undefined,
                transition: 'border-color 0.12s, box-shadow 0.12s',
              }}
            >
              <div style={{ position: 'relative' }}>
                <img
                  src={animal.image}
                  alt={animal.id}
                  style={{ width: '100%', height: 140, objectFit: 'cover' }}
                />
                {animal.pendingReview && (
                  <span style={{
                    position: 'absolute', top: 8, right: 8,
                    background: '#dc2626', color: 'white', fontSize: 10, fontWeight: 700,
                    padding: '2px 8px', borderRadius: 4,
                  }}>
                    Review Needed
                  </span>
                )}
              </div>
              <div style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{animal.id}</span>
                  {STATUS_BADGE[animal.status] && (
                    <span className={STATUS_BADGE[animal.status].cls} style={{ fontSize: 10 }}>{STATUS_BADGE[animal.status].label}</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{animal.species}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: 11, color: 'var(--color-text-muted)' }}>
                  <Clock size={11} /> {animal.lastSeen}
                  <span style={{ margin: '0 4px' }}>·</span>
                  <Camera size={11} /> {animal.lastCamera}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                  <div style={{ fontSize: 11 }}>
                    <span style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>{animal.sightings}</span>
                    <span style={{ color: 'var(--color-text-muted)', marginLeft: 3 }}>sightings</span>
                  </div>
                  <div style={{ fontSize: 11 }}>
                    <span style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>{animal.referenceImages}</span>
                    <span style={{ color: 'var(--color-text-muted)', marginLeft: 3 }}>ref images</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40, color: 'var(--color-text-muted)' }}>
              No animals match your search.
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="card" style={{ overflow: 'auto' }}>
          {selected ? (
            <div>
              {/* Header */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-card-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{selected.id}</h2>
                  {STATUS_BADGE[selected.status] && (
                    <span className={STATUS_BADGE[selected.status].cls}>{STATUS_BADGE[selected.status].label}</span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>{selected.species}</div>
              </div>

              {/* Image */}
              <div style={{ padding: '12px 20px' }}>
                <img src={selected.image} alt={selected.id} style={{ width: '100%', height: 200, objectFit: 'cover', borderRadius: 8 }} />
              </div>

              {/* Stats */}
              <div style={{ padding: '12px 20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 2 }}>LAST SEEN</div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{selected.lastSeen}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 2 }}>LAST CAMERA</div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{selected.lastCamera}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 2 }}>ZONE</div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{selected.zone}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 2 }}>TOTAL SIGHTINGS</div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{selected.sightings}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 2 }}>REFERENCE IMAGES</div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{selected.referenceImages}</div>
                  </div>
                </div>
              </div>

              {/* AI Re-ID Status */}
              <div style={{ padding: '12px 20px' }}>
                <div className="demo-alert-banner" style={{ marginBottom: 0 }}>
                  <AlertTriangle size={16} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>AI Re-ID: Simulated</div>
                    <div style={{ fontSize: 11, marginTop: 2 }}>
                      Animal identity matching uses mock data. Real inference requires a trained model or external AI service.
                    </div>
                  </div>
                </div>
              </div>

              {/* Sighting History */}
              {selected.sightingHistory.length > 0 && (
                <div style={{ padding: '12px 20px', borderTop: '1px solid var(--color-card-border)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <History size={12} style={{ marginRight: 4 }} />Sighting History
                  </div>
                  <div className="timeline">
                    {selected.sightingHistory.map((item, i) => (
                      <div key={i} className="timeline-item">
                        <div className="timeline-dot" />
                        <div className="timeline-time">{item.time}</div>
                        <div className="timeline-label">{item.camera}</div>
                        <div className="timeline-desc">{item.note}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--color-card-border)', display: 'flex', gap: 8 }}>
                <button className="btn btn-primary btn-sm"><Eye size={13} /> View Full Profile</button>
                {selected.pendingReview && (
                  <button className="btn btn-secondary btn-sm"><CheckCircle size={13} /> Review Identity</button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)' }}>
              Select an animal to view details
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
