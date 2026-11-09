import { describe, expect, it } from 'vitest';
import { deckStats } from './stats';
import { fixtureCards, legalViDeck, makeCard, makeCatalog, makeDeck, slot, fillerCards } from './testing';

const catalog = makeCatalog([...fixtureCards(), ...fillerCards(22)]);

describe('deckStats', () => {
  it('returns zeros for an empty deck', () => {
    expect(deckStats(makeDeck(), catalog)).toEqual({ mainCount: 0, curve: {}, byType: {}, byDomain: {}, averageEnergy: 0 });
  });

  it('computes curve, type split, domain split and average energy', () => {
    const deck = makeDeck({ main: [slot('fury-spell', 2), slot('order-unit', 1), slot('mixed-spell', 1)] });
    const stats = deckStats(deck, catalog);
    expect(stats.mainCount).toBe(4);
    expect(stats.curve).toEqual({ 1: 2, 3: 1, 4: 1 });
    expect(stats.byType).toEqual({ Spell: 3, Unit: 1 });
    expect(stats.byDomain).toEqual({ Fury: 3, Order: 1, Chaos: 1 });
    expect(stats.averageEnergy).toBeCloseTo((1 + 1 + 3 + 4) / 4);
  });

  it('merges duplicate slots and ignores bad counts', () => {
    const deck = makeDeck({ main: [slot('fury-spell', 1), slot('fury-spell', 2), slot('order-unit', 0), slot('order-unit', -1)] });
    expect(deckStats(deck, catalog)).toMatchObject({ mainCount: 3, curve: { 1: 3 } });
  });

  it('counts unknown cards toward the total only', () => {
    const stats = deckStats(makeDeck({ main: [slot('ghost', 2), slot('fury-spell', 1)] }), catalog);
    expect(stats.mainCount).toBe(3);
    expect(stats.curve).toEqual({ 1: 1 });
    expect(stats.averageEnergy).toBe(1);
  });

  it('keeps cards without a cost out of the curve and the average', () => {
    const cat = makeCatalog([makeCard('free', { energy: null }), makeCard('four', { energy: 4 })]);
    const stats = deckStats(makeDeck({ main: [slot('free', 2), slot('four', 1)] }), cat);
    expect(stats.curve).toEqual({ 4: 1 });
    expect(stats.averageEnergy).toBe(4);
  });

  it('describes only the main deck of a full deck', () => {
    const stats = deckStats(legalViDeck(), catalog);
    expect(stats.mainCount).toBe(40);
    expect(Object.values(stats.curve).reduce((a, b) => a + b, 0)).toBe(40);
    expect(stats.byType.Rune).toBeUndefined();
  });
});
