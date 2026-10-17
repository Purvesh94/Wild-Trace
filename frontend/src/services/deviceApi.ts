export const API_BASE = import.meta.env.VITE_GATEWAY_URL || 'http://127.0.0.1:3099';
export type WifiState = { mode: 'softap' | 'softap_candidate' | 'station' | 'offline'; base: string | null;
  subnet: string | null; cidr: string | null; netmask: string | null;
  targetHost: string | null; ssid: string | null; profileName: string | null; interfaceName: string | null;
  address: string | null; gateway: string | null; ssidBlocked: boolean; ssidNote: string | null;
  observedAt: string; networkObservedAt: string };
export type DiscoveredEsp32 = { ip: string; port: number; deviceId: string; firmware: string | null;
  source: string; compatible: true; checkedAt: string };
export type DeviceTelemetry = { device_id: string; timestamp: string | null; latitude: number | null; longitude: number | null;
  altitude_m: number | null; heading_deg: number | null; ground_speed_mps: number | null;
  battery_percent: number | null; gps_fix: boolean; source: 'unavailable' | 'flight_controller' | 'external_gateway' | 'simulation' };
export type GatewayDevice = { id: string; name: string; host: string; port: number; mode: string; type: string;
  profile: 'modern_json' | 'legacy_html'; htmlTitle: string | null; capabilities: string[];
  connected: boolean; manualDisconnected: boolean; lastSeen: string | null; hardwareVerified: boolean; verificationNote: { operator: string; note: string; at: string } | null;
  status: { firmware_version: string; armed: boolean; physical_enable: boolean; takeoff_output_active: boolean;
    landing_output_active: boolean; last_command_id: string; last_command_status: string; flight_state: string; gps_available: boolean } | null;
  telemetry: DeviceTelemetry; trail: [number, number][]; lastCommand: { command_id: string; type: string; status: string; message: string } | null };
export type GatewayEvent = { at: string; deviceId: string; event: string; detail: string };
export type GatewayReadiness = { operatorTokenConfigured: boolean; deviceTokenConfigured: boolean };

let operatorToken = sessionStorage.getItem('tadoba_operator_token') || '';
export function setOperatorToken(token: string) { operatorToken = token.trim(); sessionStorage.setItem('tadoba_operator_token', operatorToken); }
export function getOperatorToken() { return operatorToken; }
async function api<T>(path: string, method = 'GET', body?: unknown, timeoutMs = 5000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE}${path}`, { method, signal: ctrl.signal,
      headers: { ...(method !== 'GET' ? { 'X-Operator-Token': operatorToken } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined });
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error(`Local gateway at ${API_BASE} returned a web page instead of device data. Start the full backend gateway with "npm start" in the backend folder, then refresh Settings.`);
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Gateway HTTP ${response.status}`);
    return data as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('Gateway request timed out');
    throw error;
  } finally { clearTimeout(timer); }
}
export const deviceApi = {
  readiness: () => api<GatewayReadiness>('/api/gateway/readiness'),
  networkCurrent: () => api<WifiState>('/api/network/current', 'GET', undefined, 4000),
  discoverHost: (host: string, port = 80) => api<{ device: DiscoveredEsp32 }>(`/api/discovery/probe?${new URLSearchParams({ host, port: String(port) })}`),
  list: () => api<{ devices: GatewayDevice[] }>('/api/devices'),
  events: () => api<{ events: GatewayEvent[] }>('/api/events'),
  probe: (host: string, port: number, profile: 'modern_json' | 'legacy_html' = 'modern_json') =>
    api<{ health?: { device_id: string; firmware_version: string }; htmlTitle?: string; profile?: string }>('/api/devices/probe', 'POST', { host, port, profile }),
  connect: (host: string, port: number, name: string, mode: string, profile: 'modern_json' | 'legacy_html' = 'modern_json') =>
    api<{ device: GatewayDevice }>('/api/devices/connect', 'POST', { host, port, name, mode, profile }),
  disconnect: (id: string) => api<{ device: GatewayDevice }>(`/api/devices/${encodeURIComponent(id)}/disconnect`, 'POST'),
  status: (id: string) => api<{ device: GatewayDevice }>(`/api/devices/${encodeURIComponent(id)}/status`),
  verify: (id: string, operator: string, note: string) => api<{ device: GatewayDevice }>(`/api/devices/${encodeURIComponent(id)}/verification`, 'POST', {
    isolatedSwitchChecked: true, remoteDisconnectedTested: true, operator, note }),
  command: (id: string, command: 'arm' | 'takeoff' | 'land' | 'disarm', confirmation?: string, preflightConfirmed = false, missionId?: string) =>
    api<{ device: GatewayDevice; command: GatewayDevice['lastCommand'] }>(`/api/devices/${encodeURIComponent(id)}/commands/${command}`, 'POST', { confirmation, preflightConfirmed, missionId }),
  telemetry: (id: string) => api<{ telemetry: DeviceTelemetry; trail: [number, number][]; fresh: boolean }>(`/api/devices/${encodeURIComponent(id)}/telemetry`),
};
