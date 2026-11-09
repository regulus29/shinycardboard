import { describe, expect, it } from 'vitest';
import { buildCatalog, buildCatalogDetailed } from './build';
import { normalizeLegendName } from './legends';
import { rawCard, REAL_DATA_AVAILABLE, loadRealRaw } from './test-data';

const BUILT_AT = 'test';
const IMAGE_A = 'https://img.example/a.png?v=1';
const IMAGE_B = 'https://img.example/b.png';

const variantsByRid = (records: Parameters<typeof buildCatalog>[0]) =>
  Object.fromEntries(Object.values(buildCatalog(records, BUILT_AT).printings).map((p) => [p.riftboundId, p.variant]));

describe('promo reprints versus alternate art', () => {
  const standard = rawCard({ id: 's', name: 'Caitlyn', riftbound_id: 'ogn-068-298', collector_number: 68, set: { set_id: 'OGN', label: 'Origins' }, media: { image_url: IMAGE_A } });
  const reprint = rawCard({ id: 'p', name: 'Caitlyn', riftbound_id: 'pr-068a-298', collector_number: 68, set: { set_id: 'PR', label: 'Promos' }, media: { image_url: IMAGE_A } });
  const different = rawCard({ id: 'q', name: 'Caitlyn', riftbound_id: 'pr-069a-298', collector_number: 69, set: { set_id: 'PR', label: 'Promos' }, media: { image_url: IMAGE_B } });

  it('keeps a marked record as alternate art only when its artwork differs from the unmarked printing', () => {
    const catalog = buildCatalog([standard, reprint, different], BUILT_AT);
    expect(catalog.printings['pr-068a-298-alternate-art']).toMatchObject({ variant: 'other', variantLabel: 'Promo' });
    expect(catalog.printings['pr-069a-298-alternate-art']).toMatchObject({ variant: 'alternate-art', variantLabel: 'Alternate Art' });
  });

  it('gives the marked record the same key whether or not its sibling is present', () => {
    const withSibling = Object.keys(buildCatalog([standard, reprint], BUILT_AT).printings);
    const alone = Object.keys(buildCatalog([reprint], BUILT_AT).printings);
    expect(variantsByRid([reprint])).toEqual({ 'pr-068a-298': 'alternate-art' });
    expect(withSibling).toContain('pr-068a-298-alternate-art');
    expect(alone).toEqual(['pr-068a-298-alternate-art']);
  });

  it.skipIf(!REAL_DATA_AVAILABLE)('relabels the real promo reprints and keeps real alternate art', () => {
    const catalog = buildCatalog(loadRealRaw(), BUILT_AT);
    const promos = Object.values(catalog.printings).filter((p) => p.variantLabel === 'Promo');
    expect(promos.map((p) => p.riftboundId).sort()).toEqual(
      ['opp-118a-221', 'pr-068a-298', 'pr-111a-298', 'pr-159a-298', 'pr-246a-298', 'pr-276a-298', 'pr-278a-298', 'pr-293a-298'].sort(),
    );
    expect(catalog.printings['pr-263a-298-alternate-art']?.variant).toBe('alternate-art');
  });
});

describe('card key stability', () => {
  it('never renames the first card when a namesake with different rules arrives', () => {
    const first = rawCard({ id: 'aaa', name: 'Twin', riftbound_id: 'tst-001-100', collector_number: 1 });
    const second = rawCard({ id: 'bbb', name: 'Twin', riftbound_id: 'tst-002-100', collector_number: 2, classification: { type: 'Spell' } });
    const before = Object.keys(buildCatalog([first], BUILT_AT).cards);
    const after = buildCatalog([second, first], BUILT_AT);
    expect(before).toEqual(['twin']);
    expect(after.printings['tst-001-100-standard']?.cardKey).toBe('twin');
    expect(after.printings['tst-002-100-standard']?.cardKey).toMatch(/^twin-spell/);
  });
});

describe('duplicate resolution', () => {
  it('prefers the smallest source id, not the most recently updated record', () => {
    const records = [
      rawCard({ id: 'zzz', name: 'Same', riftbound_id: 'tst-005-100', collector_number: 5, media: { image_url: IMAGE_A }, metadata: { updated_on: '2030-01-01' } }),
      rawCard({ id: 'aaa', name: 'Same', riftbound_id: 'tst-005-100', collector_number: 5, media: { image_url: IMAGE_A }, metadata: { updated_on: '2000-01-01' } }),
    ];
    const { report } = buildCatalogDetailed(records, BUILT_AT);
    expect(report.duplicatesDropped).toEqual([{ kept: 'aaa', dropped: 'zzz', reason: 'same-printing' }]);
  });

  it('does not merge different cards that share artwork but have different source ids', () => {
    const records = [
      rawCard({ id: 'a', name: 'Rune One', riftbound_id: 'tst-001-100', collector_number: 1, media: { image_url: IMAGE_A } }),
      rawCard({ id: 'b', name: 'Rune Two', riftbound_id: 'tst-002-100', collector_number: 2, media: { image_url: IMAGE_A } }),
    ];
    const { catalog, report } = buildCatalogDetailed(records, BUILT_AT);
    expect(Object.keys(catalog.printings)).toHaveLength(2);
    expect(report.duplicatesDropped).toEqual([]);
  });
});

describe('legacy key aliases', () => {
  it('does not alias an old key that named more than one printing', () => {
    const records = [
      // Two promo cards share set, number and variant, so the old key was ambiguous.
      rawCard({ id: 'a', name: 'One', riftbound_id: 'tst-001-298', collector_number: 1 }),
      rawCard({ id: 'b', name: 'Two', riftbound_id: 'tst-001-221', collector_number: 1 }),
      rawCard({ id: 'c', name: 'Three', riftbound_id: 'tst-002-298', collector_number: 2 }),
    ];
    const { report } = buildCatalogDetailed(records, BUILT_AT);
    expect(report.keyAliases).toEqual({ 'tst-002-standard': 'tst-002-298-standard' });
  });
});

describe('legend names', () => {
  it('drops the descriptor before the champion', () => {
    expect(normalizeLegendName('Yordle, Kennen - Heart of the Tempest')).toBe('Kennen - Heart of the Tempest');
    expect(normalizeLegendName('Vi - Piltover Enforcer')).toBe('Vi - Piltover Enforcer');
    expect(normalizeLegendName('Defender of Tomorrow')).toBe('Defender of Tomorrow');
  });

  it('merges the descriptor form with the plain form into one card', () => {
    const legend = (id: string, name: string, rid: string, n: number) =>
      rawCard({ id, name, riftbound_id: rid, collector_number: n, classification: { type: 'Legend' } });
    const catalog = buildCatalog(
      [legend('a', 'Yordle, Kennen - Heart of the Tempest', 'tst-155-166', 155), legend('b', 'Kennen - Heart of the Tempest', 'tst-197-166', 197)],
      BUILT_AT,
    );
    expect(Object.keys(catalog.cards)).toEqual(['kennen-heart-of-the-tempest']);
  });

  it.skipIf(!REAL_DATA_AVAILABLE)('has no descriptor-prefixed legend names in the real data', () => {
    const catalog = buildCatalog(loadRealRaw(), BUILT_AT);
    for (const card of Object.values(catalog.cards).filter((c) => c.type === 'Legend')) {
      expect(card.name.split(' - ')[0], card.name).not.toContain(', ');
    }
  });
});
