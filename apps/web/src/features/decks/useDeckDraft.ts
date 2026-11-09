import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Deck } from '@sc/core';
import { saveDeck, useDeck } from '../../data';
import { createAutosaver, type SaveStatus } from './autosave';
import { AUTOSAVE_DELAY_MS } from './constants';
import { clearDraftCopy, readDraftCopy, writeDraftCopy } from './draftStore';
import { fromStored, toPatch } from './deckPatch';

export interface DraftApi {
  /** undefined while loading, null when the deck does not exist. */
  deck: Deck | null | undefined;
  /** Apply an edit to the draft immediately and queue a save. */
  edit: (change: (deck: Deck) => Deck) => void;
  status: SaveStatus;
  /** Save anything pending now. */
  flush: () => Promise<void>;
  /** Drop pending edits (used right before deleting the deck). */
  discard: () => void;
  /** Set when the stored deck changed elsewhere while this draft had unsaved edits. */
  conflict: boolean;
  /** Take the other copy (reload) or overwrite it with this draft (keep mine). */
  resolveConflict: (choice: 'reload' | 'keep') => void;
}

/**
 * Local editable copy of a stored deck. Edits show instantly and are saved after a short pause.
 * Pending edits are flushed on unmount, when the tab hides and before the page unloads; a synchronous
 * localStorage copy covers an unload that beats the database write and is merged on the next open
 * when it is newer. A newer stored copy replaces the draft when nothing is pending, and raises a
 * conflict (never a silent overwrite) when edits are pending.
 */
export function useDeckDraft(deckId: string | undefined): DraftApi {
  const stored = useDeck(deckId);
  const [draft, setDraft] = useState<Deck | undefined>();
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [conflictCopy, setConflictCopy] = useState<Deck | undefined>();
  const draftRef = useRef<Deck | undefined>(undefined);
  const knownStamp = useRef(0);

  const saver = useMemo(
    () =>
      createAutosaver<Deck>(async (value) => {
        const saved = await saveDeck(toPatch(value));
        knownStamp.current = Math.max(knownStamp.current, saved.updatedAt);
        clearDraftCopy(value.id);
      }, AUTOSAVE_DELAY_MS),
    [],
  );

  useEffect(() => saver.subscribe(setStatus), [saver]);

  const adopt = useCallback(
    (next: Deck, stamp: number) => {
      draftRef.current = next;
      knownStamp.current = stamp;
      setDraft(next);
      setConflictCopy(undefined);
    },
    [],
  );

  useEffect(() => {
    if (!stored) return;
    const current = draftRef.current;
    if (current?.id !== stored.id) {
      const rescued = readDraftCopy(stored.id);
      if (rescued && rescued.savedAt > stored.updatedAt) {
        adopt(rescued.deck, stored.updatedAt);
        saver.schedule(rescued.deck);
      } else {
        clearDraftCopy(stored.id);
        adopt(fromStored(stored), stored.updatedAt);
      }
      return;
    }
    if (stored.updatedAt <= knownStamp.current || saver.status() === 'saving') return;
    if (saver.hasPending()) setConflictCopy(stored);
    else adopt(fromStored(stored), stored.updatedAt);
  }, [stored, saver, adopt]);

  useEffect(() => {
    const flushNow = () => void saver.flush();
    const onHide = () => {
      const current = draftRef.current;
      if (current && saver.hasPending()) writeDraftCopy(current);
      flushNow();
    };
    const onVisibility = () => document.visibilityState === 'hidden' && onHide();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
      flushNow();
    };
  }, [saver]);

  const edit = useCallback(
    (change: (deck: Deck) => Deck) => {
      const current = draftRef.current;
      if (!current) return;
      const next = change(current);
      if (next === current) return;
      draftRef.current = next;
      setDraft(next);
      saver.schedule(next);
    },
    [saver],
  );

  const flush = useCallback(() => saver.flush(), [saver]);
  const discard = useCallback(() => {
    saver.cancel();
    if (deckId) clearDraftCopy(deckId);
  }, [saver, deckId]);

  const resolveConflict = useCallback(
    (choice: 'reload' | 'keep') => {
      if (!conflictCopy) return;
      if (choice === 'reload') {
        saver.cancel();
        adopt(fromStored(conflictCopy), conflictCopy.updatedAt);
        return;
      }
      knownStamp.current = conflictCopy.updatedAt;
      setConflictCopy(undefined);
    },
    [conflictCopy, saver, adopt],
  );

  let deck: Deck | null | undefined;
  if (stored === null) deck = null;
  else deck = draft && draft.id === deckId ? draft : undefined;
  return { deck, edit, status, flush, discard, conflict: conflictCopy !== undefined, resolveConflict };
}
