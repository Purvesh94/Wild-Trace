import { browserMediaUrl } from './contracts.ts';
import type { FeedSource } from './contracts.ts';

export interface MediaSession {
  start(signal: AbortSignal): Promise<void>;
  dispose(): void;
}

function waitForIce(pc: RTCPeerConnection, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      pc.removeEventListener('icegatheringstatechange', changed);
      signal.removeEventListener('abort', aborted);
      if (error) reject(error); else resolve();
    };
    const changed = () => { if (pc.iceGatheringState === 'complete') finish(); };
    const aborted = () => finish(new DOMException('Stopped', 'AbortError'));
    const timer = setTimeout(() => finish(new Error('WebRTC candidate gathering timed out. Check the local network.')), 8000);
    pc.addEventListener('icegatheringstatechange', changed);
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted(); else changed();
  });
}

/** Media-only adapters. No telemetry socket is used to transport video. */
export function createMediaSession(video: HTMLVideoElement, source: FeedSource, onDisconnect: (message: string) => void): MediaSession {
  let disposed = false;
  let stream: MediaStream | null = null;
  let peer: RTCPeerConnection | null = null;
  let resource: string | null = null;
  const deleteResource = (url: string) => {
    void fetch(url, { method: 'DELETE', signal: AbortSignal.timeout(3000), credentials: 'omit' }).catch(() => {});
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    if (peer) { peer.ontrack = null; peer.onconnectionstatechange = null; peer.close(); }
    if (resource) { deleteResource(resource); resource = null; }
    video.pause();
    video.srcObject = null;
    video.removeAttribute('src');
    video.load();
  };
  return {
    dispose,
    async start(signal) {
      signal.throwIfAborted();
      if (disposed) throw new DOMException('Stopped', 'AbortError');
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = 'anonymous';
      if (source.transport === 'none') throw new Error('No video source configured for this device.');
      if (source.transport === 'webcam') {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Webcam access requires HTTPS or localhost and browser camera support.');
        const acquired = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (disposed || signal.aborted) { acquired.getTracks().forEach(t => t.stop()); throw new DOMException('Stopped', 'AbortError'); }
        stream = acquired;
        acquired.getVideoTracks().forEach(track => { track.onended = () => onDisconnect('Webcam disconnected or camera permission ended.'); });
        video.srcObject = acquired;
      } else {
        const url = browserMediaUrl(source.url ?? '', window.location.protocol);
        if (source.transport === 'whep') {
          if (typeof RTCPeerConnection === 'undefined') throw new Error('WebRTC is unavailable in this browser.');
          peer = new RTCPeerConnection({ iceServers: [] });
          const pc = peer;
          stream = new MediaStream();
          const remoteStream = stream;
          video.srcObject = remoteStream;
          pc.addTransceiver('video', { direction: 'recvonly' });
          pc.addTransceiver('audio', { direction: 'recvonly' });
          pc.ontrack = event => {
            if (disposed) { event.track.stop(); return; }
            remoteStream.addTrack(event.track);
            event.track.onended = () => onDisconnect('The gateway ended this media track.');
          };
          pc.onconnectionstatechange = () => {
            if (['failed', 'disconnected', 'closed'].includes(pc.connectionState) && !disposed) {
              onDisconnect('WebRTC media connection lost. Check the gateway, then restart the feed.');
            }
          };
          await pc.setLocalDescription(await pc.createOffer());
          await waitForIce(pc, signal);
          const response = await fetch(url, {
            method: 'POST', headers: { 'Content-Type': 'application/sdp', Accept: 'application/sdp' },
            body: pc.localDescription?.sdp, signal, credentials: 'omit',
          });
          if (response.status !== 201) throw new Error(`Gateway negotiation failed (HTTP ${response.status}). Expected a WHEP endpoint.`);
          const location = response.headers.get('Location');
          if (!location) throw new Error('Gateway must expose its WHEP Location response header for session cleanup.');
          const sessionUrl = new URL(location, url);
          if (sessionUrl.origin !== new URL(url).origin) throw new Error('Gateway returned a session URL on a different origin.');
          if (disposed || signal.aborted) { deleteResource(sessionUrl.href); throw new DOMException('Stopped', 'AbortError'); }
          resource = sessionUrl.href;
          const answer = await response.text();
          signal.throwIfAborted();
          await pc.setRemoteDescription({ type: 'answer', sdp: answer });
        } else {
          const isHls = source.transport === 'hls' || /\.m3u8(?:$|\?)/i.test(url);
          if (isHls && !video.canPlayType('application/vnd.apple.mpegurl')) {
            throw new Error('Native HLS is unsupported in this browser. Use the gateway’s WebRTC (WHEP) output.');
          }
          if (source.mimeType && !video.canPlayType(source.mimeType)) throw new Error(`Unsupported media format: ${source.mimeType}.`);
          video.src = url;
        }
      }
      signal.throwIfAborted();
      if (!disposed) await video.play();
    },
  };
}
