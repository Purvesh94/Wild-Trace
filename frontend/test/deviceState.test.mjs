import test from 'node:test';
import assert from 'node:assert/strict';
import { canTakeoff, canLand, hasFreshDronePosition } from '../src/services/deviceState.ts';

test('takeoff requires every safety check; landing remains available when unarmed', () => {
  const device = { id: 'bridge-01', connected: true, hardwareVerified: true,
    status: { physical_enable: true, armed: true, takeoff_output_active: false, landing_output_active: false } };
  assert.equal(canTakeoff(device, true, 'TAKEOFF bridge-01', false), true);
  assert.equal(canTakeoff({ ...device, hardwareVerified: false }, true, 'TAKEOFF bridge-01', false), false);
  assert.equal(canTakeoff({ ...device, status: { ...device.status, physical_enable: false } }, true, 'TAKEOFF bridge-01', false), false);
  assert.equal(canTakeoff(device, false, 'TAKEOFF bridge-01', false), false);
  assert.equal(canTakeoff(device, true, 'TAKEOFF other-device', false), false);
  assert.equal(canTakeoff(device, true, 'TAKEOFF bridge-01', true), false);
  assert.equal(canLand({ ...device, status: { ...device.status, armed: false } }, false), true);
  assert.equal(canLand({ ...device, connected: false }, false), false);
});

test('live marker needs recent, plausible drone telemetry', () => {
  const now = Date.parse('2026-10-17T00:00:00.000Z');
  const telemetry = { source: 'external_gateway', gps_fix: true, timestamp: new Date(now - 500).toISOString(), latitude: 20.3, longitude: 79.4 };
  assert.equal(hasFreshDronePosition(telemetry, now), true);
  assert.equal(hasFreshDronePosition({ ...telemetry, timestamp: new Date(now - 11000).toISOString() }, now), false);
  assert.equal(hasFreshDronePosition({ ...telemetry, gps_fix: false }, now), false);
  assert.equal(hasFreshDronePosition({ ...telemetry, latitude: null }, now), false);
  assert.equal(hasFreshDronePosition({ ...telemetry, source: 'unavailable' }, now), false);
});
