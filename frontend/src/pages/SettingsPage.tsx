import { useState } from 'react';
import AppShell from '../components/AppShell';
import {
  User, Shield, Wifi, Bell, Database, Monitor,
  AlertTriangle, Save, QrCode, RefreshCw, Trash2,
  Copy
} from 'lucide-react';
import { MOCK_USER } from '../data/mockData';

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

type SettingsTab = 'profile' | 'notifications' | 'devices' | 'connection' | 'security' | 'system';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [devices, setDevices] = useState(MOCK_DEVICES);
  const [showQR, setShowQR] = useState(false);
  const [pairingToken, setPairingToken] = useState('');
  const [saved, setSaved] = useState(false);

  // Profile state
  const [profileName, setProfileName] = useState(MOCK_USER.name);
  const [profileRole, setProfileRole] = useState(MOCK_USER.role);
  const [profileDivision, setProfileDivision] = useState(MOCK_USER.division);

  // Notification state
  const [notifAlerts, setNotifAlerts] = useState(true);
  const [notifMissions, setNotifMissions] = useState(true);
  const [notifDevices, setNotifDevices] = useState(false);
  const [notifReports, setNotifReports] = useState(false);

  // Connection state
  const [backendUrl, setBackendUrl] = useState('http://localhost:3001');
  const [wsUrl, setWsUrl] = useState('ws://localhost:3001/ws');
  const [droneMode, setDroneMode] = useState('simulated');

  const tabs: { key: SettingsTab; label: string; icon: typeof User }[] = [
    { key: 'profile', label: 'Profile', icon: User },
    { key: 'notifications', label: 'Notifications', icon: Bell },
    { key: 'devices', label: 'Devices & QR', icon: QrCode },
    { key: 'connection', label: 'Connection', icon: Wifi },
    { key: 'security', label: 'Security', icon: Shield },
    { key: 'system', label: 'System', icon: Database },
  ];

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function generatePairingToken() {
    const token = `TSP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    setPairingToken(token);
    setShowQR(true);
  }

  function revokeDevice(id: string) {
    setDevices(prev => prev.map(d => d.id === id ? { ...d, status: 'disconnected' as const } : d));
  }

  return (
    <AppShell pageTitle="Settings" pageSubtitle="System configuration and device management">
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16, height: 'calc(100vh - 160px)' }}>
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
                Manage paired devices. Generate a QR code to onboard new devices.
              </p>

              <div className="demo-alert-banner" style={{ marginBottom: 16 }}>
                <AlertTriangle size={16} />
                <div style={{ fontSize: 12 }}>
                  QR pairing uses short-lived tokens over local network. It does not establish Wi-Fi connections or control drone hardware directly.
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
                  <QrCode size={14} /> Generate Pairing QR
                </button>
                {showQR && (
                  <button className="btn btn-secondary btn-sm" onClick={() => { setShowQR(false); setPairingToken(''); }}>
                    <RefreshCw size={12} /> Expire Token
                  </button>
                )}
              </div>

              {showQR && pairingToken && (
                <div className="card" style={{ padding: 20, maxWidth: 360, textAlign: 'center' }}>
                  {/* Simulated QR code display */}
                  <div style={{
                    width: 180, height: 180, margin: '0 auto 12px', borderRadius: 8,
                    background: 'white', border: '2px solid var(--color-card-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexDirection: 'column', gap: 8,
                  }}>
                    <QrCode size={80} color="var(--color-brand-900)" />
                    <div style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>Scan with device</div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Pairing Token</div>
                  <div style={{
                    fontSize: 13, fontFamily: 'monospace', background: 'var(--color-workspace-bg)',
                    padding: '6px 12px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 8,
                  }}>
                    {pairingToken}
                    <Copy size={12} style={{ cursor: 'pointer', color: 'var(--color-text-muted)' }} onClick={() => navigator.clipboard.writeText(pairingToken)} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 8 }}>
                    Token expires in 10 minutes. Scan the QR code from a compatible device to begin pairing.
                  </div>
                  <div className="demo-alert-banner" style={{ marginTop: 12, marginBottom: 0 }}>
                    <AlertTriangle size={14} />
                    <span style={{ fontSize: 11 }}>SIMULATED — No real QR image generated. In production, use a library like <code style={{ fontSize: 10 }}>qrcode.react</code> to encode the enrollment URL.</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CONNECTION */}
          {activeTab === 'connection' && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Connection Settings</h2>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 20 }}>Backend server and drone connectivity configuration.</p>
              <div className="form-group">
                <label className="form-label">Backend API URL</label>
                <input className="form-input" value={backendUrl} onChange={e => setBackendUrl(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">WebSocket URL</label>
                <input className="form-input" value={wsUrl} onChange={e => setWsUrl(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Drone Connection Mode</label>
                <select className="form-input" value={droneMode} onChange={e => setDroneMode(e.target.value)}>
                  <option value="simulated">Simulated (Mock)</option>
                  <option value="sitl">ArduPilot SITL</option>
                  <option value="mavlink">MAVLink (Hardware)</option>
                </select>
              </div>
              <div className="demo-alert-banner">
                <AlertTriangle size={16} />
                <span style={{ fontSize: 12 }}>
                  No backend server is currently running. Start the backend to enable API and WebSocket connectivity.
                </span>
              </div>
              <button className="btn btn-primary" onClick={handleSave}><Save size={14} /> Save</button>
              {saved && <span style={{ marginLeft: 12, color: 'var(--color-success)', fontSize: 13, fontWeight: 600 }}>✓ Saved</span>}
            </div>
          )}

          {/* SECURITY */}
          {activeTab === 'security' && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Security</h2>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 20 }}>Authentication, authorization, and access control settings.</p>
              <div className="demo-alert-banner" style={{ marginBottom: 16 }}>
                <AlertTriangle size={16} />
                <span style={{ fontSize: 12 }}>
                  Authentication is not yet implemented. The application currently runs in unauthenticated demo mode. Production deployments
                  must add server-side authentication, role-based access control, and secure session management.
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
                  { label: 'Backend', value: 'Node.js + Express (not started)', color: 'var(--color-critical)' },
                  { label: 'Database', value: 'SQLite (not connected)', color: 'var(--color-critical)' },
                  { label: 'WebSocket', value: 'Not connected', color: 'var(--color-critical)' },
                  { label: 'Drone Adapter', value: 'Simulated (mock)' },
                  { label: 'AI/Re-ID Engine', value: 'Not configured', color: 'var(--color-warning)' },
                  { label: 'Data Mode', value: 'Mock data (demo)' },
                ].map(item => (
                  <div key={item.label} style={{ padding: '10px 0', borderBottom: '1px solid var(--color-card-border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600 }}>{item.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: item.color ?? 'var(--color-text-primary)' }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
