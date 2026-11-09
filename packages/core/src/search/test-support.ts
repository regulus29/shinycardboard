// Test support only: hand built user state and small catalog helpers shared by the search tests.
import type { Catalog, OwnedEntry } from '../types';
import { runSearch, type SearchContext } from './search';

export const EMPTY: SearchContext = { owned: [], tagsByCard: {}, decksByCard: {} };

function ownedEntry(id: string, printingKey: string, quantity: number, finish: OwnedEntry['finish'] = 'normal', deleted = false): OwnedEntry {
  return { id, updatedAt: 1, printingKey, finish, condition: 'NM', quantity, ...(deleted ? { deleted: true } : {}) };
}

/** Hand built user state: two owned printings, a tombstoned one, tags and a deck. */
export const USER: SearchContext = {
  owned: [
    ownedEntry('o1', 'unl-029-219-standard', 1),
    ownedEntry('o2', 'unl-029-219-standard', 2, 'foil'),
    ownedEntry('o3', 'ogn-042-298-standard', 1),
    ownedEntry('o4', 'unl-029a-219-alternate-art', 5, 'normal', true),
  ],
  tagsByCard: { 'red-brambleback': ['aggro package', 'Burn'], 'calm-rune': ['mana'] },
  decksByCard: { 'red-brambleback': ['Fury Ramp'], 'bewitching-spirit': ['Fury Ramp', 'Mind Tempo'] },
};

export const keys = (query: string, catalog: Catalog, ctx: SearchContext = EMPTY) =>
  runSearch(query, catalog, ctx).hits.map((hit) => hit.printing.printingKey);

export const allPrintings = (catalog: Catalog) => Object.values(catalog.printings);
export const cardOf = (catalog: Catalog, key: string) => catalog.cards[catalog.printings[key]?.cardKey ?? ''];
