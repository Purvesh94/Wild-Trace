/**
 * useNetworkDiscovery — Network Scanning Hook
 *
 * Communicates with the local discovery helper at http://127.0.0.1:3099.
 * Uses Server-Sent Events (SSE) for streaming scan progress.
 *
 * Scan lifecycle:
 *  idle → scanning → done | stopped
 *
 * Device validation:
 *  Only devices that responded 200 OK + { status:"ok" } are surfaced.
 *  No device is identified as ESP32 or drone without confirmed hardware.
 *  ARP/neighbour entries are NOT used (no OS access from browser).
 *
 * Browser constraints:
 *  - This hook requires the discovery helper to be running locally.
 *  - The helper is only reachable from http:// (localhost), not from an HTTPS page.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NetworkInterface {
  name: string;
  address: string;
  netmask: string;
  subnet: string;
  base: string;      // e.g. "192.168.1"
  cidr: string;
}

export interface DiscoveredDevice {
  ip: string;
  port: number;
  hostname: string | null;
  url: string;
  firmware: string | null;
  compatible: boolean;
  source: 'http-health-check';
  checkedAt: string;
  note: string;
}

export type ScanStatus = 'idle' | 'scanning' | 'done' | 'stopped' | 'helper_unavailable';

export interface ScanProgress {
  checked: number;
  total: number;
}

export interface NetworkDiscoveryState {
  helperAvailable: boolean | null;    // null = unchecked
  interfaces: NetworkInterface[];
  selectedBase: string;
  scanPorts: string;                  // comma-separated
  healthPath: string;
  scanStatus: ScanStatus;
  progress: ScanProgress;
  devices: DiscoveredDevice[];
  scanError: string | null;
  lastScanAt: Date | null;
}

export interface NetworkDiscoveryActions {
  checkHelper: () => Promise<void>;
  loadInterfaces: () => Promise<void>;
  selectBase: (base: string) => void;
  setScanPorts: (ports: string) => void;
  setHealthPath: (path: string) => void;
  startScan: () => void;
  stopScan: () => void;
  clearDevices: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const HELPER_BASE = import.meta.env.VITE_GATEWAY_URL || import.meta.env.VITE_DISCOVERY_HELPER_URL || 'http://127.0.0.1:3099';
const DEFAULT_PORTS = '80,8080';
const DEFAULT_HEALTH = '/health';

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useNetworkDiscovery(): [NetworkDiscoveryState, NetworkDiscoveryActions] {
  const [helperAvailable, setHelperAvailable] = useState<boolean | null>(null);
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);
  const [selectedBase, setSelectedBase] = useState<string>('');
  const [scanPorts, setScanPortsState] = useState(DEFAULT_PORTS);
  const [healthPath, setHealthPathState] = useState(DEFAULT_HEALTH);
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [progress, setProgress] = useState<ScanProgress>({ checked: 0, total: 0 });
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [lastScanAt, setLastScanAt] = useState<Date | null>(null);

  const sseRef = useRef<EventSource | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sseRef.current?.close();
    };
  }, []);

  // ─── Check helper reachability ────────────────────────────────────────────

  const checkHelper = useCallback(async () => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch(`${HELPER_BASE}/health`, { signal: ctrl.signal });
      clearTimeout(t);
      const ok = res.ok;
      if (mountedRef.current) setHelperAvailable(ok);
    } catch {
      if (mountedRef.current) setHelperAvailable(false);
    }
  }, []);

  // ─── Load interfaces from helper ─────────────────────────────────────────

  const loadInterfaces = useCallback(async () => {
    try {
      const res = await fetch(`${HELPER_BASE}/api/discovery/interfaces`);
      if (!res.ok) return;
      const data = await res.json() as { interfaces: NetworkInterface[] };
      if (!mountedRef.current) return;
      setInterfaces(data.interfaces ?? []);
      // Auto-select first non-loopback subnet
      if (data.interfaces?.length && !selectedBase) {
        setSelectedBase(data.interfaces[0].base);
      }
    } catch {
      // Helper not available
    }
  }, [selectedBase]);

  // ─── Start scan ───────────────────────────────────────────────────────────

  const startScan = useCallback(() => {
    if (scanStatus === 'scanning') return;     // prevent duplicate
    if (!selectedBase) return;
    if (!helperAvailable) return;

    // Close any previous SSE
    sseRef.current?.close();
    sseRef.current = null;

    setScanStatus('scanning');
    setScanError(null);
    setDevices([]);
    setProgress({ checked: 0, total: 0 });
    setLastScanAt(new Date());

    const params = new URLSearchParams({
      base: selectedBase,
      ports: scanPorts,
      healthPath,
    });
    const url = `${HELPER_BASE}/api/discovery/scan?${params}`;

    const sse = new EventSource(url);
    sseRef.current = sse;

    sse.addEventListener('start', (e) => {
      if (!mountedRef.current) return;
      const d = JSON.parse((e as MessageEvent).data);
      setProgress({ checked: 0, total: d.total ?? 0 });
    });

    sse.addEventListener('progress', (e) => {
      if (!mountedRef.current) return;
      const d = JSON.parse((e as MessageEvent).data);
      setProgress({ checked: d.checked ?? 0, total: d.total ?? 0 });
    });

    sse.addEventListener('device', (e) => {
      if (!mountedRef.current) return;
      const device = JSON.parse((e as MessageEvent).data) as DiscoveredDevice;
      setDevices(prev => {
        // Deduplicate by ip+port
        if (prev.some(d => d.ip === device.ip && d.port === device.port)) return prev;
        return [...prev, device];
      });
    });

    sse.addEventListener('done', (e) => {
      if (!mountedRef.current) return;
      const d = JSON.parse((e as MessageEvent).data);
      setScanStatus(d.aborted ? 'stopped' : 'done');
      sse.close();
      sseRef.current = null;
    });

    sse.onerror = () => {
      if (!mountedRef.current) return;
      setScanStatus('helper_unavailable');
      setScanError('Lost connection to discovery helper. Is it running? (node backend/src/discovery.js)');
      sse.close();
      sseRef.current = null;
    };
  }, [scanStatus, selectedBase, scanPorts, healthPath, helperAvailable]);

  // ─── Stop scan ────────────────────────────────────────────────────────────

  const stopScan = useCallback(async () => {
    sseRef.current?.close();
    sseRef.current = null;
    if (mountedRef.current) setScanStatus('stopped');
    // Tell helper to stop server-side work too
    try {
      await fetch(`${HELPER_BASE}/api/discovery/stop`, { method: 'POST' });
    } catch { /* helper may be gone */ }
  }, []);

  // ─── Clearers ─────────────────────────────────────────────────────────────

  const clearDevices = useCallback(() => {
    setDevices([]);
    setScanStatus('idle');
    setScanError(null);
  }, []);

  const selectBase = useCallback((base: string) => setSelectedBase(base), []);
  const setScanPorts = useCallback((p: string) => setScanPortsState(p), []);
  const setHealthPath = useCallback((h: string) => setHealthPathState(h), []);

  return [
    { helperAvailable, interfaces, selectedBase, scanPorts, healthPath,
      scanStatus, progress, devices, scanError, lastScanAt },
    { checkHelper, loadInterfaces, selectBase, setScanPorts, setHealthPath,
      startScan, stopScan, clearDevices },
  ];
}
