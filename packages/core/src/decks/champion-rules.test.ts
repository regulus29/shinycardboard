import { describe, expect, it } from 'vitest';
import { defaultRules } from '../rules/rules';
import { resolveLegendChampion } from './identity';
import { validateDeck } from './validate';
import { fillerCards, fixtureCards, legalViDeck, makeCard, makeCatalog, makeDeck, slot } from './testing';

const catalog = makeCatalog([...fixtureCards(), ...fillerCards(22)]);
const codes = (deck: ReturnType<typeof makeDeck>, cat = catalog) => validateDeck(deck, cat).map((i) => i.code);

/** Legends shaped like the real faction-first cases: Kennen lists Yordle first. */
const legendOf = (key: string, name: string, tags: string[]) =>
  makeCard(key, { name, type: 'Legend', domains: ['Order', 'Chaos'], energy: null, tags });
const champ = (key: string, name: string, tags: string[]) =>
  makeCard(key, { name, supertype: 'Champion', domains: ['Order'], tags });
const resolve = (cat: ReturnType<typeof makeCatalog>, key: string) => {
  const legend = cat.cards[key];
  if (!legend) throw new Error(`fixture legend ${key} missing`);
  return resolveLegendChampion(legend, cat, defaultRules);
};

describe('champion resolution', () => {
  it('resolves the champion by name, so Kennen beats the Yordle faction tag', () => {
    const cat = makeCatalog([
      legendOf('kennen-legend', 'Heart of the Tempest', ['Yordle', 'Kennen']),
      champ('kennen-keeper', 'Kennen, Keeper of Balance', ['Yordle', 'Kennen']),
      champ('teemo', 'Teemo - Strategist', ['Yordle', 'Teemo']),
    ]);
    expect(resolve(cat, 'kennen-legend')).toEqual({ status: 'resolved', tag: 'Kennen' });
    expect(codes(makeDeck({ legendKey: 'kennen-legend', main: [slot('kennen-keeper', 3)] }), cat)).not.toContain('no-champion');
    expect(codes(makeDeck({ legendKey: 'kennen-legend', main: [slot('teemo', 3)] }), cat)).toContain('no-champion');
  });

  it('reports unresolved instead of falling back to the faction tag (Teemo with Yordle)', () => {
    const cat = makeCatalog([
      legendOf('teemo-legend', 'Teemo - Swift Scout', ['Teemo', 'Yordle']),
      champ('poppy', 'Poppy - Paragon', ['Yordle', 'Poppy']),
    ]);
    const issues = validateDeck(makeDeck({ legendKey: 'teemo-legend', main: [slot('poppy', 3)] }), cat);
    expect(resolve(cat, 'teemo-legend')).toEqual({ status: 'unresolved' });
    expect(issues).toContainEqual(expect.objectContaining({ code: 'champion-unresolved', severity: 'warning' }));
    expect(issues.map((i) => i.code)).not.toContain('no-champion');
  });

  it('reports a tie as ambiguous and lets the chosen champion settle it', () => {
    const cat = makeCatalog([
      legendOf('duo-legend', 'Duo Legend', ['Alpha', 'Beta']),
      champ('alpha', 'Alpha - First', ['Alpha']),
      champ('beta', 'Beta - Second', ['Beta']),
    ]);
    expect(resolve(cat, 'duo-legend')).toEqual({ status: 'ambiguous', tags: ['Alpha', 'Beta'] });
    expect(codes(makeDeck({ legendKey: 'duo-legend', main: [slot('alpha', 3)] }), cat)).toContain('champion-unresolved');
    const settled = makeDeck({ legendKey: 'duo-legend', chosenChampionKey: 'beta', main: [slot('beta', 3)] });
    expect(codes(settled, cat)).not.toContain('champion-unresolved');
    expect(codes(settled, cat)).not.toContain('no-champion');
  });

  it('skips signature mismatch while the champion is unresolved', () => {
    const cat = makeCatalog([
      legendOf('teemo-legend', 'Teemo - Swift Scout', ['Teemo']),
      makeCard('sig', { supertype: 'Signature', domains: ['Order'], tags: ['Other'] }),
    ]);
    expect(codes(makeDeck({ legendKey: 'teemo-legend', main: [slot('sig', 1)] }), cat)).not.toContain('signature-mismatch');
  });

  it('matches names with punctuation differences such as apostrophes', () => {
    const cat = makeCatalog([
      legendOf('kaisa-legend', "Kai'Sa - Daughter of the Void", ["Kai'Sa"]),
      champ('kaisa-unit', "Kai'Sa - Survivor", ["Kai'Sa", 'Void']),
    ]);
    expect(resolve(cat, 'kaisa-legend')).toEqual({ status: 'resolved', tag: "Kai'Sa" });
  });
});

describe('chosen champion key', () => {
  it('accepts a legal champion that is in the main deck', () => {
    expect(codes(legalViDeck({ chosenChampionKey: 'vi-peacekeeper' }))).toEqual([]);
  });

  it('rejects a champion of another legend', () => {
    const deck = legalViDeck({ chosenChampionKey: 'jinx-demolitionist', main: [...legalViDeck().main, slot('jinx-demolitionist', 1)] });
    expect(validateDeck(deck, catalog)).toContainEqual(expect.objectContaining({ code: 'no-champion', cardKey: 'jinx-demolitionist' }));
  });

  it('rejects a legal champion that is not in the main deck', () => {
    const rest = legalViDeck().main.filter((s) => s.cardKey !== 'vi-peacekeeper');
    const deck = legalViDeck({ chosenChampionKey: 'vi-peacekeeper', main: [...rest, slot('order-unit', 3)] });
    const issues = validateDeck(deck, catalog).filter((i) => i.code === 'no-champion');
    expect(issues).toEqual([expect.objectContaining({ cardKey: 'vi-peacekeeper', message: expect.stringContaining('not in the main deck') })]);
  });

  it('rejects an unknown chosen champion key', () => {
    expect(validateDeck(legalViDeck({ chosenChampionKey: 'ghost' }), catalog)).toContainEqual(
      expect.objectContaining({ code: 'unknown-card', cardKey: 'ghost' }),
    );
  });

  it('rejects a non-champion card as the chosen champion', () => {
    expect(codes(legalViDeck({ chosenChampionKey: 'fury-spell' }))).toContain('no-champion');
  });
});

describe('signature limit', () => {
  const sigCatalog = makeCatalog([
    ...fixtureCards(),
    ...fillerCards(22),
    ...['b', 'c'].map((k) => makeCard(`vi-sig-${k}`, { type: 'Spell', supertype: 'Signature', domains: ['Fury'], tags: ['Vi'] })),
  ]);

  it('allows three signature cards in total whatever their names', () => {
    const rest = legalViDeck().main.filter((s) => s.cardKey !== 'hextech-gauntlets');
    const deck = legalViDeck({ main: [...rest, slot('hextech-gauntlets', 1), slot('vi-sig-b', 1), slot('vi-sig-c', 1)] });
    expect(codes(deck, sigCatalog)).toEqual([]);
  });

  it('flags a fourth signature card of a different name', () => {
    const deck = legalViDeck({ main: [...legalViDeck().main, slot('vi-sig-b', 1)] });
    expect(validateDeck(deck, sigCatalog)).toContainEqual(expect.objectContaining({ code: 'signature-limit', severity: 'error' }));
  });

  it('follows the configured limit', () => {
    const issues = validateDeck(legalViDeck(), catalog, { ...defaultRules, signatureLimit: 2 });
    expect(issues.map((i) => i.code)).toContain('signature-limit');
  });
});

describe('sideboard types', () => {
  it('rejects runes and battlefields in the sideboard', () => {
    const issues = validateDeck(legalViDeck({ sideboard: [slot('fury-rune', 4), slot('bf-a', 1)] }), catalog);
    const wrong = issues.filter((i) => i.code === 'section-type').map((i) => i.cardKey);
    expect(wrong.sort()).toEqual(['bf-a', 'fury-rune']);
  });
});
