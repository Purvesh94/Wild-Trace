import { isIP } from 'node:net';
import { timingSafeEqual } from 'node:crypto';

const devices = new Map();
const audit = [];
const TIMEOUT_MS = 3000;
const STALE_MS = 10000;
const COMMAND_PATHS = Object.freeze({
  arm: '/api/commands/arm',
  takeoff: '/api/commands/takeoff',
  land: '/api/commands/land',
  disarm: '/api/commands/disarm',
});
const log = (deviceId, event, detail) => {
  audit.unshift({ at: new Date().toISOString(), deviceId, event, detail });
  audit.length = Math.min(audit.length, 200);
};
const privateIp = host => isIP(host) === 4 && (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host));
const unavailableTelemetry = id => ({ device_id: id, timestamp: null, latitude: null, longitude: null,
  altitude_m: null, heading_deg: null, ground_speed_mps: null, battery_percent: null,
  gps_fix: false, source: 'unavailable' });
const publicDevice = d => ({ id: d.id, name: d.name, host: d.host, port: d.port, mode: d.mode,
  type: d.profile === 'legacy_html' ? 'unverified-http-device' : 'esp32-remote-bridge',
  profile: d.profile || 'modern_json', htmlTitle: d.htmlTitle || null,
  capabilities: d.profile === 'legacy_html' ? [] : Object.keys(COMMAND_PATHS),
  connected: d.connected && Date.now() - d.lastSeen < STALE_MS,
  manualDisconnected: !!d.manualDisconnected,
  lastSeen: d.lastSeen ? new Date(d.lastSeen).toISOString() : null, status: d.status,
  hardwareVerified: d.hardwareVerified, verificationNote: d.verificationNote,
  telemetry: d.telemetry, trail: d.trail, lastCommand: d.lastCommand });

async function request(d, path, method = 'GET', body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`http://${d.host}:${d.port}${path}`, {
      method, signal: ctrl.signal, redirect: 'error',
      headers: { ...(process.env.ESP32_COMMAND_TOKEN ? { 'X-Device-Token': process.env.ESP32_COMMAND_TOKEN } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.message || `Device HTTP ${response.status}`), { status: response.status });
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw Object.assign(new Error('Device request timed out'), { status: 504 });
    throw error;
  } finally { clearTimeout(timer); }
}

async function readHtmlPage(d) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`http://${d.host}:${d.port}/`, { signal: ctrl.signal, redirect: 'error' });
    if (!response.ok) throw Object.assign(new Error(`HTML page returned HTTP ${response.status}`), { status: response.status });
    const body = await response.text();
    if (!/text\/html/i.test(response.headers.get('content-type') || '') && !/^\s*<!?\s*html/i.test(body))
      throw Object.assign(new Error('Endpoint did not return an HTML page'), { status: 422 });
    const title = body.match(/<title[^>]*>([^<]{1,120})<\/title>/i)?.[1]?.trim() || 'HTML device page';
    return { title };
  } catch (error) {
    if (error.name === 'AbortError') throw Object.assign(new Error('HTML page request timed out'), { status: 504 });
    throw error;
  } finally { clearTimeout(timer); }
}

async function refresh(d) {
  try {
    if (d.profile === 'legacy_html') {
      d.htmlTitle = (await readHtmlPage(d)).title;
      d.connected = true;
      d.lastSeen = Date.now();
      return publicDevice(d);
    }
    const status = await request(d, '/api/status');
    if (status.device_id !== d.id || status.device_type !== 'esp32-remote-bridge') throw new Error('Device identity changed');
    if (d.status?.last_command_status !== 'gpio_pulse_completed' && status.last_command_status === 'gpio_pulse_completed' &&
        status.last_command_id === d.lastCommand?.command_id) log(d.id, 'gpio_pulse_completed', status.last_command_id);
    d.status = status;
    d.connected = true;
    d.lastSeen = Date.now();
    return publicDevice(d);
  } catch (error) {
    d.connected = false;
    log(d.id, 'connection_error', error.message);
    throw error;
  }
}

function authenticate(req, res, next) {
  const expected = process.env.OPERATOR_TOKEN;
  const actual = req.get('X-Operator-Token') || '';
  if (!expected || !actual || Buffer.byteLength(actual) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) {
    return res.status(401).json({ error: 'Set OPERATOR_TOKEN on the backend and enter it in Settings.' });
  }
  next();
}

function installGateway(app) {
  app.get('/api/gateway/readiness', (_req, res) => res.json({
    operatorTokenConfigured: !!process.env.OPERATOR_TOKEN && !process.env.OPERATOR_TOKEN.startsWith('REPLACE_'),
    deviceTokenConfigured: !!process.env.ESP32_COMMAND_TOKEN && !process.env.ESP32_COMMAND_TOKEN.startsWith('REPLACE_'),
  }));
  app.get('/api/devices', (_req, res) => res.json({ devices: [...devices.values()].map(publicDevice) }));
  app.get('/api/events', (_req, res) => res.json({ events: audit }));
  app.post('/api/devices/probe', authenticate, async (req, res) => {
    const { host, port = 80 } = req.body || {};
    if (!privateIp(host) || !Number.isInteger(Number(port)) || +port < 1 || +port > 65535)
      return res.status(400).json({ error: 'Use a private IPv4 address and valid port.' });
    try {
      if (req.body?.profile === 'legacy_html') {
        const html = await readHtmlPage({ host, port: +port });
        return res.json({ profile: 'legacy_html', htmlTitle: html.title, supportedCommands: [] });
      }
      const health = await request({ host, port: +port }, '/health');
      if (health.status !== 'ok' || health.device_type !== 'esp32-remote-bridge')
        return res.status(422).json({ error: 'Device did not identify as an ESP32 remote bridge.' });
      res.json({ health });
    } catch (error) { res.status(error.status || 502).json({ error: error.message }); }
  });
  app.post('/api/devices/connect', authenticate, async (req, res) => {
    const { host, port = 80, name = 'ESP32 Remote Bridge', mode = 'station', profile = 'modern_json' } = req.body || {};
    if (!privateIp(host) || !Number.isInteger(Number(port)) || +port < 1 || +port > 65535 ||
        !['station', 'access_point'].includes(mode) || !['modern_json', 'legacy_html'].includes(profile))
      return res.status(400).json({ error: 'Use a private IPv4 address, valid port, and supported device profile.' });
    const candidate = { host, port: +port };
    try {
      if (profile === 'legacy_html') {
        const html = await readHtmlPage(candidate);
        const id = `html-${host.replaceAll('.', '-')}-${port}`;
        const d = { id, name: String(name).slice(0, 80), host, port: +port, mode, profile,
          htmlTitle: html.title, connected: true, manualDisconnected: false, lastSeen: Date.now(),
          status: null, hardwareVerified: false, verificationNote: null,
          telemetry: unavailableTelemetry(id), trail: [], lastCommand: null, busy: false };
        devices.set(id, d);
        log(id, 'html_connected', `HTML page reachable: ${html.title}; identity and controls unverified`);
        return res.json({ device: publicDevice(d) });
      }
      const health = await request(candidate, '/health');
      if (health.status !== 'ok' || health.device_type !== 'esp32-remote-bridge' || !/^[a-zA-Z0-9_-]{3,64}$/.test(health.device_id))
        return res.status(422).json({ error: 'Health response does not identify compatible firmware.' });
      const previous = devices.get(health.device_id);
      const d = { id: health.device_id, name: String(name).slice(0, 80), host, port: +port, mode, profile,
        connected: false, manualDisconnected: false, lastSeen: 0, status: null,
        hardwareVerified: previous?.host === host && previous?.port === +port && previous.hardwareVerified || false,
        verificationNote: previous?.host === host && previous?.port === +port ? previous?.verificationNote || null : null,
        telemetry: previous?.telemetry || unavailableTelemetry(health.device_id),
        trail: previous?.trail || [], lastCommand: previous?.lastCommand || null, busy: false };
      await refresh(d);
      devices.set(d.id, d);
      log(d.id, 'connected', `${host}:${port}`);
      res.json({ device: publicDevice(d) });
    } catch (error) { res.status(error.status || 502).json({ error: error.message }); }
  });
  app.post('/api/devices/:id/disconnect', authenticate, (req, res) => {
    const d = devices.get(req.params.id);
    if (!d) return res.status(404).json({ error: 'Unknown device' });
    if (d.busy) return res.status(409).json({ error: 'Command in progress' });
    d.connected = false;
    log(d.id, 'disconnected', 'Dashboard disconnected; this does not stop the drone.');
    d.manualDisconnected = true;
    res.json({ device: publicDevice(d) });
  });
  app.get('/api/devices/:id/status', async (req, res) => {
    const d = devices.get(req.params.id);
    if (!d) return res.status(404).json({ error: 'Unknown device' });
    if (d.manualDisconnected) return res.json({ device: publicDevice(d) });
    try { res.json({ device: await refresh(d) }); }
    catch (error) { res.status(error.status || 502).json({ error: error.message, device: publicDevice(d) }); }
  });
  app.post('/api/devices/:id/verification', authenticate, (req, res) => {
    const d = devices.get(req.params.id);
    if (!d) return res.status(404).json({ error: 'Unknown device' });
    if (d.profile === 'legacy_html') return res.status(409).json({ error: 'HTML device identity and controls are unverified.' });
    const { isolatedSwitchChecked, remoteDisconnectedTested, operator, note } = req.body || {};
    if (isolatedSwitchChecked !== true || remoteDisconnectedTested !== true || typeof operator !== 'string' || !operator.trim() || typeof note !== 'string' || !note.trim())
      return res.status(400).json({ error: 'Both physical checks, operator, and verification note are required.' });
    d.hardwareVerified = true;
    d.verificationNote = { operator: operator.trim().slice(0, 80), note: note.trim().slice(0, 500), at: new Date().toISOString() };
    log(d.id, 'hardware_verified', d.verificationNote.note);
    res.json({ device: publicDevice(d) });
  });
  app.post('/api/devices/:id/commands/:command', authenticate, async (req, res) => {
    const d = devices.get(req.params.id);
    const cmd = req.params.command;
    if (!d) return res.status(404).json({ error: 'Unknown device' });
    if (!Object.hasOwn(COMMAND_PATHS, cmd)) return res.status(404).json({ error: 'Unknown command' });
    if (d.profile === 'legacy_html') return res.status(409).json({ error: 'HTML interface has no verified safe command mapping. Controls are disabled.' });
    if (d.busy) return res.status(409).json({ error: 'Command in progress' });
    if (!d.connected) return res.status(409).json({ error: 'Device disconnected' });
    if (cmd !== 'disarm' && !d.hardwareVerified) return res.status(409).json({ error: 'Hardware interface is unverified' });
    if (cmd === 'takeoff' && (req.body?.confirmation !== `TAKEOFF ${d.id}` || req.body?.preflightConfirmed !== true))
      return res.status(400).json({ error: `Confirm preflight and type TAKEOFF ${d.id}.` });
    const missionTag = typeof req.body?.missionId === 'string' && /^[0-9a-f-]{36}$/i.test(req.body.missionId)
      ? ` mission:${req.body.missionId}` : '';
    d.busy = true;
    log(d.id, 'command_requested', `${cmd}${missionTag}`);
    try {
      await refresh(d);
      if (cmd === 'takeoff' && (!d.status.armed || d.status.takeoff_output_active || d.status.landing_output_active))
        return res.status(409).json({ error: 'Device not armed or output busy' });
      log(d.id, 'command_sent', `${cmd}${missionTag}`);
      const result = await request(d, COMMAND_PATHS[cmd], 'POST');
      d.lastCommand = result;
      log(d.id, 'command_acknowledged', `${cmd} · id: ${String(result.command_id || 'unknown').slice(0, 80)} · status: ${String(result.status || 'unknown').slice(0, 80)}${result.message ? ` · ${String(result.message).slice(0, 160)}` : ''}${missionTag}`);
      res.json({ command: result, device: publicDevice(d) });
    } catch (error) {
      log(d.id, 'command_error', `${cmd}: ${error.message}${missionTag}`);
      res.status(error.status || 502).json({ error: error.message });
    } finally { d.busy = false; }
  });
  app.get('/api/devices/:id/telemetry', (req, res) => {
    const d = devices.get(req.params.id);
    if (!d) return res.status(404).json({ error: 'Unknown device' });
    res.json({ telemetry: d.telemetry, trail: d.trail, fresh: !!d.telemetry.timestamp && Date.now() - Date.parse(d.telemetry.timestamp) < STALE_MS });
  });
  app.post('/api/devices/:id/telemetry', authenticate, (req, res) => {
    const d = devices.get(req.params.id);
    if (!d) return res.status(404).json({ error: 'Unknown device' });
    const t = req.body || {};
    if (!['flight_controller', 'external_gateway', 'simulation'].includes(t.source) ||
        !Number.isFinite(t.latitude) || Math.abs(t.latitude) > 90 ||
        !Number.isFinite(t.longitude) || Math.abs(t.longitude) > 180 ||
        typeof t.timestamp !== 'string' || !Number.isFinite(Date.parse(t.timestamp)) ||
        Math.abs(Date.now() - Date.parse(t.timestamp)) > 30000 || t.gps_fix !== true)
      return res.status(400).json({ error: 'Valid recent drone telemetry and a flight source are required.' });
    const optional = {
      altitude_m: [t.altitude_m, -500, 20000], heading_deg: [t.heading_deg, 0, 360],
      ground_speed_mps: [t.ground_speed_mps, 0, 150], battery_percent: [t.battery_percent, 0, 100],
    };
    if (Object.values(optional).some(([value, min, max]) => value !== undefined && value !== null &&
        (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)))
      return res.status(400).json({ error: 'Optional telemetry values must be finite numbers in range or null.' });
    d.telemetry = { ...unavailableTelemetry(d.id), timestamp: t.timestamp,
      latitude: t.latitude, longitude: t.longitude, gps_fix: true, source: t.source,
      altitude_m: t.altitude_m ?? null, heading_deg: t.heading_deg ?? null,
      ground_speed_mps: t.ground_speed_mps ?? null, battery_percent: t.battery_percent ?? null };
    d.trail = [...d.trail, [t.latitude, t.longitude]].slice(-300);
    log(d.id, 'telemetry_received', t.source);
    res.json({ telemetry: d.telemetry });
  });
}

export { installGateway, privateIp, unavailableTelemetry };
