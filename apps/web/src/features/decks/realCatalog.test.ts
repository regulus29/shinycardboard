import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { suggestFill, suggestMissing, validateDeck, type Catalog, type Deck } from '@sc/core';
import { applyAcquire, applySuggestions, realSuggestions } from './assistModel';
import { applyLegendChange, isValidChampionFor, legendChangeImpact, withValidChampion } from './deckModel';

const PATH = 'public/catalog.json';
const real = existsSync(PATH) ? (JSON.parse(readFileSync(PATH, 'utf8')) as Catalog) : undefined;

describe.skipIf(!real)('legend change on the real catalog', () => {
  const catalog = real as Catalog;
  const legends = Object.values(catalog.cards).filter((c) => c.type === 'Legend');
  const from = legends.find((l) => l.name.startsWith('Darius'));
  const to = legends.find((l) => l.name.startsWith('Garen'));
  const champ = Object.values(catalog.cards).find((c) => c.supertype === 'Champion' && c.type === 'Unit' && c.tags.includes('Darius'));

  const deck = (): Deck => ({
    id: 'd',
    name: 'D',
    updatedAt: 1,
    legendKey: from?.cardKey,
    chosenChampionKey: champ?.cardKey,
    main: champ ? [{ cardKey: champ.cardKey, count: 1 }] : [],
    runes: [],
    battlefields: [],
    sideboard: [],
  });

  it('finds the fixtures it needs', () => {
    expect(from && to && champ).toBeTruthy();
  });

  it('flags and clears a chosen champion that does not belong to the new legend', () => {
    if (!from || !to || !champ) return;
    expect(isValidChampionFor(from.cardKey, champ.cardKey, catalog)).toBe(true);
    const impact = legendChangeImpact(deck(), to.cardKey, catalog);
    expect(impact.championInvalid).toBe(true);
    expect(impact.championName).toBe(champ.name);
    const next = applyLegendChange(deck(), to.cardKey, catalog, true);
    expect(next.chosenChampionKey).toBeUndefined();
    expect(withValidChampion({ ...deck(), legendKey: to.cardKey }, catalog).chosenChampionKey).toBeUndefined();
  });

  it('fill then buy list leaves zero errors after a legend change', () => {
    if (!from || !to) return;
    const changed = applyLegendChange(deck(), to.cardKey, catalog, true);
    const filled = applySuggestions(changed, catalog, realSuggestions(suggestFill(changed, [], catalog)));
    const bought = applyAcquire(filled, catalog, suggestMissing(filled, [], catalog));
    const errors = validateDeck(bought, catalog).filter((i) => i.severity === 'error');
    expect(errors).toEqual([]);
  });
});
