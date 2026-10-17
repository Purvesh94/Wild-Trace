import { useCallback, useEffect, useRef, useState } from 'react';
import { deviceApi } from '../services/deviceApi';
import type { GatewayDevice, GatewayEvent } from '../services/deviceApi';

export function useGatewayDevices() {
  const [devices, setDevices] = useState<GatewayDevice[]>([]);
  const [events, setEvents] = useState<GatewayEvent[]>([]);
  const [error, setError] = useState('');
  const [checkedAt, setCheckedAt] = useState(0);
  const inFlight = useRef(false);
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const listing = await deviceApi.list();
      const updated = await Promise.all(listing.devices.map(async d => {
        if (d.manualDisconnected) return d;
        try { return (await deviceApi.status(d.id)).device; } catch { return { ...d, connected: false }; }
      }));
      setDevices(updated);
      setEvents((await deviceApi.events()).events);
      setCheckedAt(Date.now());
      setError('');
    } catch (e) {
      setDevices(previous => previous.map(d => d.manualDisconnected ? d : { ...d, connected: false }));
      setError(e instanceof Error ? e.message : String(e));
    } finally { inFlight.current = false; }
  }, []);
  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), 3000);
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, [refresh]);
  return { devices, events, error, checkedAt, refresh };
}
