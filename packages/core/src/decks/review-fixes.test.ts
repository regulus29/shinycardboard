import { describe, expect, it } from 'vitest';
import { defaultRules } from '../rules/rules';
import { buildableLegends } from './buildable';
import { resolveLegendChampion } from './identity';
import { suggestFill, suggestMissing } from './suggest';
import { validateDeck } from './validate';
import { fillerCards, fixtureCards, legalViDeck, makeCard, makeCatalog, makeDeck, owns, slot } from './testing';

const LEGEND = 'vi-piltover-enforcer';

describe('tag comparison ignores case and punctuation on both sides', () => {
  const cat = makeCatalog([
    makeCard('rek-legend', { name: "Rek'sai - Void Burrower", type: 'Legend', domains: ['Fury', 'Order'], energy: null, tags: ["Rek'sai"] }),
    makeCard('rek-unit', { name: "Rek'Sai - Swarm", supertype: 'Champion', domains: ['Fury'], tags: ["REK'SAI", 'Void'] }),
    makeCard('rek-sig', { type: 'Spell', supertype: 'Signature', domains: ['Fury'], tags: ['rek sai'] }),
  ]);

  it('resolves a legend tag that differs in case from the champion tag', () => {
    const legend = cat.cards['rek-legend'];
    expect(legend && resolveLegendChampion(legend, cat, defaultRules)).toEqual({ status: 'resolved', tag: "Rek'sai" });
  });

  it('accepts the champion and signature card despite the case difference', () => {
    const deck = makeDeck({ legendKey: 'rek-legend', main: [slot('rek-unit', 3), slot('rek-sig', 1)] });
    const codes = validateDeck(deck, cat).map((i) => i.code);
    expect(codes).not.toContain('no-champion');
    expect(codes).not.toContain('signature-mismatch');
  });
});

describe('signature limit and the sideboard', () => {
  const sigs = ['b', 'c'].map((k) => makeCard(`vi-sig-${k}`, { type: 'Spell', supertype: 'Signature', domains: ['Fury'], tags: ['Vi'] }));
  const cat = makeCatalog([...fixtureCards(), ...fillerCards(22), ...sigs]);
  const deck = legalViDeck({ sideboard: [slot('vi-sig-b', 1), slot('vi-sig-c', 1)] });
  const rules = (across: boolean) => ({ ...defaultRules, signatureLimitAppliesAcrossSideboard: across });

  it('counts sideboard signature cards by default (conservative reading)', () => {
    const issues = validateDeck(deck, cat);
    expect(issues).toContainEqual(expect.objectContaining({ code: 'signature-limit', message: expect.stringContaining('sideboard') }));
  });

  it('counts the main deck only when configured', () => {
    expect(validateDeck(deck, cat, rules(false)).map((i) => i.code)).not.toContain('signature-limit');
  });

  it('suggestFill counts sideboard signature cards against the cap', () => {
    const partial = makeDeck({ legendKey: LEGEND, chosenChampionKey: 'vi-destructive', main: [slot('vi-destructive', 3), slot('hextech-gauntlets', 1)], sideboard: [slot('vi-sig-b', 1), slot('vi-sig-c', 1)] });
    const picks = suggestFill(partial, [owns('vi-sig-b', 3), owns('fury-spell', 3)], cat).filter((s) => s.section === 'main');
    expect(picks.map((p) => p.cardKey)).toEqual(['fury-spell']);
  });
});

describe('a deck that cannot get a champion from the collection', () => {
  const cat = makeCatalog([...fixtureCards(), ...fillerCards(40, 'pool')]);
  const owned = fillerCards(40, 'pool').map((c) => owns(c.cardKey, 3));

  it('holds one main slot back and marks the champion as missing', () => {
    const fill = suggestFill(makeDeck({ legendKey: LEGEND }), owned, cat);
    const main = fill.filter((s) => s.section === 'main' && s.count > 0);
    expect(main.reduce((sum, s) => sum + s.count, 0)).toBe(defaultRules.mainDeckSize - 1);
    expect(fill.find((s) => s.role === 'missing-champion')).toMatchObject({ count: 0, section: 'main', reason: expect.stringContaining('chosen champion') });
  });

  it('suggestMissing buys the cheapest legal chosen champion into the held slot', () => {
    const buys = suggestMissing(makeDeck({ legendKey: LEGEND }), owned, cat);
    const champion = buys.find((b) => b.role === 'chosen-champion');
    expect(champion).toMatchObject({ section: 'main', count: 1 });
    expect(['vi-destructive', 'vi-peacekeeper']).toContain(champion?.cardKey);
  });

  it('is complete once the buys are applied', () => {
    const fill = suggestFill(makeDeck({ legendKey: LEGEND }), owned, cat);
    const buys = suggestMissing(makeDeck({ legendKey: LEGEND }), owned, cat);
    const slots = (section: string) => [...fill, ...buys].filter((s) => s.section === section && s.count > 0).map((s) => ({ cardKey: s.cardKey, count: s.count }));
    const chosen = buys.find((b) => b.role === 'chosen-champion')?.cardKey;
    const deck = makeDeck({ legendKey: LEGEND, ...(chosen ? { chosenChampionKey: chosen } : {}), main: slots('main'), runes: slots('runes'), battlefields: slots('battlefields') });
    expect(validateDeck(deck, cat).filter((i) => i.severity === 'error')).toEqual([]);
  });
});

describe('buildableLegends tie-breaking', () => {
  const legend = (key: string, tag: string) =>
    makeCard(key, { name: `${tag} - Legend`, type: 'Legend', domains: ['Fury', 'Order'], energy: null, tags: [tag] });
  const cat = makeCatalog([
    legend('legend-a', 'Aaa'), legend('legend-b', 'Bbb'),
    ...['Aaa', 'Bbb'].map((tag) => makeCard(`${tag}-champ`, { name: `${tag} - Champ`, supertype: 'Champion', domains: ['Fury'], tags: [tag] })),
    makeCard('bbb-offdomain', { type: 'Spell', supertype: 'Signature', domains: ['Chaos'], tags: ['Bbb'] }),
    ...fillerCards(40, 'common'),
  ]);
  const common = fillerCards(40, 'common').map((c) => owns(c.cardKey, 3));

  it('puts the legend with owned overlapping cards ahead of an otherwise equal one', () => {
    const rows = buildableLegends(cat, [...common, owns('bbb-offdomain', 2)]);
    expect(rows.map((r) => r.legendKey)).toEqual(['legend-b', 'legend-a']);
    expect(rows[0]?.score).toBe(rows[1]?.score);
    expect(rows[0]?.nearMiss).toBe(2);
  });

  it('falls back to the legend key when nothing else differs', () => {
    expect(buildableLegends(cat, common).map((r) => r.legendKey)).toEqual(['legend-a', 'legend-b']);
  });
});
