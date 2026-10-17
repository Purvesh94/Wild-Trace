import { useState } from 'react';
import { useGatewayDevices } from '../hooks/useGatewayDevices';

type Mission = { id: string; name: string; deviceId: string; operator: string; plannedStart: string;
  mode: 'manual'; status: 'planned' | 'active' | 'closed'; waypoints: [number, number][];
  log: { at: string; detail: string }[] };
const KEY = 'tadoba_manual_missions';
function load(): Mission[] {
  try { const value = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(value) ? value : []; }
  catch { return []; }
}
export default function ManualMissionRegistry() {
  const { devices, events } = useGatewayDevices();
  const [missions, setMissions] = useState<Mission[]>(load);
  const [name, setName] = useState('');
  const [operator, setOperator] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [plannedStart, setPlannedStart] = useState('');
  const [waypointText, setWaypointText] = useState('');
  const [formError, setFormError] = useState('');
  const [completionNote, setCompletionNote] = useState('');
  const selectedDevice = devices.find(d => d.id === deviceId) || devices[0];
  function save(next: Mission[]) { setMissions(next); localStorage.setItem(KEY, JSON.stringify(next)); }
  function create() {
    if (!name.trim() || !operator.trim() || !selectedDevice || !plannedStart) return;
    let waypoints: [number, number][] = [];
    if (waypointText.trim()) {
      const pairs = waypointText.split(';').map(part => part.trim().split(',').map(value => value.trim()));
      const parsed = pairs.map(point => point.map(Number));
      if (parsed.length > 50 || pairs.some(point => point.length !== 2 || point.some(value => !/^-?\d+(?:\.\d+)?$/.test(value))) ||
          parsed.some(point => Math.abs(point[0]) > 90 || Math.abs(point[1]) > 180)) {
        setFormError('Enter up to 50 planned points as latitude,longitude; latitude,longitude.'); return;
      }
      waypoints = parsed as [number, number][];
    }
    setFormError('');
    const at = new Date().toISOString();
    const mission: Mission = { id: crypto.randomUUID(), name: name.trim(), operator: operator.trim(), deviceId: selectedDevice.id,
      plannedStart, mode: 'manual', status: 'planned', waypoints, log: [{ at, detail: 'Manual mission planned; no flight command sent.' }] };
    save([mission, ...missions]); setName('');
  }
  function change(mission: Mission, status: Mission['status'], detail: string) {
    save(missions.map(m => m.id === mission.id ? { ...m, status, log: [...m.log, { at: new Date().toISOString(), detail }] } : m));
    if (status === 'active') {
      sessionStorage.setItem('tadoba_active_mission', mission.id);
      sessionStorage.setItem('tadoba_active_mission_device', mission.deviceId);
    }
    if (status === 'closed' && sessionStorage.getItem('tadoba_active_mission') === mission.id) {
      sessionStorage.removeItem('tadoba_active_mission');
      sessionStorage.removeItem('tadoba_active_mission_device');
    }
  }
  return <div className="card" style={{ padding: 16, marginBottom: 16 }}>
    <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>Manual mission records</h2>
    <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>ESP32 remote bridge supports only operator initiated button commands. Assisted flight and autonomous waypoints require different hardware. Mission records are saved in this browser.</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '10px 0' }}>
      <input className="form-input" style={{ maxWidth: 180 }} aria-label="Mission name" placeholder="Mission name" value={name} onChange={e => setName(e.target.value)} />
      <input className="form-input" style={{ maxWidth: 140 }} aria-label="Operator" placeholder="Operator" value={operator} onChange={e => setOperator(e.target.value)} />
      <select className="form-input" style={{ maxWidth: 230 }} aria-label="Assigned ESP32" value={selectedDevice?.id || ''} onChange={e => setDeviceId(e.target.value)}>
        {devices.length ? devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>) : <option value="">No ESP32 connected</option>}
      </select>
      <input className="form-input" type="datetime-local" aria-label="Planned start" value={plannedStart} onChange={e => setPlannedStart(e.target.value)} />
      <input className="form-input" style={{ maxWidth: 300 }} aria-label="Planned route points" placeholder="Planned route: lat,lng; lat,lng" value={waypointText} onChange={e => setWaypointText(e.target.value)} />
      <button className="btn btn-primary btn-sm" disabled={!name.trim() || !operator.trim() || !selectedDevice || !plannedStart} onClick={create}>Create manual mission</button>
    </div>
    {formError && <p role="alert" style={{ fontSize: 12 }}>{formError}</p>}
    {missions.map(m => <details key={m.id} style={{ borderTop: '1px solid var(--color-card-border)', padding: '8px 0', fontSize: 12 }}>
      <summary style={{ cursor: 'pointer' }}><strong>{m.name}</strong> · {m.status} · {m.deviceId} · {m.operator} · planned {new Date(m.plannedStart).toLocaleString()}</summary>
      <p>Mode: manual · Planned route points: {m.waypoints?.length || 0} (display only; waypoint execution unsupported) · Mission state is an operator record, not drone flight telemetry.</p>
      {m.status === 'planned' && <button className="btn btn-secondary btn-sm" onClick={() => change(m, 'active', 'Operator marked mission active; no flight command sent.')}>Mark active</button>}
      {m.status === 'active' && <div style={{ display: 'flex', gap: 8 }}><input className="form-input" placeholder="Completion note" value={completionNote} onChange={e => setCompletionNote(e.target.value)} /><button className="btn btn-secondary btn-sm" disabled={!completionNote.trim()} onClick={() => { change(m, 'closed', `Operator closed mission: ${completionNote.trim()}. Flight response not verified by this record.`); setCompletionNote(''); }}>Close record</button></div>}
      <div style={{ marginTop: 8 }}>{m.log.map((entry, i) => <div key={i}>{new Date(entry.at).toLocaleString()} · {entry.detail}</div>)}</div>
      <div style={{ marginTop: 8 }}><strong>Gateway command events</strong>{events.filter(e => e.deviceId === m.deviceId && e.detail.includes(`mission:${m.id}`)).map((e, i) =>
        <div key={i}>{new Date(e.at).toLocaleString()} · {e.event} · {e.detail}</div>)}</div>
    </details>)}
  </div>;
}
