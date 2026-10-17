/**
 * useDeviceConnection — Device Connection Adapter
 *
 * Transport contract (future ESP32 firmware must implement):
 *
 *  WebSocket  ws://<host>:<port><wsPath>
 *    • On open:  server sends JSON  { type: "hello", firmware: "...", uptime: <s> }
 *    • Heartbeat: server sends JSON { type: "ping" }  every ≤5 s
 *    • Client may send JSON { type: "ping" } and expect { type: "pong" }
 *    • Authentication (future): send { type: "auth", token: "<bearer>" } after open
 *
 *  HTTP health  GET http://<host>:<port><healthPath>
 *    • 200 OK   body: JSON { status: "ok", uptime: <s>, firmware?: "..." }
 *    • Any non-200 → treat as unhealthy
 *    • CORS header required: Access-Control-Allow-Origin: *
 *
 * Browser constraints honoured:
 *  • No ICMP ping; reachability tested via WebSocket/fetch only.
 *  • Mixed-content (HTTPS page → ws:// / http:// device) will be blocked by the
 *    browser when the page is served over HTTPS. The UI warns when this applies.
 *  • no-cors is NOT used as proof of connectivity.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConnectionStatus =
  | 'not_connected'
  | 'connecting'
  | 'connected'
  | 'failed'
  | 'disconnected';

export type TransportKind = 'websocket' | 'http_poll';

export interface LogEntry {
  ts: string;           // ISO timestamp
  level: 'info' | 'warn' | 'error' | 'success';
  msg: string;
}

export interface ConnectionSettings {
  host: string;         // IP or hostname, no protocol prefix
  port: string;
  wsPath: string;       // e.g. "/ws"
  healthPath: string;   // e.g. "/health"
  timeoutMs: number;
}

export interface DeviceConnectionState {
  status: ConnectionStatus;
  transport: TransportKind | null;
  wsReachable: boolean | null;   // null = untested
  httpReachable: boolean | null; // null = untested; labelled separately
  lastSeen: Date | null;
  firmwareInfo: string | null;
  logs: LogEntry[];
  settings: ConnectionSettings;
  mixedContentWarning: boolean;
}

export interface DeviceConnectionActions {
  connect: () => void;
  disconnect: () => void;
  testConnection: () => Promise<void>;
  updateSettings: (s: Partial<ConnectionSettings>) => void;
  clearLogs: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LS_KEY = 'tadoba_device_conn_settings';
const MAX_LOGS = 80;
const DEFAULT_SETTINGS: ConnectionSettings = {
  host: '192.168.1.100',
  port: '8080',
  wsPath: '/ws',
  healthPath: '/health',
  timeoutMs: 6000,
};
const STALE_THRESHOLD_MS = 12_000; // no WS message → stale

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadSettings(): ConnectionSettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(s: ConnectionSettings) {
  // Only non-secret connection settings are persisted.
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

function isoNow() {
  return new Date().toISOString();
}

function makeEntry(
  level: LogEntry['level'],
  msg: string,
): LogEntry {
  return { ts: isoNow(), level, msg };
}

function wsUrl(s: ConnectionSettings) {
  return `ws://${s.host}:${s.port}${s.wsPath}`;
}
function httpUrl(s: ConnectionSettings) {
  return `http://${s.host}:${s.port}${s.healthPath}`;
}

/** True when the page is HTTPS and the device target is plain HTTP/WS */
function hasMixedContentRisk(): boolean {
  return window.location.protocol === 'https:';
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDeviceConnection(): [DeviceConnectionState, DeviceConnectionActions] {
  const [settings, setSettingsState] = useState<ConnectionSettings>(loadSettings);

  const [status, setStatus] = useState<ConnectionStatus>('not_connected');
  const [transport, setTransport] = useState<TransportKind | null>(null);
  const [wsReachable, setWsReachable] = useState<boolean | null>(null);
  const [httpReachable, setHttpReachable] = useState<boolean | null>(null);
  const [lastSeen, setLastSeen] = useState<Date | null>(null);
  const [firmwareInfo, setFirmwareInfo] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectingRef = useRef(false); // guard duplicate connect attempts
  const mountedRef = useRef(true);

  // Track settings in a ref so WS callbacks always see latest values
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      doDisconnect(true);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Log helpers ──────────────────────────────────────────────────────────

  const addLog = useCallback((level: LogEntry['level'], msg: string) => {
    if (!mountedRef.current) return;
    setLogs(prev => {
      const next = [...prev, makeEntry(level, msg)];
      return next.length > MAX_LOGS ? next.slice(next.length - MAX_LOGS) : next;
    });
  }, []);

  // ─── Stale detection ──────────────────────────────────────────────────────

  function resetStaleTimer() {
    if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
    staleTimerRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      addLog('warn', `No message from device for ${STALE_THRESHOLD_MS / 1000}s — connection may be stale.`);
      setStatus('disconnected');
    }, STALE_THRESHOLD_MS);
  }

  // ─── HTTP health-check (standalone, used for both test and poll) ───────────

  async function checkHttp(s: ConnectionSettings): Promise<boolean> {
    const url = httpUrl(s);
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), s.timeoutMs);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(tid);
      if (res.ok) {
        try {
          const body = await res.json();
          const fw = body?.firmware ?? body?.version ?? null;
          if (fw && mountedRef.current) setFirmwareInfo(String(fw));
        } catch { /* body not JSON — still OK */ }
        if (mountedRef.current) {
          setHttpReachable(true);
          setLastSeen(new Date());
        }
        return true;
      }
      if (mountedRef.current) setHttpReachable(false);
      return false;
    } catch (err: unknown) {
      if (mountedRef.current) setHttpReachable(false);
      const msg = err instanceof Error ? err.message : String(err);
      // AbortError = timeout; TypeError with "Failed to fetch" = CORS / network
      if (msg.includes('abort') || msg.includes('Abort')) {
        addLog('error', `HTTP health-check timed out (${s.timeoutMs}ms). Device unreachable or blocked by CORS.`);
      } else {
        addLog('error', `HTTP health-check failed: ${msg}`);
      }
      return false;
    }
  }

  // ─── HTTP polling fallback ─────────────────────────────────────────────────

  function startHttpPoll(s: ConnectionSettings) {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    const interval = Math.max(s.timeoutMs, 5000);
    addLog('info', `Starting HTTP poll fallback every ${interval / 1000}s → ${httpUrl(s)}`);
    setTransport('http_poll');

    pollTimerRef.current = setInterval(async () => {
      if (!mountedRef.current) return;
      const ok = await checkHttp(settingsRef.current);
      if (!ok && mountedRef.current) {
        addLog('warn', 'HTTP poll: device not reachable. Showing as disconnected.');
        setStatus('disconnected');
      }
    }, interval);
  }

  function stopHttpPoll() {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }

  // ─── WebSocket connection ──────────────────────────────────────────────────

  function openWebSocket(s: ConnectionSettings) {
    const url = wsUrl(s);
    addLog('info', `Attempting WebSocket → ${url}`);

    // Guard: close any existing socket first
    if (wsRef.current) {
      wsRef.current.onclose = null; // suppress old handler
      wsRef.current.close();
      wsRef.current = null;
    }

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog('error', `WebSocket construction failed: ${msg}`);
      setWsReachable(false);
      handleWsFallback(s);
      return;
    }

    wsRef.current = ws;

    const connectTimeout = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        addLog('warn', `WebSocket did not open within ${s.timeoutMs}ms — falling back to HTTP poll.`);
        ws.onclose = null;
        ws.close();
        if (wsRef.current === ws) wsRef.current = null;
        setWsReachable(false);
        handleWsFallback(s);
      }
    }, s.timeoutMs);

    ws.onopen = () => {
      clearTimeout(connectTimeout);
      if (!mountedRef.current) return;
      addLog('success', `WebSocket connected to ${url}`);
      setWsReachable(true);
      setStatus('connected');
      setTransport('websocket');
      setLastSeen(new Date());
      connectingRef.current = false;
      resetStaleTimer();
    };

    ws.onmessage = (ev) => {
      if (!mountedRef.current) return;
      setLastSeen(new Date());
      resetStaleTimer();
      try {
        const data = JSON.parse(ev.data as string);
        if (data.type === 'hello') {
          const fw = data.firmware ?? data.version ?? null;
          if (fw) setFirmwareInfo(String(fw));
          addLog('info', `Device hello — firmware: ${fw ?? 'unknown'}, uptime: ${data.uptime ?? '?'}s`);
        } else if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch { /* non-JSON frame — still marks activity */ }
    };

    ws.onerror = () => {
      // onerror always precedes onclose; log here, handle in onclose
      if (!mountedRef.current) return;
      clearTimeout(connectTimeout);
      addLog('warn', 'WebSocket error event received.');
    };

    ws.onclose = (ev) => {
      clearTimeout(connectTimeout);
      if (!mountedRef.current) return;
      if (wsRef.current === ws) wsRef.current = null;
      if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
      const reason = ev.reason ? ` (${ev.reason})` : '';
      addLog(
        ev.wasClean ? 'info' : 'error',
        `WebSocket closed — code ${ev.code}${reason}`,
      );
      setWsReachable(false);
      setStatus('disconnected');
      setTransport(null);
      connectingRef.current = false;
    };
  }

  async function handleWsFallback(s: ConnectionSettings) {
    addLog('info', 'Testing HTTP reachability as fallback…');
    const ok = await checkHttp(s);
    if (!mountedRef.current) return;
    if (ok) {
      addLog('success', `HTTP health endpoint responded — monitoring via HTTP poll.`);
      addLog('warn', 'HTTP reachability ≠ WebSocket connection. Commands require WebSocket.');
      setStatus('connected');
      setHttpReachable(true);
      startHttpPoll(s);
    } else {
      addLog('error', 'Neither WebSocket nor HTTP health endpoint reachable. Device unavailable.');
      setStatus('failed');
      setWsReachable(false);
      setHttpReachable(false);
      connectingRef.current = false;
    }
  }

  // ─── Teardown ─────────────────────────────────────────────────────────────

  function doDisconnect(silent = false) {
    stopHttpPoll();
    if (staleTimerRef.current) { clearTimeout(staleTimerRef.current); staleTimerRef.current = null; }
    connectingRef.current = false;
    if (wsRef.current) {
      wsRef.current.onclose = null; // prevent re-entry cascade
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    if (!silent && mountedRef.current) {
      setStatus('not_connected');
      setTransport(null);
      setWsReachable(null);
      setHttpReachable(null);
      setLastSeen(null);
      setFirmwareInfo(null);
    }
  }

  // ─── Public actions ───────────────────────────────────────────────────────

  const connect = useCallback(() => {
    if (connectingRef.current || status === 'connecting') return;
    const s = settingsRef.current;
    doDisconnect(true); // clean slate
    connectingRef.current = true;
    setStatus('connecting');
    setWsReachable(null);
    setHttpReachable(null);
    setFirmwareInfo(null);
    addLog('info', `Connecting to ${s.host}:${s.port}…`);
    if (hasMixedContentRisk()) {
      addLog('warn', 'Page is served over HTTPS. Browser may block ws:// and http:// connections to the device. Use http:// to serve this dashboard on the same network for LAN access.');
    }
    openWebSocket(s);
  }, [status, addLog]); // eslint-disable-line react-hooks/exhaustive-deps

  const disconnect = useCallback(() => {
    addLog('info', 'Disconnected by user.');
    doDisconnect(false);
  }, [addLog]); // eslint-disable-line react-hooks/exhaustive-deps

  const testConnection = useCallback(async () => {
    const s = settingsRef.current;
    addLog('info', `Test — probing HTTP ${httpUrl(s)} …`);
    setHttpReachable(null);
    const httpOk = await checkHttp(s);
    addLog(httpOk ? 'success' : 'error', `HTTP health: ${httpOk ? 'reachable' : 'unreachable'}`);

    // Quick WS probe (open and immediately close)
    addLog('info', `Test — probing WebSocket ${wsUrl(s)} …`);
    await new Promise<void>((resolve) => {
      if (hasMixedContentRisk()) {
        addLog('warn', 'Mixed-content: WebSocket probe may be blocked by browser.');
      }
      let ws: WebSocket;
      try { ws = new WebSocket(wsUrl(s)); } catch (e: unknown) {
        addLog('error', `WebSocket probe error: ${e instanceof Error ? e.message : e}`);
        setWsReachable(false);
        resolve();
        return;
      }
      const t = setTimeout(() => {
        ws.onclose = null; ws.close();
        addLog('error', `WebSocket probe timed out (${s.timeoutMs}ms).`);
        setWsReachable(false);
        resolve();
      }, s.timeoutMs);
      ws.onopen = () => {
        clearTimeout(t);
        addLog('success', 'WebSocket probe: port open and handshake succeeded.');
        setWsReachable(true);
        ws.onclose = null; ws.close();
        resolve();
      };
      ws.onerror = () => { /* handled in onclose */ };
      ws.onclose = () => {
        clearTimeout(t);
        if (!ws.onopen) return; // already resolved via onopen path
        addLog('error', 'WebSocket probe: connection refused or closed immediately.');
        setWsReachable(false);
        resolve();
      };
    });
  }, [addLog, settings]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateSettings = useCallback((partial: Partial<ConnectionSettings>) => {
    setSettingsState(prev => {
      const next = { ...prev, ...partial };
      saveSettings(next);
      return next;
    });
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  const mixedContentWarning = hasMixedContentRisk();

  return [
    { status, transport, wsReachable, httpReachable, lastSeen, firmwareInfo, logs, settings, mixedContentWarning },
    { connect, disconnect, testConnection, updateSettings, clearLogs },
  ];
}
