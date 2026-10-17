/**
 * Tadoba Sentinel — Local Device Gateway
 * ==========================================
 * Express server (port 3099) that provides network discovery, Wi-Fi status,
 * device connection, and authenticated command routes:
 *
 *  GET  /api/discovery/interfaces   → list local network interfaces & subnets
 *  GET  /api/discovery/scan         → SSE stream of discovered devices (subnet sweep)
 *  POST /api/discovery/stop         → cancel any running scan
 *  GET  /health                     → self-health (also acts as test device for dev)
 *
 * Discovery method:
 *  1. Iterates 1–254 of the selected /24 subnet (max 256 addresses).
 *  2. Tries GET http://<ip>:<port>/health for each configured port.
 *  3. Only emits a device if the response is 200 + valid JSON with { status:"ok" }.
 *  4. Never identifies an arbitrary HTTP server as ESP32/drone.
 *  5. Concurrency is bounded (CONCURRENCY = 20) with per-request timeout.
 *  6. DNS reverse-lookup attempted for discovered IPs (best-effort; may fail).
 *
 * Security:
 *  - CORS restricted to localhost origins only (dashboard runs locally).
 *  - Targets restricted to RFC-1918 private ranges only.
 *  - No credentials stored or forwarded.
 *
 * Also hosts gateway and current Wi-Fi routes for Device Connection.
 *
 * Start: node backend/src/discovery.js
 */

import express from 'express';
import cors from 'cors';
import os from 'os';
import dns from 'dns';
import { promisify } from 'util';
import { isIP } from 'node:net';
import { installGateway } from './gateway.js';
import { currentWifi } from './wifi.js';

const dnsReverse = promisify(dns.reverse);

const PORT = 3099;
const CONCURRENCY = 20;          // simultaneous fetch probes
const PROBE_TIMEOUT_MS = 2500;   // per-host timeout
const SCAN_PORTS = [80, 8080]; // ESP32 AP and configurable station services
const MAX_HOSTS = 256;

// ─── Private range guard ──────────────────────────────────────────────────────

const PRIVATE_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,  // link-local
];

function isPrivateIp(ip) {
  return PRIVATE_RANGES.some(r => r.test(ip));
}

// ─── Network interface enumeration ───────────────────────────────────────────

function getInterfaces() {
  const ifaces = os.networkInterfaces();
  const results = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const addr of addrs ?? []) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      // Build /24 subnet base
      const parts = addr.address.split('.');
      const subnet = `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
      const base   = `${parts[0]}.${parts[1]}.${parts[2]}`;
      results.push({
        name,
        address: addr.address,
        netmask: addr.netmask,
        subnet,
        base,
        cidr: addr.cidr ?? subnet,
      });
    }
  }
  return results;
}

// ─── Probe a single host:port ─────────────────────────────────────────────────

async function probeHost(ip, port, healthPath = '/health') {
  const url = `http://${ip}:${port}${healthPath}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'error' });
    if (!res.ok) return null;
    let body = null;
    let compatible = false;
    let firmware = null;
    try {
      body = await res.json();
      // Validate: must have { status: "ok" } to be considered compatible.
      // We do NOT assume it's an ESP32 — we report what we see.
      compatible = body?.status === 'ok' && body?.device_type === 'esp32-remote-bridge' && typeof body?.device_id === 'string';
      firmware = body?.firmware_version ?? null;
    } catch {
      // 200 OK but non-JSON → reachable but not compatible
    }
    return { ip, port, url, compatible, firmware, deviceId: compatible ? body.device_id : null, rawStatus: res.status, body };
  } catch (err) {
    return null; // unreachable / refused / timeout
  } finally {
    clearTimeout(timer);
  }
}

// ─── DNS reverse lookup (best-effort) ────────────────────────────────────────

async function reverseLookup(ip) {
  try {
    const names = await dnsReverse(ip);
    return names[0] ?? null;
  } catch {
    return null;
  }
}

// ─── Active scan state (one at a time) ───────────────────────────────────────

let activeScanAbort = null;

// ─── Express app ──────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use(cors({
  // Only allow requests from localhost-served dashboards
  origin: (origin, cb) => {
    if (!origin || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      cb(null, true);
    } else {
      cb(new Error('Not allowed by CORS — discovery helper is localhost-only'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
}));

// Self-health (also useful as a local test device during development)
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'tadoba-local-gateway',
    version: '1.0.0',
    uptime: Math.round(process.uptime()),
    note: 'This is the laptop gateway, not an ESP32.',
  });
});

// List network interfaces
app.get('/api/discovery/interfaces', (_req, res) => {
  const ifaces = getInterfaces();
  res.json({ interfaces: ifaces });
});

// Fast, read-only probe for the standard ESP32 access-point address or a
// manually entered private IP. A generic HTTP page is never called a drone.
app.get('/api/discovery/probe', async (req, res) => {
  const host = req.query.host;
  const port = Number(req.query.port ?? 80);
  if (typeof host !== 'string' || isIP(host) !== 4 || !isPrivateIp(host) ||
      !Number.isInteger(port) || port < 1 || port > 65535) {
    return res.status(400).json({ error: 'Use a private IPv4 host and valid port.' });
  }
  const result = await probeHost(host, port);
  if (!result?.compatible) return res.status(404).json({ error: 'No compatible ESP32 JSON firmware at this address.' });
  res.json({ device: { ip: host, port, deviceId: result.deviceId, firmware: result.firmware,
    source: 'http-health-check', compatible: true, checkedAt: new Date().toISOString() } });
});

// Stop any running scan
app.post('/api/discovery/stop', (_req, res) => {
  if (activeScanAbort) {
    activeScanAbort.abort();
    activeScanAbort = null;
    res.json({ stopped: true });
  } else {
    res.json({ stopped: false, message: 'No scan running' });
  }
});

// Scan — SSE streaming endpoint
app.get('/api/discovery/scan', async (req, res) => {
  // Parse query params
  const base     = req.query.base   ?? '192.168.4';
  const portsStr = req.query.ports  ?? SCAN_PORTS.join(',');
  const healthPath = '/health';
  const ports = typeof portsStr === 'string' ? portsStr.split(',').map(Number) : [];

  // Security: base must resolve to a private range
  if (typeof base !== 'string' || !/^(?:\d{1,3}\.){2}\d{1,3}$/.test(base) ||
      base.split('.').some(n => Number(n) > 255) || !isPrivateIp(`${base}.1`) ||
      !ports.length || ports.length > 4 || ports.some(p => !Number.isInteger(p) || p < 1 || p > 65535)) {
    res.status(400).json({ error: 'Scan target must be a private (RFC-1918) subnet.' });
    return;
  }

  // A valid new request supersedes the previous scan.
  if (activeScanAbort) activeScanAbort.abort();
  const abort = new AbortController();
  activeScanAbort = abort;

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  res.on('close', () => abort.abort());

  function send(event, data) {
    if (!res.writableEnded) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  }

  // Build host list (1–254, skip .0 and .255)
  const hosts = [];
  for (let i = 1; i <= 254 && hosts.length < MAX_HOSTS; i++) {
    hosts.push(`${base}.${i}`);
  }

  send('start', { total: hosts.length * ports.length, base, ports, healthPath });

  let checked = 0;
  const total = hosts.length * ports.length;

  // Bounded concurrency queue
  async function* tasks() {
    for (const ip of hosts) {
      for (const port of ports) {
        yield { ip, port };
      }
    }
  }

  async function runWorker(taskGen) {
    for await (const { ip, port } of taskGen) {
      if (abort.signal.aborted) break;
      const result = await probeHost(ip, port, healthPath);
      checked++;
      send('progress', { checked, total, ip, port });
      if (result && result.compatible) {
        // Best-effort hostname lookup
        const hostname = await reverseLookup(ip);
        send('device', {
          ip,
          port,
          hostname,
          url: result.url,
          firmware: result.firmware,
          deviceId: result.deviceId,
          compatible: true,
          source: 'http-health-check',
          checkedAt: new Date().toISOString(),
          note: 'Firmware identifies as ESP32 remote bridge. Physical hardware and drone response remain unverified.',
        });
      }
    }
  }

  const gen = tasks();
  const workers = Array.from({ length: CONCURRENCY }, () => runWorker(gen));
  try {
    await Promise.all(workers);
  } catch { /* abort */ }

  if (!res.writableEnded) {
    const wasStopped = abort.signal.aborted;
    send('done', { checked, total, aborted: wasStopped });
    res.end();
  }
  if (activeScanAbort === abort) activeScanAbort = null;
});

installGateway(app);
app.get('/api/network/current', async (_req, res) => {
  try { res.json(await currentWifi()); }
  catch (error) { res.status(503).json({ error: error.message }); }
});

export { app, getInterfaces };

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replaceAll('\\', '/')}`).href) app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Tadoba Local Gateway`);
  console.log(`  ➜  http://127.0.0.1:${PORT}/health`);
  console.log(`  ➜  GET /api/discovery/interfaces`);
  console.log(`  ➜  GET /api/discovery/scan?base=192.168.1&ports=80,8080`);
  console.log(`  ➜  POST /api/discovery/stop`);
  console.log(`\n  CORS: localhost origins only.`);
  console.log(`  Targets: RFC-1918 private ranges only.\n`);
});
