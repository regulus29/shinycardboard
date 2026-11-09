/** Synchronous best-effort copy of an unsaved draft, for when the page unloads before IndexedDB finishes. */
import type { Deck } from '@sc/core';
import { DRAFT_STORAGE_PREFIX } from './constants';

export interface DraftCopy {
  deck: Deck;
  savedAt: number;
}

export function writeDraftCopy(deck: Deck, now: number = Date.now()): void {
  try {
    localStorage.setItem(DRAFT_STORAGE_PREFIX + deck.id, JSON.stringify({ deck, savedAt: now } satisfies DraftCopy));
  } catch {
    // Storage may be full or blocked; the normal save path still runs.
  }
}

export function readDraftCopy(deckId: string): DraftCopy | undefined {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_PREFIX + deckId);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const { deck, savedAt } = parsed as Partial<DraftCopy>;
    return deck && typeof deck.id === 'string' && typeof savedAt === 'number' ? { deck, savedAt } : undefined;
  } catch {
    return undefined;
  }
}

export function clearDraftCopy(deckId: string): void {
  try {
    localStorage.removeItem(DRAFT_STORAGE_PREFIX + deckId);
  } catch {
    // Nothing to clear when storage is blocked.
  }
}
