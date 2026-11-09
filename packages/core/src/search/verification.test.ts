import { describe, expect, it } from 'vitest';
import { buildCatalog } from '../catalog/build';
import {
  loadFixtureRaw,
  loadRealRaw,
  REAL_DATA_AVAILABLE,
  REAL_DATA_SKIP_REASON,
} from '../catalog/test-data';
import type { Catalog } from '../types';
import { runSearch } from './search';
import { allPrintings, cardOf, EMPTY, keys, USER } from './test-support';

/**
 * Verification queries: the definition of done for search. They run against the committed
 * fixture always, and against the full Riftcodex pull when data/raw/cards.json exists.
 * Expected values were chosen by inspecting the real data (see comments) and, where a
 * result set is large, computed by an independent plain filter over the catalog.
 */

function defineVerification(getCatalog: () => Catalog): void {
  it('unl 29a returns the Red Brambleback alternate art only', () => {
    const catalog = getCatalog();
    expect(keys('unl 29a', catalog)).toEqual(['unl-029a-219-alternate-art']);
    const [hit] = runSearch('unl 29a', catalog, EMPTY).hits;
    expect(hit?.card.name).toBe('Red Brambleback');
    expect(hit?.printing.variant).toBe('alternate-art');
  });

  it.each(['UNL-029', 'unl 29', 'unl029', 'Unl #29', 'unl-29'])('%s returns the standard printing', (query) => {
    expect(keys(query, getCatalog())).toEqual(['unl-029-219-standard']);
  });

  it.each(['ogn 42', 'OGN-042', 'ogn042', 'ogn #42', 'OGN 042'])('%s resolves to Origins number 42', (query) => {
    const catalog = getCatalog();
    // In the real data OGN 042 is the Calm Rune; its alternate art is 042a.
    expect(keys(query, catalog)).toEqual(['ogn-042-298-standard']);
    expect(cardOf(catalog, 'ogn-042-298-standard')?.name).toBe('Calm Rune');
    expect(keys('ogn 42a', catalog)).toEqual(['ogn-042a-298-alternate-art']);
  });

  it('combines a bare number with other terms', () => {
    const catalog = getCatalog();
    expect(keys('42 calm', catalog)).toContain('ogn-042-298-standard');
    expect(keys('42 fury type:unit', catalog).every((key) => catalog.printings[key]?.collectorNumber === 42)).toBe(true);
  });

  it('fury unit energy>=3 matches an independent filter', () => {
    const catalog = getCatalog();
    const expected = allPrintings(catalog)
      .filter((p) => {
        const card = catalog.cards[p.cardKey];
        return card?.type === 'Unit' && card.domains.includes('Fury') && (card.energy ?? -1) >= 3;
      })
      .map((p) => p.printingKey)
      .sort();
    expect(expected.length).toBeGreaterThan(5);
    expect(keys('fury unit energy>=3', catalog).sort()).toEqual(expected);
  });

  it('-domain:fury type:spell excludes Fury and keeps only spells', () => {
    const catalog = getCatalog();
    const expected = allPrintings(catalog)
      .filter((p) => {
        const card = catalog.cards[p.cardKey];
        return card?.type === 'Spell' && !card.domains.includes('Fury');
      })
      .map((p) => p.printingKey)
      .sort();
    expect(expected.length).toBeGreaterThan(5);
    expect(keys('-domain:fury type:spell', catalog).sort()).toEqual(expected);
  });

  it('finds Bewitching Spirit through a typo, ranked first', () => {
    const catalog = getCatalog();
    const { hits } = runSearch('Bewitchng Spirit', catalog, EMPTY);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((hit) => hit.card.name === 'Bewitching Spirit')).toBe(true);
    expect(runSearch('bewitching spirit', catalog, EMPTY).hits.map((h) => h.printing.printingKey)).toEqual(
      hits.map((h) => h.printing.printingKey),
    );
    expect(runSearch('Bewitchng', catalog, EMPTY).hits[0]?.card.name).toBe('Bewitching Spirit');
  });

  it('does not apply typo tolerance when the word exists', () => {
    const catalog = getCatalog();
    const { hits } = runSearch('poppy', catalog, EMPTY);
    expect(hits.length).toBeGreaterThan(0);
    // Hits are named Poppy or carry the Poppy champion tag; no near-miss names such as "Puppy".
    expect(hits.every((hit) => /poppy/i.test(hit.card.name) || hit.card.tags.some((tag) => /poppy/i.test(tag)))).toBe(true);
  });

  it('owned: filters by quantity, finish and ignores tombstones', () => {
    const catalog = getCatalog();
    const total = allPrintings(catalog).length;
    expect(keys('owned:yes', catalog, USER).sort()).toEqual(['ogn-042-298-standard', 'unl-029-219-standard']);
    expect(keys('owned:no', catalog, USER)).toHaveLength(total - 2);
    expect(keys('owned:foil', catalog, USER)).toEqual(['unl-029-219-standard']);
    expect(keys('owned:>2', catalog, USER)).toEqual(['unl-029-219-standard']);
    expect(keys('owned:1', catalog, USER)).toEqual(['ogn-042-298-standard']);
    expect(keys('owned:yes -owned:foil', catalog, USER)).toEqual(['ogn-042-298-standard']);
    expect(keys('owned:yes', catalog, EMPTY)).toEqual([]);
  });

  it('tag: matches user tags by card, with quotes, prefixes and negation', () => {
    const catalog = getCatalog();
    const brambleback = ['unl-029-219-standard', 'unl-029a-219-alternate-art'];
    expect(keys('tag:burn', catalog, USER)).toEqual(brambleback);
    expect(keys('tag:"aggro package"', catalog, USER)).toEqual(brambleback);
    expect(keys('tag:agg', catalog, USER)).toEqual(brambleback);
    expect(keys('tag:mana', catalog, USER).every((key) => cardOf(catalog, key)?.name === 'Calm Rune')).toBe(true);
    expect(keys('tag:nothing', catalog, USER)).toEqual([]);
    expect(keys('tag:any', catalog, USER)).toHaveLength(
      allPrintings(catalog).filter((p) => ['red-brambleback', 'calm-rune'].includes(p.cardKey)).length,
    );
    expect(keys('tag:none', catalog, USER)).not.toContain('unl-029-219-standard');
    expect(keys('-tag:burn type:unit fury', catalog, USER)).not.toContain('unl-029-219-standard');
    expect(keys('tag:burn', catalog, EMPTY)).toEqual([]);
  });

  it('deck: matches the decks that use a card', () => {
    const catalog = getCatalog();
    const names = new Set(runSearch('deck:"fury ramp"', catalog, USER).hits.map((h) => h.card.name));
    expect(names).toEqual(new Set(['Red Brambleback', 'Bewitching Spirit']));
    expect([...new Set(runSearch('deck:tempo', catalog, USER).hits.map((h) => h.card.name))]).toEqual(['Bewitching Spirit']);
  });

  it('cost:2..4 might>=2 matches an independent filter', () => {
    const catalog = getCatalog();
    const expected = allPrintings(catalog)
      .filter((p) => {
        const card = catalog.cards[p.cardKey];
        return card && card.energy !== null && card.energy >= 2 && card.energy <= 4 && (card.might ?? -1) >= 2;
      })
      .map((p) => p.printingKey)
      .sort();
    expect(expected.length).toBeGreaterThan(5);
    expect(keys('cost:2..4 might>=2', catalog).sort()).toEqual(expected);
    expect(keys('energy:2..4 might>=2', catalog).sort()).toEqual(expected);
  });

  it('quoted phrases match rules text as contiguous phrases', () => {
    const catalog = getCatalog();
    const hasPhrase = (text: string) => /\bdraw 1\b/.test(text.toLowerCase().replace(/[^a-z0-9]+/g, ' '));
    const expected = allPrintings(catalog)
      .filter((p) => hasPhrase(catalog.cards[p.cardKey]?.rulesText ?? ''))
      .map((p) => p.printingKey)
      .sort();
    expect(expected.length).toBeGreaterThan(3);
    const viaField = keys('text:"draw 1"', catalog).sort();
    const bare = keys('"draw 1"', catalog).sort();
    // Whole word boundary on the right differs from prefix match ("draw 10"), so allow a superset.
    for (const key of expected) {
      expect(viaField).toContain(key);
      expect(bare).toContain(key);
    }
    expect(keys('text:"draw 1" -text:"draw 1"', catalog)).toEqual([]);
    expect(keys('"zzz not a phrase"', catalog)).toEqual([]);
  });

  it('an empty query returns every printing in set then number order', () => {
    const catalog = getCatalog();
    const { hits, warnings } = runSearch('', catalog, EMPTY);
    expect(warnings).toEqual([]);
    expect(hits).toHaveLength(allPrintings(catalog).length);
    expect(runSearch('   ', catalog, EMPTY).hits).toHaveLength(hits.length);
    const setOrder = catalog.sets.map((s) => s.setId);
    for (let i = 1; i < hits.length; i++) {
      const [a, b] = [hits[i - 1]?.printing, hits[i]?.printing];
      const setDelta = setOrder.indexOf(a?.setId ?? '') - setOrder.indexOf(b?.setId ?? '');
      expect(setDelta < 0 || (setDelta === 0 && (a?.collectorNumber ?? 0) <= (b?.collectorNumber ?? 0))).toBe(true);
    }
  });

  it('supports OR, parentheses and field alternatives', () => {
    const catalog = getCatalog();
    const count = (q: string) => keys(q, catalog).length;
    expect(count('type:rune OR type:battlefield')).toBe(count('type:rune') + count('type:battlefield'));
    expect(count('(fury OR calm) type:rune')).toBe(count('domain:fury,calm type:rune'));
    expect(count('-(fury OR calm) type:rune')).toBe(count('type:rune') - count('domain:fury,calm type:rune'));
  });

  it('sorts, limits and breaks ties stably', () => {
    const catalog = getCatalog();
    const byEnergy = runSearch('type:unit', catalog, EMPTY, { sort: 'energy' }).hits;
    const energies = byEnergy.map((h) => h.card.energy);
    expect(energies).toEqual([...energies].sort((a, b) => (a ?? Infinity) - (b ?? Infinity)));
    const desc = runSearch('type:unit', catalog, EMPTY, { sort: 'energy', descending: true }).hits;
    expect(desc[0]?.card.energy).toBe(Math.max(...energies.map((e) => e ?? -1)));
    expect(runSearch('type:unit', catalog, EMPTY, { limit: 5 }).hits).toHaveLength(5);
    expect(runSearch('type:unit', catalog, EMPTY, { sort: 'name' }).hits[0]?.card.name).toBe(
      [...byEnergy.map((h) => h.card.name)].sort((a, b) => a.localeCompare(b))[0],
    );
    const owned = runSearch('', catalog, USER, { sort: 'owned', descending: true, limit: 2 }).hits;
    expect(owned.map((h) => h.printing.printingKey)).toEqual(['unl-029-219-standard', 'ogn-042-298-standard']);
    expect(keys('fury', catalog)).toEqual(keys('fury', catalog));
  });

  it('ranks exact names above partial matches', () => {
    const catalog = getCatalog();
    expect(runSearch('rebuttal', catalog, EMPTY).hits[0]?.card.name).toBe('Rebuttal');
    const [first, second] = runSearch('red brambleback', catalog, EMPTY).hits;
    expect(first?.score).toBeGreaterThanOrEqual(second?.score ?? 0);
    expect(first?.card.name).toBe('Red Brambleback');
  });

  it('warns about unknown fields and sets but still returns results', () => {
    const catalog = getCatalog();
    expect(runSearch('set:zzz', catalog, EMPTY).warnings.map((w) => w.message)).toEqual(['Unknown set "zzz"']);
    const result = runSearch('bogus:thing', catalog, EMPTY);
    expect(result.warnings[0]?.message).toContain('Unknown field');
  });

  it('keyword and set filters work', () => {
    const catalog = getCatalog();
    const tank = keys('keyword:tank', catalog);
    expect(tank.length).toBeGreaterThan(0);
    expect(tank.every((key) => cardOf(catalog, key)?.keywords.includes('Tank'))).toBe(true);
    expect(keys('tank', catalog)).toEqual(expect.arrayContaining(tank));
    const origins = keys('set:origins', catalog);
    expect(origins.length).toBeGreaterThan(0);
    expect(origins.every((key) => catalog.printings[key]?.setId === 'OGN')).toBe(true);
    expect(keys('ogn', catalog)).toEqual(origins);
    expect(keys('variant:alt', catalog).every((key) => catalog.printings[key]?.variant === 'alternate-art')).toBe(true);
    expect(keys('variant:metal', catalog).every((key) => catalog.printings[key]?.variant === 'metal')).toBe(true);
  });
}

describe('verification queries on the fixture', () => {
  const catalog = buildCatalog(loadFixtureRaw(), 'fixture');
  defineVerification(() => catalog);
});

describe.skipIf(!REAL_DATA_AVAILABLE)(
  `verification queries on the real dataset${REAL_DATA_AVAILABLE ? '' : ` (skipped: ${REAL_DATA_SKIP_REASON})`}`,
  () => {
    const catalog = REAL_DATA_AVAILABLE ? buildCatalog(loadRealRaw(), 'real') : ({} as Catalog);
    defineVerification(() => catalog);

    it('searches the whole catalog well inside the latency budget', () => {
      const queries = ['', 'fury unit energy>=3', 'bewitchng spirit', 'poppy', '-domain:fury type:spell', 'text:"draw 1"', 'owned:yes', 'ogn 42', '(tank OR shield) cost<=3'];
      const BUDGET_MS = 20;
      const RUNS = 20;
      runSearch('warm up', catalog, USER);
      for (const query of queries) {
        const times: number[] = [];
        for (let i = 0; i < RUNS; i++) {
          const start = performance.now();
          runSearch(query, catalog, USER);
          times.push(performance.now() - start);
        }
        times.sort((a, b) => a - b);
        expect(times[Math.floor(RUNS / 2)] as number, query).toBeLessThan(BUDGET_MS);
      }
    });
  },
);
