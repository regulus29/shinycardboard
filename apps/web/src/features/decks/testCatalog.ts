/** Small hand-made catalog and owned-row helpers for deck feature tests. Not imported by app code. */
import type { Card, Catalog, Domain, OwnedEntry, Printing } from '@sc/core';

const BASE_CARD: Omit<Card, 'cardKey' | 'name' | 'printingKeys'> = {
  type: 'Unit',
  supertype: null,
  domains: ['Fury'],
  energy: 2,
  might: 2,
  power: null,
  rulesText: '',
  tags: [],
  keywords: [],
};

function card(cardKey: string, name: string, overrides: Partial<Card> = {}): Card {
  return { ...BASE_CARD, cardKey, name, printingKeys: [`${cardKey}-std`], ...overrides };
}

function printingsFor(c: Card): Printing[] {
  return c.printingKeys.map((printingKey, i) => ({
    printingKey,
    cardKey: c.cardKey,
    setId: 'TST',
    setLabel: 'Test Set',
    collectorNumber: i + 1,
    riftboundId: `tst-${c.cardKey}`,
    variant: i === 0 ? 'standard' : 'alternate-art',
    variantLabel: i === 0 ? null : 'Alt',
    rarity: 'Common',
    imageUrl: '',
    artist: null,
    sourceId: c.cardKey,
    tcgplayerId: null,
  }));
}

const FURY_UNITS = [1, 2, 3, 4, 5, 6].map((energy) => card(`fury-unit-${energy}`, `Fury Unit ${energy}`, { energy }));
const FURY_SPELLS = [1, 2].map((energy) => card(`fury-spell-${energy}`, `Fury Spell ${energy}`, { type: 'Spell', energy, might: null }));

export const TEST_CARDS: Card[] = [
  card('vi-legend', 'Vi, Piltover Enforcer', { type: 'Legend', domains: ['Fury', 'Order'], tags: ['Vi', 'Piltover'], energy: null, might: null }),
  card('jinx-legend', 'Jinx, Loose Cannon', { type: 'Legend', domains: ['Chaos'], tags: ['Jinx'], energy: null, might: null }),
  card('vi-champ', 'Vi, Destructive', { supertype: 'Champion', tags: ['Vi'], energy: 4 }),
  card('jinx-champ', 'Jinx, Rebel', { supertype: 'Champion', tags: ['Jinx'], domains: ['Chaos'], energy: 3 }),
  card('vi-sig', 'Vi Signature Spell', { type: 'Spell', supertype: 'Signature', tags: ['Vi'], energy: 3, might: null }),
  card('chaos-unit', 'Chaos Unit', { domains: ['Chaos'], energy: 2 }),
  card('order-gear', 'Order Gear', { type: 'Gear', domains: ['Order'], energy: 1, might: null }),
  card('fury-rune', 'Fury Rune', { type: 'Rune', domains: ['Fury'], energy: null, might: null }),
  card('order-rune', 'Order Rune', { type: 'Rune', domains: ['Order'], energy: null, might: null }),
  card('chaos-rune', 'Chaos Rune', { type: 'Rune', domains: ['Chaos'], energy: null, might: null }),
  ...[1, 2, 3, 4].map((n) => card(`bf-${n}`, `Battlefield ${n}`, { type: 'Battlefield', domains: ['Colorless'], energy: null, might: null })),
  ...FURY_UNITS,
  ...FURY_SPELLS,
];

/** Give one card a second printing, for the printing picker. */
function withAltPrinting(cards: Card[], cardKey: string): Card[] {
  return cards.map((c) => (c.cardKey === cardKey ? { ...c, printingKeys: [...c.printingKeys, `${cardKey}-alt`] } : c));
}

export function makeTestCatalog(): Catalog {
  const cards = withAltPrinting(TEST_CARDS, 'fury-unit-3');
  return {
    builtAt: 'test',
    cards: Object.fromEntries(cards.map((c) => [c.cardKey, c])),
    printings: Object.fromEntries(cards.flatMap(printingsFor).map((p) => [p.printingKey, p])),
    sets: [{ setId: 'TST', label: 'Test Set', count: cards.length }],
  };
}

export function ownedRow(cardKey: string, quantity: number, printingKey = `${cardKey}-std`): OwnedEntry {
  return { id: `${printingKey}|normal|NM`, printingKey, finish: 'normal', condition: 'NM', quantity, updatedAt: 1 };
}

/** A collection that fully covers the Vi legend: every Fury card x3, runes, battlefields and the legend. */
export function viCollection(): OwnedEntry[] {
  const keys = TEST_CARDS.filter((c) => c.domains.includes('Fury' as Domain) || c.type === 'Battlefield').map((c) => c.cardKey);
  return [...keys.map((key) => ownedRow(key, key.endsWith('rune') ? 12 : 3)), ownedRow('vi-legend', 1)];
}
