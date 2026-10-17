import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createMediaSession } from '../media/adapters.ts';
import { getDetector, subscribeDetector, inferenceGate } from '../media/detection.ts';
import { validateBoxes } from '../media/contracts.ts';
import type { DetectionBox, DetectionEngine, FeedSource, FeedState } from '../media/contracts.ts';
import { logMedia, publishDetections } from '../media/stores.ts';

const STALE_MS = 5000;
const OVERLAY_MS = 1000;
const INFERENCE_INTERVAL_MS = 500;
export interface OverlayFrame { boxes: DetectionBox[]; width: number; height: number; observedAt: number; generation: number; engine: DetectionEngine }

export function useVideoFeed(source: FeedSource) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sourceRef = useRef(source);
  const engine = useSyncExternalStore(subscribeDetector, getDetector);
  const [running, setRunning] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [detectionEnabled, setDetectionEnabledState] = useState(false);
  const detectionRef = useRef(false);
  const [detectionGeneration, setDetectionGeneration] = useState(0);
  const detectionGenerationRef = useRef(0);
  const engineRef = useRef(engine);
  const [status, setStatus] = useState<FeedState>('stopped');
  const [message, setMessage] = useState('');
  const [detectionMessage, setDetectionMessage] = useState('');
  const [detectionMessageKey, setDetectionMessageKey] = useState({ generation: 0, engine });
  const [lastFrameAt, setLastFrameAt] = useState<number | null>(null);
  const [captureAt, setCaptureAt] = useState<number | null>(null);
  const [overlay, setOverlay] = useState<OverlayFrame | null>(null);
  const inferenceAbortRef = useRef<AbortController | null>(null);
  const detectorBlockedRef = useRef(false);
  useEffect(() => { sourceRef.current = source; }, [source]);
  useEffect(() => { engineRef.current = engine; }, [engine]);
  const setDetectionEnabled = useCallback((enabled: boolean) => {
    const generation = detectionGenerationRef.current + 1;
    detectionGenerationRef.current = generation;
    detectionRef.current = enabled;
    detectorBlockedRef.current = false;
    inferenceAbortRef.current?.abort();
    setDetectionGeneration(generation);
    setOverlay(null);
    setDetectionMessage('');
    setDetectionMessageKey({ generation, engine: engineRef.current });
    setDetectionEnabledState(enabled);
  }, []);
  const updateDetectionMessage = useCallback((message: string) => {
    setDetectionMessage(message);
    setDetectionMessageKey({ generation: detectionGenerationRef.current, engine: engineRef.current });
  }, []);
  // Keep detector refs and requests synchronized; overlay/message validity is derived from engine and generation.
  useEffect(() => {
    detectionRef.current = detectionEnabled;
    detectorBlockedRef.current = false;
    inferenceAbortRef.current?.abort();
  }, [detectionEnabled, engine]);

  // Media URLs/transport/identity are explicit dependencies; position metadata may update without restarting playback.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !running) { setStatus('stopped'); setOverlay(null); return; }
    let active = true;
    let lastFrame = 0;
    let lastUiUpdate = 0;
    let lastInference = -Infinity;
    let previousMediaTime = -1;
    let frameCallback = 0;
    let animationFrame = 0;
    let firstFrame = true;
    let state: FeedState = 'loading';
    const ctrl = new AbortController();
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const transition = (next: FeedState, detail = '') => {
      if (!active) return;
      if (next !== state || detail) logMedia(next === 'playing' ? 'success' : next === 'error' ? 'error' : 'info', `${source.name}: ${detail || next}`);
      state = next;
      setStatus(next);
      setMessage(detail);
    };
    const fail = (detail: string, next: FeedState = 'error') => {
      if (!active) return;
      transition(next, detail);
      active = false;
      ctrl.abort();
      inferenceAbortRef.current?.abort();
      setOverlay(null);
      session.dispose();
    };
    const session = createMediaSession(video, source, detail => fail(detail, 'disconnected'));
    const startedAt = Date.now();
    setStatus('loading'); setMessage('Waiting for video frames…');
    setLastFrameAt(null); setCaptureAt(null); setOverlay(null); setDetectionMessage('');
    detectorBlockedRef.current = false;
    const startTimeout = setTimeout(() => fail('No video frames received within 20 seconds. Check the source, gateway, codecs and CORS.'), 20000);

    const infer = (observedAt: number, mediaTime: number) => {
      if (!engine || !detectionRef.current || detectorBlockedRef.current || document.hidden || !context) return;
      if (observedAt - lastInference < INFERENCE_INTERVAL_MS) return;
      lastInference = observedAt;
      const generation = detectionGenerationRef.current;
      void inferenceGate.run(source.id, async () => {
        const request = new AbortController();
        inferenceAbortRef.current = request;
        const timeout = setTimeout(() => {
          request.abort();
          if (active) {
            detectorBlockedRef.current = true;
            updateDetectionMessage('Detection timed out. Playback continues; toggle detection to retry.');
            setOverlay(null);
          }
        }, 8000);
        try {
          const ratio = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
          canvas.width = Math.max(1, Math.round(video.videoWidth * ratio));
          canvas.height = Math.max(1, Math.round(video.videoHeight * ratio));
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          context.getImageData(0, 0, 1, 1); // Explicit origin-clean check before sending any frame.
          const image = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Frame encoding failed.')), 'image/jpeg', 0.8));
          request.signal.throwIfAborted();
          const frameId = crypto.randomUUID();
          const result = await engine.infer({ image, frameId, sourceId: source.id, width: canvas.width, height: canvas.height, observedAt, mediaTime }, request.signal);
          if (!active || request.signal.aborted || !detectionRef.current || detectionGenerationRef.current !== generation || state !== 'playing' || document.hidden) return;
          if (result.frameId !== frameId) throw new Error('Detector returned results for a different frame.');
          // Discard delayed responses instead of painting old boxes over a newer scene.
          if (Date.now() - observedAt > OVERLAY_MS || Math.abs(video.currentTime - mediaTime) > OVERLAY_MS / 1000) return;
          const boxes = validateBoxes(result.boxes, engine.supportedClasses);
          setOverlay({ boxes, width: canvas.width, height: canvas.height, observedAt, generation, engine });
          updateDetectionMessage(boxes.length ? `${boxes.length} detection${boxes.length === 1 ? '' : 's'} · unverified` : 'No supported objects detected in the sampled frame.');
          publishDetections(sourceRef.current, boxes, observedAt);
        } catch (error) {
          if (!active || request.signal.aborted) return;
          detectorBlockedRef.current = true;
          const detail = error instanceof DOMException && error.name === 'SecurityError'
            ? 'Frames are blocked by CORS. Configure the media server for this dashboard origin. Detection stopped.'
            : `Detection unavailable: ${error instanceof Error ? error.message : String(error)} Playback continues.`;
          updateDetectionMessage(detail); setOverlay(null); logMedia('error', `${source.name}: ${detail}`);
        } finally {
          clearTimeout(timeout);
          if (inferenceAbortRef.current === request) inferenceAbortRef.current = null;
        }
      }).catch(() => {});
    };

    const onFrame = (mediaTime: number, estimatedCapture?: number) => {
      if (!active || video.paused || video.ended || video.readyState < 2 || video.videoWidth === 0 || mediaTime === previousMediaTime) return;
      previousMediaTime = mediaTime;
      const now = Date.now();
      lastFrame = now;
      if (firstFrame) { firstFrame = false; clearTimeout(startTimeout); }
      if (state !== 'playing') transition('playing');
      if (now - lastUiUpdate >= 500) {
        setLastFrameAt(now);
        setCaptureAt(Number.isFinite(estimatedCapture) ? performance.timeOrigin + estimatedCapture! : null);
        lastUiUpdate = now;
      }
      infer(now, mediaTime);
    };
    const callback: VideoFrameRequestCallback = (_now, metadata) => {
      onFrame(metadata.mediaTime, metadata.captureTime);
      if (active) frameCallback = video.requestVideoFrameCallback(callback);
    };
    const fallbackFrame = () => {
      onFrame(video.currentTime);
      if (active) animationFrame = requestAnimationFrame(fallbackFrame);
    };
    if (typeof video.requestVideoFrameCallback === 'function') frameCallback = video.requestVideoFrameCallback(callback);
    else animationFrame = requestAnimationFrame(fallbackFrame);

    const clearResults = () => { setOverlay(null); inferenceAbortRef.current?.abort(); };
    const waiting = () => { if (active) { clearResults(); transition('loading', 'Buffering — waiting for fresh frames.'); } };
    const ended = () => fail('The source ended. Restart when the device is available.', 'disconnected');
    const mediaError = () => fail(video.error?.code === 4
      ? 'Unsupported video format or inaccessible source. Check the gateway URL, codecs and CORS.'
      : 'Video playback failed. Check the network, gateway and CORS; the browser may not distinguish these failures.');
    const hidden = () => { if (document.hidden) clearResults(); };
    video.addEventListener('waiting', waiting);
    video.addEventListener('ended', ended);
    video.addEventListener('error', mediaError);
    video.addEventListener('pause', clearResults);
    video.addEventListener('seeking', clearResults);
    document.addEventListener('visibilitychange', hidden);
    const healthTimer = setInterval(() => {
      if (!active) return;
      if (lastFrame && Date.now() - lastFrame > STALE_MS && state !== 'stale') {
        clearResults(); transition('stale', 'No fresh frames for 5 seconds. Overlays cleared.');
      }
      setOverlay(previous => previous && Date.now() - previous.observedAt > OVERLAY_MS ? null : previous);
      if (!lastFrame && Date.now() - startedAt > 20000) fail('No video frames received.');
    }, 250);
    void session.start(ctrl.signal).catch(error => {
      if (!active || ctrl.signal.aborted) return;
      fail(error instanceof Error ? error.message : 'Unable to start this media source.');
    });
    return () => {
      active = false; ctrl.abort(); inferenceAbortRef.current?.abort();
      clearTimeout(startTimeout); clearInterval(healthTimer);
      if (frameCallback) video.cancelVideoFrameCallback(frameCallback);
      if (animationFrame) cancelAnimationFrame(animationFrame);
      video.removeEventListener('waiting', waiting); video.removeEventListener('ended', ended);
      video.removeEventListener('error', mediaError); video.removeEventListener('pause', clearResults);
      video.removeEventListener('seeking', clearResults); document.removeEventListener('visibilitychange', hidden);
      session.dispose();
    };
    // Telemetry updates must not restart media. Source URL/transport changes must.
  }, [running, attempt, source.id, source.transport, source.url, source.mimeType, source.name, engine]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleOverlay = overlay?.generation === detectionGeneration && overlay.engine === engine ? overlay : null;
  const visibleDetectionMessage = detectionMessageKey.generation === detectionGeneration && detectionMessageKey.engine === engine ? detectionMessage : '';
  return { videoRef, status, message, lastFrameAt, captureAt, overlay: visibleOverlay, detectionMessage: visibleDetectionMessage, detectionEnabled, setDetectionEnabled, engine,
    start: () => { setRunning(true); setAttempt(n => n + 1); },
    stop: () => { setRunning(false); setOverlay(null); },
  };
}
