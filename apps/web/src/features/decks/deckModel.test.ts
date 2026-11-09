import { describe, expect, it } from 'vitest';
import { defaultRules, legalCards, type Deck } from '@sc/core';
import {
  adjustCard,
  applyLegendChange,
  checkAdd,
  chooseChampion,
  championChoices,
  countOf,
  groupByType,
  legendChangeImpact,
  removeCard,
  setPin,
  toRows,
} from './deckModel';
import { makeTestCatalog } from './testCatalog';

const catalog = makeTestCatalog();
const card = (key: string) => {
  const found = catalog.cards[key];
  if (!found) throw new Error(`missing ${key}`);
  return found;
};

function deck(over: Partial<Deck> = {}): Deck {
  return { id: 'd1', name: 'Test', updatedAt: 1, legendKey: 'vi-legend', main: [], runes: [], battlefields: [], sideboard: [], ...over };
}

describe('adjustCard and copy limits', () => {
  it('adds copies up to the rules copy limit and then blocks with a reason', () => {
    let d = deck();
    for (let i = 0; i < defaultRules.copyLimit + 2; i++) d = adjustCard(d, catalog, card('fury-unit-1'), 'main', 1);
    expect(countOf(d, 'main', 'fury-unit-1')).toBe(defaultRules.copyLimit);
    const check = checkAdd(d, catalog, card('fury-unit-1'), 'main');
    expect(check.ok).toBe(false);
    expect(!check.ok && check.reason).toMatch(/limit/i);
  });

  it('counts the sideboard toward the copy limit when the rules say so', () => {
    const d = deck({ main: [{ cardKey: 'fury-unit-2', count: 2 }], sideboard: [{ cardKey: 'fury-unit-2', count: 1 }] });
    expect(checkAdd(d, catalog, card('fury-unit-2'), 'main').ok).toBe(false);
    expect(checkAdd(d, catalog, card('fury-unit-2'), 'sideboard').ok).toBe(false);
  });

  it('caps runes at the rune deck size and battlefields at one copy and the count', () => {
    const runes = deck({ runes: [{ cardKey: 'fury-rune', count: defaultRules.runeDeckSize }] });
    expect(checkAdd(runes, catalog, card('fury-rune'), 'runes').ok).toBe(false);
    const eleven = deck({ runes: [{ cardKey: 'fury-rune', count: defaultRules.runeDeckSize - 1 }] });
    expect(checkAdd(eleven, catalog, card('fury-rune'), 'runes').ok).toBe(true);
    const bf = deck({ battlefields: [{ cardKey: 'bf-1', count: 1 }] });
    expect(checkAdd(bf, catalog, card('bf-1'), 'battlefields').ok).toBe(false);
    expect(checkAdd(bf, catalog, card('bf-2'), 'battlefields').ok).toBe(true);
  });

  it('refuses a card in the wrong section', () => {
    expect(checkAdd(deck(), catalog, card('fury-rune'), 'main').ok).toBe(false);
    expect(checkAdd(deck(), catalog, card('fury-unit-1'), 'runes').ok).toBe(false);
  });

  it('removes copies and drops empty slots, clearing a champion with no copies left', () => {
    let d = deck({ main: [{ cardKey: 'vi-champ', count: 1 }], chosenChampionKey: 'vi-champ' });
    d = adjustCard(d, catalog, card('vi-champ'), 'main', -1);
    expect(d.main).toEqual([]);
    expect(d.chosenChampionKey).toBeUndefined();
  });

  it('does not mutate the input deck', () => {
    const d = deck();
    adjustCard(d, catalog, card('fury-unit-1'), 'main', 1);
    expect(d.main).toEqual([]);
  });
});

describe('signature limit', () => {
  it('stops adding signature cards at the rules limit', () => {
    const d = deck({ main: [{ cardKey: 'vi-sig', count: defaultRules.signatureLimit }] });
    const check = checkAdd(d, catalog, card('vi-sig'), 'main');
    expect(check.ok).toBe(false);
  });
});

describe('pins, champion and grouping', () => {
  it('pins a printing for every copy and clears the pin', () => {
    const d = deck({ main: [{ cardKey: 'fury-unit-3', count: 2 }] });
    const pinned = setPin(d, 'main', 'fury-unit-3', 'fury-unit-3-alt');
    expect(pinned.main).toEqual([{ cardKey: 'fury-unit-3', count: 2, printingKey: 'fury-unit-3-alt' }]);
    expect(setPin(pinned, 'main', 'fury-unit-3', undefined).main).toEqual([{ cardKey: 'fury-unit-3', count: 2 }]);
  });

  it('choosing a champion adds one to the main deck when absent', () => {
    const d = chooseChampion(deck(), catalog, card('vi-champ'));
    expect(d.chosenChampionKey).toBe('vi-champ');
    expect(countOf(d, 'main', 'vi-champ')).toBe(1);
  });

  it('lists only champions that match the legend', () => {
    expect(championChoices(card('vi-legend'), catalog).map((c) => c.cardKey)).toEqual(['vi-champ']);
    expect(championChoices(undefined, catalog)).toEqual([]);
  });

  it('groups rows by type in rules order and sorts within a group', () => {
    const rows = toRows(
      [
        { cardKey: 'fury-spell-1', count: 2 },
        { cardKey: 'fury-unit-5', count: 1 },
        { cardKey: 'fury-unit-1', count: 3 },
        { cardKey: 'order-gear', count: 1 },
        { cardKey: 'mystery', count: 1 },
      ],
      catalog,
    );
    const groups = groupByType(rows, 'energy');
    expect(groups.map((g) => g.type)).toEqual(['Unit', 'Spell', 'Gear', 'Unknown']);
    expect(groups[0]?.rows.map((r) => r.cardKey)).toEqual(['fury-unit-1', 'fury-unit-5']);
    expect(groups[0]?.total).toBe(4);
  });

  it('merges slots of one card and keeps the first pin', () => {
    const rows = toRows([{ cardKey: 'fury-unit-1', count: 1, printingKey: 'p' }, { cardKey: 'fury-unit-1', count: 1 }], catalog);
    expect(rows).toEqual([expect.objectContaining({ cardKey: 'fury-unit-1', count: 2, printingKey: 'p' })]);
  });
});

describe('legend change impact', () => {
  const d = deck({
    main: [
      { cardKey: 'fury-unit-1', count: 3 },
      { cardKey: 'vi-champ', count: 1 },
    ],
    runes: [{ cardKey: 'fury-rune', count: 12 }],
    chosenChampionKey: 'vi-champ',
  });

  it('lists the cards the new legend cannot use', () => {
    const impact = legendChangeImpact(d, 'jinx-legend', catalog);
    expect(impact.illegal.map((e) => e.cardKey).sort()).toEqual(['fury-rune', 'fury-unit-1', 'vi-champ']);
    expect(impact.championInvalid).toBe(true);
  });

  it('keeps everything for a legend that shares the identity', () => {
    expect(legendChangeImpact(d, 'vi-legend', catalog)).toEqual({ illegal: [], championInvalid: false });
  });

  it('applies the change keeping or dropping illegal cards', () => {
    const kept = applyLegendChange(d, 'jinx-legend', catalog, false);
    expect(kept.legendKey).toBe('jinx-legend');
    expect(kept.main).toHaveLength(2);
    expect(kept.chosenChampionKey).toBeUndefined();
    const dropped = applyLegendChange(d, 'jinx-legend', catalog, true);
    expect(dropped.main).toEqual([]);
    expect(dropped.runes).toEqual([]);
  });

  it('removeCard clears a stale champion', () => {
    expect(removeCard(d, 'main', 'vi-champ').chosenChampionKey).toBeUndefined();
  });
});

describe('fixture sanity', () => {
  it('has legal cards for the Vi legend and excludes off identity cards', () => {
    const keys = legalCards(card('vi-legend'), catalog).map((c) => c.cardKey);
    expect(keys).toContain('fury-unit-1');
    expect(keys).not.toContain('chaos-unit');
  });
});
