/**
 * Property-style check on the real dataset (data/raw/cards.json through buildCatalog):
 * for any partial collection and any legend, the owned fill plus the suggested buys must
 * form a deck with zero validation errors. Skipped when the raw file is absent.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Card, Catalog, Deck, DeckSlot, OwnedEntry, RiftcodexCard } from '../types';
import { buildCatalog } from '../catalog/build';
import { defaultRules } from '../rules/rules';
import { seededRng } from './hand';
import { isChampionUnit } from './identity';
import { suggestFill, suggestMissing } from './suggest';
import { makeDeck, ownCards } from './testing';
import { validateDeck } from './validate';

const RAW_PATH = new URL('../../../../data/raw/cards.json', import.meta.url);
const rules = defaultRules;

/** Owned fill plus buys, assembled as a deck the way a UI would apply them. */
function completedDeck(base: Deck, owned: OwnedEntry[], catalog: Catalog): Deck {
  const fill = suggestFill(base, owned, catalog);
  const buys = suggestMissing(base, owned, catalog);
  const slots = (section: string): DeckSlot[] =>
    [...fill, ...buys].filter((s) => s.section === section && s.count > 0).map((s) => ({ cardKey: s.cardKey, count: s.count }));
  const chosen = [...fill, ...buys].find((s) => s.role === 'chosen-champion')?.cardKey;
  return {
    ...base,
    ...(chosen ? { chosenChampionKey: chosen } : {}),
    main: [...(base.main ?? []), ...slots('main')],
    runes: [...(base.runes ?? []), ...slots('runes')],
    battlefields: [...(base.battlefields ?? []), ...slots('battlefields')],
  };
}

function sample<T>(items: T[], count: number, seed: number): T[] {
  const rng = seededRng(seed);
  const pool = [...items];
  const picked: T[] = [];
  while (picked.length < count && pool.length > 0) picked.push(pool.splice(Math.floor(rng() * pool.length), 1)[0] as T);
  return picked;
}

describe.skipIf(!existsSync(RAW_PATH))('owned fill plus buys always form a legal deck', () => {
  const catalog = buildCatalog(JSON.parse(readFileSync(RAW_PATH, 'utf-8')) as RiftcodexCard[], 'invariant-test');
  const cards = Object.values(catalog.cards);
  const legends = cards.filter((c) => c.type === 'Legend');
  const deckable = cards.filter((c) => c.type !== 'Legend' && c.supertype !== 'Token');
  const errorsFor = (legend: Card, owned: OwnedEntry[], extra: Partial<Deck> = {}) =>
    validateDeck(completedDeck(makeDeck({ legendKey: legend.cardKey, ...extra }), owned, catalog), catalog)
      .filter((i) => i.severity === 'error')
      .map((i) => `${i.code}: ${i.message}`);
  const vi = catalog.cards['vi-piltover-enforcer'] as Card;
  const jinx = catalog.cards['jinx-loose-cannon'] as Card;

  it('holds for an empty collection and every legend', () => {
    for (const legend of legends) expect(errorsFor(legend, []), legend.cardKey).toEqual([]);
  });

  it('holds for a starter Vi collection of 35 Fury/Order cards without a Vi champion', () => {
    const pool = deckable.filter((c) => c.domains.every((d) => d === 'Fury' || d === 'Order') && !isChampionUnit(c, rules) && c.type !== 'Rune');
    const owned = ownCards(catalog, sample(pool, 35, 11), 2);
    expect(errorsFor(vi, owned)).toEqual([]);
    const fill = suggestFill(makeDeck({ legendKey: vi.cardKey }), owned, catalog);
    expect(fill.find((s) => s.role === 'missing-champion')).toMatchObject({ count: 0, section: 'main' });
    const buys = suggestMissing(makeDeck({ legendKey: vi.cardKey }), owned, catalog);
    expect(buys.filter((b) => b.role === 'chosen-champion')).toHaveLength(1);
  });

  it('holds for a random 30 percent collection and every legend', () => {
    const owned = ownCards(catalog, sample(deckable, Math.floor(deckable.length * 0.3), 7), 3);
    for (const legend of legends) expect(errorsFor(legend, owned), legend.cardKey).toEqual([]);
    expect(errorsFor(jinx, owned)).toEqual([]);
  });

  it('holds for a mono Calm collection', () => {
    const calm = deckable.filter((c) => c.domains.length > 0 && c.domains.every((d) => d === 'Calm'));
    const owned = ownCards(catalog, calm, 3);
    for (const legend of legends) expect(errorsFor(legend, owned), legend.cardKey).toEqual([]);
  });

  it('buys the explicitly chosen champion when it is not owned', () => {
    const owned = ownCards(catalog, deckable.filter((c) => c.domains.every((d) => d === 'Fury') && c.type !== 'Rune'), 3);
    const errors = errorsFor(vi, owned, { chosenChampionKey: 'vi-peacekeeper' });
    expect(errors, errors.join(' | ')).toEqual([]);
    const buys = suggestMissing(makeDeck({ legendKey: vi.cardKey, chosenChampionKey: 'vi-peacekeeper' }), owned, catalog);
    expect(buys.find((b) => b.role === 'chosen-champion')?.cardKey).toBe('vi-peacekeeper');
  });
});
