import { useEffect } from 'react';

let openModals = 0;
let previousOverflow = '';

/** The app root id; dialogs portal to <body> so they stay outside it. */
const APP_ROOT_ID = 'root';

/** True while any Dialog or Drawer is open. */
export function isModalOpen(): boolean {
  return typeof document !== 'undefined' && document.querySelector('[aria-modal="true"]') !== null;
}

/** While active: lock page scroll and make the app root inert so focus and AT cannot escape the modal. */
export function useModalLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const root = document.getElementById(APP_ROOT_ID);
    if (openModals === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      root?.setAttribute('inert', '');
    }
    openModals += 1;
    return () => {
      openModals -= 1;
      if (openModals === 0) {
        document.body.style.overflow = previousOverflow;
        root?.removeAttribute('inert');
      }
    };
  }, [active]);
}
