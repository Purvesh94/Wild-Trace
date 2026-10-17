import { useState } from 'react';
import { useGatewayDevices } from '../hooks/useGatewayDevices';
import { deviceApi } from '../services/deviceApi';
import { canTakeoff, canLand } from '../services/deviceState';

export default function DroneControlPanel({ deviceId }: { deviceId?: string }) {
  const { devices, events, error: gatewayError, refresh } = useGatewayDevices();
  const [selectedId, setSelectedId] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [preflight, setPreflight] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const controllable = devices.filter(d => d.profile === 'modern_json');
  const selected = controllable.find(d => d.id === (deviceId || selectedId)) || (!deviceId ? controllable[0] : undefined);
  const missionId = sessionStorage.getItem('tadoba_active_mission_device') === selected?.id
    ? sessionStorage.getItem('tadoba_active_mission') : null;
  const ready = !!selected?.connected && !!selected.hardwareVerified && !!selected.status?.physical_enable;
  async function command(action: 'arm' | 'takeoff' | 'land' | 'disarm') {
    if (!selected) return;
    setBusy(true);
    setFeedback(`Command requested: ${action}`);
    try {
      const response = await deviceApi.command(selected.id, action, confirmation, preflight, missionId || undefined);
      setFeedback(`ESP32 acknowledged ${action}: ${response.command?.status || 'unknown'}. Drone response unverified.`);
      setConfirmation('');
      await refresh();
      if (action === 'takeoff' || action === 'land') {
        setTimeout(() => void refresh(), 500);
      }
    } catch (e) { setFeedback(`Command rejected: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setBusy(false); }
  }
  return <div className="card" style={{ padding: 16, marginBottom: 16 }}>
    <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>ESP32 manual drone control</h2>
    <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Controls the original remote through isolated button switches. A GPIO acknowledgement does not confirm takeoff or landing. Waypoint and return-to-home commands are unsupported.</p>
    {gatewayError && <p role="alert" style={{ fontSize: 12 }}>{gatewayError}</p>}
    {!selected ? <p style={{ fontSize: 12 }}>Connect an ESP32 in Settings → Device Connection first.</p> : <>
      {missionId && <p style={{ fontSize: 12 }}>Active mission record: {missionId}</p>}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', margin: '10px 0' }}>
        {!deviceId && <select className="form-input" aria-label="Control device" style={{ maxWidth: 300 }} value={selected.id} onChange={e => { setSelectedId(e.target.value); setPreflight(false); setConfirmation(''); }}>
          {controllable.map(d => <option key={d.id} value={d.id}>{d.name} · {d.id}</option>)}
        </select>}
        <span className={`badge ${selected.connected ? 'success' : 'critical'}`}>{selected.connected ? 'ESP32 connected' : 'Disconnected'}</span>
        <span className={`badge ${selected.hardwareVerified ? 'success' : 'warning'}`}>{selected.hardwareVerified ? 'Hardware record present' : 'Hardware unverified'}</span>
        <span className="badge neutral">Drone flight state: {selected.status?.flight_state || 'unknown'}</span>
      </div>
      <div style={{ fontSize: 12, marginBottom: 8 }}>Physical enable: {selected.status?.physical_enable ? 'closed' : 'open'} · Controller armed: {selected.status?.armed ? 'yes' : 'no'} · Last command: {selected.status?.last_command_id || 'none'} ({selected.status?.last_command_status || 'none'})</div>
      <div style={{ fontSize: 12, marginBottom: 8 }}>Battery: {selected.telemetry.battery_percent ?? 'Unavailable'}% · Altitude: {selected.telemetry.altitude_m ?? 'Unavailable'} m · GPS: {selected.telemetry.gps_fix ? 'Fix reported' : 'Unavailable'}</div>
      <label style={{ fontSize: 12, display: 'block', marginBottom: 8 }}><input type="checkbox" checked={preflight} onChange={e => setPreflight(e.target.checked)} /> I checked the flight area, remote pairing, battery, and safe clearance. These checks are operator reported.</label>
      <label style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>To request takeoff, type <strong>TAKEOFF {selected.id}</strong>
        <input className="form-input" value={confirmation} onChange={e => setConfirmation(e.target.value)} style={{ maxWidth: 300, marginTop: 4 }} />
      </label>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" disabled={busy || !ready || selected.status?.armed} onClick={() => void command('arm')}>Arm</button>
        <button className="btn btn-primary" disabled={!canTakeoff(selected, preflight, confirmation, busy)} onClick={() => void command('takeoff')}>Takeoff · GPIO18</button>
        <button className="btn btn-danger" disabled={!canLand(selected, busy)} onClick={() => void command('land')}>Land · GPIO19</button>
        <button className="btn btn-secondary" disabled={busy || !selected.connected} onClick={() => void command('disarm')}>Disarm / Disable outputs</button>
        <button className="btn btn-secondary" disabled title="Hover is unsupported by the current E88 remote bridge">Hover · unsupported</button>
        <button className="btn btn-secondary" disabled title="No verified motor-stop command or flight telemetry is available">Emergency Stop · unavailable</button>
        <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void refresh()}>Refresh status</button>
      </div>
      <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 8 }}>Disarm only drives the ESP32 outputs LOW. It cannot stop motors in flight. Use the original remote for any emergency response.</p>
      {feedback && <p role="status" style={{ fontSize: 12, marginTop: 8 }}>{feedback}</p>}
      <div style={{ fontSize: 12, fontWeight: 600, marginTop: 12 }}>Command log</div>
      <div aria-live="polite" style={{ fontSize: 11, marginTop: 6, maxHeight: 130, overflow: 'auto' }}>
        {events.filter(e => e.deviceId === selected.id && e.event.startsWith('command')).slice(0, 12).map((e, i) => <div key={`${e.at}-${i}`}>{new Date(e.at).toLocaleTimeString()} · {e.event.replaceAll('_', ' ')} · {e.detail}</div>)}
        {!events.some(e => e.deviceId === selected.id && e.event.startsWith('command')) && 'No commands sent in this gateway session.'}
      </div>
    </>}
  </div>;
}
