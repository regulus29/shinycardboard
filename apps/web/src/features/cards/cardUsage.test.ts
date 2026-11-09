import { describe, expect, it } from 'vitest';
import { runSearch, type Deck } from '@sc/core';
import { FIXTURE_CATALOG } from '../collection/testFixture';
import { deckUsage, neighborsOf } from './cardUsage';

const deck = (id: string, name: string, patch: Partial<Deck>): Deck => ({ id, name, updatedAt: 1, main: [], runes: [], battlefields: [], sideboard: [], ...patch });

describe('deckUsage', () => {
  it('sums copies across zones, includes the legend and sorts by count', () => {
    const decks = [
      deck('1', 'Zed', { main: [{ cardKey: 'vi', count: 2 }], sideboard: [{ cardKey: 'vi', count: 1 }] }),
      deck('2', 'Alpha', { legendKey: 'vi' }),
      deck('3', 'Other', { main: [{ cardKey: 'tide', count: 3 }] }),
    ];
    expect(deckUsage(decks, 'vi')).toEqual([
      { deckId: '1', name: 'Zed', count: 3 },
      { deckId: '2', name: 'Alpha', count: 1 },
    ]);
    expect(deckUsage(decks, 'nobody')).toEqual([]);
  });
});

describe('neighborsOf', () => {
  const hits = runSearch('', FIXTURE_CATALOG, { owned: [], tagsByCard: {}, decksByCard: {} }, { sort: 'name' }).hits;

  it('finds the previous and next printing in list order', () => {
    const middle = hits[2]!.printing.printingKey;
    expect(neighborsOf(hits, middle)).toMatchObject({ index: 2, total: 6, previous: hits[1]!.printing.printingKey, next: hits[3]!.printing.printingKey });
  });

  it('has no previous at the start, no next at the end, and null for unknown keys', () => {
    expect(neighborsOf(hits, hits[0]!.printing.printingKey)?.previous).toBeNull();
    expect(neighborsOf(hits, hits[5]!.printing.printingKey)?.next).toBeNull();
    expect(neighborsOf(hits, 'nope')).toBeNull();
  });
});
