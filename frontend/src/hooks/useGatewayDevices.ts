import { useCallback, useEffect, useState } from 'react';
import { deviceApi } from '../services/deviceApi';
import type { GatewayDevice, GatewayEvent } from '../services/deviceApi';

export function useGatewayDevices() {
  const [devices, setDevices] = useState<GatewayDevice[]>([]);
  const [events, setEvents] = useState<GatewayEvent[]>([]);
  const [error, setError] = useState('');
  const [checkedAt, setCheckedAt] = useState(0);
  const refresh = useCallback(async () => {
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
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { void refresh(); const timer = setInterval(() => void refresh(), 3000); return () => clearInterval(timer); }, [refresh]);
  return { devices, events, error, checkedAt, refresh };
}
