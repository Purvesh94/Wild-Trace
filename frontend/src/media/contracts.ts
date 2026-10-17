export type MediaTransport = 'none' | 'webcam' | 'native' | 'hls' | 'whep';
export type FeedState = 'stopped' | 'loading' | 'playing' | 'stale' | 'disconnected' | 'error';
export interface DevicePosition {
  lat: number;
  lng: number;
  timestamp: number;
}
export interface FeedSource {
  id: string;
  name: string;
  kind: 'drone' | 'camera' | 'webcam';
  transport: MediaTransport;
  url?: string;
  mimeType?: string;
  viaGateway?: boolean;
  demoMarker?: boolean;
  position?: DevicePosition;
  telemetryAt?: number;
}
export interface DetectionBox {
  label: string;
  confidence: number;
  // Normalized coordinates in the original, unmirrored video frame.
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface DetectionResult {
  boxes: DetectionBox[];
  frameId: string;
}
export interface DetectionFrame {
  image: Blob;
  sourceId: string;
  frameId: string;
  width: number;
  height: number;
  observedAt: number;
  mediaTime: number;
}
export interface DetectionEngine {
  name: string;
  supportedClasses: readonly string[];
  infer(frame: DetectionFrame, signal: AbortSignal): Promise<DetectionResult>;
}

export function browserMediaUrl(value: string, pageProtocol = 'http:'): string {
  if (/^rtsps?:/i.test(value.trim())) {
    throw new Error('RTSP needs a media gateway. Enter its browser-ready WebRTC (WHEP) or HLS URL.');
  }
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Enter a complete http:// or https:// media URL.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP(S) browser media endpoints are supported.');
  if (url.username || url.password) throw new Error('Keep camera credentials in the gateway, not in a browser URL.');
  if (pageProtocol === 'https:' && url.protocol === 'http:') throw new Error('This HTTPS dashboard requires an HTTPS media gateway.');
  return url.href;
}

export function validPosition(value: unknown): value is DevicePosition {
  if (!value || typeof value !== 'object') return false;
  const p = value as DevicePosition;
  return Number.isFinite(p.lat) && Math.abs(p.lat) <= 90 && Number.isFinite(p.lng) && Math.abs(p.lng) <= 180
    && Number.isFinite(p.timestamp) && p.timestamp > 0 && p.timestamp <= Date.now() + 5000;
}

export function validateBoxes(value: unknown, classes: readonly string[]): DetectionBox[] {
  if (!Array.isArray(value)) throw new Error('The detector returned an invalid boxes array.');
  return value.slice(0, 100).filter((b): b is DetectionBox => {
    if (!b || typeof b !== 'object' || !classes.includes(b.label)) return false;
    return [b.x, b.y, b.width, b.height, b.confidence].every(Number.isFinite)
      && b.confidence >= 0 && b.confidence <= 1 && b.x >= 0 && b.y >= 0
      && b.width > 0 && b.height > 0 && b.x + b.width <= 1.00001 && b.y + b.height <= 1.00001;
  });
}

// Coordinates describe pixels, never latitude/longitude. object-fit: contain adds letterboxing.
export function containRect(frameWidth: number, frameHeight: number, viewWidth: number, viewHeight: number) {
  if (Math.min(frameWidth, frameHeight, viewWidth, viewHeight) <= 0) return { x: 0, y: 0, width: 0, height: 0 };
  const scale = Math.min(viewWidth / frameWidth, viewHeight / frameHeight);
  const width = frameWidth * scale;
  const height = frameHeight * scale;
  return { x: (viewWidth - width) / 2, y: (viewHeight - height) / 2, width, height };
}
