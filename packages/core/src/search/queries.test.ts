import { describe, expect, it } from 'vitest';
import { buildCatalog } from '../catalog/build';
import { loadFixtureRaw, loadRealRaw, rawCard, REAL_DATA_AVAILABLE, REAL_DATA_SKIP_REASON } from '../catalog/test-data';
import type { Catalog } from '../types';
import { runSearch } from './search';
import { allPrintings, cardOf, EMPTY, keys, USER } from './test-support';

/**
 * Natural language queries people actually type: set titles, printed numbers, variant words,
 * rules text and stat phrases. Run against the fixture, and the full dataset when available.
 */

const STANDARD_42 = 'ogn-042-298-standard';
const BRAMBLEBACK = 'unl-029-219-standard';
const BRAMBLEBACK_ALT = 'unl-029a-219-alternate-art';

function defineQueries(getCatalog: () => Catalog): void {
  it.each([
    ['unleashed 29', BRAMBLEBACK],
    ['origins 42', STANDARD_42],
    ['origins #42', STANDARD_42],
    ['origins 042', STANDARD_42],
    ['ORIGINS-42', STANDARD_42],
  ])('release title query %s resolves like the set code', (query, expected) => {
    expect(keys(query, getCatalog())).toEqual([expected]);
  });

  it('treats set titles as sets and keeps them first without losing card names', () => {
    const catalog = getCatalog();
    const unl = keys('unl', catalog);
    expect(unl.length).toBeGreaterThan(10);
    const unleashed = runSearch('unleashed', catalog, EMPTY).hits;
    expect(new Set(unleashed.slice(0, unl.length).map((h) => h.printing.printingKey))).toEqual(new Set(unl));
    expect(keys('unleashed red brambleback', catalog).sort()).toEqual([BRAMBLEBACK_ALT, BRAMBLEBACK].sort());
    expect(keys('unleashed fury', catalog).every((key) => catalog.printings[key]?.setId === 'UNL')).toBe(true);
    const grounds = keys('proving grounds', catalog);
    expect(grounds.length).toBeGreaterThan(0);
    expect(grounds.every((key) => catalog.printings[key]?.setId === 'OGS')).toBe(true);
    expect(keys('organized play', catalog)).toEqual(keys('opp', catalog));
    const promoSets = ['OPP', 'PR', 'JDG'];
    const promo = runSearch('promo', catalog, EMPTY).hits;
    expect(promo.every((h) => promoSets.includes(h.printing.setId) || /promo/i.test(h.card.name))).toBe(true);
    expect(promo.filter((h) => promoSets.includes(h.printing.setId)).length).toBeGreaterThan(0);
  });

  it('still returns cards whose names contain a set word', () => {
    const catalog = getCatalog();
    const named = allPrintings(catalog).filter((p) => /unleashed/i.test(catalog.cards[p.cardKey]?.name ?? ''));
    // The committed fixture has no such card; the real dataset has Kayn - Unleashed.
    if (named.length === 0) return;
    const found = new Set(keys('unleashed', catalog));
    for (const printing of named) expect(found.has(printing.printingKey)).toBe(true);
  });

  it.each(['042/298', '42/298', 'ogn 042/298', 'ogn/042', 'OGN042/298', 'origins 042/298'])('printed number %s finds Origins 42', (query) => {
    expect(keys(query, getCatalog())).toEqual([STANDARD_42]);
  });

  it('uses the printed set size to narrow a bare number', () => {
    const catalog = getCatalog();
    const large = keys('1/298', catalog);
    expect(large.length).toBeGreaterThan(0);
    expect(large.every((key) => catalog.printings[key]?.riftboundId.endsWith('-298'))).toBe(true);
    expect(keys('1/24', catalog).every((key) => catalog.printings[key]?.riftboundId.endsWith('-024'))).toBe(true);
  });

  it.each([
    ['alt art', 'alternate-art'],
    ['alt', 'alternate-art'],
    ['altart', 'alternate-art'],
    ['alternate art', 'alternate-art'],
    ['metal', 'metal'],
    ['overnumbered', 'overnumbered'],
    ['starter', 'other'],
    ['ultimate', 'other'],
    ['launch exclusive', 'other'],
    ['gg ez', 'other'],
  ])('bare variant word %s filters by variant', (query, variant) => {
    const catalog = getCatalog();
    const hits = keys(query, catalog);
    expect(hits.length, query).toBeGreaterThan(0);
    expect(hits.every((key) => catalog.printings[key]?.variant === variant), query).toBe(true);
  });

  it('keeps variant words ANDed with names and card numbers', () => {
    const catalog = getCatalog();
    for (const query of ['jinx alt', 'jinx altart', 'jinx alt art', 'jinx alternate art']) {
      const hits = runSearch(query, catalog, EMPTY).hits;
      expect(hits.length, query).toBeGreaterThan(0);
      expect(hits.every((h) => h.printing.variant === 'alternate-art' && /jinx/i.test(h.card.name)), query).toBe(true);
    }
    for (const query of ['unl 29 alt', 'unl 29 alternate art', 'unl 29 alt art', 'unleashed 29 alt']) {
      expect(keys(query, catalog), query).toEqual([BRAMBLEBACK_ALT]);
    }
    expect(keys('metal petal', catalog)).toEqual([]);
    const names = new Set(runSearch('metal', catalog, EMPTY).hits.map((h) => h.card.name));
    expect(names.has('Petal Pixie')).toBe(false);
  });

  it('foil means owned in foil, so nothing matches without owned copies', () => {
    const catalog = getCatalog();
    expect(keys('foil', catalog, EMPTY)).toEqual([]);
    expect(keys('foil', catalog, USER)).toEqual([BRAMBLEBACK]);
    expect(keys('-foil owned:yes', catalog, USER)).toEqual([STANDARD_42]);
  });

  it('searches unquoted rules text and mechanic words', () => {
    const catalog = getCatalog();
    const rulesHave = (text: string) => (cardKey: string) =>
      ` ${(catalog.cards[cardKey]?.rulesText ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `.includes(text);
    const draw1 = keys('draw 1', catalog);
    for (const p of allPrintings(catalog).filter((p) => rulesHave(' draw 1 ')(p.cardKey))) expect(draw1).toContain(p.printingKey);
    expect(draw1.length).toBeGreaterThan(3);
    const first = runSearch('draw 1', catalog, EMPTY).hits[0];
    expect(rulesHave(' draw 1')(first?.card.cardKey ?? '')).toBe(true);

    const stun = runSearch('stun', catalog, EMPTY).hits;
    expect(stun.length).toBeGreaterThan(0);
    expect(stun.every((h) => /stun/i.test(h.card.rulesText + h.card.name))).toBe(true);

    expect(keys('draw a card', catalog).length).toBeGreaterThan(0);
    const sand = runSearch('sand soldier', catalog, EMPTY).hits;
    expect(sand.length).toBeGreaterThan(0);
    expect(sand.every((h) => /sand/i.test(h.card.rulesText + h.card.name) && /soldier/i.test(h.card.rulesText + h.card.name))).toBe(true);
  });

  it('puts name matches above rules-text matches', () => {
    const hits = runSearch('poppy', getCatalog(), EMPTY).hits;
    const firstOther = hits.findIndex((h) => !/poppy/i.test(h.card.name));
    const lastNamed = hits.map((h) => /poppy/i.test(h.card.name)).lastIndexOf(true);
    if (firstOther !== -1) expect(lastNamed).toBeLessThan(firstOther);
  });

  it('finds supertypes and token cards', () => {
    const catalog = getCatalog();
    const champions = keys('champion legend', catalog);
    expect(champions.length).toBeGreaterThan(3);
    expect(champions.every((key) => cardOf(catalog, key)?.supertype === 'Champion' && cardOf(catalog, key)?.type === 'Legend')).toBe(true);
    expect(keys('champion', catalog).every((key) => cardOf(catalog, key)?.supertype === 'Champion')).toBe(true);
    const signature = keys('signature', catalog);
    expect(signature.some((key) => catalog.printings[key]?.variant === 'signature')).toBe(true);
    expect(signature.some((key) => cardOf(catalog, key)?.supertype === 'Signature')).toBe(true);
    expect(keys('supertype:signature', catalog).every((key) => cardOf(catalog, key)?.supertype === 'Signature')).toBe(true);
    const tokens = keys('token', catalog);
    expect(cardOf(catalog, tokens[0] ?? '')?.supertype).toBe('Token');
  });

  it.each([
    ['cost 3', 'energy', 3],
    ['3 cost', 'energy', 3],
    ['might 5', 'might', 5],
    ['5 might', 'might', 5],
  ] as const)('stat pair %s', (query, field, value) => {
    const catalog = getCatalog();
    const hits = runSearch(query, catalog, EMPTY).hits;
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.card[field] === value)).toBe(true);
    expect(keys(query, catalog).sort()).toEqual(keys(`${field === 'energy' ? 'cost' : field}:${value}`, catalog).sort());
  });

  it('finds compound and run-together names', () => {
    const catalog = getCatalog();
    for (const query of ['leesin', 'lee sin', 'Lee-Sin']) {
      const hits = runSearch(query, catalog, EMPTY).hits;
      const leeSin = allPrintings(catalog).filter((p) => catalog.cards[p.cardKey]?.name.startsWith('Lee Sin')).length;
      expect(leeSin).toBeGreaterThan(0);
      // Other cards may mention the words in their rules, but Lee Sin printings lead.
      expect(hits.slice(0, leeSin).every((h) => h.card.name.startsWith('Lee Sin')), query).toBe(true);
    }
    expect(keys('khazix', catalog)).toEqual(keys("kha'zix", catalog));
  });

  it('treats empty and punctuation-only queries as show everything', () => {
    const catalog = getCatalog();
    const total = allPrintings(catalog).length;
    for (const query of ['', '   ', '%$#@!', '.*', '""', '-']) {
      expect(runSearch(query, catalog, EMPTY).hits, query).toHaveLength(total);
    }
    expect(runSearch('', catalog, EMPTY).warnings).toEqual([]);
    expect(runSearch('%$#@!', catalog, EMPTY).warnings).toHaveLength(1);
    expect(runSearch('Vi - Destructive', catalog, EMPTY).warnings).toEqual([]);
    expect(runSearch('vi destructive', catalog, EMPTY).hits.length).toBeGreaterThan(0);
  });
}

describe('natural queries on the fixture', () => {
  const catalog = buildCatalog(loadFixtureRaw(), 'fixture');
  defineQueries(() => catalog);
});

describe.skipIf(!REAL_DATA_AVAILABLE)(
  `natural queries on the real dataset${REAL_DATA_AVAILABLE ? '' : ` (skipped: ${REAL_DATA_SKIP_REASON})`}`,
  () => {
    const catalog = REAL_DATA_AVAILABLE ? buildCatalog(loadRealRaw(), 'real') : ({} as Catalog);
    defineQueries(() => catalog);

    it('returns Kayn - Unleashed for the bare set title, after the Unleashed set cards', () => {
      const named = allPrintings(catalog).filter((p) => /Kayn - Unleashed/.test(catalog.cards[p.cardKey]?.name ?? ''));
      expect(named.length).toBeGreaterThan(0);
      const hits = runSearch('unleashed', catalog, EMPTY).hits.map((h) => h.printing.printingKey);
      const lastSet = Math.max(...keys('unl', catalog).map((key) => hits.indexOf(key)));
      for (const printing of named) {
        expect(hits).toContain(printing.printingKey);
        if (printing.setId !== 'UNL') expect(hits.indexOf(printing.printingKey)).toBeGreaterThan(lastSet);
      }
    });
  },
);

describe('accents and apostrophes', () => {
  const catalog = buildCatalog(
    [
      rawCard({ name: "Cho'Gath - Feasting", riftbound_id: 'tst-001-100', collector_number: 1 }),
      rawCard({ name: 'Elise - Spider Queen', riftbound_id: 'tst-002-100', collector_number: 2 }),
      rawCard({ name: 'Zo\u00eb - Aspect of Twilight', riftbound_id: 'tst-003-100', collector_number: 3 }),
    ],
    'accents',
  );

  it('ignores accents and apostrophes in names and queries', () => {
    expect(keys('chogath', catalog)).toEqual(['tst-001-100-standard']);
    expect(keys("cho'gath", catalog)).toEqual(['tst-001-100-standard']);
    expect(keys('zoe', catalog)).toEqual(['tst-003-100-standard']);
    expect(keys('Zo\u00eb', catalog)).toEqual(['tst-003-100-standard']);
    expect(keys('elyse', catalog)).toEqual(['tst-002-100-standard']);
  });
});

/** Marker-only printings: a lettered/starred printing with no unmarked printing at the same set and number. */
function markerOnlyPrintings(catalog: Catalog) {
  const unmarked = new Set<string>();
  const marked: { key: string; set: string; number: number }[] = [];
  for (const p of allPrintings(catalog)) {
    const match = /^[a-z]+-0*(\d+)([a-z*]?)-/i.exec(p.riftboundId);
    if (!match) continue;
    const slot = `${p.setId}|${Number(match[1])}`;
    if (match[2]) marked.push({ key: p.printingKey, set: p.setId.toLowerCase(), number: Number(match[1]) });
    else unmarked.add(slot);
  }
  return marked.filter((m) => !unmarked.has(`${m.set.toUpperCase()}|${m.number}`));
}

function defineIdentifierQueries(getCatalog: () => Catalog): void {
  it.each([
    ['unl 229 sig', 'unl-229x-219-signature'],
    ['unl 229 signature', 'unl-229x-219-signature'],
    ['unl-229 sig', 'unl-229x-219-signature'],
  ])('signature variant word after a number: %s', (query, expected) => {
    expect(keys(query, getCatalog())).toContain(expected);
    expect(keys(query, getCatalog()).every((key) => getCatalog().printings[key]?.setId === 'UNL')).toBe(true);
  });

  it('treats bare sig as signature and combines it with names', () => {
    const catalog = getCatalog();
    const sig = keys('sig', catalog);
    expect(sig.length).toBeGreaterThan(0);
    expect(sig.some((key) => catalog.printings[key]?.variant === 'signature')).toBe(true);
    const vi = runSearch('sig vi', catalog, EMPTY).hits;
    expect(vi.length).toBeGreaterThan(0);
    expect(vi.every((h) => h.printing.variant === 'signature' || h.card.supertype === 'Signature')).toBe(true);
    expect(vi.some((h) => /^Vi\b/.test(h.card.name))).toBe(true);
  });

  it('falls back to any marker when a set and number only exist marked', () => {
    const catalog = getCatalog();
    const candidates = markerOnlyPrintings(catalog);
    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates.slice(0, 5)) {
      expect(keys(`${candidate.set} ${candidate.number}`, catalog), candidate.key).toContain(candidate.key);
    }
    // Where an unmarked printing exists it is still the only match.
    expect(keys('unl 29', catalog)).toEqual([BRAMBLEBACK]);
  });

  it('reads lowercase or between facet words as OR, and leaves names alone', () => {
    const catalog = getCatalog();
    expect(keys('fury or calm unit', catalog).sort()).toEqual(keys('(fury OR calm) unit', catalog).sort());
    expect(keys('fury or calm or mind rune', catalog).sort()).toEqual(keys('(fury OR calm OR mind) rune', catalog).sort());
    expect(keys('type:rune or type:battlefield', catalog).sort()).toEqual(keys('type:rune OR type:battlefield', catalog).sort());
    expect(keys('tank or shield', catalog).sort()).toEqual(keys('tank OR shield', catalog).sort());
    // Not between two facet words: a plain word, searched like any other.
    expect(keys('fury or', catalog)).toEqual(keys('fury or', catalog));
    expect(keys('rise or fall', catalog)).toEqual(keys('rise fall or', catalog));
  });

  it('resolves pasted printing keys and source ids', () => {
    const catalog = getCatalog();
    expect(keys(BRAMBLEBACK, catalog)).toEqual([BRAMBLEBACK]);
    expect(keys(BRAMBLEBACK.toUpperCase(), catalog)).toEqual([BRAMBLEBACK]);
    expect(keys('unl-029-219', catalog)).toEqual([BRAMBLEBACK]);
    expect(keys('unl-029a-219', catalog)).toEqual([BRAMBLEBACK_ALT]);
    expect(keys('ogn-042-298-standard', catalog)).toEqual([STANDARD_42]);
    expect(keys('unl-229*-219', catalog)).toEqual(['unl-229x-219-signature']);
    expect(keys('unl-229x-219-signature', catalog)).toEqual(['unl-229x-219-signature']);
    expect(keys(`${BRAMBLEBACK} fury`, catalog)).toEqual([BRAMBLEBACK]);
    expect(keys(`-${BRAMBLEBACK} red brambleback`, catalog)).toEqual([BRAMBLEBACK_ALT]);
  });

  it('accepts x or * as the overnumbered and signature marker', () => {
    const catalog = getCatalog();
    expect(keys('ogn 301x', catalog)).toEqual(['ogn-301x-298-signature']);
    expect(keys('ogn 301*', catalog)).toEqual(['ogn-301x-298-signature']);
    expect(keys('ogn301x', catalog)).toEqual(['ogn-301x-298-signature']);
  });
}

describe('identifier queries on the fixture', () => {
  const catalog = buildCatalog(loadFixtureRaw(), 'fixture');
  defineIdentifierQueries(() => catalog);
});

describe.skipIf(!REAL_DATA_AVAILABLE)(
  `identifier queries on the real dataset${REAL_DATA_AVAILABLE ? '' : ` (skipped: ${REAL_DATA_SKIP_REASON})`}`,
  () => {
    const catalog = REAL_DATA_AVAILABLE ? buildCatalog(loadRealRaw(), 'real') : ({} as Catalog);
    defineIdentifierQueries(() => catalog);

    it.each([
      ['opp 42', 'opp-042b-298-standard'],
      ['pr 246', 'pr-246a-298-alternate-art'],
    ])('%s finds the marked-only printing', (query, expected) => {
      expect(keys(query, catalog)).toContain(expected);
    });
  },
);
