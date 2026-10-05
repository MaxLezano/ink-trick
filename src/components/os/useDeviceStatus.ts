import { useEffect, useState } from 'react';
import { DeviceStatus, EMPTY_STATUS, getDeviceStatus, subscribe } from '../../services/tabletControlService';

/** Battery / Wi-Fi / USB status, refreshed by native broadcasts while `active`. */
export function useDeviceStatus(active = true): DeviceStatus {
  const [status, setStatus] = useState<DeviceStatus>(EMPTY_STATUS);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    let pending: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => getDeviceStatus().then(s => alive && setStatus(s));
    // Broadcasts come in bursts (Wi-Fi connecting, battery while charging): coalesce them.
    const schedule = () => {
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        refresh();
      }, 300);
    };
    refresh();
    const unsub = subscribe('onDeviceStatusChanged', schedule);
    return () => {
      alive = false;
      if (pending) clearTimeout(pending);
      unsub();
    };
  }, [active]);
  return status;
}
