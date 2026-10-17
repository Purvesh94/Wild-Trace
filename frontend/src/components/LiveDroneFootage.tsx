import { useRef, useState, useSyncExternalStore } from 'react';
import type { FormEvent } from 'react';
import { Camera, Video, Maximize2, Volume2, VolumeX, Play, Square, MapPin, Plus, LayoutGrid } from 'lucide-react';
import { useVideoFeed } from '../hooks/useVideoFeed';
import { browserMediaUrl } from '../media/contracts.ts';
import type { FeedSource, MediaTransport } from '../media/contracts.ts';
import { getMediaLogs, subscribeEvents, upsertFeed } from '../media/stores.ts';

function timeLabel(timestamp: number | null) {
  return timestamp ? new Date(timestamp).toLocaleTimeString() : 'Not received';
}

function FeedCard({ source, selected, onSelect }: { source: FeedSource; selected: boolean; onSelect: (id: string) => void }) {
  const feed = useVideoFeed(source);
  const frameRef = useRef<HTMLDivElement>(null);
  const [muted, setMuted] = useState(true);
  const [controlError, setControlError] = useState('');
  const isTest = source.kind === 'webcam';
  const busy = ['playing', 'loading', 'stale'].includes(feed.status);
  const overlay = feed.overlay;
  const statusLabel = { stopped: 'Stopped', loading: 'Loading', playing: isTest ? 'Webcam active' : 'Receiving video', stale: 'Stale frames', disconnected: 'Disconnected', error: 'Unavailable' }[feed.status];
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement === frameRef.current) await document.exitFullscreen();
      else if (frameRef.current?.requestFullscreen) await frameRef.current.requestFullscreen();
      else throw new Error('Fullscreen is unavailable in this browser.');
    } catch (error) { setControlError(error instanceof Error ? error.message : 'Fullscreen could not start.'); }
  };
  return (
    <article className={`feed-card${selected ? ' is-selected' : ''}`} aria-label={`${source.name} feed`}>
      <div className="feed-card-header">
        <button className="feed-select-title" onClick={() => onSelect(source.id)} aria-pressed={selected}>
          {isTest ? <Camera size={15} /> : <Video size={15} />} {source.name}
        </button>
        <span className={`badge ${feed.status === 'playing' ? 'success' : ['error', 'disconnected'].includes(feed.status) ? 'critical' : 'neutral'}`}>{statusLabel}</span>
      </div>
      <div className="feed-frame" ref={frameRef}>
        <video ref={feed.videoRef} muted playsInline aria-label={`${source.name} video`} />
        {overlay && overlay.boxes.length > 0 && (
          <svg className="feed-overlay" viewBox={`0 0 ${overlay.width} ${overlay.height}`} preserveAspectRatio="xMidYMid meet" aria-label="Unverified detection boxes">
            {overlay.boxes.map((box, i) => {
              const x = box.x * overlay.width;
              const y = box.y * overlay.height;
              const fontSize = Math.max(16, overlay.width / 28);
              const textY = Math.max(fontSize, y - 5);
              return <g key={`${box.label}-${i}`}>
                <rect x={x} y={y} width={box.width * overlay.width} height={box.height * overlay.height} fill="none" stroke="#4ade80" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                <text x={Math.min(x + 4, overlay.width - fontSize * (box.label.length + 6) * 0.6)} y={textY} fontSize={fontSize} fill="white" stroke="#0d2818" strokeWidth="3" paintOrder="stroke" fontWeight="600">{box.label} {Math.round(box.confidence * 100)}%</text>
              </g>;
            })}
          </svg>
        )}
        {feed.status !== 'playing' && (
          <div className="feed-placeholder" role="status">
            <Video size={26} />
            <strong>{source.transport === 'none' ? 'No stream configured' : statusLabel}</strong>
            <span>{feed.message || (isTest ? 'Start the webcam test to request camera access.' : 'Start this source to check video connectivity.')}</span>
          </div>
        )}
        <span className={`feed-source-label${isTest ? ' test' : ''}`}>{isTest ? 'WEBCAM TEST · NOT DRONE FOOTAGE' : source.viaGateway ? 'DEVICE VIDEO · VIA GATEWAY' : 'DEVICE VIDEO'}</span>
        <div className="feed-video-controls">
          <button className="btn btn-secondary btn-sm" onClick={() => { if (feed.videoRef.current) feed.videoRef.current.muted = !muted; setMuted(v => !v); }} aria-label={muted ? `Unmute ${source.name}` : `Mute ${source.name}`} disabled={isTest} title={isTest ? 'Webcam test captures video only' : undefined}>{muted ? <VolumeX size={14} /> : <Volume2 size={14} />}</button>
          <button className="btn btn-secondary btn-sm" onClick={fullscreen} aria-label={`Fullscreen ${source.name}`}><Maximize2 size={14} /></button>
        </div>
      </div>
      <div className="feed-details">
        <div className="feed-times"><span>Frame received <strong>{timeLabel(feed.lastFrameAt)}</strong></span><span>Capture time <strong>{feed.captureAt ? `${timeLabel(feed.captureAt)} (estimated)` : 'Not supplied'}</strong></span></div>
        <div className="feed-map-link">
          <button className="btn btn-secondary btn-sm" disabled={!source.position && !source.demoMarker} onClick={() => onSelect(source.id)}><MapPin size={12} />{isTest ? 'No drone marker' : source.demoMarker ? 'Linked demo marker' : source.position ? 'Locate device' : 'GPS unavailable'}</button>
          <span>{source.demoMarker ? 'Demo position only' : source.position ? 'Device GPS only' : 'No device position'}</span>
        </div>
        <div className="feed-actions">
          <button className="btn btn-primary btn-sm" disabled={source.transport === 'none' || busy} onClick={() => { setMuted(true); setControlError(''); feed.start(); }}><Play size={12} />{isTest ? 'Start webcam test' : 'Start feed'}</button>
          <button className="btn btn-secondary btn-sm" disabled={feed.status === 'stopped'} onClick={feed.stop}><Square size={12} />Stop</button>
          <label className="feed-detection-toggle"><input type="checkbox" checked={feed.detectionEnabled} disabled={!feed.engine} onChange={event => feed.setDetectionEnabled(event.target.checked)} />Detection</label>
        </div>
        <p className="feed-note">{feed.engine ? `${feed.engine.name} · enabling detection sends readable frames to this engine (max 2/sec).` : 'Detection not configured — no model results are available.'}</p>
        {feed.detectionMessage && <p className="feed-note" role="status">{feed.detectionMessage}</p>}
        {controlError && <p className="feed-error" role="alert">{controlError}</p>}
      </div>
    </article>
  );
}

function SourceForm({ sources, selectedId, onSelect }: { sources: FeedSource[]; selectedId: string; onSelect: (id: string) => void }) {
  const [target, setTarget] = useState(selectedId === 'webcam-test' ? 'new' : selectedId);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'drone' | 'camera'>('drone');
  const [transport, setTransport] = useState<MediaTransport>('whep');
  const [url, setUrl] = useState('');
  const [viaGateway, setViaGateway] = useState(true);
  const [error, setError] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const checkedUrl = browserMediaUrl(url, window.location.protocol);
      const previous = sources.find(s => s.id === target);
      if (!previous && !name.trim()) throw new Error('Enter a device name.');
      const source: FeedSource = previous
        ? { ...previous, transport, url: checkedUrl, viaGateway }
        : { id: `device-${crypto.randomUUID()}`, name: name.trim(), kind, transport, url: checkedUrl, viaGateway };
      upsertFeed(source); onSelect(source.id); setError(''); setUrl('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Invalid source.'); }
  }
  return <details className="feed-config">
    <summary><Plus size={13} /> Configure a device stream</summary>
    <form onSubmit={submit} className="feed-config-form">
      <label>Link to device<select className="form-input" value={target} onChange={e => setTarget(e.target.value)}><option value="new">New device (GPS unavailable)</option>{sources.filter(s => s.kind !== 'webcam').map(s => <option key={s.id} value={s.id}>{s.name}{s.demoMarker ? ' — demo marker' : ''}</option>)}</select></label>
      {target === 'new' && <><label>Device name<input className="form-input" maxLength={80} value={name} onChange={e => setName(e.target.value)} required /></label><label>Device type<select className="form-input" value={kind} onChange={e => setKind(e.target.value as 'drone' | 'camera')}><option value="drone">Drone</option><option value="camera">Camera</option></select></label></>}
      <label>Browser transport<select className="form-input" value={transport} onChange={e => setTransport(e.target.value as MediaTransport)}><option value="whep">WebRTC (WHEP gateway)</option><option value="hls">HLS (native browser support)</option><option value="native">Browser-playable HTTP video</option></select></label>
      <label>Media URL<input className="form-input" type="text" required value={url} onChange={e => setUrl(e.target.value)} placeholder="http://localhost:8889/drone-01/whep" /></label>
      <label className="feed-detection-toggle"><input type="checkbox" checked={viaGateway} onChange={e => setViaGateway(e.target.checked)} />Source is provided by a media gateway</label>
      <p className="feed-note">RTSP must be converted by your local gateway to WebRTC/HLS. No gateway is bundled or assumed connected. Source settings last for this app session.</p>
      <button className="btn btn-primary btn-sm" type="submit">Use stream</button>
      {error && <p className="feed-error" role="alert">{error}</p>}
    </form>
  </details>;
}

export default function LiveDroneFootage({ sources, selectedId, onSelect }: { sources: FeedSource[]; selectedId: string; onSelect: (id: string) => void }) {
  const [grid, setGrid] = useState(false);
  const logs = useSyncExternalStore(subscribeEvents, getMediaLogs);
  const selected = sources.find(s => s.id === selectedId) ?? sources[0];
  const visible = grid ? sources.filter(s => s.transport !== 'none' || s.id === selected?.id) : selected ? [selected] : [];
  return <section className="card footage-panel" aria-labelledby="footage-title">
    <div className="card-header"><span className="card-title" id="footage-title"><Video size={15} /> Live Drone Footage</span><span className="badge neutral">Live media</span></div>
    <div className="footage-body">
      <p className="feed-note">Device video and telemetry are separate connections. Demo markers have no footage attached.</p>
      <div className="feed-toolbar"><label className="feed-source-picker">Select feed<select className="form-input" value={selected?.id ?? ''} onChange={e => onSelect(e.target.value)}>{sources.map(s => <option value={s.id} key={s.id}>{s.name}{s.transport === 'none' ? ' — unconfigured' : ''}</option>)}</select></label><button className={`btn btn-sm ${grid ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={grid} onClick={() => setGrid(v => !v)}><LayoutGrid size={14} />{grid ? 'Single feed' : 'Multi-feed'}</button></div>
      <div className={`feed-grid${grid ? ' multi' : ''}`}>{visible.map(source => <FeedCard key={source.id} source={source} selected={selectedId === source.id} onSelect={onSelect} />)}</div>
      <SourceForm sources={sources} selectedId={selectedId} onSelect={onSelect} />
      <details className="feed-log"><summary>Media & detection log ({logs.length})</summary><div role="log" aria-label="Media and detection events">{logs.length === 0 ? <p className="feed-note">No media or detection events yet.</p> : [...logs].reverse().map((log, i) => <p key={`${log.ts}-${i}`}><time>{new Date(log.ts).toLocaleTimeString()}</time> {log.msg}</p>)}</div></details>
    </div>
  </section>;
}
