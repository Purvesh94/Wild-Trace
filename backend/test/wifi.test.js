import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyWifi, parseNetshSsid } from '../src/wifi.js';

test('reads exact SSID without matching BSSID and chooses SoftAP target', () => {
  assert.equal(parseNetshSsid('    SSID                   : WildTrace-ESP32\n    BSSID                  : 01:02:03:04:05:06'), 'WildTrace-ESP32');
  assert.deepEqual(classifyWifi({ ssid: 'WildTrace-ESP32', address: '192.168.4.2', gateway: '192.168.4.1' }),
    { mode: 'softap', base: '192.168.4', targetHost: '192.168.4.1' });
});

test('uses network profile and gateway when Windows hides SSID', () => {
  assert.equal(classifyWifi({ ssid: null, profileName: 'WildTrace-ESP32', address: '192.168.4.2' }).mode, 'softap_candidate');
  assert.deepEqual(classifyWifi({ ssid: null, profileName: 'Office WiFi', address: '192.168.1.58', gateway: '192.168.1.1' }),
    { mode: 'station', base: '192.168.1', targetHost: null });
  assert.equal(classifyWifi({}).mode, 'offline');
});
