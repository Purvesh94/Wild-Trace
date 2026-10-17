import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/discovery.js';

test('gateway requires authentication and preserves command versus flight status', async () => {
  process.env.OPERATOR_TOKEN = 'test-operator-token';
  process.env.ESP32_COMMAND_TOKEN = 'test-device-token-long-enough';
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const nativeFetch = globalThis.fetch;
  const calls = [];
  let armed = false;
  let lastStatus = 'none';
  globalThis.fetch = async (input, options = {}) => {
    const url = String(input);
    if (url.startsWith('http://192.168.4.2:80')) return new Promise((_resolve, reject) =>
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
    if (url === 'http://192.168.4.3:80/') return new Response('<!doctype html><html><head><title>Classic ESP32</title></head></html>',
      { headers: { 'Content-Type': 'text/html' } });
    if (!url.startsWith('http://192.168.4.1:80')) return nativeFetch(input, options);
    calls.push([url, options.method || 'GET']);
    if (url.endsWith('/health')) return Response.json({ status: 'ok', device_id: 'test-esp32', device_type: 'esp32-remote-bridge', firmware_version: '1.0.0' });
    if (url.endsWith('/api/status')) return Response.json({ device_id: 'test-esp32', device_type: 'esp32-remote-bridge', armed, physical_enable: true,
      takeoff_output_active: false, landing_output_active: false, last_command_status: lastStatus, flight_state: 'unknown', gps_available: false });
    if (url.includes('/api/commands/')) {
      const cmd = url.split('/').at(-1);
      if (options.headers['X-Device-Token'] !== process.env.ESP32_COMMAND_TOKEN) return Response.json({ message: 'Bad token' }, { status: 401 });
      if (cmd === 'arm') armed = true;
      if (cmd === 'disarm') armed = false;
      lastStatus = ['takeoff', 'land'].includes(cmd) ? 'gpio_pulse_active' : 'accepted';
      return Response.json({ command_id: `test-${calls.length}`, type: cmd, status: lastStatus, drone_response_confirmed: false });
    }
    return Response.json({ message: 'Unknown' }, { status: 404 });
  };
  async function call(path, method = 'GET', body, token = true) {
    const response = await nativeFetch(`${base}${path}`, { method,
      headers: { ...(token ? { 'X-Operator-Token': process.env.OPERATOR_TOKEN } : {}), 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined });
    return { code: response.status, data: await response.json() };
  }
  try {
    assert.equal((await call('/health')).data.service, 'tadoba-local-gateway');
    assert.equal((await call('/api/gateway/readiness')).code, 200);
    assert.equal((await call('/api/discovery/scan?base=192.168.999')).code, 400);
    assert.equal((await call('/api/devices/connect', 'POST', { host: '192.168.4.1' }, false)).code, 401);
    assert.equal((await call('/api/devices/probe', 'POST', { host: '127.0.0.1' })).code, 400);
    assert.equal((await call('/api/devices/probe', 'POST', { host: '192.168.4.2' })).code, 504);
    const discovered = await call('/api/discovery/probe?host=192.168.4.1&port=80');
    assert.equal(discovered.data.device.deviceId, 'test-esp32');
    const htmlProbe = await call('/api/devices/probe', 'POST', { host: '192.168.4.3', profile: 'legacy_html' });
    assert.equal(htmlProbe.data.htmlTitle, 'Classic ESP32');
    const htmlConnect = await call('/api/devices/connect', 'POST', { host: '192.168.4.3', profile: 'legacy_html' });
    assert.equal(htmlConnect.data.device.profile, 'legacy_html');
    assert.equal(htmlConnect.data.device.capabilities.length, 0);
    assert.equal((await call(`/api/devices/${htmlConnect.data.device.id}/commands/land`, 'POST')).code, 409);
    assert.equal((await call(`/api/devices/${htmlConnect.data.device.id}/verification`, 'POST', {
      isolatedSwitchChecked: true, remoteDisconnectedTested: true, operator: 'Test', note: 'Meters checked' })).code, 409);
    assert.equal((await call('/api/devices/connect', 'POST', { host: '127.0.0.1' })).code, 400);
    const connected = await call('/api/devices/connect', 'POST', { host: '192.168.4.1', port: 80, mode: 'access_point' });
    assert.equal(connected.code, 200);
    assert.equal(connected.data.device.status.flight_state, 'unknown');
    assert.equal((await call('/api/devices/test-esp32/commands/takeoff', 'POST', { confirmation: 'TAKEOFF test-esp32', preflightConfirmed: true })).code, 409);
    assert.equal((await call('/api/devices/test-esp32/verification', 'POST', { isolatedSwitchChecked: true, remoteDisconnectedTested: true, operator: 'Test', note: 'Meters checked' })).code, 200);
    assert.equal((await call('/api/devices/test-esp32/commands/arm', 'POST')).code, 200);
    assert.equal((await call('/api/devices/test-esp32/commands/takeoff', 'POST', { confirmation: 'wrong' })).code, 400);
    const takeoff = await call('/api/devices/test-esp32/commands/takeoff', 'POST', { confirmation: 'TAKEOFF test-esp32', preflightConfirmed: true });
    assert.equal(takeoff.code, 200);
    assert.equal(takeoff.data.command.status, 'gpio_pulse_active');
    assert.equal(takeoff.data.device.status.flight_state, 'unknown');
    assert.equal((await call('/api/devices/test-esp32/commands/land', 'POST')).code, 200);
    assert.equal((await call('/api/devices/test-esp32/telemetry')).data.telemetry.latitude, null);
    assert.equal((await call('/api/devices/test-esp32/telemetry', 'POST', { source: 'remote_controller', latitude: 20, longitude: 79, timestamp: new Date().toISOString(), gps_fix: true })).code, 400);
    assert.equal((await call('/api/devices/test-esp32/telemetry', 'POST', { source: 'external_gateway', latitude: 20, longitude: 79, battery_percent: 200, timestamp: new Date().toISOString(), gps_fix: true })).code, 400);
    const telemetry = await call('/api/devices/test-esp32/telemetry', 'POST', { source: 'external_gateway', latitude: 20.3, longitude: 79.4, timestamp: new Date().toISOString(), gps_fix: true });
    assert.equal(telemetry.code, 200);
    assert.equal((await call('/api/devices/test-esp32/telemetry')).data.trail.length, 1);
    assert.equal((await call('/api/devices/test-esp32/disconnect', 'POST')).code, 200);
    assert.equal((await call('/api/devices/test-esp32/commands/land', 'POST')).code, 409);
    assert.equal(calls.filter(([url]) => url.endsWith('/api/commands/takeoff')).length, 1);
  } finally {
    globalThis.fetch = nativeFetch;
    await new Promise(resolve => server.close(resolve));
  }
});
