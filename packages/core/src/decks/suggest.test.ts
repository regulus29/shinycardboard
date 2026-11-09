import { describe, expect, it } from 'vitest';
import { defaultRules } from '../rules/rules';
import { legalCards } from './legal';
import { suggestFill } from './suggest';
import { fillerCards, fixtureCards, makeCard, makeCatalog, makeDeck, owns, slot } from './testing';
import type { FillSuggestion } from './deck-types';

const catalog = makeCatalog([...fixtureCards(), ...fillerCards(22)]);
const LEGEND = 'vi-piltover-enforcer';
const everything = () => Object.keys(catalog.cards).map((k) => owns(k, 3));
const mainOf = (list: FillSuggestion[]) => list.filter((s) => s.section === 'main');
const total = (list: FillSuggestion[]) => list.reduce((sum, s) => sum + s.count, 0);

describe('suggestFill: guards', () => {
  it('returns nothing without a legend, with an unknown legend or with an empty collection', () => {
    expect(suggestFill(makeDeck(), everything(), catalog)).toEqual([]);
    expect(suggestFill(makeDeck({ legendKey: 'ghost' }), everything(), catalog)).toEqual([]);
    expect(suggestFill(makeDeck({ legendKey: LEGEND }), [], catalog).filter((s) => s.count > 0)).toEqual([]);
  });

  it('returns no main deck suggestions once the main deck is full', () => {
    const deck = makeDeck({ legendKey: LEGEND, main: Array.from({ length: 14 }, (_, i) => slot(`filler-${i}`, 3)) });
    const cat = makeCatalog([...fixtureCards(), ...fillerCards(42)]);
    const owned = Object.keys(cat.cards).map((k) => owns(k, 3));
    expect(mainOf(suggestFill(deck, owned, cat))).toEqual([]);
  });
});

describe('suggestFill: main deck', () => {
  const deck = makeDeck({ legendKey: LEGEND });

  it('puts the chosen champion first when the deck has none', () => {
    const [first] = suggestFill(deck, everything(), catalog);
    expect(first?.cardKey).toMatch(/^vi-(destructive|peacekeeper)$/);
    expect(first?.reason).toContain('Chosen champion');
  });

  it('fills the open slots with only legal owned cards within the copy limit', () => {
    const picks = mainOf(suggestFill(deck, everything(), catalog));
    const legal = new Set(legalCards(catalog.cards[LEGEND], catalog).map((c) => c.cardKey));
    expect(total(picks)).toBe(defaultRules.mainDeckSize);
    for (const p of picks) {
      expect(legal.has(p.cardKey)).toBe(true);
      expect(p.count).toBeLessThanOrEqual(defaultRules.copyLimit);
      expect(catalog.cards[p.cardKey]?.type).not.toBe('Rune');
    }
  });

  it('never offers more copies than are owned', () => {
    const picks = mainOf(suggestFill(deck, [owns('vi-destructive', 1), owns('fury-spell', 2)], catalog));
    expect(picks.map((p) => [p.cardKey, p.count])).toEqual(expect.arrayContaining([['vi-destructive', 1], ['fury-spell', 2]]));
    expect(total(picks)).toBe(3);
  });

  it('subtracts copies already in the main deck and the sideboard', () => {
    const partial = makeDeck({ legendKey: LEGEND, main: [slot('fury-spell', 2)], sideboard: [slot('order-unit', 3)] });
    const picks = mainOf(suggestFill(partial, [owns('fury-spell', 5), owns('order-unit', 5)], catalog));
    expect(picks.find((p) => p.cardKey === 'fury-spell')?.count).toBe(1);
    expect(picks.find((p) => p.cardKey === 'order-unit')).toBeUndefined();
  });

  it('respects domain identity', () => {
    const picks = suggestFill(deck, [owns('chaos-unit', 3), owns('mixed-spell', 3), owns('fury-spell', 1)], catalog);
    expect(picks.filter((p) => p.count > 0).map((p) => p.cardKey)).toEqual(['fury-spell']);
  });

  it('prefers a card that fills an empty part of the curve', () => {
    const cards = [
      ...fixtureCards(),
      ...['a', 'b', 'c', 'd'].map((k) => makeCard(`cheap-${k}`, { energy: 1 })),
      makeCard('cheap-extra', { energy: 1 }),
      makeCard('mid', { energy: 3 }),
    ];
    const cat = makeCatalog(cards);
    const cheap = ['a', 'b', 'c', 'd'].map((k) => slot(`cheap-${k}`, 3));
    const partial = makeDeck({ legendKey: LEGEND, main: [slot('vi-destructive', 1), ...cheap] });
    const [first] = suggestFill(partial, [owns('cheap-extra', 3), owns('mid', 3)], cat);
    expect(first?.cardKey).toBe('mid');
    expect(first?.reason).toContain('3 energy');
  });

  it('favors cards sharing the legend champion tag and says so', () => {
    const cards = [...fixtureCards(), makeCard('tagged', { energy: 2, tags: ['Vi'] }), makeCard('plain', { energy: 2 })];
    const cat = makeCatalog(cards);
    const partial = makeDeck({ legendKey: LEGEND, main: [slot('vi-destructive', 1)] });
    const [first] = suggestFill(partial, [owns('plain', 3), owns('tagged', 3)], cat);
    expect(first?.cardKey).toBe('tagged');
    expect(first?.reason).toContain('Vi');
  });

  it('mentions signature cards of the legend', () => {
    const partial = makeDeck({ legendKey: LEGEND, main: [slot('vi-destructive', 1)] });
    const [first] = suggestFill(partial, [owns('hextech-gauntlets', 1)], catalog);
    expect(first?.reason).toContain('Signature card');
  });

  it('gives every suggestion a plain ASCII reason, a count and a section', () => {
    for (const s of suggestFill(deck, everything(), catalog)) {
      expect(s.reason).toMatch(/^[A-Z][A-Za-z ]+/);
      expect(s.reason).toMatch(/^[\x20-\x7e]+$/);
      expect(s.count).toBeGreaterThan(0);
      expect(['main', 'runes', 'battlefields']).toContain(s.section);
    }
  });

  it('is deterministic', () => {
    expect(suggestFill(deck, everything(), catalog)).toEqual(suggestFill(deck, everything(), catalog));
  });
});

describe('suggestFill: runes and battlefields', () => {
  const deck = makeDeck({ legendKey: LEGEND });
  const section = (list: FillSuggestion[], name: FillSuggestion['section']) => list.filter((s) => s.section === name);

  it('balances runes across the legend domains and skips off identity runes', () => {
    const runes = section(suggestFill(deck, [owns('fury-rune', 12), owns('order-rune', 12), owns('chaos-rune', 12)], catalog), 'runes');
    expect(runes.map((r) => [r.cardKey, r.count])).toEqual([['fury-rune', 6], ['order-rune', 6]]);
  });

  it('tops up around runes already in the deck and stops at the owned count', () => {
    const partial = makeDeck({ legendKey: LEGEND, runes: [slot('fury-rune', 6)] });
    const runes = section(suggestFill(partial, [owns('fury-rune', 8), owns('order-rune', 2)], catalog), 'runes');
    expect(total(runes)).toBe(4);
    expect(runes.find((r) => r.cardKey === 'order-rune')?.count).toBe(2);
  });

  it('suggests owned battlefields not already chosen', () => {
    const partial = makeDeck({ legendKey: LEGEND, battlefields: [slot('bf-a')] });
    const picks = section(suggestFill(partial, [owns('bf-a', 1), owns('bf-b', 2), owns('bf-c', 1)], catalog), 'battlefields');
    expect(picks.map((p) => [p.cardKey, p.count])).toEqual([['bf-b', 1], ['bf-c', 1]]);
  });
});
