import { describe, expect, it } from 'vitest';
import { allocationConflicts, missingCards, ownedByCard } from './ownership';
import { fixtureCards, makeCard, makeCatalog, makeDeck, makeOwned, owns, slot } from './testing';

/** A card with a base and an alternate art printing. */
const twin = makeCard('twin', { printingKeys: ['ogn-twin', 'ogn-twin-alt'] });
const catalog = makeCatalog([...fixtureCards(), twin]);

describe('ownedByCard', () => {
  it('returns an empty map for an empty collection', () => {
    expect(ownedByCard([], catalog)).toEqual({});
  });

  it('sums printings, finishes and conditions of one card', () => {
    const owned = [
      makeOwned('ogn-twin', 2),
      makeOwned('ogn-twin-alt', 1, { finish: 'foil' }),
      makeOwned('ogn-twin', 1, { condition: 'HP' }),
    ];
    expect(ownedByCard(owned, catalog)).toEqual({ twin: 4 });
  });

  it('ignores tombstones, unknown printings and bad quantities', () => {
    const owned = [
      makeOwned('ogn-twin', 2, { deleted: true }),
      makeOwned('zzz-missing', 5),
      makeOwned('ogn-twin', 0),
      makeOwned('ogn-twin', -2),
      makeOwned('ogn-twin', Number.NaN),
      makeOwned('ogn-twin', 1),
    ];
    expect(ownedByCard(owned, catalog)).toEqual({ twin: 1 });
  });
});

describe('missingCards', () => {
  it('reports a full deck as missing everything when nothing is owned', () => {
    const deck = makeDeck({ main: [slot('fury-spell', 3)], runes: [slot('fury-rune', 2)] });
    expect(missingCards(deck, [], catalog)).toEqual([
      { cardKey: 'fury-spell', needed: 3, owned: 0, missing: 3 },
      { cardKey: 'fury-rune', needed: 2, owned: 0, missing: 2 },
    ]);
  });

  it('returns nothing for an empty deck or a fully owned deck', () => {
    expect(missingCards(makeDeck(), [], catalog)).toEqual([]);
    const deck = makeDeck({ main: [slot('fury-spell', 3)] });
    expect(missingCards(deck, [owns('fury-spell', 5)], catalog)).toEqual([]);
  });

  it('merges duplicate slots and counts across all sections including the sideboard', () => {
    const deck = makeDeck({ main: [slot('fury-spell', 2), slot('fury-spell', 1)], sideboard: [slot('fury-spell', 1)] });
    expect(missingCards(deck, [owns('fury-spell', 1)], catalog)).toEqual([
      { cardKey: 'fury-spell', needed: 4, owned: 1, missing: 3 },
    ]);
  });

  it('needs the legend itself', () => {
    const deck = makeDeck({ legendKey: 'vi-piltover-enforcer' });
    expect(missingCards(deck, [], catalog)).toEqual([{ cardKey: 'vi-piltover-enforcer', needed: 1, owned: 0, missing: 1 }]);
  });

  it('lets any printing fill an unpinned slot', () => {
    const deck = makeDeck({ main: [slot('twin', 3)] });
    const owned = [makeOwned('ogn-twin', 1), makeOwned('ogn-twin-alt', 2)];
    expect(missingCards(deck, owned, catalog)).toEqual([]);
  });

  it('requires the pinned printing for a pinned slot', () => {
    const deck = makeDeck({ main: [slot('twin', 2, 'ogn-twin-alt')] });
    const owned = [makeOwned('ogn-twin', 5), makeOwned('ogn-twin-alt', 1)];
    expect(missingCards(deck, owned, catalog)).toEqual([{ cardKey: 'twin', needed: 2, owned: 6, missing: 1 }]);
  });

  it('reserves pinned copies before filling unpinned demand', () => {
    const deck = makeDeck({ main: [slot('twin', 1, 'ogn-twin-alt'), slot('twin', 2)] });
    const exactlyEnough = [makeOwned('ogn-twin-alt', 1), makeOwned('ogn-twin', 2)];
    expect(missingCards(deck, exactlyEnough, catalog)).toEqual([]);
    const pinnedCopyWouldBeStolen = [makeOwned('ogn-twin-alt', 1), makeOwned('ogn-twin', 1)];
    expect(missingCards(deck, pinnedCopyWouldBeStolen, catalog)).toEqual([{ cardKey: 'twin', needed: 3, owned: 2, missing: 1 }]);
  });

  it('ignores a pin that is unknown or belongs to another card', () => {
    const deck = makeDeck({ main: [slot('twin', 1, 'nope'), slot('twin', 1, 'ogn-fury-spell')] });
    expect(missingCards(deck, [makeOwned('ogn-twin', 2)], catalog)).toEqual([]);
  });

  it('treats an unknown card as fully missing without throwing', () => {
    const deck = makeDeck({ main: [slot('ghost', 2)] });
    expect(missingCards(deck, [], catalog)).toEqual([{ cardKey: 'ghost', needed: 2, owned: 0, missing: 2 }]);
  });
});

describe('allocationConflicts', () => {
  const a = makeDeck({ id: 'a', main: [slot('fury-spell', 3)] });
  const b = makeDeck({ id: 'b', main: [slot('fury-spell', 2)] });

  it('reports a card two decks demand more of than is owned', () => {
    expect(allocationConflicts([a, b], [owns('fury-spell', 4)], catalog)).toEqual([
      { cardKey: 'fury-spell', owned: 4, demanded: 5, decks: ['a', 'b'] },
    ]);
  });

  it('is quiet when owned covers the demand, with no decks, or with zero owned and one deck', () => {
    expect(allocationConflicts([a, b], [owns('fury-spell', 5)], catalog)).toEqual([]);
    expect(allocationConflicts([], [], catalog)).toEqual([]);
    expect(allocationConflicts([a], [], catalog)).toEqual([]);
  });

  it('reports zero owned when two decks want the card', () => {
    expect(allocationConflicts([a, b], [], catalog)[0]).toMatchObject({ owned: 0, demanded: 5 });
  });

  it('skips deleted decks and merges duplicate slots inside a deck', () => {
    const gone = makeDeck({ id: 'gone', deleted: true, main: [slot('fury-spell', 3)] });
    expect(allocationConflicts([a, gone], [], catalog)).toEqual([]);
    const dup = makeDeck({ id: 'dup', main: [slot('fury-spell', 1), slot('fury-spell', 1)] });
    expect(allocationConflicts([dup, b], [owns('fury-spell', 3)], catalog)).toEqual([
      { cardKey: 'fury-spell', owned: 3, demanded: 4, decks: ['dup', 'b'] },
    ]);
  });

  it('counts legends as demand', () => {
    const x = makeDeck({ id: 'x', legendKey: 'vi-piltover-enforcer' });
    const y = makeDeck({ id: 'y', legendKey: 'vi-piltover-enforcer' });
    expect(allocationConflicts([x, y], [owns('vi-piltover-enforcer', 1)], catalog)).toHaveLength(1);
  });
});
