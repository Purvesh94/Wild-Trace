import { useRef, useEffect, useState } from 'react';
import {
  Wifi, WifiOff, AlertTriangle, CheckCircle, Loader,
  Radio, Globe, PlugZap, Trash2, Terminal, Info,
  ScanSearch, StopCircle, RefreshCw, Server, ChevronDown, ChevronRight,
} from 'lucide-react';
import { useDeviceConnection, type ConnectionStatus } from '../hooks/useDeviceConnection';
import { useNetworkDiscovery, HELPER_BASE, type DiscoveredDevice } from '../hooks/useNetworkDiscovery';

// ─── Shared sub-components ─────────────────────────────────────────────────────

function StatusPill({ status }: { status: ConnectionStatus }) {
  const map: Record<ConnectionStatus, { cls: string; icon: React.ReactNode; label: string }> = {
    not_connected: { cls: 'badge neutral',   icon: <WifiOff size={11} />, label: 'Not Connected' },
    connecting:    { cls: 'badge info',      icon: <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} />, label: 'Connecting…' },
    connected:     { cls: 'badge success',   icon: <CheckCircle size={11} />, label: 'Connected' },
    failed:        { cls: 'badge critical',  icon: <AlertTriangle size={11} />, label: 'Failed' },
    disconnected:  { cls: 'badge warning',   icon: <WifiOff size={11} />, label: 'Disconnected' },
  };
  const p = map[status];
  return <span className={p.cls} style={{ fontSize: 12, gap: 5 }}>{p.icon} {p.label}</span>;
}

function ReachabilityDot({ val, label }: { val: boolean | null; label: string }) {
  const color = val === null ? '#d1d5db' : val ? 'var(--color-success)' : 'var(--color-critical)';
  const text  = val === null ? 'Untested' : val ? 'Reachable' : 'Unreachable';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ color: 'var(--color-text-muted)', fontWeight: 500 }}>{label}:</span>
      <span style={{ color, fontWeight: 600 }}>{text}</span>
    </div>
  );
}

function LogLevel({ level }: { level: 'info' | 'warn' | 'error' | 'success' }) {
  const map = {
    info:    { color: 'var(--color-info)',    label: 'INFO ' },
    warn:    { color: 'var(--color-warning)', label: 'WARN ' },
    error:   { color: 'var(--color-critical)', label: 'ERR  ' },
    success: { color: 'var(--color-success)', label: 'OK   ' },
  };
  const { color, label } = map[level];
  return <span style={{ color, fontWeight: 700, userSelect: 'none' }}>{label}</span>;
}

// ─── Scan progress bar ─────────────────────────────────────────────────────────

function ScanProgressBar({ checked, total }: { checked: number; total: number }) {
  const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4 }}>
        <span>Probing addresses…</span>
        <span>{checked} / {total} ({pct}%)</span>
      </div>
      <div style={{ height: 4, background: 'var(--color-card-border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: 'var(--color-brand-400)',
          borderRadius: 2, transition: 'width 0.2s ease',
        }} />
      </div>
    </div>
  );
}

// ─── Discovered device card ────────────────────────────────────────────────────

function DeviceCard({ device, onSelect }: { device: DiscoveredDevice; onSelect: () => void }) {
  return (
    <div style={{
      border: '1px solid var(--color-card-border)',
      borderRadius: 'var(--border-radius-md)',
      padding: '12px 14px',
      background: 'var(--color-card-bg)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 14, fontFamily: 'ui-monospace, Consolas, monospace' }}>
            {device.ip}:{device.port}
          </span>
          <span className="badge success" style={{ fontSize: 10 }}>● Compatible</span>
          <span className="badge neutral" style={{ fontSize: 10 }}>{device.source}</span>
        </div>
        {device.hostname && (
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 2 }}>
            🔤 {device.hostname}
          </div>
        )}
        {device.firmware && (
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>FW: {device.firmware}</div>
        )}
        <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 4 }}>
          Checked: {new Date(device.checkedAt).toLocaleTimeString('en-GB', { hour12: false })}
        </div>
        <div style={{
          fontSize: 10, color: 'var(--color-warning)', marginTop: 3,
          padding: '2px 6px', background: 'var(--color-warning-bg)',
          borderRadius: 3, display: 'inline-block',
        }}>
          ⚠ {device.note}
        </div>
      </div>
      <button className="btn btn-primary btn-sm" style={{ flexShrink: 0 }} onClick={onSelect}>
        <PlugZap size={12} /> Use
      </button>
    </div>
  );
}

// ─── Network Discovery section ─────────────────────────────────────────────────

export function NetworkDiscoverySection({
  onSelectDevice,
}: {
  onSelectDevice: (ip: string, port: string) => void;
}) {
  const [scanOpen, setScanOpen] = useState(false);
  const [discovery, discoveryActions] = useNetworkDiscovery();
  const {
    helperAvailable, interfaces, selectedBase, scanPorts, healthPath,
    scanStatus, progress, devices, scanError, lastScanAt,
  } = discovery;
  const {
    checkHelper, loadInterfaces, selectBase, setScanPorts,
    startScan, stopScan, clearDevices,
  } = discoveryActions;

  const isScanning = scanStatus === 'scanning';

  // Check helper on mount
  useEffect(() => {
    checkHelper();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load interfaces when helper becomes available
  useEffect(() => {
    if (helperAvailable) loadInterfaces();
  }, [helperAvailable]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Section header — collapsible */}
      <button
        onClick={() => setScanOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          background: 'var(--color-workspace-bg)', border: '1px solid var(--color-card-border)',
          borderRadius: scanOpen ? 'var(--border-radius-md) var(--border-radius-md) 0 0' : 'var(--border-radius-md)',
          padding: '10px 14px', cursor: 'pointer', textAlign: 'left',
          transition: 'background 0.12s',
        }}
      >
        <ScanSearch size={15} color="var(--color-brand-500)" />
        <span style={{ fontWeight: 600, fontSize: 13 }}>Network Discovery</span>
        {helperAvailable === true  && <span className="badge success" style={{ fontSize: 10 }}>Helper running</span>}
        {helperAvailable === false && <span className="badge critical" style={{ fontSize: 10 }}>Helper offline</span>}
        {helperAvailable === null  && <span className="badge neutral" style={{ fontSize: 10 }}>Checking…</span>}
        {devices.length > 0 && <span className="badge brand" style={{ fontSize: 10 }}>{devices.length} found</span>}
        <span style={{ marginLeft: 'auto', color: 'var(--color-text-muted)' }}>
          {scanOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>

      {scanOpen && (
        <div style={{
          border: '1px solid var(--color-card-border)',
          borderTop: 'none',
          borderRadius: '0 0 var(--border-radius-md) var(--border-radius-md)',
          padding: '16px',
          background: 'var(--color-card-bg)',
        }}>
          {/* Helper status */}
          {helperAvailable === false && (
            <div className="demo-alert-banner" style={{ marginBottom: 12 }}>
              <AlertTriangle size={15} />
              <div style={{ fontSize: 12 }}>
                <strong>Discovery helper not running.</strong> Start it with:<br />
                <code style={{ fontSize: 11, background: '#0f1a11', color: '#86efac', padding: '2px 6px', borderRadius: 3, display: 'inline-block', marginTop: 4 }}>
                  node backend/src/discovery.js
                </code>
                <br />
                <span style={{ marginTop: 4, display: 'inline-block' }}>
                  Helper listens on <code style={{ fontSize: 10 }}>http://127.0.0.1:3099</code> (localhost only).
                  Requires the dashboard to be served over <code style={{ fontSize: 10 }}>http://</code>.
                </span>
              </div>
              <button className="btn btn-secondary btn-sm" style={{ flexShrink: 0 }} onClick={checkHelper}>
                <RefreshCw size={11} /> Retry
              </button>
            </div>
          )}

          {helperAvailable === true && (
            <>
              {/* Helper self-test note */}
              <div style={{
                fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 12,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <Server size={12} />
                Helper: <code style={{ fontSize: 10 }}>{HELPER_BASE}</code>
                — bounds: 256 addresses/scan, {HELPER_BASE.length > 0 ? '20' : '?'} concurrent probes, 2.5 s/host
              </div>

              {/* Scan config */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
                {/* Subnet selector */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Subnet (/24)</label>
                  {interfaces.length > 0 ? (
                    <select
                      className="form-input"
                      value={selectedBase}
                      disabled={isScanning}
                      onChange={e => selectBase(e.target.value)}
                    >
                      {interfaces.map(iface => (
                        <option key={iface.base} value={iface.base}>
                          {iface.base}.0/24 ({iface.name} {iface.address})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input className="form-input" value={selectedBase}
                      disabled={isScanning}
                      placeholder="192.168.4"
                      onChange={e => selectBase(e.target.value.trim())} />
                  )}
                </div>

                {/* Ports */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Ports to probe</label>
                  <input className="form-input" value={scanPorts} disabled={isScanning}
                    placeholder="80,8080"
                    onChange={e => setScanPorts(e.target.value.trim())} />
                </div>

                {/* Health path */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Health endpoint (fixed for ESP32 scan)</label>
                  <input className="form-input" value={healthPath} readOnly />
                </div>
              </div>

              {/* Scan buttons */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={isScanning || !selectedBase}
                  onClick={startScan}
                  id="scan-start-btn"
                >
                  <ScanSearch size={13} />
                  {isScanning ? 'Scanning…' : 'Scan Devices'}
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  disabled={!isScanning}
                  onClick={stopScan}
                  id="scan-stop-btn"
                >
                  <StopCircle size={13} /> Stop Scan
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={isScanning}
                  onClick={() => { clearDevices(); loadInterfaces(); checkHelper(); }}
                  id="scan-refresh-btn"
                >
                  <RefreshCw size={13} /> Refresh
                </button>
                {lastScanAt && !isScanning && (
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)', alignSelf: 'center' }}>
                    Last scan: {lastScanAt.toLocaleTimeString('en-GB', { hour12: false })}
                  </span>
                )}
              </div>

              {/* Progress bar */}
              {isScanning && (
                <div style={{ marginBottom: 12 }}>
                  <ScanProgressBar checked={progress.checked} total={progress.total} />
                  <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 4 }}>
                    ⚠ Radar animation represents scan activity, not physical distance or signal strength.
                  </div>
                </div>
              )}

              {/* Scan error */}
              {scanError && (
                <div className="demo-alert-banner" style={{ marginBottom: 12 }}>
                  <AlertTriangle size={14} /> <span style={{ fontSize: 12 }}>{scanError}</span>
                </div>
              )}

              {/* Results */}
              {(scanStatus === 'done' || scanStatus === 'stopped') && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 600, marginBottom: 8,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    {devices.length > 0 ? (
                      <>
                        <CheckCircle size={13} color="var(--color-success)" />
                        {devices.length} compatible device{devices.length !== 1 ? 's' : ''} discovered
                        {scanStatus === 'stopped' && ' (scan stopped early)'}
                      </>
                    ) : (
                      <>
                        <Info size={13} color="var(--color-text-muted)" />
                        <span style={{ color: 'var(--color-text-muted)' }}>
                          No compatible devices discovered on {selectedBase}.0/24
                          {scanStatus === 'stopped' ? ' (scan stopped early)' : ''}.
                          A compatible device must respond 200 OK + {'{status:"ok"}'} at the health endpoint.
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )}

              {devices.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                  {devices.map(d => (
                    <DeviceCard
                      key={`${d.ip}:${d.port}`}
                      device={d}
                      onSelect={() => onSelectDevice(d.ip, String(d.port))}
                    />
                  ))}
                </div>
              )}

              {/* Discovery honesty note */}
              <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 10, lineHeight: 1.5 }}>
                Discovery finds devices that respond correctly to the health endpoint. It does not enumerate all
                router-connected devices (requires router integration). ARP/neighbour entries are not accessible from the browser.
                No device is identified as ESP32 or drone without confirmed hardware.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function DeviceConnectionPanel() {
  const [state, actions] = useDeviceConnection();
  const { status, transport, wsReachable, httpReachable, lastSeen, firmwareInfo,
          logs, settings, mixedContentWarning } = state;
  const { connect, disconnect, testConnection, updateSettings, clearLogs } = actions;

  const logRef = useRef<HTMLDivElement>(null);
  const isConnected  = status === 'connected';
  const isConnecting = status === 'connecting';
  const isBusy = isConnected || isConnecting;

  // Auto-scroll log on new entries
  useEffect(() => {
    requestAnimationFrame(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    });
  }, [logs.length]);

  function fmtTs(iso: string) {
    return new Date(iso).toLocaleTimeString('en-GB', { hour12: false });
  }
  function fmtLastSeen(d: Date | null) {
    if (!d) return '—';
    return d.toLocaleTimeString('en-GB', { hour12: false });
  }

  // Fill form when a discovered device is selected
  function handleSelectDevice(ip: string, port: string) {
    updateSettings({ host: ip, port });
  }

  return (
    <div>
      {/* ── Header ── */}
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Device Connection</h2>
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 20 }}>
        Scan your local network for compatible devices, then connect via WebSocket (primary)
        or HTTP health-check polling (fallback). ESP32 hardware not required for website-side setup.
      </p>

      {/* ── Network Discovery ── */}
      <NetworkDiscoverySection onSelectDevice={handleSelectDevice} />

      {/* ── Mixed-content warning ── */}
      {mixedContentWarning && (
        <div className="demo-alert-banner" style={{ marginBottom: 16 }}>
          <AlertTriangle size={15} />
          <span style={{ fontSize: 12 }}>
            Page served over <strong>HTTPS</strong>. Browsers block plain <code style={{ fontSize: 10 }}>ws://</code> and{' '}
            <code style={{ fontSize: 10 }}>http://</code> LAN connections. Serve the dashboard over{' '}
            <code style={{ fontSize: 10 }}>http://</code> on your local network.
          </span>
        </div>
      )}

      {/* ── Status row ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '12px 16px', borderRadius: 'var(--border-radius-md)',
        background: 'var(--color-workspace-bg)', border: '1px solid var(--color-card-border)',
        marginBottom: 20,
      }}>
        <StatusPill status={status} />
        <div style={{ display: 'flex', gap: 16, flex: 1, flexWrap: 'wrap' }}>
          <ReachabilityDot val={wsReachable}   label="WebSocket" />
          <ReachabilityDot val={httpReachable} label="HTTP health" />
        </div>
        {transport && (
          <span className="badge info" style={{ fontSize: 10 }}>
            <Radio size={10} /> {transport === 'websocket' ? 'WebSocket' : 'HTTP Poll'}
          </span>
        )}
        {lastSeen && (
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            Last msg: {fmtLastSeen(lastSeen)}
          </span>
        )}
        {firmwareInfo && (
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>FW: {firmwareInfo}</span>
        )}
      </div>

      {/* ── Browser host note ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, fontSize: 11, color: 'var(--color-text-muted)' }}>
        <Globe size={12} />
        Dashboard: <strong style={{ color: 'var(--color-text-secondary)' }}>
          {window.location.hostname}:{window.location.port || (window.location.protocol === 'https:' ? '443' : '80')}
        </strong>
        <span style={{ marginLeft: 4 }}>· Client IP: <em>unavailable in browser</em></span>
      </div>

      {/* ── Settings grid ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 12, marginBottom: 16,
      }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Device IP / Hostname</label>
          <input id="dev-conn-host" className="form-input" value={settings.host} disabled={isBusy}
            placeholder="192.168.1.100" onChange={e => updateSettings({ host: e.target.value.trim() })} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Port</label>
          <input id="dev-conn-port" className="form-input" value={settings.port} disabled={isBusy}
            placeholder="8080" onChange={e => updateSettings({ port: e.target.value.trim() })} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">WebSocket endpoint</label>
          <input id="dev-conn-ws-path" className="form-input" value={settings.wsPath} disabled={isBusy}
            placeholder="/ws" onChange={e => updateSettings({ wsPath: e.target.value.trim() })} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">HTTP health endpoint</label>
          <input id="dev-conn-health-path" className="form-input" value={settings.healthPath} disabled={isBusy}
            placeholder="/health" onChange={e => updateSettings({ healthPath: e.target.value.trim() })} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Timeout (ms)</label>
          <input id="dev-conn-timeout" className="form-input" type="number" min={1000} max={30000} step={500}
            value={settings.timeoutMs} disabled={isBusy}
            onChange={e => updateSettings({ timeoutMs: Number(e.target.value) })} />
        </div>
      </div>

      {/* ── Action buttons ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        <button id="dev-conn-connect-btn" className="btn btn-primary" disabled={isBusy} onClick={connect}>
          <PlugZap size={14} /> {isConnecting ? 'Connecting…' : 'Connect'}
        </button>
        <button id="dev-conn-disconnect-btn" className="btn btn-danger"
          disabled={!isBusy && status !== 'disconnected'} onClick={disconnect}>
          <WifiOff size={14} /> Disconnect
        </button>
        <button id="dev-conn-test-btn" className="btn btn-secondary" disabled={isConnecting}
          onClick={() => testConnection()}>
          <Wifi size={14} /> Test Connection
        </button>
      </div>

      {/* ── Transport notices ── */}
      {isConnected && transport === 'http_poll' && (
        <div style={{
          padding: '10px 14px', borderRadius: 'var(--border-radius-md)',
          background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning-border)',
          fontSize: 12, color: 'var(--color-warning)', marginBottom: 16, display: 'flex', gap: 8,
        }}>
          <AlertTriangle size={15} style={{ marginTop: 1, flexShrink: 0 }} />
          HTTP polling only — WebSocket unavailable. Device commands disabled; require active WebSocket.
        </div>
      )}
      {isConnected && transport === 'websocket' && (
        <div style={{
          padding: '10px 14px', borderRadius: 'var(--border-radius-md)',
          background: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)',
          fontSize: 12, color: 'var(--color-success)', marginBottom: 16, display: 'flex', gap: 8,
        }}>
          <CheckCircle size={14} />
          WebSocket active. Commands interface ready — disabled until firmware protocol is finalised.
        </div>
      )}

      {/* ── Connection Log ── */}
      <div style={{ border: '1px solid var(--color-card-border)', borderRadius: 'var(--border-radius-md)', overflow: 'hidden' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 14px', background: 'var(--color-workspace-bg)',
          borderBottom: '1px solid var(--color-card-border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
            <Terminal size={13} /> Connection Log
            <span className="badge neutral" style={{ fontSize: 10 }}>{logs.length}</span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={clearLogs} disabled={logs.length === 0}
            style={{ padding: '3px 8px' }}>
            <Trash2 size={11} /> Clear
          </button>
        </div>
        <div ref={logRef} style={{
          height: 200, overflowY: 'auto',
          fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 11.5, lineHeight: 1.6,
          padding: '8px 14px', background: '#0f1a11',
        }}>
          {logs.length === 0 ? (
            <span style={{ color: '#4a7055' }}>No entries. Press Connect or Test Connection.</span>
          ) : (
            logs.map((entry, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 1 }}>
                <span style={{ color: '#4a7055', flexShrink: 0 }}>{fmtTs(entry.ts)}</span>
                <LogLevel level={entry.level} />
                <span style={{
                  color: entry.level === 'error' ? '#fca5a5' : entry.level === 'warn' ? '#fcd34d'
                       : entry.level === 'success' ? '#86efac' : '#d1fae5',
                  wordBreak: 'break-all',
                }}>
                  {entry.msg}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── ESP32 Contract reference ── */}
      <details style={{ marginTop: 16 }}>
        <summary style={{
          cursor: 'pointer', fontSize: 12, fontWeight: 600,
          color: 'var(--color-text-secondary)', userSelect: 'none',
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0',
        }}>
          <Info size={13} /> ESP32 Firmware Contract (future reference)
        </summary>
        <div style={{
          marginTop: 8, padding: '12px 16px',
          background: 'var(--color-workspace-bg)', borderRadius: 'var(--border-radius-md)',
          border: '1px solid var(--color-card-border)', fontSize: 12, lineHeight: 1.7,
        }}>
          <p style={{ fontWeight: 600, marginBottom: 6 }}>WebSocket — <code style={{ fontSize: 11 }}>ws://&lt;ip&gt;:&lt;port&gt;/ws</code></p>
          <ul style={{ paddingLeft: 16, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
            <li>On open → <code style={{ fontSize: 11 }}>{`{ "type":"hello", "firmware":"1.0", "uptime":0 }`}</code></li>
            <li>Heartbeat ≤5 s → <code style={{ fontSize: 11 }}>{`{ "type":"ping" }`}</code></li>
            <li>Respond to ping with <code style={{ fontSize: 11 }}>{`{ "type":"pong" }`}</code></li>
            <li>CORS: <code style={{ fontSize: 11 }}>Access-Control-Allow-Origin: *</code></li>
          </ul>
          <p style={{ fontWeight: 600, marginBottom: 6 }}>HTTP health — <code style={{ fontSize: 11 }}>GET /health</code></p>
          <ul style={{ paddingLeft: 16, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
            <li>200 OK → <code style={{ fontSize: 11 }}>{`{ "status":"ok", "uptime":42, "firmware":"1.0" }`}</code></li>
            <li>CORS: <code style={{ fontSize: 11 }}>Access-Control-Allow-Origin: *</code></li>
          </ul>
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            Connection settings saved in <code style={{ fontSize: 10 }}>localStorage</code> (no secrets). Discovery helper required for subnet scanning only.
          </p>
        </div>
      </details>
    </div>
  );
}
