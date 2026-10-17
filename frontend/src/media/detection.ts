import { validateBoxes, browserMediaUrl } from './contracts.ts';
import type { DetectionEngine, DetectionFrame, DetectionResult } from './contracts.ts';

// Kept until the original promise settles, even across stop/restart or component remounts.
// Abort must not allow two non-cooperative engine calls to overlap for the same source.
export class InferenceGate {
  private pending = new Set<string>();
  async run<T>(sourceId: string, work: () => Promise<T>): Promise<T | undefined> {
    if (this.pending.has(sourceId)) return undefined;
    this.pending.add(sourceId);
    try { return await work(); } finally { this.pending.delete(sourceId); }
  }
}
export const inferenceGate = new InferenceGate();

export function createHttpDetector(endpoint: string, supportedClasses: string[]): DetectionEngine {
  const url = browserMediaUrl(endpoint, typeof window === 'undefined' ? 'http:' : window.location.protocol);
  return {
    name: 'Configured detection service', supportedClasses,
    async infer(frame: DetectionFrame, signal: AbortSignal): Promise<DetectionResult> {
      const body = new FormData();
      body.append('image', frame.image, 'frame.jpg');
      body.append('metadata', JSON.stringify({ ...frame, image: undefined }));
      const response = await fetch(url, { method: 'POST', body, signal, credentials: 'omit' });
      if (!response.ok) throw new Error(`Detection service returned HTTP ${response.status}.`);
      const result = await response.json();
      if (result.frameId !== frame.frameId) throw new Error('Detection response does not match the submitted frame.');
      return { frameId: result.frameId, boxes: validateBoxes(result.boxes, supportedClasses) };
    },
  };
}

let registeredEngine: DetectionEngine | null = null;
const subscribers = new Set<() => void>();
export const subscribeDetector = (fn: () => void) => { subscribers.add(fn); return () => { subscribers.delete(fn); }; };
export const getDetector = () => registeredEngine;
export function registerDetectionEngine(engine: DetectionEngine | null) {
  registeredEngine = engine;
  subscribers.forEach(fn => fn());
}

const endpoint = import.meta.env?.VITE_DETECTION_API_URL;
const classes = (import.meta.env?.VITE_DETECTION_CLASSES ?? '').split(',').map((s: string) => s.trim()).filter(Boolean);
if (endpoint && classes.length) {
  try { registeredEngine = createHttpDetector(endpoint, classes); } catch { /* Show unavailable; never invent results. */ }
}
