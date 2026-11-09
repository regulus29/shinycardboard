import { describe, expect, it } from 'vitest';
import { defaultRules } from '../rules/rules';
import { deckCompletion } from './completion';
import { drawHand, mulligan, seededRng } from './hand';
import { fillerCards, fixtureCards, legalViDeck, makeCatalog, makeDeck, slot } from './testing';

const catalog = makeCatalog([...fixtureCards(), ...fillerCards(22)]);

describe('seededRng', () => {
  it('repeats for the same seed and differs for another', () => {
    const a = Array.from({ length: 5 }, seededRng(7));
    const b = Array.from({ length: 5 }, seededRng(7));
    expect(a).toEqual(b);
    expect(Array.from({ length: 5 }, seededRng(8))).not.toEqual(a);
  });

  it('stays in the half open range 0..1', () => {
    const rng = seededRng(42);
    for (let i = 0; i < 1000; i++) {
      const n = rng();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });
});

describe('drawHand', () => {
  const deck = legalViDeck();

  it('is deterministic for a seed and varies across seeds', () => {
    const first = drawHand(deck, catalog, 4, seededRng(1));
    expect(drawHand(deck, catalog, 4, seededRng(1))).toEqual(first);
    const others = [2, 3, 4, 5, 6].map((s) => drawHand(deck, catalog, 4, seededRng(s)).hand.join());
    expect(new Set([first.hand.join(), ...others]).size).toBeGreaterThan(1);
  });

  it('draws the requested hand size and uses the rules default', () => {
    expect(drawHand(deck, catalog, 7, seededRng(1)).hand).toHaveLength(7);
    expect(drawHand(deck, catalog, undefined, seededRng(1)).hand).toHaveLength(defaultRules.openingHandSize);
    expect(drawHand(deck, catalog, 0, seededRng(1)).hand).toEqual([]);
  });

  it('sets the chosen champion aside and conserves every other copy', () => {
    const draw = drawHand(deck, catalog, 4, seededRng(3));
    expect(draw.champion).toMatch(/^vi-/);
    const all = [...draw.hand, ...draw.library, draw.champion];
    expect(all).toHaveLength(40);
    expect(all.filter((k) => k === draw.champion)).toHaveLength(3);
  });

  it('keeps the champion in the library when the rules start it there', () => {
    const draw = drawHand(deck, catalog, 4, seededRng(3), { ...defaultRules, championStartsOutsideLibrary: false });
    expect(draw.champion).toBeUndefined();
    expect(draw.hand.length + draw.library.length).toBe(40);
  });

  it('merges duplicate slots and handles small or empty decks', () => {
    const dup = makeDeck({ main: [slot('fury-spell', 1), slot('fury-spell', 1)] });
    expect(drawHand(dup, catalog, 4, seededRng(1)).hand).toEqual(['fury-spell', 'fury-spell']);
    expect(drawHand(makeDeck(), catalog, 4, seededRng(1))).toEqual({ hand: [], library: [] });
  });

  it('does not mutate the deck', () => {
    const copy = structuredClone(deck);
    drawHand(deck, catalog, 4, seededRng(9));
    expect(deck).toEqual(copy);
  });
});

describe('mulligan', () => {
  const start = { hand: ['a', 'b', 'c', 'd'], library: ['w', 'x', 'y', 'z'] };

  it('replaces chosen cards from the top and sends them to the bottom', () => {
    expect(mulligan(start, [0, 2])).toEqual({ hand: ['w', 'b', 'x', 'd'], library: ['y', 'z', 'a', 'c'] });
  });

  it('honors at most the configured number and ignores bad or repeated indexes', () => {
    const result = mulligan(start, [3, 3, 9, -1, 1, 0, 2]);
    expect(result.hand.filter((_, i) => i < 4 && start.hand[i] !== result.hand[i])).toHaveLength(defaultRules.mulliganMax);
  });

  it('is a no-op with no indexes and never mutates its input', () => {
    expect(mulligan(start, [])).toEqual(start);
    const copy = structuredClone(start);
    mulligan(start, [0]);
    expect(start).toEqual(copy);
  });

  it('stops when the library runs dry', () => {
    expect(mulligan({ hand: ['a', 'b'], library: ['x'] }, [0, 1])).toEqual({ hand: ['x', 'b'], library: ['a'] });
  });

  it('keeps the set aside champion', () => {
    expect(mulligan({ ...start, champion: 'vi' }, [0]).champion).toBe('vi');
  });
});

describe('deckCompletion', () => {
  const byName = (deck: ReturnType<typeof makeDeck>) =>
    Object.fromEntries(deckCompletion(deck, catalog).sections.map((s) => [s.section, s]));

  it('marks a complete legal deck ready', () => {
    const result = deckCompletion(legalViDeck(), catalog);
    expect(result.ready).toBe(true);
    expect(result.percent).toBe(1);
    expect(result.sections.map((s) => s.section)).toEqual(['legend', 'main', 'runes', 'battlefields', 'sideboard']);
  });

  it('reports an empty deck as 0 percent with every section remaining', () => {
    const result = deckCompletion(makeDeck(), catalog);
    expect(result.percent).toBe(0);
    expect(result.ready).toBe(false);
    expect(byName(makeDeck())).toMatchObject({
      legend: { remaining: 1 },
      main: { count: 0, remaining: 40, complete: false },
      runes: { remaining: 12 },
      battlefields: { remaining: 3 },
    });
  });

  it('shows partial progress per section', () => {
    const deck = legalViDeck({ main: legalViDeck().main.slice(0, 3), runes: [slot('fury-rune', 6)] });
    const sections = byName(deck);
    expect(sections.main).toMatchObject({ count: 9, remaining: 31, complete: false });
    expect(sections.runes).toMatchObject({ count: 6, remaining: 6, complete: false });
    expect(sections.battlefields?.complete).toBe(true);
    expect(deckCompletion(deck, catalog).percent).toBeGreaterThan(0);
    expect(deckCompletion(deck, catalog).percent).toBeLessThan(1);
  });

  it('is not ready when sections are full but a rule is broken', () => {
    const deck = legalViDeck({ runes: [slot('chaos-rune', 12)] });
    const result = deckCompletion(deck, catalog);
    expect(byName(deck).runes?.complete).toBe(true);
    expect(result.ready).toBe(false);
  });

  it('treats the sideboard as optional and complete only at an allowed size', () => {
    const three = byName(legalViDeck({ sideboard: [slot('fury-spell', 3)] })).sideboard;
    expect(three).toMatchObject({ count: 3, target: 8, remaining: 5, complete: false });
    expect(byName(legalViDeck()).sideboard).toMatchObject({ count: 0, target: 0, complete: true });
    expect(deckCompletion(legalViDeck({ sideboard: [slot('filler-7', 2)] }), catalog).ready).toBe(true);
  });
});
