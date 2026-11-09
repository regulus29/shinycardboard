import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useToast } from '../ui';

/** How often an open tab asks the server whether a new service worker exists. */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** Registers the service worker, offers a reload toast for updates and confirms offline readiness. */
export function UpdatePrompt() {
  const toast = useToast();
  const announcedUpdate = useRef(false);
  const announcedOffline = useRef(false);
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => void registration.update(), UPDATE_CHECK_INTERVAL_MS);
    },
  });

  useEffect(() => {
    if (!needRefresh || announcedUpdate.current) return;
    announcedUpdate.current = true;
    toast.show({
      title: 'Update available',
      description: 'A new version of Shiny Cardboard is ready.',
      tone: 'info',
      action: { label: 'Reload', onClick: () => void updateServiceWorker(true) },
    });
  }, [needRefresh, toast, updateServiceWorker]);

  useEffect(() => {
    if (!offlineReady || announcedOffline.current) return;
    announcedOffline.current = true;
    toast.show({ title: 'Ready to work offline', description: 'The app and card catalog are saved on this device.', tone: 'success' });
  }, [offlineReady, toast]);

  return null;
}
