import { useState, useEffect } from 'react';
import AppShell from '../components/AppShell';
import Esp32ConnectionPanel from '../components/Esp32ConnectionPanel';
import DeviceConnectionPanel from '../components/DeviceConnectionPanel';
import { QRCodeSVG } from 'qrcode.react';
import {
  User, Shield, Bell, Database,
  AlertTriangle, Save, QrCode, RefreshCw, Trash2,
  Copy, PlugZap, Clock,
} from 'lucide-react';
import { MOCK_USER } from '../data/mockData';
import { API_BASE, deviceApi } from '../services/deviceApi';
import { getDetector } from '../media/detection';

interface DeviceEntry {
  id: string;
  name: string;
  type: 'drone' | 'camera' | 'mobile';
  status: 'connected' | 'disconnected' | 'paired';
  lastSeen: string;
  pairingToken?: string;
}

const MOCK_DEVICES: DeviceEntry[] = [
  { id: 'DEV-001', name: 'Drone D-01', type: 'drone', status: 'connected', lastSeen: '2 min ago' },
  { id: 'DEV-002', name: 'Drone D-02', type: 'drone', status: 'connected', lastSeen: '1 min ago' },
  { id: 'DEV-003', name: 'Camera 07 (WiFi)', type: 'camera', status: 'connected', lastSeen: '30 sec ago' },
  { id: 'DEV-004', name: 'Field Tablet', type: 'mobile', status: 'disconnected', lastSeen: '1 hour ago' },
];

type SettingsTab = 'profile' | 'notifications' | 'devices' | 'device_connect' | 'security' | 'system';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [devices, setDevices] = useState(MOCK_DEVICES);
  const [showQR, setShowQR] = useState(false);
  const [pairingToken, setPairingToken] = useState('');
  const [tokenExpiry, setTokenExpiry] = useState<Date | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [saved, setSaved] = useState(false);
  const [gatewayOnline, setGatewayOnline] = useState<boolean | null>(null);
  const [connectedDeviceCount, setConnectedDeviceCount] = useState(0);
  const [systemCheckedAt, setSystemCheckedAt] = useState<Date | null>(null);

  // Profile state
  const [profileName, setProfileName] = useState(MOCK_USER.name);
  const [profileRole, setProfileRole] = useState(MOCK_USER.role);
  const [profileDivision, setProfileDivision] = useState(MOCK_USER.division);

  // Notification state
  const [notifAlerts, setNotifAlerts] = useState(true);
  const [notifMissions, setNotifMissions] = useState(true);
  const [notifDevices, setNotifDevices] = useState(false);
  const [notifReports, setNotifReports] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for system tab
  const [_droneMode] = useState('simulated');

  const tabs: { key: SettingsTab; label: string; icon: typeof User }[] = [
    { key: 'profile', label: 'Profile', icon: User },
    { key: 'notifications', label: 'Notifications', icon: Bell },
    { key: 'devices', label: 'Devices & QR', icon: QrCode },
    { key: 'device_connect', label: 'Device Connection', icon: PlugZap },
    { key: 'security', label: 'Security', icon: Shield },
    { key: 'system', label: 'System', icon: Database },
  ];

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  // Token expiry countdown
  useEffect(() => {
    if (!tokenExpiry) return;
    const tick = setInterval(() => {
      const left = Math.max(0, Math.round((tokenExpiry.getTime() - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        setShowQR(false);
        setPairingToken('');
        setTokenExpiry(null);
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [tokenExpiry]);

  useEffect(() => {
    if (activeTab !== 'system') return;
    let alive = true;
    const check = async () => {
      try {
        const response = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(2500) });
        if (!response.ok) throw new Error('Gateway unavailable');
        const listing = await deviceApi.list();
        if (!alive) return;
        setGatewayOnline(true);
        setConnectedDeviceCount(listing.devices.filter(device => device.connected && !device.manualDisconnected).length);
      } catch {
        if (alive) { setGatewayOnline(false); setConnectedDeviceCount(0); }
      } finally { if (alive) setSystemCheckedAt(new Date()); }
    };
    void check();
    const timer = setInterval(() => void check(), 3000);
    return () => { alive = false; clearInterval(timer); };
  }, [activeTab]);

  function generatePairingToken() {
    const random = crypto.getRandomValues(new Uint8Array(16));
    const token = `TSP-${Array.from(random, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    setPairingToken(token);
    setTokenExpiry(expiry);
    setSecondsLeft(600);
    setShowQR(true);
  }

  function expireToken() {
    setShowQR(false);
    setPairingToken('');
    setTokenExpiry(null);
    setSecondsLeft(0);
  }

  function fmtCountdown(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  function revokeDevice(id: string) {
    setDevices(prev => prev.map(d => d.id === id ? { ...d, status: 'disconnected' as const } : d));
  }

  return (
    <AppShell pageTitle="Settings" pageSubtitle="System configuration and device management">
      <div className="settings-layout" style={{ display: 'grid', gridTemplateColumns: '200px minmax(0, 1fr)', gap: 16, height: 'calc(100vh - 160px)' }}>
        {/* Settings sidebar */}
        <div className="card" style={{ overflow: 'auto' }}>
          <div style={{ padding: '8px 0' }}>
            {tabs.map(t => (
              <div
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 16px', cursor: 'pointer',
                  background: activeTab === t.key ? 'var(--color-workspace-bg)' : 'transparent',
                  borderLeft: activeTab === t.key ? '3px solid var(--color-brand-400)' : '3px solid transparent',
                  fontWeight: activeTab === t.key ? 600 : 400,
                  fontSize: 13,
                  color: activeTab === t.key ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  transition: 'all 0.12s',
                }}
              >
                <t.icon size={15} />
                {t.label}
              </div>
            ))}
          </div>
        </div>

        {/* Settings content */}
        <div className="card" style={{ overflow: 'auto', padding: '24px 28px' }}>
          {/* PROFILE */}
          {activeTab === 'profile' && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Profile Settings</h2>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 20 }}>Manage your operator profile and credentials.</p>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input className="form-input" value={profileName} onChange={e => setProfileName(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Role</label>
                <select className="form-input" value={profileRole} onChange={e => setProfileRole(e.target.value)}>
                  <option>Operator</option><option>Reviewer</option><option>Admin</option><option>Observer</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Division</label>
                <input className="form-input" value={profileDivision} onChange={e => setProfileDivision(e.target.value)} />
              </div>
              <button className="btn btn-primary" onClick={handleSave}><Save size={14} /> Save Changes</button>
              {saved && <span style={{ marginLeft: 12, color: 'var(--color-success)', fontSize: 13, fontWeight: 600 }}>✓ Saved</span>}
            </div>
          )}

          {/* NOTIFICATIONS */}
          {activeTab === 'notifications' && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Notifications</h2>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 20 }}>Choose which alerts and updates you receive.</p>
              {[
                { label: 'Wildlife Alerts', desc: 'New animal detections and camera events', checked: notifAlerts, onChange: setNotifAlerts },
                { label: 'Mission Updates', desc: 'Drone mission status changes', checked: notifMissions, onChange: setNotifMissions },
                { label: 'Device Alerts', desc: 'Camera offline, battery low', checked: notifDevices, onChange: setNotifDevices },
                { label: 'Report Generation', desc: 'When scheduled reports are ready', checked: notifReports, onChange: setNotifReports },
              ].map(item => (
                <div key={item.label} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 0', borderBottom: '1px solid var(--color-card-border)',
                }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{item.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{item.desc}</div>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" checked={item.checked} onChange={e => item.onChange(e.target.checked)} />
                    <span className="toggle-slider" />
                  </label>
                </div>
              ))}
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={handleSave}><Save size={14} /> Save</button>
              {saved && <span style={{ marginLeft: 12, color: 'var(--color-success)', fontSize: 13, fontWeight: 600 }}>✓ Saved</span>}
            </div>
          )}

          {/* DEVICES & QR */}
          {activeTab === 'devices' && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Device Management & QR Pairing</h2>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 20 }}>
                  Demo device records and a local QR preview. This screen does not pair or connect hardware.
              </p>

              <div className="demo-alert-banner" style={{ marginBottom: 16 }}>
                <AlertTriangle size={16} />
                <div style={{ fontSize: 12 }}>
                  Demo only: the QR code contains a browser-generated, short-lived token. This project has no QR redemption endpoint, so scanning it does not pair a device. Connect an ESP32 from the Device Connection tab instead.
                  Real device connectivity requires network reachability and compatible protocols.
                </div>
              </div>

              {/* Paired Devices Table */}
              <table className="data-table" style={{ marginBottom: 16 }}>
                <thead>
                  <tr><th>Device</th><th>Type</th><th>Status</th><th>Last Seen</th><th></th></tr>
                </thead>
                <tbody>
                  {devices.map(d => (
                    <tr key={d.id}>
                      <td style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{d.name}</td>
                      <td><span className="badge neutral" style={{ fontSize: 10 }}>{d.type}</span></td>
                      <td>
                        <span className={`badge ${d.status === 'connected' ? 'success' : d.status === 'paired' ? 'info' : 'critical'}`} style={{ fontSize: 10 }}>
                          ● {d.status}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{d.lastSeen}</td>
                      <td>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => revokeDevice(d.id)}
                          disabled={d.status === 'disconnected'}
                        >
                          <Trash2 size={12} /> Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* QR Generation */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
                <button className="btn btn-primary btn-sm" onClick={generatePairingToken}>
                  <QrCode size={14} /> {showQR ? 'Regenerate QR' : 'Generate Pairing QR'}
                </button>
                {showQR && (
                  <button className="btn btn-danger btn-sm" onClick={expireToken}>
                    <RefreshCw size={12} /> Expire Token
                  </button>
                )}
              </div>

              {showQR && pairingToken && (
                <div className="card" style={{ padding: 24, maxWidth: 340, textAlign: 'center' }}>
                  {/* Real QR code — encodes the pairing token as a URL */}
                  <div style={{
                    display: 'inline-block', padding: 12,
                    background: 'white', borderRadius: 10,
                    border: '2px solid var(--color-card-border)',
                    boxShadow: 'var(--color-card-shadow)',
                    marginBottom: 14,
                  }}>
                    <QRCodeSVG
                      value={`tadoba-sentinel://pair?token=${encodeURIComponent(pairingToken)}&host=${encodeURIComponent(window.location.hostname)}&port=${encodeURIComponent(window.location.port || '80')}`}
                      size={180}
                      bgColor="#ffffff"
                      fgColor="#0d2818"
                      level="M"
                      includeMargin={false}
                    />
                  </div>

                  {/* Countdown */}
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '4px 12px', borderRadius: 20, marginBottom: 14,
                    background: secondsLeft < 60 ? 'var(--color-critical-bg)' : 'var(--color-success-bg)',
                    color: secondsLeft < 60 ? 'var(--color-critical)' : 'var(--color-success)',
                    fontSize: 12, fontWeight: 700,
                  }}>
                    <Clock size={12} />
                    Expires in {fmtCountdown(secondsLeft)}
                  </div>

                  {/* Token text + copy */}
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 6 }}>PAIRING TOKEN</div>
                  <div style={{
                    fontSize: 12, fontFamily: 'ui-monospace, Consolas, monospace',
                    background: 'var(--color-workspace-bg)', border: '1px solid var(--color-card-border)',
                    padding: '7px 12px', borderRadius: 6,
                    display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 10,
                    letterSpacing: '0.04em',
                  }}>
                    {pairingToken}
                    <Copy
                      size={13}
                      aria-label="Copy token"
                      style={{ cursor: 'pointer', color: 'var(--color-text-muted)', flexShrink: 0 }}
                      onClick={() => navigator.clipboard.writeText(pairingToken)}
                    />
                  </div>

                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                    Scan with a compatible device on the same network.
                    The QR encodes a pairing URL including this token.
                    Token auto-expires when the countdown reaches zero.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* DEVICE CONNECTION */}
          {activeTab === 'device_connect' && (
            <><Esp32ConnectionPanel /><details style={{ marginTop: 20 }}><summary style={{ cursor: 'pointer', fontSize: 12 }}>Legacy WebSocket device connection</summary><DeviceConnectionPanel /></details></>
          )}

          {/* SECURITY */}
          {activeTab === 'security' && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Security</h2>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 20 }}>Authentication, authorization, and access control settings.</p>
              <div className="demo-alert-banner" style={{ marginBottom: 16 }}>
                <AlertTriangle size={16} />
                <span style={{ fontSize: 12 }}>
                  There is no dashboard sign-in or role-based access control. Drone command routes require the configured local operator token, but this demo gateway must stay bound to loopback and must not be exposed to a network.
                </span>
              </div>
              <div className="form-group">
                <label className="form-label">API Key (for external AI services)</label>
                <input className="form-input" type="password" placeholder="Set via .env file — never commit to source control" readOnly />
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                  Required env var: <code style={{ fontSize: 10 }}>AI_SERVICE_API_KEY</code>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">JWT Secret</label>
                <input className="form-input" type="password" placeholder="Auto-generated on first server start" readOnly />
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                  Required env var: <code style={{ fontSize: 10 }}>JWT_SECRET</code>
                </div>
              </div>
            </div>
          )}

          {/* SYSTEM */}
          {activeTab === 'system' && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>System Information</h2>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 20 }}>Application status and diagnostics.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {[
                  { label: 'Application', value: 'Tadoba Sentinel v0.1.0-dev' },
                  { label: 'Frontend', value: 'React + Vite (running)' },
                  { label: 'Local gateway', value: gatewayOnline === null ? 'Checking…' : gatewayOnline ? 'Node.js + Express running on this laptop' : 'Not reachable', color: gatewayOnline === false ? 'var(--color-critical)' : undefined },
                  { label: 'ESP32 bridge', value: gatewayOnline === null ? 'Checking…' : gatewayOnline ? `${connectedDeviceCount} connected · HTTP status polling` : 'Unavailable while gateway is offline' },
                  { label: 'Database', value: 'No database used by the drone gateway; connection state is in memory' },
                  { label: 'WebSocket', value: 'Not used for ESP32 connection; status refreshes over HTTP every 3 seconds' },
                  { label: 'Drone adapter', value: connectedDeviceCount ? 'ESP32 bridge connected; flight hardware state is separately verified' : 'No live ESP32 bridge currently connected' },
                  { label: 'AI/Re-ID engine', value: getDetector() ? 'Detection service configured' : 'Not configured' },
                  { label: 'Demo content', value: 'Sample dashboard data remains in other sections' },
                ].map(item => (
                  <div key={item.label} style={{ padding: '10px 0', borderBottom: '1px solid var(--color-card-border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600 }}>{item.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: item.color ?? 'var(--color-text-primary)' }}>{item.value}</div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 14 }}>Last checked {systemCheckedAt ? systemCheckedAt.toLocaleTimeString() : '—'} · these checks report the local gateway and registered device sessions, not whether the drone is airborne or camera video is flowing.</p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
