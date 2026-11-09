import { useLiveQuery } from 'dexie-react-hooks';
import type { CardTagging, Deck, OwnedEntry, SavedSearch } from '@sc/core';
import { db } from './db';
import { liveOnly } from './repo';
import { reportDbFailure } from './health';
import { RECENT_DECKS_LIMIT } from '../config/constants';

/*
 * Live, reactive reads. Each hook re-renders when the underlying rows change (including
 * writes from sync) and never includes tombstones.
 *
 * Loading contract: every hook returns `undefined` until its first read completes, so
 * "still loading" and "genuinely empty" (`[]`) are different states. A failed read is
 * logged, flips the shared database health state (see health.ts) and leaves the hook at
 * `undefined`; the app shell reacts by replacing the UI with the Storage unavailable screen,
 * so pages do not need their own failure branch.
 */

/** Live query that logs instead of throwing, so one bad read cannot crash the render tree. */
export function useLive<T>(query: () => Promise<T>, deps: unknown[]): T | undefined {
  return useLiveQuery(async () => {
    try {
      return await query();
    } catch (error) {
      console.error('Database read failed:', error);
      reportDbFailure('read'); // the shell swaps in the Storage unavailable screen
      return undefined;
    }
  }, deps);
}

/** All owned rows. */
export function useOwned(): OwnedEntry[] | undefined {
  return useLive(async () => liveOnly(await db.owned.toArray()), []);
}

/** Owned rows (all finishes and conditions) for one printing. */
export function useOwnedForPrinting(printingKey: string | undefined): OwnedEntry[] | undefined {
  return useLive(
    async () => (printingKey ? liveOnly(await db.owned.where('printingKey').equals(printingKey).toArray()) : []),
    [printingKey],
  );
}

/** All tagging records (one per tagged card). */
export function useTaggings(): CardTagging[] | undefined {
  return useLive(async () => liveOnly(await db.taggings.toArray()), []);
}

/** Distinct user tags with the number of cards using each, sorted alphabetically. */
export function useTagCounts(): { tag: string; count: number }[] | undefined {
  return useLive(async () => {
    const counts = new Map<string, number>();
    for (const row of liveOnly(await db.taggings.toArray())) {
      for (const tag of row.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => a.tag.localeCompare(b.tag));
  }, []);
}

/** All decks, most recently edited first. */
export function useDecks(): Deck[] | undefined {
  return useLive(async () => liveOnly(await db.decks.orderBy('updatedAt').reverse().toArray()), []);
}

/** The most recently edited decks, for sidebars and shortcuts. */
export function useRecentDecks(limit: number = RECENT_DECKS_LIMIT): Deck[] | undefined {
  return useDecks()?.slice(0, limit);
}

/**
 * One deck by id. Returns `undefined` while loading, `null` when it does not exist or was
 * deleted, so pages can tell "not found" from "still loading".
 */
export function useDeck(deckId: string | undefined): Deck | null | undefined {
  return useLive(async () => {
    if (!deckId) return null;
    const deck = await db.decks.get(deckId);
    return deck && !deck.deleted ? deck : null;
  }, [deckId]);
}

/** Saved searches, alphabetical. */
export function useSavedSearches(): SavedSearch[] | undefined {
  return useLive(async () => liveOnly(await db.savedSearches.toArray()).sort((a, b) => a.name.localeCompare(b.name)), []);
}
