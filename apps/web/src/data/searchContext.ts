import { useMemo } from 'react';
import type { CardTagging, Deck, DeckSlot, OwnedEntry, SearchContext } from '@sc/core';
import { db } from './db';
import { liveOnly } from './repo';
import { useLive } from './hooks';

function slotKeys(deck: Deck): string[] {
  const slots: DeckSlot[] = [...deck.main, ...deck.runes, ...deck.battlefields, ...deck.sideboard];
  const keys = slots.map((slot) => slot.cardKey);
  return deck.legendKey ? [deck.legendKey, ...keys] : keys;
}

/** Pure derivation of core's SearchContext from raw user data. */
export function buildSearchContext(owned: OwnedEntry[], taggings: CardTagging[], decks: Deck[]): SearchContext {
  const tagsByCard: Record<string, string[]> = {};
  for (const row of taggings) tagsByCard[row.cardKey] = row.tags;

  const decksByCard: Record<string, string[]> = {};
  for (const deck of decks) {
    for (const key of new Set(slotKeys(deck))) (decksByCard[key] ??= []).push(deck.name);
  }
  return { owned, tagsByCard, decksByCard };
}

/** One combined read: a single subscription and a single re-render per write across all three tables. */
function useUserSnapshot() {
  return useLive(async () => {
    const [owned, taggings, decks] = await Promise.all([db.owned.toArray(), db.taggings.toArray(), db.decks.toArray()]);
    return { owned: liveOnly(owned), taggings: liveOnly(taggings), decks: liveOnly(decks) };
  }, []);
}

/**
 * Live SearchContext for runSearch/suggest, or `undefined` until the first read completes.
 * Identity changes only when the underlying data does, so it is safe in dependency lists.
 */
export function useSearchContext(): SearchContext | undefined {
  const snapshot = useUserSnapshot();
  return useMemo(
    () => (snapshot ? buildSearchContext(snapshot.owned, snapshot.taggings, snapshot.decks) : undefined),
    [snapshot],
  );
}
