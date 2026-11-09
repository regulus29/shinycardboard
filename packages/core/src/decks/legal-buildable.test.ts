import { describe, expect, it } from 'vitest';
import { buildableLegends } from './buildable';
import { legalCards } from './legal';
import { fillerCards, fixtureCards, legalViDeck, makeCard, makeCatalog, makeOwned, owns, ownEverything, syntheticCatalog } from './testing';
import { defaultRules } from '../rules/rules';

const catalog = makeCatalog([...fixtureCards(), ...fillerCards(22)]);
const keys = (cards: { cardKey: string }[]) => cards.map((c) => c.cardKey);

describe('legalCards', () => {
  const vi = catalog.cards['vi-piltover-enforcer'];

  it('limits the pool to the legend domain identity plus Colorless', () => {
    const pool = keys(legalCards(vi, catalog));
    expect(pool).toEqual(expect.arrayContaining(['vi-destructive', 'vi-peacekeeper', 'fury-spell', 'order-unit', 'colorless-unit']));
    expect(pool).not.toContain('chaos-unit');
    expect(pool).not.toContain('mixed-spell');
  });

  it('includes this legend signature card but not another legend one', () => {
    const pool = keys(legalCards(vi, catalog));
    expect(pool).toContain('hextech-gauntlets');
    expect(pool).not.toContain('get-excited');
  });

  it('includes matching runes and every battlefield, never legends or tokens', () => {
    const pool = keys(legalCards(vi, catalog));
    expect(pool).toEqual(expect.arrayContaining(['fury-rune', 'order-rune', 'bf-a', 'bf-b', 'bf-c']));
    expect(pool).not.toContain('chaos-rune');
    expect(pool).not.toContain('vi-piltover-enforcer');
    expect(pool).not.toContain('recruit-token');
  });

  it('without a legend lists every deckable card except signature cards', () => {
    const pool = keys(legalCards(undefined, catalog));
    expect(pool).toContain('chaos-unit');
    expect(pool).not.toContain('hextech-gauntlets');
    expect(pool).not.toContain('jinx-loose-cannon');
  });

  it('keeps foreign signature cards when the rule is off', () => {
    const foreign = makeCard('foreign-signature', { supertype: 'Signature', domains: ['Fury'], tags: ['Other'] });
    const cat = makeCatalog([...fixtureCards(), foreign]);
    const legend = cat.cards['vi-piltover-enforcer'];
    expect(keys(legalCards(legend, cat))).not.toContain('foreign-signature');
    expect(keys(legalCards(legend, cat, { ...defaultRules, signatureRequiresMatchingLegend: false }))).toContain('foreign-signature');
  });

  it('is empty for an empty catalog', () => {
    expect(legalCards(undefined, makeCatalog([]))).toEqual([]);
  });
});

describe('buildableLegends', () => {
  const viDeck = legalViDeck();
  const everyViCard = [
    owns('vi-piltover-enforcer', 1),
    ...[...viDeck.main, ...viDeck.runes, ...viDeck.battlefields].map((s) => owns(s.cardKey, s.count)),
  ];
  const viResult = (owned: ReturnType<typeof owns>[]) =>
    buildableLegends(catalog, owned).find((r) => r.legendKey === 'vi-piltover-enforcer');

  it('scores zero for every legend with an empty collection', () => {
    const result = buildableLegends(catalog, []);
    expect(result).toHaveLength(2);
    for (const r of result) expect(r).toMatchObject({ completeness: 0, ownedLegalCards: 0, shortBy: 56 });
  });

  it('reports a complete deck as 1 and ranks it first', () => {
    const [top, second] = buildableLegends(catalog, everyViCard);
    expect(top).toMatchObject({ legendKey: 'vi-piltover-enforcer', completeness: 1, shortBy: 0 });
    expect(second?.legendKey).toBe('jinx-loose-cannon');
    expect(second?.completeness).toBeLessThan(1);
  });

  it('counts a missing legend as one slot short', () => {
    const noLegend = everyViCard.filter((o) => o.printingKey !== 'ogn-vi-piltover-enforcer');
    expect(viResult(noLegend)).toMatchObject({ shortBy: 1 });
  });

  it('counts a missing chosen champion as a shortfall even when other cards could fill the deck', () => {
    const noChampions = everyViCard.filter((o) => !o.printingKey.startsWith('ogn-vi-') || o.printingKey.includes('enforcer'));
    const extra = [owns('filler-0', 3), owns('colorless-unit', 3), owns('fury-spell', 3)];
    const result = viResult([...noChampions, ...extra]);
    expect(result?.shortBy).toBeGreaterThan(0);
  });

  it('caps copies at the copy limit so one card cannot fill the deck', () => {
    expect(viResult([owns('fury-spell', 40)])?.ownedLegalCards).toBe(defaultRules.copyLimit);
  });

  it('sums copies across printings and finishes', () => {
    const cat = makeCatalog(fixtureCards().map((c) => (c.cardKey === 'fury-spell' ? { ...c, printingKeys: ['ogn-fury-spell', 'ogn-fury-spell-b'] } : c)));
    const owned = [makeOwned('ogn-fury-spell', 1), makeOwned('ogn-fury-spell-b', 1, { finish: 'foil' })];
    expect(buildableLegends(cat, owned).find((r) => r.legendKey === 'vi-piltover-enforcer')?.ownedLegalCards).toBe(2);
  });

  it('ignores cards that are illegal for the legend', () => {
    expect(viResult([owns('chaos-unit', 3), owns('chaos-rune', 12)])?.completeness).toBe(0);
  });

  it('is deterministic and breaks ties by legend key', () => {
    const first = buildableLegends(catalog, []).map((r) => r.legendKey);
    expect(first).toEqual(['jinx-loose-cannon', 'vi-piltover-enforcer']);
    expect(buildableLegends(catalog, []).map((r) => r.legendKey)).toEqual(first);
  });

  it('ranks the whole catalog in well under 100 ms for 1500 cards', () => {
    const big = syntheticCatalog(1500);
    const owned = ownEverything(big);
    expect(Object.keys(big.cards).length).toBeGreaterThanOrEqual(1500);
    buildableLegends(big, owned); // warm up, as a running app would have
    const started = performance.now();
    const ranked = buildableLegends(big, owned);
    const elapsed = performance.now() - started;
    console.info(`buildableLegends: ${ranked.length} legends over ${Object.keys(big.cards).length} cards in ${elapsed.toFixed(1)} ms`);
    expect(ranked).toHaveLength(60);
    expect(elapsed).toBeLessThan(100);
  });
});
