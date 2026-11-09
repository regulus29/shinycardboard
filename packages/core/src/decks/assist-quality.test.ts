import { describe, expect, it } from 'vitest';
import { defaultAssist, defaultRules } from '../rules/rules';
import { buildableLegends } from './buildable';
import { drawHand, seededRng } from './hand';
import { suggestFill, suggestMissing } from './suggest';
import {
  fillerCards, fixtureCards, legalViDeck, makeCard, makeCatalog, makeDeck, makePrinting, owns, slot,
} from './testing';

const LEGEND = 'vi-piltover-enforcer';
const base = [...fixtureCards(), ...fillerCards(22)];
const ownAll = (cat: ReturnType<typeof makeCatalog>, copies = 3) =>
  Object.keys(cat.cards).map((k) => owns(k, cat.cards[k]?.type === 'Rune' ? 12 : copies));
const mainPicks = (list: ReturnType<typeof suggestFill>) => list.filter((s) => s.section === 'main');
const count = (list: ReturnType<typeof suggestFill>) => list.reduce((sum, s) => sum + s.count, 0);

describe('suggestFill: coherent decks', () => {
  /** Vi plus extra Fury champions of other names, to tempt the greedy fill into a champion pile. */
  const champions = ['a', 'b', 'c', 'd', 'e'].map((k, i) =>
    makeCard(`extra-champ-${k}`, { name: `Extra ${k} - Champion`, supertype: 'Champion', domains: ['Fury'], energy: 2 + i, tags: [`Extra${k}`] }));
  const cat = makeCatalog([...base, ...champions]);

  it('picks one chosen champion line at x3 and flags it with a role', () => {
    const picks = mainPicks(suggestFill(makeDeck({ legendKey: LEGEND }), ownAll(cat), cat));
    const chosen = picks.filter((p) => p.role === 'chosen-champion');
    expect(chosen).toHaveLength(1);
    expect(picks[0]).toBe(chosen[0]);
    expect(chosen[0]?.count).toBe(defaultRules.copyLimit);
    expect(chosen[0]?.reason).toContain('Chosen champion for Vi - Piltover Enforcer');
  });

  it('adds at most the configured number of other champion cards', () => {
    const picks = mainPicks(suggestFill(makeDeck({ legendKey: LEGEND }), ownAll(cat), cat));
    const champs = picks.filter((p) => cat.cards[p.cardKey]?.supertype === 'Champion');
    expect(champs.length).toBeLessThanOrEqual(1 + defaultAssist.otherChampionCards);
  });

  it('honors Deck.chosenChampionKey and keeps adding copies of that line', () => {
    const deck = makeDeck({ legendKey: LEGEND, chosenChampionKey: 'vi-peacekeeper', main: [slot('vi-peacekeeper', 1)] });
    const picks = mainPicks(suggestFill(deck, ownAll(cat), cat));
    expect(picks.find((p) => p.role === 'chosen-champion')).toBeUndefined();
    const line = picks.find((p) => p.cardKey === 'vi-peacekeeper');
    expect(line).toMatchObject({ count: 2, reason: expect.stringContaining('chosen champion') });
  });

  it('prefers the champion tag over a faction tag at equal cost', () => {
    const tagged = [
      makeCard('champion-tagged', { energy: 2, tags: ['Vi'] }),
      makeCard('faction-tagged', { energy: 2, tags: ['Piltover'] }),
    ];
    const tcat = makeCatalog([...fixtureCards(), ...tagged]);
    const deck = makeDeck({ legendKey: LEGEND, chosenChampionKey: 'vi-destructive', main: [slot('vi-destructive', 3)] });
    const [first] = mainPicks(suggestFill(deck, [owns('champion-tagged', 3), owns('faction-tagged', 3)], tcat));
    expect(first?.cardKey).toBe('champion-tagged');
  });

  it('never suggests more than the signature limit in total', () => {
    const sigs = ['a', 'b', 'c', 'd', 'e'].map((k) => makeCard(`vi-sig-${k}`, { type: 'Spell', supertype: 'Signature', domains: ['Fury'], energy: 2, tags: ['Vi'] }));
    const scat = makeCatalog([...base, ...sigs]);
    const picks = mainPicks(suggestFill(makeDeck({ legendKey: LEGEND }), ownAll(scat), scat));
    const sigCopies = picks.filter((p) => scat.cards[p.cardKey]?.supertype === 'Signature').reduce((sum, p) => sum + p.count, 0);
    expect(sigCopies).toBe(defaultRules.signatureLimit);
  });

  it('counts signature cards already in the deck against the limit', () => {
    const deck = makeDeck({ legendKey: LEGEND, chosenChampionKey: 'vi-destructive', main: [slot('vi-destructive', 3), slot('hextech-gauntlets', 3)] });
    const sigs = makeCard('vi-sig-x', { type: 'Spell', supertype: 'Signature', domains: ['Fury'], energy: 2, tags: ['Vi'] });
    const scat = makeCatalog([...base, sigs]);
    expect(mainPicks(suggestFill(deck, [owns('vi-sig-x', 3), owns('fury-spell', 3)], scat)).map((p) => p.cardKey)).toEqual(['fury-spell']);
  });

  it('gives every suggestion a section and one of the known reason forms', () => {
    const reasonForm = /^(Chosen champion for|More copies of|Signature card for|Shares the|Fills the|Deck is light on|Owned legal card|Keeps the rune deck|Battlefield for)/;
    for (const s of suggestFill(makeDeck({ legendKey: LEGEND }), ownAll(cat), cat)) {
      expect(s.reason).toMatch(reasonForm);
      expect(s.reason).toMatch(/^[\x20-\x7e]+$/);
    }
  });
});

describe('suggestMissing', () => {
  const pricey = makeCard('pricey', { energy: 2, tags: ['Vi'] });
  const cheap = makeCard('cheap', { energy: 2, tags: ['Vi'] });
  const cat = makeCatalog([...base, pricey, cheap], [
    makePrinting('pricey', { printingKey: 'ogn-pricey', rarity: 'Epic' }),
    makePrinting('cheap', { printingKey: 'ogn-cheap', rarity: 'Common' }),
  ]);

  it('is empty when the owned cards already complete the deck', () => {
    expect(suggestMissing(legalViDeck(), ownAll(cat).concat(owns(LEGEND, 1)), cat)).toEqual([]);
  });

  it('lists the legend, runes, battlefields and a full main deck for an empty collection', () => {
    const buys = suggestMissing(makeDeck({ legendKey: LEGEND }), [], cat);
    expect(buys[0]).toMatchObject({ cardKey: LEGEND, section: 'legend', count: 1 });
    const total = (section: string) => buys.filter((b) => b.section === section).reduce((sum, b) => sum + b.count, 0);
    expect(total('main')).toBe(defaultRules.mainDeckSize);
    expect(total('runes')).toBe(defaultRules.runeDeckSize);
    expect(total('battlefields')).toBe(defaultRules.battlefieldCount);
  });

  it('asks only for what the collection lacks, cheapest rarity first, with no prices', () => {
    const deck = legalViDeck({ main: legalViDeck().main.filter((s) => s.cardKey !== 'filler-0') });
    const owned = ownAll(cat).filter((o) => o.printingKey !== 'ogn-pricey' && o.printingKey !== 'ogn-cheap');
    const buys = suggestMissing(deck, owned, cat);
    const bought = buys.filter((b) => b.section === 'main');
    expect(bought.map((b) => b.cardKey)).not.toContain('pricey');
    expect(bought.every((b) => b.reason.startsWith('Common rarity.'))).toBe(true);
    expect(JSON.stringify(buys)).not.toMatch(/\$|price/i);
  });

  it('asks only for the slots the owned cards cannot fill', () => {
    const owned = [owns(LEGEND, 1), owns('filler-0', 3), owns('filler-1', 3)];
    const deck = makeDeck({ legendKey: LEGEND, main: [slot('vi-destructive', 3)] });
    const buys = suggestMissing(deck, owned, cat);
    expect(buys.find((b) => b.cardKey === LEGEND)).toBeUndefined();
    expect(buys.filter((b) => b.cardKey.startsWith('filler-0') || b.cardKey === 'filler-1')).toEqual([]);
    expect(buys.filter((b) => b.section === 'main').reduce((sum, b) => sum + b.count, 0)).toBe(defaultRules.mainDeckSize - 3 - 6);
  });
});

describe('buildableLegends: discrimination', () => {
  const legend = (key: string, tag: string) =>
    makeCard(key, { name: `${tag} - Legend`, type: 'Legend', domains: ['Fury', 'Order'], energy: null, tags: [tag] });
  const champion = (tag: string) =>
    makeCard(`${tag}-champ`, { name: `${tag} - Champ`, supertype: 'Champion', domains: ['Fury'], tags: [tag] });
  const sig = (tag: string, n: number) =>
    makeCard(`${tag}-sig-${n}`, { type: 'Spell', supertype: 'Signature', domains: ['Fury'], tags: [tag] });
  const cat = makeCatalog([
    legend('legend-a', 'Aaa'), legend('legend-b', 'Bbb'), champion('Aaa'), champion('Bbb'),
    ...[1, 2, 3, 4, 5].map((n) => sig('Aaa', n)),
    ...fillerCards(40, 'common'),
    makeCard('fury-rune', { type: 'Rune', domains: ['Fury'], energy: null }),
    makeCard('order-rune', { type: 'Rune', domains: ['Order'], energy: null }),
    makeCard('chaos-rune', { type: 'Rune', domains: ['Chaos'], energy: null }),
  ]);
  const common = fillerCards(40, 'common').map((c) => owns(c.cardKey, 3));
  const find = (rows: ReturnType<typeof buildableLegends>, key: string) => rows.find((r) => r.legendKey === key);

  it('ranks the legend whose champion is owned above one with the same pool but no champion', () => {
    const rows = buildableLegends(cat, [...common, owns('Aaa-champ', 3)]);
    expect(rows.map((r) => r.legendKey)).toEqual(['legend-a', 'legend-b']);
    expect(find(rows, 'legend-a')).toMatchObject({ championAvailable: true, championChoices: 1 });
    expect(find(rows, 'legend-b')).toMatchObject({ championAvailable: false, championChoices: 0 });
    expect((find(rows, 'legend-a')?.score ?? 0)).toBeGreaterThan(find(rows, 'legend-b')?.score ?? 0);
  });

  it('caps signature coverage at the signature limit', () => {
    const sigs = [1, 2, 3, 4, 5].map((n) => owns(`Aaa-sig-${n}`, 3));
    const row = find(buildableLegends(cat, [...common, owns('Aaa-champ', 3), ...sigs]), 'legend-a');
    expect(row?.signatureOwned).toBe(defaultRules.signatureLimit);
    const baseline = find(buildableLegends(cat, [...common, owns('Aaa-champ', 3)]), 'legend-a');
    expect((row?.ownedLegalCards ?? 0) - (baseline?.ownedLegalCards ?? 0)).toBe(defaultRules.signatureLimit);
  });

  it('does not credit another legend signature cards', () => {
    const row = find(buildableLegends(cat, [...common, owns('Aaa-sig-1', 3)]), 'legend-b');
    expect(row?.signatureOwned).toBe(0);
  });

  it('counts runes only inside the legend identity, and any split of them is enough', () => {
    const monoFury = find(buildableLegends(cat, [owns('fury-rune', 12)]), 'legend-a');
    expect(monoFury?.sections.runes).toEqual({ have: 12, need: 12 });
    const offIdentity = find(buildableLegends(cat, [owns('chaos-rune', 12)]), 'legend-a');
    expect(offIdentity?.sections.runes).toEqual({ have: 0, need: 12 });
  });

  it('reports an honest per section breakdown and shortBy', () => {
    const row = find(buildableLegends(cat, [owns('legend-a', 1), ...common]), 'legend-a');
    expect(row?.sections.legend).toEqual({ have: 1, need: 1 });
    expect(row?.sections.main.have).toBe(defaultRules.mainDeckSize - 1);
    // One main slot (no champion owned), all runes and all battlefields are short.
    expect(row?.shortBy).toBe(1 + defaultRules.runeDeckSize + defaultRules.battlefieldCount);
    expect(row?.completeness).toBeCloseTo(1 - (row?.shortBy ?? 0) / 56);
  });

  it('breaks exact ties by legend key', () => {
    const rows = buildableLegends(cat, common);
    expect(rows.map((r) => r.legendKey)).toEqual(['legend-a', 'legend-b']);
  });
});

describe('drawHand with a chosen champion', () => {
  const cat = makeCatalog(base);
  const deck = legalViDeck({ chosenChampionKey: 'vi-peacekeeper' });

  it('sets the explicitly chosen champion aside, not the first matching one', () => {
    const draw = drawHand(deck, cat, 4, seededRng(5));
    expect(draw.champion).toBe('vi-peacekeeper');
    const all = [...draw.hand, ...draw.library];
    expect(all.filter((k) => k === 'vi-peacekeeper')).toHaveLength(2);
    expect(all.filter((k) => k === 'vi-destructive')).toHaveLength(3);
  });

  it('falls back to the first matching champion when the key is not in the main deck', () => {
    const rest = deck.main.filter((s) => s.cardKey !== 'vi-peacekeeper');
    const draw = drawHand({ ...deck, main: [...rest, slot('order-unit', 3)] }, cat, 4, seededRng(5));
    expect(draw.champion).toBe('vi-destructive');
  });
});
