import { useEffect } from 'react';
import { OMNIBOX_INPUT_ID } from '../config/constants';
import { isModalOpen } from '../ui/useModalLock';

/** Move keyboard focus to the global omnibox (any page can call this). */
export function focusOmnibox(): void {
  const input = document.getElementById(OMNIBOX_INPUT_ID);
  if (input instanceof HTMLInputElement) {
    input.focus();
    input.select();
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** App-wide keyboard shortcuts. Currently: `/` focuses the omnibox. */
export function useGlobalShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target) || isModalOpen()) return;
      event.preventDefault();
      focusOmnibox();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
}
