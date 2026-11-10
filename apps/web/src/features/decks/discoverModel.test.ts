import { describe, expect, it } from 'vitest';
import type { Deck } from '@sc/core';
import { discoverLegends, ownedAfterDecks } from './discoverModel';
import { makeTestCatalog, ownedRow, viCollection } from './testCatalog';

const catalog = makeTestCatalog();
const deckFor = (legendKey: string, main: Deck['main'] = []): Deck => ({ id: legendKey, updatedAt: 1, name: legendKey, legendKey, main, runes: [], battlefields: [], sideboard: [] });

describe('discoverLegends', () => {
  it('lists a legend that has no deck yet', () => {
    const keys = discoverLegends(catalog, viCollection(), []).map((r) => r.legendKey);
    expect(keys).toContain('vi-legend');
  });

  it('hides a legend that already has a deck when no spare legend copy exists', () => {
    const keys = discoverLegends(catalog, viCollection(), [deckFor('vi-legend')]).map((r) => r.legendKey);
    expect(keys).not.toContain('vi-legend');
  });
});

describe('ownedAfterDecks', () => {
  it('removes copies that existing decks claim', () => {
    const owned = [ownedRow('vi-legend', 1), ownedRow('vi-champ', 3)];
    const left = ownedAfterDecks(owned, [deckFor('vi-legend', [{ cardKey: 'vi-champ', count: 2 }])], catalog);
    expect(left.find((e) => e.printingKey.startsWith('vi-legend'))).toBeUndefined();
    expect(left.find((e) => e.printingKey.startsWith('vi-champ'))?.quantity).toBe(1);
  });
});
