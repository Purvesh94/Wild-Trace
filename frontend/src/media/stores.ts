import { MOCK_ALERTS, MOCK_MAP_CAMERAS, MOCK_MAP_DRONES } from '../data/mockData.ts';
import { browserMediaUrl, validPosition } from './contracts.ts';
import type { DetectionBox, FeedSource, DevicePosition } from './contracts.ts';
import type { LogEntry } from '../hooks/useDeviceConnection.ts';

type Alert = Omit<typeof MOCK_ALERTS[number], 'lat' | 'lng'> & {
  lat: number | null; lng: number | null;
  testSource?: boolean; sourceId?: string; platformPosition?: DevicePosition;
};
let feeds: FeedSource[] = [
  ...MOCK_MAP_DRONES.map(d => ({ id: d.id, name: d.label, kind: 'drone' as const, transport: 'none' as const, demoMarker: true })),
  ...MOCK_MAP_CAMERAS.map(c => ({ id: c.id, name: c.label, kind: 'camera' as const, transport: 'none' as const, demoMarker: true })),
  { id: 'webcam-test', name: 'Webcam test — this computer', kind: 'webcam', transport: 'webcam' },
];
const feedListeners = new Set<() => void>();
export const subscribeFeeds = (fn: () => void) => { feedListeners.add(fn); return () => { feedListeners.delete(fn); }; };
export const getFeeds = () => feeds;
export function upsertFeed(source: FeedSource) {
  feeds = feeds.some(f => f.id === source.id) ? feeds.map(f => f.id === source.id ? source : f) : [...feeds, source].slice(-32);
  feedListeners.forEach(fn => fn());
}

/** Optional media advertisement on the EXISTING telemetry socket. No video bytes use this socket. */
export function acceptDeviceMessage(data: unknown) {
  if (!data || typeof data !== 'object') return;
  const d = data as Record<string, unknown>;
  if (!['hello', 'telemetry'].includes(String(d.type)) || typeof d.deviceId !== 'string' || !d.deviceId || d.deviceId === 'webcam-test') return;
  const previous = feeds.find(f => f.id === d.deviceId);
  const media = d.media as Record<string, unknown> | undefined;
  let transport = previous?.transport ?? 'none';
  let url = previous?.url;
  if (media && ['native', 'hls', 'whep'].includes(String(media.transport)) && typeof media.url === 'string') {
    url = browserMediaUrl(media.url, window.location.protocol);
    transport = media.transport as FeedSource['transport'];
  }
  // A GPS receiver on the remote controller reports the controller position,
  // not the drone. Only an identified flight source can move a drone marker.
  const flightPositionSource = ['flight_controller', 'external_gateway', 'simulation'].includes(String(d.positionSource));
  const position = validPosition(d.position) && (d.kind !== 'drone' || flightPositionSource) ? d.position : previous?.position;
  upsertFeed({
    id: d.deviceId, name: typeof d.name === 'string' ? d.name : previous?.name ?? d.deviceId,
    kind: d.kind === 'camera' ? 'camera' : previous?.kind ?? 'drone', transport, url,
    viaGateway: media?.viaGateway === true || previous?.viaGateway,
    position, demoMarker: position ? false : previous?.demoMarker,
    telemetryAt: Date.now(),
  });
}

let liveAlerts: Alert[] = [];
let logs: LogEntry[] = [];
let alerts: Alert[] = [...MOCK_ALERTS];
const eventListeners = new Set<() => void>();
const lastEmission = new Map<string, number>();
export const subscribeEvents = (fn: () => void) => { eventListeners.add(fn); return () => { eventListeners.delete(fn); }; };
export const getAlerts = () => alerts;
export const getMediaLogs = () => logs;
export function logMedia(level: LogEntry['level'], msg: string) {
  logs = [...logs, { ts: new Date().toISOString(), level, msg }].slice(-100);
  eventListeners.forEach(fn => fn());
}
export function publishDetections(source: FeedSource, boxes: DetectionBox[], observedAt: number) {
  for (const box of boxes) {
    const key = `${source.id}:${box.label}`;
    if (observedAt - (lastEmission.get(key) ?? 0) < 10000) continue;
    lastEmission.set(key, observedAt);
    if (lastEmission.size > 500) lastEmission.delete(lastEmission.keys().next().value!);
    const date = new Date(observedAt);
    const test = source.kind === 'webcam';
    liveAlerts = [{
      id: `LIVE-${crypto.randomUUID().slice(0, 8)}`, type: 'detection', species: box.label,
      description: `${test ? 'WEBCAM TEST — ' : ''}${box.label} detected (${Math.round(box.confidence * 100)}%)`,
      source: source.name, sourceId: source.id, testSource: test,
      zone: 'Object location unknown', priority: 'low', status: 'needs_verification',
      time: date.toLocaleTimeString(), date: date.toLocaleDateString(),
      lat: null, lng: null, platformPosition: source.position,
      image: null, identityStatus: null, candidateId: null,
      timeline: [{ time: date.toLocaleTimeString(), label: test ? 'Webcam test detection' : 'Video detection', desc: 'Unverified model output. Device GPS is not the object location.', done: true }],
    }, ...liveAlerts].slice(0, 100);
    alerts = [...liveAlerts, ...MOCK_ALERTS];
    logMedia('info', `${source.name}: ${box.label} ${Math.round(box.confidence * 100)}%${test ? ' (WEBCAM TEST)' : ''}; object location unknown.`);
  }
}
