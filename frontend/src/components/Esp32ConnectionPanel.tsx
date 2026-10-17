import { useCallback, useEffect, useRef, useState } from 'react';
import { useGatewayDevices } from '../hooks/useGatewayDevices';
import { API_BASE, deviceApi, getOperatorToken, setOperatorToken } from '../services/deviceApi';
import type { DiscoveredEsp32, GatewayReadiness, WifiState } from '../services/deviceApi';
import DroneControlPanel from './DroneControlPanel';

const AUTO_RECONNECT_KEY = 'wildtrace_auto_reconnect';
const AUTHORIZED_DEVICES_KEY = 'wildtrace_authorized_devices';

function readAuthorizedDevices(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(AUTHORIZED_DEVICES_KEY) || '[]');
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string' && /^[a-zA-Z0-9_-]{3,64}$/.test(id)) : [];
  } catch { return []; }
}

export default function Esp32ConnectionPanel() {
  const { devices, events, error: gatewayError, refresh } = useGatewayDevices();
  const [wifi, setWifi] = useState<WifiState | null>(null);
  const [wifiError, setWifiError] = useState('');
  const [readiness, setReadiness] = useState<GatewayReadiness | null>(null);
  const [found, setFound] = useState<DiscoveredEsp32[]>([]);
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'done' | 'error'>('idle');
  const [scanProgress, setScanProgress] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState(80);
  const [name, setName] = useState('ESP32 Remote Bridge');
  const [mode, setMode] = useState<'station' | 'access_point'>('station');
  const [profile, setProfile] = useState<'modern_json' | 'legacy_html'>('modern_json');
  const [token, setToken] = useState(getOperatorToken());
  const [selectedId, setSelectedId] = useState('');
  const [operator, setOperator] = useState('');
  const [note, setNote] = useState('');
  const [isolated, setIsolated] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [autoReconnect, setAutoReconnect] = useState(() => localStorage.getItem(AUTO_RECONNECT_KEY) === 'true');
  const [networkChange, setNetworkChange] = useState('');
  const scanRef = useRef<EventSource | null>(null);
  const scanVersionRef = useRef(0);
  const networkKeyRef = useRef('');
  const previousNetworkRef = useRef<WifiState | null>(null);
  const autoReconnectRef = useRef(autoReconnect);
  const authorizedRef = useRef(new Set(readAuthorizedDevices()));
  const reconnectingRef = useRef(new Set<string>());
  const selected = devices.find(d => d.id === selectedId) || devices[0];

  const closeActiveScan = useCallback(() => {
    scanRef.current?.close();
    scanRef.current = null;
  }, []);

  const saveAuthorized = useCallback(() => {
    localStorage.setItem(AUTHORIZED_DEVICES_KEY, JSON.stringify([...authorizedRef.current]));
  }, []);

  const reconnectIfAuthorized = useCallback(async (device: DiscoveredEsp32, connectionMode: 'station' | 'access_point', version: number) => {
    if (!autoReconnectRef.current || !authorizedRef.current.has(device.deviceId) || reconnectingRef.current.has(device.deviceId)) return;
    reconnectingRef.current.add(device.deviceId);
    try {
      const result = await deviceApi.connect(device.ip, device.port, `ESP32 ${device.deviceId}`, connectionMode, 'modern_json');
      if (version === scanVersionRef.current) {
        setSelectedId(result.device.id);
        setMessage(`Reconnected to previously authorized device ${device.deviceId}.`);
      }
    } catch (error) {
      if (version === scanVersionRef.current) setMessage(`Could not reconnect to ${device.deviceId}: ${error instanceof Error ? error.message : String(error)}`);
    } finally { reconnectingRef.current.delete(device.deviceId); }
  }, []);

  const scan = useCallback(async (network: WifiState) => {
    scanRef.current?.close();
    const version = ++scanVersionRef.current;
    setFound([]); setScanProgress(''); setScanStatus('scanning');
    if (network.mode === 'softap' || network.mode === 'softap_candidate') {
      try {
        const { device } = await deviceApi.discoverHost('192.168.4.1', 80);
        if (version === scanVersionRef.current) { setFound([device]); setScanStatus('done'); void reconnectIfAuthorized(device, 'access_point', version); }
      } catch { if (version === scanVersionRef.current) setScanStatus('done'); }
      return;
    }
    if (network.mode !== 'station' || !network.cidr) { setScanStatus('error'); return; }
    const params = new URLSearchParams({ cidr: network.cidr, ports: '80,8080' });
    const stream = new EventSource(`${API_BASE}/api/discovery/scan?${params}`);
    scanRef.current = stream;
    stream.addEventListener('device', event => {
      if (version !== scanVersionRef.current) return;
      try {
        const d = JSON.parse((event as MessageEvent).data) as DiscoveredEsp32;
        setFound(previous => previous.some(p => p.ip === d.ip && p.port === d.port) ? previous : [...previous, d]);
        void reconnectIfAuthorized(d, 'station', version);
      } catch { /* Ignore malformed discovery event. */ }
    });
    stream.addEventListener('progress', event => {
      if (version !== scanVersionRef.current) return;
      try { const data = JSON.parse((event as MessageEvent).data); setScanProgress(`${data.checked}/${data.total} host and port checks`); }
      catch { /* Ignore malformed progress event. */ }
    });
    stream.addEventListener('done', () => {
      if (version !== scanVersionRef.current) return;
      stream.close(); scanRef.current = null; setScanStatus('done');
    });
    stream.onerror = () => {
      if (version !== scanVersionRef.current) return;
      stream.close(); scanRef.current = null; setScanStatus('error');
    };
  }, [reconnectIfAuthorized]);

  const detectWifi = useCallback(async (forceScan = false) => {
    void deviceApi.readiness().then(setReadiness).catch(() => setReadiness(null));
    try {
      const current = await deviceApi.networkCurrent();
      setWifi(current); setWifiError('');
      const key = `${current.mode}|${current.interfaceName}|${current.ssid || current.profileName}|${current.address}|${current.cidr}|${current.gateway}`;
      if (forceScan || key !== networkKeyRef.current) {
        const previous = previousNetworkRef.current;
        if (previous && `${previous.mode}|${previous.interfaceName}|${previous.address}|${previous.cidr}` !== `${current.mode}|${current.interfaceName}|${current.address}|${current.cidr}`) {
          setNetworkChange(`Laptop network changed: ${previous.ssid || previous.profileName || previous.address || previous.mode} → ${current.ssid || current.profileName || current.address || current.mode}. Checking for authorized devices.`);
        }
        previousNetworkRef.current = current;
        networkKeyRef.current = key;
        const ap = current.mode === 'softap' || current.mode === 'softap_candidate';
        setMode(ap ? 'access_point' : 'station');
        setHost(previous => ap ? '192.168.4.1' : previous === '192.168.4.1' ? '' : previous);
        void scan(current);
      }
    } catch (error) { setWifiError(error instanceof Error ? error.message : String(error)); }
  }, [scan]);
  useEffect(() => {
    const initial = setTimeout(() => void detectWifi(), 0);
    const timer = setInterval(() => void detectWifi(), 3000);
    return () => { clearTimeout(initial); clearInterval(timer); ++scanVersionRef.current; closeActiveScan(); }; // eslint-disable-line react-hooks/exhaustive-deps
  }, [closeActiveScan, detectWifi]);

  function chooseFound(device: DiscoveredEsp32) {
    setHost(device.ip); setPort(device.port); setProfile('modern_json');
    setName(`ESP32 ${device.deviceId}`);
    setMessage(`Selected ${device.deviceId}. Press Connect to verify its status through the gateway.`);
  }
  const ap = wifi?.mode === 'softap' || wifi?.mode === 'softap_candidate';
  const wifiMessage = wifi?.mode === 'softap'
    ? 'Laptop is connected to WildTrace-ESP32 → SoftAP mode active. Checking 192.168.4.1.'
    : wifi?.mode === 'softap_candidate'
      ? 'Laptop appears to be on the ESP32 access-point network. Checking 192.168.4.1; exact SSID is unavailable.'
      : wifi?.mode === 'station'
        ? `Laptop Wi-Fi is connected${wifi.ssid ? ` to ${wifi.ssid}` : wifi.profileName ? ` · Windows profile: ${wifi.profileName}` : ''} → Searching its live subnet ${wifi.subnet || `${wifi.base}.0/24`}.`
        : 'No active Wi-Fi network detected. Check Wi-Fi or enter a device IP manually.';
  async function run(work: () => Promise<unknown>, success: string) {
    setBusy(true); setMessage('');
    try { await work(); await refresh(); setMessage(success); }
    catch (e) { setMessage(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  return <div>
    <h2 style={{ fontSize: 18, fontWeight: 700 }}>ESP32 Device Connection</h2>
    <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '8px 0 18px' }}>
      The local gateway checks the laptop network and talks to ESP32 devices over HTTP. It also avoids browser CORS restrictions on local device requests.
    </p>
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <div className="card-title">Current laptop Wi-Fi</div>
      <p role="status" style={{ fontSize: 13, margin: '10px 0 6px' }}>{wifi ? wifiMessage : wifiError ? 'Local gateway unavailable.' : 'Checking laptop network…'}</p>
      {wifi && <div style={{ fontSize: 12, lineHeight: 1.7 }}>
        <div><strong>Wi-Fi name:</strong> {wifi.ssid || 'Unavailable'}{!wifi.ssid && wifi.profileName ? ` · Windows profile: ${wifi.profileName}` : ''}</div>
        <div><strong>Wi-Fi adapter:</strong> {wifi.interfaceName || 'Not connected'} · <strong>Laptop IP:</strong> {wifi.address || 'Unavailable'}/{wifi.cidr?.split('/')[1] || '—'}</div>
        <div><strong>Subnet:</strong> {wifi.subnet || 'Unavailable'} · <strong>Subnet mask:</strong> {wifi.netmask || 'Unavailable'} · <strong>Router gateway:</strong> {wifi.gateway || 'Unavailable'}</div>
        <div>Network status refreshed {new Date(wifi.networkObservedAt).toLocaleTimeString()} · automatic refresh every 3 seconds.</div>
        {wifi.ssidNote && <div style={{ color: 'var(--color-warning)' }}>{wifi.ssidNote}</div>}
      </div>}
      {wifiError && <p role="alert" style={{ fontSize: 12 }}>{wifiError}</p>}
      {networkChange && <p role="status" style={{ fontSize: 12 }}>{networkChange}</p>}
      <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => void detectWifi(true)}>Refresh Wi-Fi & scan</button>
    </div>
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <div className="card-title">Drone setup</div>
      <p style={{ fontSize: 12, margin: '8px 0' }}>A laptop Wi-Fi connection does not pair the drone by itself. The ESP32 must run the WildTrace firmware and join the same Wi-Fi, or provide its own WildTrace-ESP32 access point.</p>
      <div style={{ fontSize: 12, lineHeight: 1.7 }}>
        <div>1. Set the ESP32 station Wi-Fi name to {wifi?.ssid ? <strong>{wifi.ssid}</strong> : <strong>the exact SSID shown in Windows Wi-Fi</strong>} and enter its password in the firmware configuration; upload it over USB. A Windows network profile name may differ from the SSID.</div>
        <div>2. Set matching device command tokens in the ESP32 firmware and local gateway, then restart the gateway.</div>
        <div>3. Select a discovered ESP32 below. Test the isolated K5/K3 button interface before using flight controls.</div>
      </div>
      {readiness && <p style={{ fontSize: 12, margin: '8px 0 0' }}>
        Local gateway: operator token {readiness.operatorTokenConfigured ? 'configured' : 'missing'} · ESP32 command token {readiness.deviceTokenConfigured ? 'configured' : 'missing'}.
        {!readiness.deviceTokenConfigured && ' Set ESP32_COMMAND_TOKEN in backend/.env.local to the same value as DEVICE_COMMAND_TOKEN in firmware secrets.h.'}
      </p>}
    </div>
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <div className="card-title">Available ESP32 devices</div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, margin: '10px 0' }}>
        <input type="checkbox" checked={autoReconnect} onChange={event => {
          const enabled = event.target.checked;
          autoReconnectRef.current = enabled; setAutoReconnect(enabled); localStorage.setItem(AUTO_RECONNECT_KEY, String(enabled));
          if (enabled) devices.filter(d => d.profile === 'modern_json' && d.connected).forEach(d => authorizedRef.current.add(d.id));
          saveAuthorized();
        }} />
        <span>Automatically reconnect to devices I have connected before. This only retries a compatible ESP32 identity on the laptop’s current local network; it never changes Wi-Fi networks or sends flight commands.</span>
      </label>
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '8px 0' }}>
        {ap ? 'SoftAP: probing 192.168.4.1:80.' : wifi?.mode === 'station' ? `Laptop Wi-Fi: scanning ${wifi.subnet || `${wifi.base}.0/24`} on ports 80 and 8080.` : 'Connect to Wi-Fi to scan, or use manual IP below.'}
        {' '}Only firmware that identifies itself as an ESP32 remote bridge appears here.
      </p>
      {scanStatus === 'scanning' && <div role="status" style={{ fontSize: 12 }}>Scanning… {scanProgress}</div>}
      {scanStatus === 'error' && <div role="alert" style={{ fontSize: 12 }}>Network scan could not finish. Check the local gateway and try manual IP.</div>}
      {scanStatus === 'done' && found.length === 0 && <div role="status" style={{ fontSize: 12 }}>No drone found. Make sure the ESP32 is powered on, flashed with compatible firmware, and connected to the same Wi-Fi. Scans cannot cross isolated subnets.</div>}
      {found.map(d => <div key={`${d.ip}:${d.port}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid var(--color-card-border)', fontSize: 12 }}>
        <div><strong>{d.deviceId}</strong> · {d.ip}:{d.port}<div>Firmware {d.firmware || 'unknown'} · identified by /health</div></div>
        <button className="btn btn-primary btn-sm" onClick={() => chooseFound(d)}>Select</button>
      </div>)}
      <button className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} disabled={!wifi || scanStatus === 'scanning'} onClick={() => wifi && void scan(wifi)}>Scan again</button>
    </div>
    <div className="card" style={{ padding: 16, marginTop: 16 }}>
      <div className="card-title" style={{ marginBottom: 12 }}>Connect or test by IP</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
        <label className="form-group"><span className="form-label">Device name</span><input className="form-input" value={name} onChange={e => setName(e.target.value)} /></label>
        <label className="form-group"><span className="form-label">Connection mode</span><select className="form-input" value={mode} onChange={e => setMode(e.target.value as typeof mode)}><option value="station">Station / shared Wi-Fi</option><option value="access_point">ESP32 SoftAP</option></select></label>
        <label className="form-group"><span className="form-label">Device IP</span><input className="form-input" value={host} placeholder={ap ? '192.168.4.1' : '192.168.1.100'} onChange={e => setHost(e.target.value.trim())} /></label>
        <label className="form-group"><span className="form-label">HTTP port</span><input className="form-input" type="number" min="1" max="65535" value={port} onChange={e => setPort(Number(e.target.value))} /></label>
        <label className="form-group"><span className="form-label">Device interface</span><select className="form-input" value={profile} onChange={e => setProfile(e.target.value as typeof profile)}><option value="modern_json">WildTrace JSON API · controls</option><option value="legacy_html">Classic HTML page · read only</option></select></label>
        <label className="form-group"><span className="form-label">Operator token</span><input className="form-input" type="password" value={token} onChange={e => { setToken(e.target.value); setOperatorToken(e.target.value); }} autoComplete="off" /></label>
      </div>
      {profile === 'legacy_html' && <p style={{ fontSize: 12, color: 'var(--color-warning)' }}>HTML pages can be checked for reachability and title. Their identity and command routes are unverified, so flight controls stay disabled. The original GET /stop does not land the drone.</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" disabled={busy || !host} onClick={() => void run(async () => { await deviceApi.probe(host, port, profile); }, profile === 'legacy_html' ? 'HTML page reachable; identity unverified' : 'ESP32 health check passed')}>Test Connection</button>
        <button className="btn btn-primary" disabled={busy || !host} onClick={() => void run(async () => { const r = await deviceApi.connect(host, port, name, mode, profile); setSelectedId(r.device.id); if (profile === 'modern_json' && autoReconnectRef.current) { authorizedRef.current.add(r.device.id); saveAuthorized(); } }, profile === 'legacy_html' ? 'HTML page reachable; controls unavailable' : 'ESP32 connected; drone flight state remains unknown')}>Connect selected IP</button>
        <button className="btn btn-secondary" disabled={busy} onClick={() => void refresh()}>Refresh</button>
      </div>
      {(message || gatewayError) && <p role="status" style={{ marginTop: 10, fontSize: 12 }}>{message || gatewayError}</p>}
    </div>
    <div className="card" style={{ padding: 16, marginTop: 16 }}>
      <div className="card-title">Connected devices</div>
      {devices.length === 0 && <p style={{ fontSize: 12, marginTop: 10 }}>No devices connected yet. Select a discovered ESP32 above or enter a device IP.</p>}
      {devices.length > 0 && <>
        <select className="form-input" aria-label="Device" value={selected?.id || ''} onChange={e => setSelectedId(e.target.value)} style={{ margin: '10px 0' }}>
          {devices.map(d => <option key={d.id} value={d.id}>{d.name} ({d.id})</option>)}
        </select>
        {selected && <div style={{ fontSize: 12, lineHeight: 1.8 }}>
          <div><strong>Connection:</strong> {selected.connected ? selected.profile === 'legacy_html' ? 'HTML page reachable · identity unverified' : 'ESP32 responding' : 'Disconnected / unreachable'}</div>
          <div><strong>Device:</strong> {selected.type} · {selected.host}:{selected.port} · {selected.mode}</div>
          <div><strong>Interface:</strong> {selected.profile === 'legacy_html' ? `HTML · ${selected.htmlTitle || 'untitled'} · read only` : 'WildTrace JSON API'} · <strong>Last seen:</strong> {selected.lastSeen ? new Date(selected.lastSeen).toLocaleString() : 'Never'}</div>
          {selected.profile === 'modern_json' && <>
            <div><strong>Firmware:</strong> {selected.status?.firmware_version || 'Unknown'} · <strong>Physical enable:</strong> {selected.status?.physical_enable ? 'Closed' : 'Open / unknown'} · <strong>Armed:</strong> {selected.status?.armed ? 'Yes' : 'No'}</div>
            <div><strong>Hardware interface:</strong> {selected.hardwareVerified ? `Operator recorded: ${selected.verificationNote?.operator}` : 'Unverified — takeoff disabled'}</div>
            <div><strong>Battery:</strong> {selected.telemetry.battery_percent ?? 'Unavailable'}% · <strong>Altitude:</strong> {selected.telemetry.altitude_m ?? 'Unavailable'} m · <strong>Flight state:</strong> {selected.status?.flight_state || 'unknown'}</div>
          </>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void run(() => deviceApi.status(selected.id), 'Status refreshed')}>View Status</button>
            <button className="btn btn-danger btn-sm" disabled={busy || !selected.connected} onClick={() => void run(async () => { await deviceApi.disconnect(selected.id); authorizedRef.current.delete(selected.id); saveAuthorized(); }, 'Dashboard disconnected; this does not land the drone')}>Disconnect</button>
          </div>
        </div>}
      </>}
    </div>
    {selected?.profile === 'modern_json' && <div style={{ marginTop: 16 }}><DroneControlPanel deviceId={selected.id} /></div>}
    {selected?.profile === 'modern_json' && !selected.hardwareVerified && <div className="card" style={{ padding: 16, marginTop: 16 }}>
      <div className="card-title">Hardware verification record</div>
      <p style={{ fontSize: 12, margin: '8px 0' }}>Record these checks only after physically completing them. The software cannot verify the isolated switch or button contacts.</p>
      <label style={{ display: 'block', fontSize: 12 }}><input type="checkbox" checked={isolated} onChange={e => setIsolated(e.target.checked)} /> Isolated switches verified with a multimeter; no remote voltage reaches ESP32 GPIO.</label>
      <label style={{ display: 'block', fontSize: 12 }}><input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)} /> Both 200 ms pulses tested with remote controller disconnected.</label>
      <input className="form-input" placeholder="Operator name" value={operator} onChange={e => setOperator(e.target.value)} style={{ marginTop: 8 }} />
      <input className="form-input" placeholder="Test details / measurement" value={note} onChange={e => setNote(e.target.value)} style={{ marginTop: 8 }} />
      <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} disabled={busy || !isolated || !dryRun || !operator.trim() || !note.trim()} onClick={() => void run(() => deviceApi.verify(selected.id, operator, note), 'Verification record saved')}>Record verification</button>
    </div>}
    <div className="card" style={{ padding: 16, marginTop: 16 }}>
      <div className="card-title">Gateway events</div>
      <div style={{ maxHeight: 220, overflow: 'auto', fontSize: 11, marginTop: 8 }}>
        {events.length ? events.map((event, i) => <div key={i}>{new Date(event.at).toLocaleTimeString()} · {event.deviceId} · {event.event} · {event.detail}</div>) : 'No events yet.'}
      </div>
    </div>
  </div>;
}
