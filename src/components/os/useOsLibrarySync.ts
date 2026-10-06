import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useLibraryStore } from '../../store/libraryStore';
import { useTabletStore } from '../../store/tabletStore';
import { getDeviceStatus, subscribe } from '../../services/tabletControlService';
import { watchSharedBooks } from '../../services/importService';

const RESUME_RESCAN_AFTER_MS = 20000;

/**
 * InkTrick OS keeps the library current without the refresh button (the app is never relaunched):
 * books shared from Drive are imported, and the folders are rescanned when the USB cable is
 * unplugged (files copied from a computer) and when coming back from another app (Drive, files).
 */
export function useOsLibrarySync() {
  const isDeviceOwner = useTabletStore(s => s.isDeviceOwner);
  const isLoaded = useLibraryStore(s => s.isLoaded);

  useEffect(() => {
    if (!isDeviceOwner || !isLoaded) return;
    const rescan = () => useLibraryStore.getState().refreshLibrary(true);
    const stopShared = watchSharedBooks();

    let usbConnected: boolean | null = null;
    const checkUsb = () =>
      getDeviceStatus().then(s => {
        if (usbConnected && !s.isUsbConnected) setTimeout(rescan, 1500);
        usbConnected = s.isUsbConnected;
      });
    checkUsb();
    const stopStatus = subscribe('onDeviceStatusChanged', checkUsb);

    let leftAt = 0;
    const appState = AppState.addEventListener('change', state => {
      if (state !== 'active') leftAt = Date.now();
      else if (leftAt && Date.now() - leftAt > RESUME_RESCAN_AFTER_MS) rescan();
    });

    return () => {
      stopShared();
      stopStatus();
      appState.remove();
    };
  }, [isDeviceOwner, isLoaded]);
}
