import os from 'node:os';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

const run = promisify(execFile);
const SOFTAP_SSID = 'WildTrace-ESP32';
const windowsProfileScript = `
$adapter = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and ($_.InterfaceDescription -match 'Wi-Fi|Wireless|WLAN|802.11' -or $_.Name -match 'Wi-Fi|Wireless|WLAN') } | Select-Object -First 1
if ($adapter) {
  $profile = Get-NetConnectionProfile -InterfaceIndex $adapter.ifIndex -ErrorAction SilentlyContinue
  $ip = Get-NetIPConfiguration -InterfaceIndex $adapter.ifIndex -ErrorAction SilentlyContinue
  [pscustomobject]@{
    profileName = $profile.Name
    interfaceName = $adapter.Name
    address = $ip.IPv4Address.IPAddress | Select-Object -First 1
    gateway = $ip.IPv4DefaultGateway.NextHop | Select-Object -First 1
  } | ConvertTo-Json -Compress
}`;

export function parseNetshSsid(output) {
  const match = output.match(/^\s*SSID\s*:\s*(.+?)\s*$/im);
  return match?.[1] || null;
}
export function classifyWifi({ ssid = null, profileName = null, address = null, gateway = null }) {
  const base = typeof address === 'string' && /^(?:\d{1,3}\.){3}\d{1,3}$/.test(address)
    ? address.split('.').slice(0, 3).join('.') : null;
  const apCandidate = base === '192.168.4' && gateway === '192.168.4.1';
  const profileCandidate = profileName === SOFTAP_SSID;
  const mode = ssid === SOFTAP_SSID ? 'softap' : !ssid && (apCandidate || profileCandidate) ? 'softap_candidate'
    : address ? 'station' : 'offline';
  return { mode, base, targetHost: mode.startsWith('softap') ? '192.168.4.1' : null };
}

export async function currentWifi() {
  let ssid = null;
  let ssidBlocked = false;
  let profileName = null;
  let interfaceName = null;
  let address = null;
  let gateway = null;
  if (process.platform === 'win32') {
    try {
      const { stdout } = await run('netsh.exe', ['wlan', 'show', 'interfaces'], { timeout: 3000, windowsHide: true });
      ssid = parseNetshSsid(stdout);
      ssidBlocked = !ssid && /location permission|location services|requires elevation|access is denied/i.test(stdout);
    } catch (error) {
      const text = `${error.stdout || ''}\n${error.stderr || ''}`;
      ssidBlocked = /location permission|location services|requires elevation|access is denied/i.test(text);
    }
    try {
      const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', windowsProfileScript],
        { timeout: 5000, windowsHide: true, maxBuffer: 32768 });
      const profile = JSON.parse(stdout.trim());
      profileName = profile.profileName || null;
      interfaceName = profile.interfaceName || null;
      address = profile.address || null;
      gateway = profile.gateway || null;
    } catch { /* Network may be disconnected or PowerShell unavailable. */ }
  } else {
    // Other systems retain IP awareness; exact SSID needs a platform adapter.
    const entry = Object.entries(os.networkInterfaces()).find(([name, addrs]) =>
      /wi-?fi|wlan|wireless|en0/i.test(name) && addrs?.some(a => a.family === 'IPv4' && !a.internal));
    interfaceName = entry?.[0] || null;
    address = entry?.[1]?.find(a => a.family === 'IPv4' && !a.internal)?.address || null;
  }
  const classification = classifyWifi({ ssid, profileName, address, gateway });
  return { ...classification, ssid, profileName, interfaceName, address, gateway, ssidBlocked,
    observedAt: new Date().toISOString(),
    ssidNote: ssidBlocked ? 'Windows blocked SSID access. Enable Location services to show the exact Wi-Fi name.'
      : !ssid && address ? 'Exact Wi-Fi SSID unavailable; the network profile and IP are shown.' : null };
}
