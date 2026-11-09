import { describe, expect, it } from 'vitest';
import type { Catalog } from '../types';
import { buildCatalog } from './build';
import { aliasPreviousCardKeys, aliasPreviousKeys, findLostCardKeys, findLostKeys, type CatalogWithAliases } from './stability';
import { rawCard } from './test-data';

const records = [
  rawCard({ id: 'a1', name: 'Alpha', riftbound_id: 'tst-001-298', collector_number: 1 }),
  rawCard({ id: 'b1', name: 'Beta', riftbound_id: 'tst-002-298', collector_number: 2 }),
  rawCard({ id: 'c1', name: 'Gamma', riftbound_id: 'tst-003-298', collector_number: 3 }),
];

/** A previous shipped catalog where Alpha had an old key and Beta had a duplicate record that is now merged. */
function doctoredPrevious(): CatalogWithAliases {
  const previous: CatalogWithAliases = structuredClone(buildCatalog(records, 'prev'));
  const alpha = previous.printings['tst-001-298-standard']!;
  delete previous.printings['tst-001-298-standard'];
  previous.printings['old-alpha'] = { ...alpha, printingKey: 'old-alpha' };
  previous.cards.alpha!.printingKeys = ['old-alpha'];
  const beta = previous.printings['tst-002-298-standard']!;
  previous.printings['old-beta-dup'] = { ...beta, printingKey: 'old-beta-dup', sourceId: 'b-dup' };
  previous.cards.beta!.printingKeys.push('old-beta-dup');
  previous.keyAliases = { 'oldest-alpha': 'old-alpha' };
  return previous;
}

describe('previous key aliases', () => {
  const next = buildCatalog(records, 'next');
  const dropped = [{ kept: 'b1', dropped: 'b-dup' }];

  it('aliases renamed keys through the source id and merged duplicates through the kept record', () => {
    const aliases = aliasPreviousKeys(doctoredPrevious(), next, dropped);
    expect(aliases).toMatchObject({
      'old-alpha': 'tst-001-298-standard',
      'old-beta-dup': 'tst-002-298-standard',
      // An alias from an older build keeps working after the key moves again.
      'oldest-alpha': 'tst-001-298-standard',
    });
    expect(findLostKeys(doctoredPrevious(), { ...next, keyAliases: aliases })).toEqual([]);
  });

  it('reports a key as lost when neither its record nor its merge target exists', () => {
    expect(findLostKeys(doctoredPrevious(), next)).toEqual(['old-alpha', 'old-beta-dup']);
    const withoutDrops = aliasPreviousKeys(doctoredPrevious(), next, []);
    expect(findLostKeys(doctoredPrevious(), { ...next, keyAliases: withoutDrops })).toEqual(['old-beta-dup']);
  });

  it('aliases vanished card keys to the card that holds their printings', () => {
    const previous = doctoredPrevious();
    previous.cards['old-name'] = { ...previous.cards.alpha!, cardKey: 'old-name' };
    const printingAliases = aliasPreviousKeys(previous, next, dropped);
    const cardAliases = aliasPreviousCardKeys(previous, next, printingAliases);
    expect(cardAliases).toEqual({ 'old-name': 'alpha' });
    expect(findLostCardKeys(previous, next)).toEqual(['old-name']);
    expect(findLostCardKeys(previous, { ...next, cardKeyAliases: cardAliases })).toEqual([]);
  });

  it('never invents an alias for a record that no longer exists', () => {
    const previous: Catalog = structuredClone(next);
    previous.printings['ghost'] = { ...previous.printings['tst-001-298-standard']!, printingKey: 'ghost', sourceId: 'gone' };
    expect(aliasPreviousKeys(previous, next, dropped)).not.toHaveProperty('ghost');
  });
});
