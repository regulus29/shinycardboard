import { describe, expect, it } from 'vitest';
import type { Catalog, RiftcodexCard } from '../types';
import { buildCatalog, buildCatalogDetailed } from './build';
import { assignPrintingKeys, legacyKey } from './keys';
import { comparePrintings, setRank } from './order';
import { cleanRulesText, parseKeywords } from './text';
import { loadFixtureRaw, loadRealRaw, rawCard, REAL_DATA_AVAILABLE, REAL_DATA_SKIP_REASON } from './test-data';
import { findLostKeys } from './stability';
import { findDuplicateLegends, findDuplicateStandards, validateCatalog } from './validate';
import { legendTitle } from './legends';
import { splitName } from './variant';

const BUILT_AT = 'test';

function reordered<T>(items: T[]): T[] {
  // Deterministic reorder (reverse then interleave) is enough to prove order independence.
  const reversed = [...items].reverse();
  return reversed.filter((_, i) => i % 2 === 0).concat(reversed.filter((_, i) => i % 2 === 1));
}

const keyBySource = (catalog: Catalog) =>
  Object.fromEntries(Object.values(catalog.printings).map((p) => [p.sourceId, p.printingKey]));

describe('name and variant rules', () => {
  it('strips every parenthetical but keeps numbers out of variants', () => {
    expect(splitName('Red Brambleback (Alternate Art)')).toEqual({
      baseName: 'Red Brambleback',
      suffixes: ['Alternate Art'],
    });
    expect(splitName('Recruit (271) // Buff')).toEqual({ baseName: 'Recruit // Buff', suffixes: [] });
  });

  it('derives variants from flags first, then name suffix, and keys from the source id', () => {
    const catalog = buildCatalog(
      [
        rawCard({ name: 'A' }),
        rawCard({ name: 'A (Alternate Art)', riftbound_id: 'tst-001a-100', metadata: { alternate_art: true } }),
        rawCard({ name: 'A (Overnumbered)', riftbound_id: 'tst-001*-100', collector_number: 99, metadata: { overnumbered: true } }),
        rawCard({ name: 'A (Signature)', riftbound_id: 'tst-002*-100', collector_number: 98, metadata: { signature: true } }),
        rawCard({ name: 'A (Metal)', collector_number: 1 }),
        rawCard({ name: 'A (Launch Exclusive)', riftbound_id: 'tst-003-100', collector_number: 3 }),
      ],
      BUILT_AT,
    );
    const byKey = catalog.printings;
    expect(Object.keys(byKey).sort()).toEqual([
      'tst-001-100-metal',
      'tst-001-100-standard',
      'tst-001a-100-alternate-art',
      'tst-001x-100-overnumbered',
      'tst-002x-100-signature',
      'tst-003-100-launch-exclusive',
    ]);
    expect(byKey['tst-001-100-standard']?.variantLabel).toBeNull();
    expect(byKey['tst-001a-100-alternate-art']?.variantLabel).toBe('Alternate Art');
    expect(byKey['tst-001-100-metal']).toMatchObject({ variant: 'metal', variantLabel: 'Metal', riftboundId: 'tst-001-100' });
    expect(byKey['tst-003-100-launch-exclusive']).toMatchObject({ variant: 'other', variantLabel: 'Launch Exclusive' });
    expect(catalog.cards.a?.printingKeys[0]).toBe('tst-001-100-standard');
  });

  it('infers overnumbered above the set size and alternate art from the id marker', () => {
    const catalog = buildCatalog(
      [
        rawCard({ name: 'B', riftbound_id: 'tst-166-166', collector_number: 166 }),
        rawCard({ name: 'B', riftbound_id: 'tst-167-166', collector_number: 167, tcgplayer_id: '1' }),
        rawCard({ name: 'B', riftbound_id: 'tst-010a-166', collector_number: 10 }),
        rawCard({ name: 'C (Ultimate)', riftbound_id: 'tst-238-219', collector_number: 238 }),
      ],
      BUILT_AT,
    );
    const variants = Object.fromEntries(Object.values(catalog.printings).map((p) => [p.riftboundId, p.variant]));
    expect(variants).toEqual({
      'tst-166-166': 'standard',
      'tst-167-166': 'overnumbered',
      'tst-010a-166': 'alternate-art',
      'tst-238-219': 'other',
    });
  });
});

describe('cardKey rule', () => {
  it('merges printings and punctuation variants of one name', () => {
    const catalog = buildCatalog(
      [
        rawCard({ name: "Kha'Zix - Voidreaver", riftbound_id: 'tst-001-1' }),
        rawCard({ name: "Kha'Zix - Voidreaver (Signature)", riftbound_id: 'tst-009*-1', collector_number: 9, metadata: { signature: true } }),
        rawCard({ name: 'Vi - Destructive', riftbound_id: 'tst-002-1', collector_number: 2 }),
        rawCard({ name: 'Vi, Destructive', riftbound_id: 'tst-003-1', collector_number: 3 }),
      ],
      BUILT_AT,
    );
    expect(Object.keys(catalog.cards).sort()).toEqual(['khazix-voidreaver', 'vi-destructive']);
    expect(catalog.cards['khazix-voidreaver']?.printingKeys).toHaveLength(2);
    expect(catalog.cards['vi-destructive']?.printingKeys).toHaveLength(2);
  });

  it('keeps same-name cards with different rules apart', () => {
    const catalog = buildCatalog(
      [
        rawCard({ name: 'Twin', riftbound_id: 'tst-001-1', classification: { type: 'Unit' } }),
        rawCard({ name: 'Twin', riftbound_id: 'tst-002-1', collector_number: 2, classification: { type: 'Spell' }, attributes: { might: null, power: null } }),
        rawCard({ name: 'Twin (Alternate Art)', riftbound_id: 'tst-003a-1', collector_number: 3, metadata: { alternate_art: true } }),
      ],
      BUILT_AT,
    );
    const keys = Object.keys(catalog.cards);
    expect(keys).toHaveLength(2);
    expect(keys.map((key) => catalog.cards[key]?.type).sort()).toEqual(['Spell', 'Unit']);
    expect(validateCatalog(catalog)).toEqual([]);
  });

  it('never merges same-name cards in the fixture and real data', () => {
    const datasets = [loadFixtureRaw(), ...(REAL_DATA_AVAILABLE ? [loadRealRaw()] : [])];
    for (const raw of datasets) {
      const bySource = new Map(raw.map((r) => [r.id, r]));
      const catalog = buildCatalog(raw, BUILT_AT);
      for (const card of Object.values(catalog.cards)) {
        const signatures = new Set(
          card.printingKeys.map((key) => {
            const source = bySource.get(catalog.printings[key]?.sourceId ?? '');
            return [source?.classification.type, source?.attributes.energy, source?.attributes.might, source?.classification.domain.join()].join('|');
          }),
        );
        expect(signatures.size, card.cardKey).toBe(1);
      }
    }
  });

  it('merges a legend recorded both as "Champion - Title" and as "Title"', () => {
    const legend = (name: string, rid: string, n: number) =>
      rawCard({ name, riftbound_id: rid, collector_number: n, classification: { type: 'Legend' }, tags: ['Jayce'] });
    const catalog = buildCatalog(
      [legend('Jayce - Defender of Tomorrow', 'tst-149-166', 149), legend('Defender of Tomorrow', 'tst-194-166', 194)],
      BUILT_AT,
    );
    expect(Object.keys(catalog.cards)).toEqual(['jayce-defender-of-tomorrow']);
    expect(Object.keys(catalog.printings)).toHaveLength(2);
    expect(findDuplicateLegends(catalog)).toEqual([]);
    expect(legendTitle('Jayce - Defender of Tomorrow')).toBe('Defender of Tomorrow');
  });

  it('unions tags across printings, representative first', () => {
    const catalog = buildCatalog(
      [
        rawCard({ name: 'T', riftbound_id: 'tst-001-1', tags: ['Vi', 'Piltover'] }),
        rawCard({ name: 'T (Alternate Art)', riftbound_id: 'tst-001a-1', metadata: { alternate_art: true }, tags: ['Piltover', 'Enforcer'] }),
      ],
      BUILT_AT,
    );
    expect(catalog.cards.t?.tags).toEqual(['Vi', 'Piltover', 'Enforcer']);
  });
});

describe('printing keys', () => {
  const base = [
    rawCard({ name: 'Alpha', riftbound_id: 'tst-001-298', collector_number: 1, id: 'a1' }),
    rawCard({ name: 'Beta', riftbound_id: 'tst-002-298', collector_number: 2, id: 'a2' }),
    rawCard({ name: 'Gamma', riftbound_id: 'tst-003-024', collector_number: 3, id: 'a3' }),
  ];

  it('stays stable when records are added, removed, edited or reordered', () => {
    const before = keyBySource(buildCatalog(base, BUILT_AT));
    const added = [
      ...base,
      // A new promo reusing an existing collector number must not rename anything.
      rawCard({ name: 'Delta', riftbound_id: 'tst-001-221', collector_number: 1, id: 'a0' }),
      rawCard({ name: 'Alpha (Alternate Art)', riftbound_id: 'tst-001a-298', collector_number: 1, id: 'a9', metadata: { alternate_art: true } }),
    ];
    const removed = base.filter((r) => r.id !== 'a2');
    const edited = base.map((r) => (r.id === 'a1' ? { ...r, name: 'Alfa', text: { ...r.text, plain: 'typo fixed' } } : r));
    for (const records of [added, removed, edited, reordered(base)]) {
      const after = keyBySource(buildCatalog(records, BUILT_AT));
      for (const [source, key] of Object.entries(before)) {
        if (source in after) expect(after[source], source).toBe(key);
      }
    }
    expect(Object.values(before).sort()).toEqual(['tst-001-298-standard', 'tst-002-298-standard', 'tst-003-024-standard']);
  });

  it('gives the oldest record the base key and suffixes the rest by their own identity', () => {
    const records = [
      rawCard({ name: 'Dup', riftbound_id: 'tst-005-100', collector_number: 5, id: 'zzz-newer', tcgplayer_id: '777' }),
      rawCard({ name: 'Dup', riftbound_id: 'tst-005-100', collector_number: 5, id: 'aaa-older' }),
    ];
    const forward = keyBySource(buildCatalog(records, BUILT_AT));
    expect(forward).toEqual({ 'aaa-older': 'tst-005-100-standard', 'zzz-newer': 'tst-005-100-standard-t777' });
    expect(keyBySource(buildCatalog([...records].reverse(), BUILT_AT))).toEqual(forward);
    const { report } = buildCatalogDetailed(records, BUILT_AT);
    expect(report.disambiguatedKeys).toBe(1);
  });

  it('throws on a truly identical identity rather than overwriting', () => {
    const input = { setId: 'TST', variantSlug: 'standard', tcgplayerId: null, riftboundId: 'tst-1-1', sourceId: 'same' };
    expect(() => assignPrintingKeys([input, { ...input }, { ...input }])).toThrow(/unique printing key/);
  });

  it('reports lost keys unless an alias covers them', () => {
    const previous = buildCatalog(base, BUILT_AT);
    const next = buildCatalog(base.slice(1), BUILT_AT);
    expect(findLostKeys(previous, next)).toEqual(['tst-001-298-standard']);
    expect(findLostKeys(previous, { ...next, keyAliases: { 'tst-001-298-standard': 'tst-002-298-standard' } })).toEqual([]);
  });

  it('aliases the old key format to the new keys where unambiguous', () => {
    const { report } = buildCatalogDetailed(base, BUILT_AT);
    expect(report.keyAliases).toEqual({
      'tst-001-standard': 'tst-001-298-standard',
      'tst-002-standard': 'tst-002-298-standard',
      'tst-003-standard': 'tst-003-024-standard',
    });
    expect(legacyKey({ setId: 'UNL', collectorNumber: 29, variantSlug: 'alternate-art' })).toBe('unl-029-alternate-art');
  });
});

describe('duplicate and phantom records', () => {
  const IMAGE = 'https://img.example/same.png?v=1';

  it('collapses the same printing listed twice, preferring the TCGplayer record', () => {
    const { catalog, report } = buildCatalogDetailed(
      [
        rawCard({ id: 'old', name: 'Rogue Assassin', riftbound_id: 'tst-005-100', collector_number: 5, media: { image_url: IMAGE } }),
        rawCard({ id: 'new', name: 'Akali - Rogue Assassin', riftbound_id: 'tst-005-100', collector_number: 5, tcgplayer_id: '99', media: { image_url: IMAGE } }),
      ],
      BUILT_AT,
    );
    expect(report.duplicatesDropped).toEqual([{ kept: 'new', dropped: 'old', reason: 'same-printing' }]);
    expect(Object.keys(catalog.cards)).toEqual(['akali-rogue-assassin']);
    expect(catalog.printings['tst-005-100-standard']?.sourceId).toBe('new');
  });

  it('drops stale standard phantoms that share artwork with a real variant', () => {
    const { catalog, report } = buildCatalogDetailed(
      [
        rawCard({ id: 'real', name: 'Shen (Alternate Art)', riftbound_id: 'tst-042-166', collector_number: 42, tcgplayer_id: '5', metadata: { alternate_art: true }, media: { image_url: IMAGE } }),
        rawCard({ id: 'ghost', name: 'Shen', riftbound_id: 'tst-042-166', collector_number: 42, media: { image_url: IMAGE } }),
      ],
      BUILT_AT,
    );
    expect(report.duplicatesDropped.map((d) => d.reason)).toEqual(['stale-standard']);
    expect(Object.values(catalog.printings).map((p) => p.variant)).toEqual(['alternate-art']);
    expect(findDuplicateStandards(catalog)).toEqual([]);
  });

  it('keeps a metal printing that shares artwork with its base, and drops one TCGplayer product listed twice', () => {
    const { catalog, report } = buildCatalogDetailed(
      [
        rawCard({ id: 'base', name: 'Lux', riftbound_id: 'tst-014-24', collector_number: 14, tcgplayer_id: '1', media: { image_url: IMAGE } }),
        rawCard({ id: 'metal', name: 'Lux (Metal)', riftbound_id: 'tst-014-24', collector_number: 14, tcgplayer_id: '2', media: { image_url: IMAGE } }),
        rawCard({ id: 'p1', name: 'Viktor', riftbound_id: 'tst-246a-298', collector_number: 246, tcgplayer_id: '8', media: { image_url: 'https://img.example/v.png' } }),
        rawCard({ id: 'p2', name: 'Viktor', riftbound_id: 'tst-246b-298', collector_number: 246, tcgplayer_id: '8', media: { image_url: 'https://img.example/v.png' } }),
      ],
      BUILT_AT,
    );
    expect(Object.values(catalog.printings).filter((p) => p.cardKey === 'lux')).toHaveLength(2);
    expect(report.duplicatesDropped).toMatchObject([{ reason: 'same-tcgplayer-id' }]);
  });

  it('skips records it cannot model and reports them', () => {
    const { catalog, report } = buildCatalogDetailed(
      [rawCard({ name: 'Ok' }), rawCard({ name: 'Odd', riftbound_id: 'tst-002-1', collector_number: 2, classification: { type: 'Vehicle' } })],
      BUILT_AT,
    );
    expect(Object.keys(catalog.cards)).toEqual(['ok']);
    expect(report.skipped).toMatchObject([{ name: 'Odd', reason: 'unknown card type "Vehicle"' }]);
  });
});

describe('set order', () => {
  it('puts unknown new sets after main sets and before promo sets', () => {
    const ids = ['PR', 'ZZZ', 'UNL', 'OPP', 'NEW', 'OGN', 'JDG', 'VEN'];
    const ordered = [...ids].sort((a, b) => setRank(a) - setRank(b) || a.localeCompare(b));
    expect(ordered).toEqual(['OGN', 'UNL', 'VEN', 'NEW', 'ZZZ', 'OPP', 'PR', 'JDG']);
    const a = { setId: 'NEW', collectorNumber: 2, variant: 'standard' as const, printingKey: 'x' };
    expect(comparePrintings(a, { ...a, collectorNumber: 1 })).toBeGreaterThan(0);
  });
});

describe('rules text and keywords', () => {
  it('prefers rich text, keeps paragraphs and decodes entities', () => {
    const text = cleanRulesText('<p>[Deathknell][&gt;] Draw 1.<br />[Assault 2] (+2 :rb_might:)</p>', null);
    expect(text).toBe('[Deathknell][>] Draw 1.\n[Assault 2] (+2 :rb_might:)');
    expect(cleanRulesText(null, '[NO TEXT]')).toBe('');
  });

  it('parses keywords with numbers, ignoring effect words', () => {
    expect(parseKeywords('[Assault 2][Ganking] [Buff] a unit. [Level 6][>] Quick. [Quick-Draw]')).toEqual([
      'Assault',
      'Ganking',
      'Quick-Draw',
    ]);
  });

  it('flags unknown bracket terms in the report but not known effect words', () => {
    const { report } = buildCatalogDetailed(
      [rawCard({ text: { rich: '<p>[Buff] a unit. [Zoomies] now. [Assault]</p>', plain: '' } })],
      BUILT_AT,
    );
    expect(report.unrecognizedTerms).toEqual({ Zoomies: 1 });
    expect(report.unrecognizedTermCount).toBe(1);
  });
});

describe('fixture catalog', () => {
  const raw = loadFixtureRaw();
  const { catalog, report } = buildCatalogDetailed(raw, BUILT_AT);

  it('is consistent and covers the variety the tests rely on', () => {
    expect(validateCatalog(catalog)).toEqual([]);
    expect(raw.length).toBeGreaterThanOrEqual(150);
    expect(raw.length).toBeLessThanOrEqual(250);
    const printings = Object.values(catalog.printings);
    expect(new Set(printings.map((p) => p.setId)).size).toBe(8);
    expect(new Set(printings.map((p) => p.variant))).toEqual(
      new Set(['standard', 'alternate-art', 'overnumbered', 'signature', 'metal', 'other']),
    );
    const cards = Object.values(catalog.cards);
    expect(new Set(cards.map((c) => c.type)).size).toBe(6);
    expect(cards.some((c) => c.domains.includes('Colorless'))).toBe(true);
    expect(cards.some((c) => c.energy === null)).toBe(true);
    expect(cards.some((c) => c.might === null)).toBe(true);
  });

  it('exercises the duplicate rules and the unflagged overnumbered inference', () => {
    const reasons = new Set(report.duplicatesDropped.map((d) => d.reason));
    expect(reasons).toEqual(new Set(['same-printing', 'same-tcgplayer-id']));
    const inferred = raw.filter((r) => !r.metadata.overnumbered && !r.name.includes('(') && r.collector_number > 166 && r.set.set_id === 'VEN');
    expect(inferred.length).toBeGreaterThan(0);
    for (const record of inferred) {
      const key = keyBySource(catalog)[record.id];
      if (key) expect(key.endsWith('-overnumbered'), key).toBe(true);
    }
  });

  it('lists the standard printing first and counts sets', () => {
    const brambleback = catalog.cards['red-brambleback'];
    expect(brambleback?.printingKeys).toEqual(['unl-029-219-standard', 'unl-029a-219-alternate-art']);
    expect(brambleback?.keywords).toEqual(['Accelerate']);
    expect(catalog.sets.reduce((sum, set) => sum + set.count, 0)).toBe(Object.keys(catalog.printings).length);
    expect(catalog.sets.map((s) => s.setId).slice(0, 4)).toEqual(['OGN', 'OGS', 'SFD', 'UNL']);
  });

  it('is order independent', () => {
    expect(buildCatalog(reordered(raw), BUILT_AT)).toEqual(catalog);
  });
});

describe.skipIf(!REAL_DATA_AVAILABLE)(`real dataset${REAL_DATA_AVAILABLE ? '' : ` (skipped: ${REAL_DATA_SKIP_REASON})`}`, () => {
  const raw: RiftcodexCard[] = REAL_DATA_AVAILABLE ? loadRealRaw() : [];
  const { catalog, report } = REAL_DATA_AVAILABLE ? buildCatalogDetailed(raw, BUILT_AT) : ({} as ReturnType<typeof buildCatalogDetailed>);

  it('builds a consistent catalog with no skipped records', () => {
    expect(validateCatalog(catalog)).toEqual([]);
    expect(report.skipped).toEqual([]);
    expect(report.printingCount + report.duplicatesDropped.length).toBe(raw.length);
    expect(report.disambiguatedKeys).toBe(0);
  });

  it('has no phantom standard printings and no duplicate legends', () => {
    expect(findDuplicateStandards(catalog)).toEqual([]);
    expect(findDuplicateLegends(catalog)).toEqual([]);
    // A standard record without a TCGplayer id must not share set, source id and artwork with another printing.
    const byArtwork = new Map<string, string[]>();
    for (const p of Object.values(catalog.printings)) {
      const key = [p.setId, p.riftboundId, p.imageUrl.split('?')[0]].join('|');
      byArtwork.set(key, [...(byArtwork.get(key) ?? []), p.printingKey]);
    }
    for (const p of Object.values(catalog.printings)) {
      const key = [p.setId, p.riftboundId, p.imageUrl.split('?')[0]].join('|');
      if (p.variant === 'standard' && p.tcgplayerId === null) expect(byArtwork.get(key), p.printingKey).toHaveLength(1);
    }
  });

  it('drops duplicates only when they share artwork or a TCGplayer product', () => {
    const byId = new Map(raw.map((r) => [r.id, r]));
    const image = (r?: RiftcodexCard) => r?.media.image_url.split('?')[0];
    for (const { kept, dropped } of report.duplicatesDropped) {
      const [a, b] = [byId.get(kept), byId.get(dropped)];
      const sameArt = a?.riftbound_id === b?.riftbound_id && image(a) === image(b);
      const sameProduct = a?.tcgplayer_id !== null && a?.tcgplayer_id === b?.tcgplayer_id;
      expect(sameArt || sameProduct, `${a?.name} / ${b?.name}`).toBe(true);
    }
  });

  it('infers overnumbered only for Vendetta cards above the set size', () => {
    const flagged = new Set(raw.filter((r) => r.metadata.overnumbered).map((r) => r.id));
    const inferred = Object.values(catalog.printings).filter(
      (p) => p.variant === 'overnumbered' && !flagged.has(p.sourceId),
    );
    // Unflagged records above the set size, except twins of a flagged overnumbered record (merged as duplicates).
    const flaggedIds = new Set(raw.filter((r) => r.metadata.overnumbered).map((r) => r.riftbound_id));
    const expectedInferred = new Set(
      raw
        .filter((r) => !flaggedIds.has(r.riftbound_id))
        .filter((r) => r.set.set_id === 'VEN' && !r.metadata.overnumbered && !r.metadata.alternate_art && !r.name.includes('(') && r.collector_number > 166)
        .map((r) => r.riftbound_id),
    );
    expect(inferred.length).toBe(expectedInferred.size);
    expect(inferred.length).toBeGreaterThan(15);
    expect(new Set(inferred.map((p) => p.setId))).toEqual(new Set(['VEN']));
    const promos = Object.values(catalog.printings).filter((p) => ['OPP', 'PR', 'JDG', 'OGS'].includes(p.setId));
    expect(promos.some((p) => p.variant === 'overnumbered')).toBe(false);
  });

  it('keeps every metal printing distinct from its base printing', () => {
    const rawMetal = new Set(raw.filter((r) => /\(Metal\)/.test(r.name)).map((r) => `${r.set.set_id}|${r.riftbound_id}`));
    const metal = Object.values(catalog.printings).filter((p) => p.variant === 'metal');
    expect(metal).toHaveLength(rawMetal.size);
    for (const printing of metal) expect(printing.printingKey.endsWith('-metal'), printing.printingKey).toBe(true);
  });

  it('has exactly one Legend card per legend title, and signature cards map to one champion', () => {
    const legends = Object.values(catalog.cards).filter((c) => c.type === 'Legend');
    const titles = legends.map((c) => legendTitle(c.name).toLowerCase());
    expect(new Set(titles).size).toBe(legends.length);
    const champions = new Set(legends.map((c) => (c.name.split(' - ')[0] ?? '').split(', ').pop()?.toLowerCase()));
    for (const card of Object.values(catalog.cards).filter((c) => c.supertype === 'Signature')) {
      const matched = card.tags.filter((tag) => champions.has(tag.toLowerCase()));
      expect(matched.length, `${card.name}: ${card.tags.join(',')}`).toBe(1);
    }
  });

  it('parses a sensible keyword set from the data', () => {
    const keywords = new Set(Object.values(catalog.cards).flatMap((c) => c.keywords));
    for (const expected of ['Assault', 'Shield', 'Tank', 'Accelerate', 'Deflect', 'Ganking', 'Hidden', 'Legion', 'Temporary', 'Vision']) {
      expect(keywords.has(expected), expected).toBe(true);
    }
    expect(report.unrecognizedTermCount).toBe(0);
  });

  it('keeps existing keys when records are removed or added', () => {
    const before = keyBySource(catalog);
    const subset = raw.filter((_, i) => i % 7 !== 0);
    const extra = rawCard({ id: 'brand-new', name: 'Brand New', riftbound_id: 'opp-001-999', set: { set_id: 'OPP', label: 'x' }, collector_number: 1 });
    for (const records of [subset, [...raw, extra]]) {
      const after = keyBySource(buildCatalog(records, BUILT_AT));
      let compared = 0;
      for (const [source, key] of Object.entries(after)) {
        if (source in before) {
          expect(key, source).toBe(before[source]);
          compared++;
        }
      }
      expect(compared).toBeGreaterThan(900);
    }
  });

  it('is order independent', () => {
    expect(buildCatalog(reordered(raw), BUILT_AT)).toEqual(catalog);
  });
});
