/** Hand-made catalog fixtures for tests, modeled on real Riftcodex records. Not part of the public API. */
import type { Card, Catalog, Deck, DeckSlot, Domain, OwnedEntry, Printing } from '../types';

let nextId = 0;

export function makeCard(cardKey: string, overrides: Partial<Card> = {}): Card {
  return {
    cardKey,
    name: cardKey,
    type: 'Unit',
    supertype: null,
    domains: ['Fury'],
    energy: 2,
    might: 2,
    power: null,
    rulesText: '',
    tags: [],
    keywords: [],
    printingKeys: [`ogn-${cardKey}`],
    ...overrides,
  };
}

export function makePrinting(cardKey: string, overrides: Partial<Printing> = {}): Printing {
  return {
    printingKey: `ogn-${cardKey}`,
    cardKey,
    setId: 'OGN',
    setLabel: 'Origins',
    collectorNumber: 1,
    riftboundId: 'ogn-001-298',
    variant: 'standard',
    variantLabel: null,
    rarity: 'Common',
    imageUrl: '',
    artist: null,
    sourceId: cardKey,
    tcgplayerId: null,
    ...overrides,
  };
}

/** Catalog from cards, each with printings named by its printingKeys. Extra printings are added as given. */
export function makeCatalog(cards: Card[], extraPrintings: Printing[] = []): Catalog {
  const printings: Record<string, Printing> = {};
  for (const card of cards) {
    for (const printingKey of card.printingKeys) {
      printings[printingKey] = makePrinting(card.cardKey, { printingKey });
    }
  }
  for (const p of extraPrintings) printings[p.printingKey] = p;
  return {
    builtAt: 'test',
    cards: Object.fromEntries(cards.map((c) => [c.cardKey, c])),
    printings,
    sets: [{ setId: 'OGN', label: 'Origins', count: cards.length }],
  };
}

export function makeOwned(printingKey: string, quantity: number, overrides: Partial<OwnedEntry> = {}): OwnedEntry {
  nextId += 1;
  return { id: `o${nextId}`, updatedAt: 0, printingKey, finish: 'normal', condition: 'NM', quantity, ...overrides };
}

/** Owned copies of a card via its default test printing. */
export function owns(cardKey: string, quantity: number): OwnedEntry {
  return makeOwned(`ogn-${cardKey}`, quantity);
}

export function makeDeck(overrides: Partial<Deck> = {}): Deck {
  nextId += 1;
  return { id: `d${nextId}`, updatedAt: 0, name: 'Test deck', main: [], runes: [], battlefields: [], sideboard: [], ...overrides };
}

export function slot(cardKey: string, count = 1, printingKey?: string): DeckSlot {
  return printingKey === undefined ? { cardKey, count } : { cardKey, count, printingKey };
}

const FURY_ORDER: Domain[] = ['Fury', 'Order'];
const FURY_CHAOS: Domain[] = ['Fury', 'Chaos'];

/** Small catalog modeled on real data: Vi (Fury+Order) and Jinx (Fury+Chaos) legends, champions, signatures, runes, battlefields. */
export function fixtureCards(): Card[] {
  const rune = (key: string, domain: Domain) =>
    makeCard(key, { name: `${domain} Rune`, type: 'Rune', supertype: 'Basic', domains: [domain], energy: null, might: null });
  const battlefield = (key: string) =>
    makeCard(key, { name: key, type: 'Battlefield', domains: ['Colorless'], energy: null, might: null });
  return [
    makeCard('vi-piltover-enforcer', { name: 'Vi - Piltover Enforcer', type: 'Legend', domains: FURY_ORDER, energy: null, might: null, tags: ['Vi'] }),
    makeCard('vi-destructive', { name: 'Vi - Destructive', supertype: 'Champion', domains: ['Fury'], energy: 2, tags: ['Vi', 'Piltover'] }),
    makeCard('vi-peacekeeper', { name: 'Vi - Peacekeeper', supertype: 'Champion', domains: ['Order'], energy: 5, tags: ['Vi', 'Piltover'] }),
    makeCard('hextech-gauntlets', { name: 'Hextech Gauntlets', type: 'Gear', supertype: 'Signature', domains: FURY_ORDER, energy: 3, tags: ['Vi', 'Equipment'] }),
    makeCard('jinx-loose-cannon', { name: 'Jinx - Loose Cannon', type: 'Legend', domains: FURY_CHAOS, energy: null, might: null, tags: ['Jinx'] }),
    makeCard('jinx-demolitionist', { name: 'Jinx - Demolitionist', supertype: 'Champion', domains: ['Chaos'], energy: 3, tags: ['Jinx', 'Zaun'] }),
    makeCard('get-excited', { name: 'Get Excited', type: 'Spell', supertype: 'Signature', domains: FURY_CHAOS, energy: 2, tags: ['Jinx'] }),
    makeCard('fury-spell', { name: 'Fury Spell', type: 'Spell', domains: ['Fury'], energy: 1 }),
    makeCard('order-unit', { name: 'Order Unit', domains: ['Order'], energy: 3 }),
    makeCard('chaos-unit', { name: 'Chaos Unit', domains: ['Chaos'], energy: 3 }),
    makeCard('mixed-spell', { name: 'Fury Chaos Spell', type: 'Spell', domains: FURY_CHAOS, energy: 4 }),
    makeCard('colorless-unit', { name: 'Colorless Unit', domains: ['Colorless'], energy: 1 }),
    rune('fury-rune', 'Fury'),
    rune('order-rune', 'Order'),
    rune('chaos-rune', 'Chaos'),
    battlefield('bf-a'),
    battlefield('bf-b'),
    battlefield('bf-c'),
    makeCard('recruit-token', { name: 'Recruit', type: 'Unit', supertype: 'Token', domains: ['Colorless'], energy: null }),
  ];
}

/** A complete legal Vi deck over the fixture catalog (40 main, 12 runes, 3 battlefields), spread over legal cards. */
export function legalViDeck(overrides: Partial<Deck> = {}): Deck {
  return makeDeck({
    legendKey: 'vi-piltover-enforcer',
    main: [slot('vi-destructive', 3), slot('vi-peacekeeper', 3), slot('hextech-gauntlets', 3), slot('fury-spell', 3), slot('order-unit', 3), slot('colorless-unit', 3), ...fillerSlots(22)],
    runes: [slot('fury-rune', 6), slot('order-rune', 6)],
    battlefields: [slot('bf-a'), slot('bf-b'), slot('bf-c')],
    ...overrides,
  });
}

/** Filler slots of generated filler cards, three copies each, totalling `total` copies. */
export function fillerSlots(total: number, prefix = 'filler'): DeckSlot[] {
  const slots: DeckSlot[] = [];
  for (let n = 0, left = total; left > 0; n++, left -= 3) slots.push(slot(`${prefix}-${n}`, Math.min(3, left)));
  return slots;
}

const DOMAINS: Domain[] = ['Fury', 'Calm', 'Mind', 'Body', 'Chaos', 'Order'];

/**
 * Deterministic synthetic catalog of roughly `size` cards shaped like the real set:
 * legends with two domains, champions and signature cards per legend, basic runes,
 * battlefields and a bulk of single or dual domain units, spells and gear.
 */
export function syntheticCatalog(size: number): Catalog {
  const cards: Card[] = [];
  const legendCount = Math.floor(size / 25);
  for (let i = 0; i < legendCount; i++) {
    const domains: Domain[] = [DOMAINS[i % 6] as Domain, DOMAINS[(i + 1 + (i % 4)) % 6] as Domain];
    const tag = `champ${i}`;
    cards.push(makeCard(`legend-${i}`, { type: 'Legend', domains, energy: null, tags: [tag] }));
    cards.push(makeCard(`sig-${i}`, { type: 'Spell', supertype: 'Signature', domains, tags: [tag] }));
    for (let c = 0; c < 6; c++) {
      const domain = domains[c % 2] as Domain;
      cards.push(makeCard(`champion-${i}-${c}`, { supertype: 'Champion', domains: [domain], energy: 2 + (c % 5), tags: [tag, 'Faction'] }));
    }
  }
  for (const domain of DOMAINS) {
    cards.push(makeCard(`rune-${domain}`, { type: 'Rune', supertype: 'Basic', domains: [domain], energy: null }));
  }
  for (let b = 0; b < legendCount; b++) {
    cards.push(makeCard(`battlefield-${b}`, { type: 'Battlefield', domains: ['Colorless'], energy: null }));
  }
  const types = ['Unit', 'Spell', 'Gear'] as const;
  for (let n = 0; cards.length < size; n++) {
    const first = DOMAINS[n % 6] as Domain;
    const domains: Domain[] = n % 7 === 0 ? [first, DOMAINS[(n + 2) % 6] as Domain] : [first];
    cards.push(makeCard(`card-${n}`, { type: types[n % 3] ?? 'Unit', domains, energy: n % 9 }));
  }
  return makeCatalog(cards);
}

/** Owned entries for every card in the catalog at `copies` each. */
export function ownEverything(catalog: Catalog, copies = 3): OwnedEntry[] {
  return Object.values(catalog.cards).map((card) => owns(card.cardKey, copies));
}

/** Filler cards matching fillerSlots: Fury units with a spread of costs. */
export function fillerCards(total: number, prefix = 'filler'): Card[] {
  return fillerSlots(total, prefix).map((s, n) => makeCard(s.cardKey, { name: s.cardKey, domains: ['Fury'], energy: n % 8 }));
}

/** Owned entries (via each card's first printing) for the given cards, `copies` each. */
export function ownCards(catalog: Catalog, cards: Card[], copies = 3): OwnedEntry[] {
  return cards.flatMap((card) => {
    const printingKey = card.printingKeys.find((k) => catalog.printings[k]);
    return printingKey ? [makeOwned(printingKey, copies)] : [];
  });
}
