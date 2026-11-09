import { useEffect, useRef, useState } from 'react';

/**
 * Local text draft for a field saved on blur. Follows the stored value (for example after a sync)
 * until the user starts typing, so remote edits never clobber what is being typed.
 */
export function useDraft(stored: string) {
  const [value, setValue] = useState(stored);
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current) setValue(stored);
  }, [stored]);
  return {
    value,
    change: (next: string) => {
      dirty.current = true;
      setValue(next);
    },
    /** Call after saving; true when the draft differs from the stored value. */
    settle: (): boolean => {
      dirty.current = false;
      return value !== stored;
    },
  };
}
