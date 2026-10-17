import os from 'node:os';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

const run = promisify(execFile);
const SOFTAP_SSID = 'WildTrace-ESP32';
const WINDOWS_DETAILS_TTL_MS = 5000;
const WINDOWS_PROFILE_TIMEOUT_MS = 12000;
const WINDOWS_SSID_TIMEOUT_MS = 5000;

const windowsProfileScript = `
$adapter = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and ($_.InterfaceDescription -match 'Wi-Fi|Wireless|WLAN|802.11' -or $_.Name -match 'Wi-Fi|Wireless|WLAN') } | Select-Object -First 1
if ($adapter) {
  $profile = Get-NetConnectionProfile -InterfaceIndex $adapter.ifIndex -ErrorAction SilentlyContinue
  $ip = Get-NetIPConfiguration -InterfaceIndex $adapter.ifIndex -ErrorAction SilentlyContinue
  $address = $ip.IPv4Address | Select-Object -First 1
  $gateway = $ip.IPv4DefaultGateway | Select-Object -First 1
  [pscustomobject]@{
    profileName = $profile.Name
    interfaceName = $adapter.Name
    address = $address.IPAddress
    netmask = $address.PrefixLength
    gateway = $gateway.NextHop
  } | ConvertTo-Json -Compress
}`;

let windowsDetails = { interfaceName: null, profileName: null, address: null, netmask: null, gateway: null, ssid: null, ssidBlocked: false };
let windowsDetailsCheckedAt = 0;
let windowsDetailsRequest = null;

function isWifiInterface(name) {
  return /wi-?fi|wlan|wireless|802\.11/i.test(name) || /^en\d+$/i.test(name);
}

function prefixFromNetmask(netmask) {
  if (typeof netmask !== 'string' || !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(netmask)) return null;
  const bits = netmask.split('.').map(Number);
  if (bits.some(bit => bit > 255)) return null;
  const binary = bits.map(bit => bit.toString(2).padStart(8, '0')).join('');
  if (!/^1*0*$/.test(binary)) return null;
  return binary.indexOf('0') === -1 ? 32 : binary.indexOf('0');
}

function networkFor(address, prefix) {
  if (typeof address !== 'string' || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
  const addressNumber = octets.reduce((value, octet) => value * 256 + octet, 0) >>> 0;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (addressNumber & mask) >>> 0;
  const networkAddress = [24, 16, 8, 0].map(shift => (network >>> shift) & 255).join('.');
  return {
    subnet: `${networkAddress}/${prefix}`,
    cidr: `${address}/${prefix}`,
    base: address.split('.').slice(0, 3).join('.'),
  };
}

function activeWifiInterface() {
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    if (!isWifiInterface(name)) continue;
    const address = entries?.find(entry => entry.family === 'IPv4' && !entry.internal);
    if (address) return { name, ...address };
  }
  return null;
}

function refreshWindowsDetails(now) {
  if (process.platform !== 'win32' || windowsDetailsRequest || now - windowsDetailsCheckedAt < WINDOWS_DETAILS_TTL_MS) return;
  windowsDetailsCheckedAt = now;

  windowsDetailsRequest = Promise.allSettled([
    run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', windowsProfileScript],
      { timeout: WINDOWS_PROFILE_TIMEOUT_MS, windowsHide: true, maxBuffer: 32768 }),
    run('netsh.exe', ['wlan', 'show', 'interfaces'], { timeout: WINDOWS_SSID_TIMEOUT_MS, windowsHide: true }),
  ]).then(([profileResult, ssidResult]) => {
    const next = { ...windowsDetails };
    if (profileResult.status === 'fulfilled') {
      try {
        const profile = JSON.parse(profileResult.value.stdout.trim());
        next.interfaceName = profile.interfaceName || null;
        next.profileName = profile.profileName || null;
        next.address = profile.address || null;
        next.netmask = Number.isInteger(profile.netmask) ? profile.netmask : null;
        next.gateway = profile.gateway || null;
      } catch {
        next.profileName = null;
      }
    }
    const ssidOutput = ssidResult.status === 'fulfilled'
      ? ssidResult.value.stdout
      : `${ssidResult.reason?.stdout || ''}\n${ssidResult.reason?.stderr || ''}`;
    next.ssid = parseNetshSsid(ssidOutput);
    next.ssidBlocked = !next.ssid && /location permission|location services|requires elevation|access is denied/i.test(ssidOutput);
    windowsDetails = next;
  }).finally(() => { windowsDetailsRequest = null; });
}

export function parseNetshSsid(output) {
  const match = output.match(/^\s*SSID\s*:\s*(.+?)\s*$/im);
  return match?.[1] || null;
}

export function classifyWifi({ ssid = null, profileName = null, address = null, gateway = null }) {
  const network = networkFor(address, 24);
  const isSoftApAddress = network?.base === '192.168.4' && (!gateway || gateway === '192.168.4.1');
  const apCandidate = isSoftApAddress && gateway === '192.168.4.1';
  const profileCandidate = profileName === SOFTAP_SSID;
  const mode = ssid === SOFTAP_SSID ? 'softap' : !ssid && (apCandidate || profileCandidate || isSoftApAddress)
    ? 'softap_candidate' : address ? 'station' : 'offline';
  return { mode, base: network?.base ?? null,
    targetHost: mode.startsWith('softap') ? '192.168.4.1' : null };
}

export function currentWifi() {
  const now = Date.now();
  const localInterface = activeWifiInterface();
  if (localInterface) refreshWindowsDetails(now);

  const detailsMatchInterface = localInterface && windowsDetails.interfaceName === localInterface.name;
  const interfaceName = localInterface?.name || null;
  const address = localInterface?.address || null;
  const localPrefix = localInterface?.cidr?.split('/')[1];
  const localNetmask = localInterface?.netmask || null;
  const prefix = localPrefix && /^\d+$/.test(localPrefix) ? Number(localPrefix) : prefixFromNetmask(localNetmask);
  const windowsAddressMatches = detailsMatchInterface && windowsDetails.address === address;
  const cidrPrefix = windowsAddressMatches && windowsDetails.netmask !== null
    ? windowsDetails.netmask : prefix;
  const mask = cidrPrefix === null || cidrPrefix === undefined ? 0
    : cidrPrefix === 0 ? 0 : (0xffffffff << (32 - cidrPrefix)) >>> 0;
  const netmaskFromPrefix = Number.isInteger(cidrPrefix)
    ? [24, 16, 8, 0].map(shift => (mask >>> shift) & 255).join('.') : null;
  const netmask = localNetmask || netmaskFromPrefix;
  const network = networkFor(address, cidrPrefix);
  const ssid = windowsAddressMatches ? windowsDetails.ssid : null;
  const profileName = windowsAddressMatches ? windowsDetails.profileName : null;
  const gateway = windowsAddressMatches ? windowsDetails.gateway : null;
  const ssidBlocked = !!windowsAddressMatches && windowsDetails.ssidBlocked;
  const classification = classifyWifi({ ssid, profileName, address, gateway });

  return { ...classification, ssid, profileName, interfaceName, address, netmask,
    gateway, ssidBlocked, ssidNote: ssidBlocked
      ? 'Windows blocked SSID access. The active Wi-Fi adapter, IP, and subnet are still available.'
      : !ssid && address ? 'Wi-Fi name is not available yet; using the live adapter IP and subnet.' : null,
    observedAt: new Date(now).toISOString(), networkObservedAt: new Date(now).toISOString(),
    subnet: network?.subnet ?? null, cidr: network?.cidr ?? null,
    base: network?.base ?? classification.base };
}
