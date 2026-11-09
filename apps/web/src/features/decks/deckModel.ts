/** Pure deck editing model: slot math, copy limit checks, grouping and legend change impact. */
import {
  defaultRules,
  legalCards,
  legendChampionTags,
  type Card,
  type CardType,
  type Catalog,
  type Deck,
  type DeckSection,
  type DeckSlot,
  type RulesConfig,
} from '@sc/core';
import type { CardOrder } from './constants';

export type AddCheck = { ok: true } | { ok: false; reason: string };

const ALL_SECTIONS: readonly DeckSection[] = ['main', 'runes', 'battlefields', 'sideboard'];

export function slotsOf(deck: Deck, section: DeckSection): DeckSlot[] {
  return deck[section] ?? [];
}

export function withSlots(deck: Deck, section: DeckSection, slots: DeckSlot[]): Deck {
  return { ...deck, [section]: slots };
}

export function totalCount(slots: DeckSlot[]): number {
  return slots.reduce((sum, slot) => sum + Math.max(0, slot.count), 0);
}

/** Copies of one card in a section, summed over pinned printings. */
export function countOf(deck: Deck, section: DeckSection, cardKey: string): number {
  return totalCount(slotsOf(deck, section).filter((slot) => slot.cardKey === cardKey));
}

/** Copies counted against the per card limit: main plus sideboard when the rules say so. */
export function copiesTowardLimit(deck: Deck, cardKey: string, rules: RulesConfig = defaultRules): number {
  const side = rules.copyLimitAppliesAcrossSideboard ? countOf(deck, 'sideboard', cardKey) : 0;
  return countOf(deck, 'main', cardKey) + side;
}

export function isSignatureCard(card: Card, rules: RulesConfig = defaultRules): boolean {
  return card.supertype === rules.classification.signatureSupertype;
}

export function isChampionCard(card: Card, rules: RulesConfig = defaultRules): boolean {
  return card.type === rules.classification.championType && card.supertype === rules.classification.championSupertype;
}

/** Whether a card type may sit in a section at all. */
export function sectionAccepts(card: Card, section: DeckSection, rules: RulesConfig = defaultRules): boolean {
  const c = rules.classification;
  if (section === 'runes') return card.type === c.runeType;
  if (section === 'battlefields') return card.type === c.battlefieldType;
  const allowed: readonly string[] = section === 'main' ? c.mainDeckTypes : c.sideboardTypes;
  return allowed.includes(card.type);
}

export function copyLimitOf(card: Card, section: DeckSection, rules: RulesConfig = defaultRules): number {
  if (section === 'battlefields') return rules.battlefieldCopyLimit;
  if (rules.classification.copyLimitExemptTypes.includes(card.type)) return Number.POSITIVE_INFINITY;
  return rules.copyLimit;
}

function signatureCopies(deck: Deck, catalog: Catalog, rules: RulesConfig): number {
  const sections: DeckSection[] = rules.signatureLimitAppliesAcrossSideboard ? ['main', 'sideboard'] : ['main'];
  return sections.reduce((sum, section) => {
    const own = slotsOf(deck, section).filter((slot) => {
      const card = catalog.cards[slot.cardKey];
      return card !== undefined && isSignatureCard(card, rules);
    });
    return sum + totalCount(own);
  }, 0);
}

function sectionCap(section: DeckSection, rules: RulesConfig): number {
  if (section === 'runes') return rules.runeDeckSize;
  if (section === 'battlefields') return rules.battlefieldCount;
  return Number.POSITIVE_INFINITY;
}

/** Can one more copy of the card go into the section? The reason is plain language for a tooltip. */
export function checkAdd(deck: Deck, catalog: Catalog, card: Card, section: DeckSection, rules: RulesConfig = defaultRules): AddCheck {
  if (!sectionAccepts(card, section, rules)) return { ok: false, reason: `${card.type} cards cannot go in this section` };
  const cap = sectionCap(section, rules);
  if (totalCount(slotsOf(deck, section)) >= cap) {
    return { ok: false, reason: section === 'runes' ? `The rune deck is full (${cap})` : `All ${cap} battlefields are chosen` };
  }
  if (section === 'runes') return { ok: true };
  const limit = copyLimitOf(card, section, rules);
  const have = section === 'battlefields' ? countOf(deck, section, card.cardKey) : copiesTowardLimit(deck, card.cardKey, rules);
  if (have >= limit) return { ok: false, reason: limit === 1 ? 'Only one copy is allowed' : `Copy limit reached (${limit})` };
  if (isSignatureCard(card, rules) && signatureCopies(deck, catalog, rules) >= rules.signatureLimit) {
    return { ok: false, reason: `Signature limit reached (${rules.signatureLimit})` };
  }
  return { ok: true };
}

/** The chosen champion must be in the main deck, so dropping its last copy clears the choice. */
function clearStaleChampion(deck: Deck): Deck {
  const key = deck.chosenChampionKey;
  if (!key || countOf(deck, 'main', key) > 0) return deck;
  return { ...deck, chosenChampionKey: undefined };
}

/** Add (+1) or remove (-1) one copy. Returns the same deck when the change is blocked. */
export function adjustCard(deck: Deck, catalog: Catalog, card: Card, section: DeckSection, delta: 1 | -1, rules: RulesConfig = defaultRules): Deck {
  const slots = slotsOf(deck, section);
  if (delta === 1) {
    if (!checkAdd(deck, catalog, card, section, rules).ok) return deck;
    const at = slots.findIndex((slot) => slot.cardKey === card.cardKey);
    if (at < 0) return withSlots(deck, section, [...slots, { cardKey: card.cardKey, count: 1 }]);
    return withSlots(deck, section, slots.map((slot, i) => (i === at ? { ...slot, count: slot.count + 1 } : slot)));
  }
  const last = slots.map((slot) => slot.cardKey).lastIndexOf(card.cardKey);
  if (last < 0) return deck;
  const next = slots.map((slot, i) => (i === last ? { ...slot, count: slot.count - 1 } : slot)).filter((slot) => slot.count > 0);
  return clearStaleChampion(withSlots(deck, section, next));
}

/** Remove every copy of a card from a section. */
export function removeCard(deck: Deck, section: DeckSection, cardKey: string): Deck {
  return clearStaleChampion(withSlots(deck, section, slotsOf(deck, section).filter((slot) => slot.cardKey !== cardKey)));
}

/** Pin a card in a section to one printing, or clear the pin. The pin covers every copy of the card. */
export function setPin(deck: Deck, section: DeckSection, cardKey: string, printingKey: string | undefined): Deck {
  const slots = slotsOf(deck, section);
  const total = countOf(deck, section, cardKey);
  const at = slots.findIndex((slot) => slot.cardKey === cardKey);
  if (total === 0 || at < 0) return deck;
  const merged: DeckSlot = printingKey ? { cardKey, count: total, printingKey } : { cardKey, count: total };
  const rest = slots.filter((slot) => slot.cardKey !== cardKey);
  return withSlots(deck, section, [...rest.slice(0, at), merged, ...rest.slice(at)]);
}

/** Make a champion the chosen one and make sure a copy is in the main deck. */
export function chooseChampion(deck: Deck, catalog: Catalog, champion: Card | undefined, rules: RulesConfig = defaultRules): Deck {
  if (!champion) return { ...deck, chosenChampionKey: undefined };
  const withKey = { ...deck, chosenChampionKey: champion.cardKey };
  if (countOf(withKey, 'main', champion.cardKey) > 0) return withKey;
  const added = adjustCard(withKey, catalog, champion, 'main', 1, rules);
  return { ...added, chosenChampionKey: champion.cardKey };
}

/** Champion units that can be the chosen champion for a legend. */
export function championChoices(legend: Card | undefined, catalog: Catalog, chosen?: Card, rules: RulesConfig = defaultRules): Card[] {
  if (!legend) return [];
  const tags = legendChampionTags(legend, catalog, rules).map((tag) => tag.toLowerCase());
  return legalCards(legend, catalog, rules, chosen)
    .filter((card) => isChampionCard(card, rules))
    .filter((card) => tags.length === 0 || card.tags.some((tag) => tags.includes(tag.toLowerCase())))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface DeckRow {
  cardKey: string;
  card: Card | undefined;
  count: number;
  printingKey?: string;
}

export interface DeckGroup {
  type: CardType | 'Unknown';
  rows: DeckRow[];
  total: number;
}

/** Merge slots of one card into a row; the first pin wins. */
export function toRows(slots: DeckSlot[], catalog: Catalog): DeckRow[] {
  const rows = new Map<string, DeckRow>();
  for (const slot of slots) {
    const row = rows.get(slot.cardKey) ?? { cardKey: slot.cardKey, card: catalog.cards[slot.cardKey], count: 0 };
    row.count += Math.max(0, slot.count);
    if (slot.printingKey && !row.printingKey) row.printingKey = slot.printingKey;
    rows.set(slot.cardKey, row);
  }
  return [...rows.values()].filter((row) => row.count > 0);
}

export function sortRows(rows: DeckRow[], order: CardOrder): DeckRow[] {
  const byName = (a: DeckRow, b: DeckRow) => (a.card?.name ?? a.cardKey).localeCompare(b.card?.name ?? b.cardKey);
  const energy = (row: DeckRow) => row.card?.energy ?? Number.POSITIVE_INFINITY;
  return [...rows].sort(order === 'name' ? byName : (a, b) => energy(a) - energy(b) || byName(a, b));
}

/** Group rows by card type in rules order (Unit, Spell, Gear), unknown cards last. */
export function groupByType(rows: DeckRow[], order: CardOrder, rules: RulesConfig = defaultRules): DeckGroup[] {
  const c = rules.classification;
  const known: readonly string[] = [...c.mainDeckTypes, c.battlefieldType, c.runeType];
  const groups = new Map<string, DeckRow[]>();
  for (const row of sortRows(rows, order)) {
    const type = row.card && known.includes(row.card.type) ? row.card.type : 'Unknown';
    groups.set(type, [...(groups.get(type) ?? []), row]);
  }
  const rank = (type: string) => (known.includes(type) ? known.indexOf(type) : known.length);
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([type, list]) => ({ type: type as DeckGroup['type'], rows: list, total: list.reduce((sum, row) => sum + row.count, 0) }));
}

/** Is the key a champion that can be the chosen champion of this deck legend? */
export function isValidChampionFor(legendKey: string | undefined, championKey: string | undefined, catalog: Catalog, rules: RulesConfig = defaultRules): boolean {
  const legend = legendKey ? catalog.cards[legendKey] : undefined;
  const champion = championKey ? catalog.cards[championKey] : undefined;
  if (!legend || !champion) return false;
  return championChoices(legend, catalog, champion, rules).some((card) => card.cardKey === champion.cardKey);
}

/** A copy of the deck whose chosen champion key is dropped when it is not valid for the legend. */
export function withValidChampion(deck: Deck, catalog: Catalog, rules: RulesConfig = defaultRules): Deck {
  if (!deck.chosenChampionKey || isValidChampionFor(deck.legendKey, deck.chosenChampionKey, catalog, rules)) return deck;
  return { ...deck, chosenChampionKey: undefined };
}

/** The champion the rules will use: the valid chosen one, else the first legal champion in the main deck. */
export function effectiveChampion(deck: Deck, catalog: Catalog, rules: RulesConfig = defaultRules): Card | undefined {
  const sane = withValidChampion(deck, catalog, rules);
  if (sane.chosenChampionKey) return catalog.cards[sane.chosenChampionKey];
  const legend = sane.legendKey ? catalog.cards[sane.legendKey] : undefined;
  const legal = new Set(championChoices(legend, catalog, undefined, rules).map((card) => card.cardKey));
  const key = slotsOf(sane, 'main').find((slot) => legal.has(slot.cardKey))?.cardKey;
  return key ? catalog.cards[key] : undefined;
}

export interface IllegalEntry {
  section: DeckSection;
  cardKey: string;
  name: string;
  count: number;
}

export interface LegendChangeImpact {
  illegal: IllegalEntry[];
  championInvalid: boolean;
  /** Name of the chosen champion that would be cleared. */
  championName?: string;
}

/** What would become illegal if the deck switched to another legend. */
export function legendChangeImpact(deck: Deck, nextLegendKey: string, catalog: Catalog, rules: RulesConfig = defaultRules): LegendChangeImpact {
  const legend = catalog.cards[nextLegendKey];
  const legal = new Set(legalCards(legend, catalog, rules).map((card) => card.cardKey));
  const illegal: IllegalEntry[] = ALL_SECTIONS.flatMap((section) =>
    slotsOf(deck, section)
      .filter((slot) => !legal.has(slot.cardKey))
      .map((slot) => ({ section, cardKey: slot.cardKey, name: catalog.cards[slot.cardKey]?.name ?? slot.cardKey, count: slot.count })),
  );
  const key = deck.chosenChampionKey;
  const championInvalid = Boolean(key) && !isValidChampionFor(nextLegendKey, key, catalog, rules);
  return { illegal, championInvalid, championName: championInvalid && key ? (catalog.cards[key]?.name ?? key) : undefined };
}

/** Switch legend. With `dropIllegal`, cards the new legend cannot use are removed. */
export function applyLegendChange(deck: Deck, nextLegendKey: string, catalog: Catalog, dropIllegal: boolean, rules: RulesConfig = defaultRules): Deck {
  const impact = legendChangeImpact(deck, nextLegendKey, catalog, rules);
  let next: Deck = { ...deck, legendKey: nextLegendKey };
  if (dropIllegal) {
    for (const entry of impact.illegal) next = removeCard(next, entry.section, entry.cardKey);
  }
  return impact.championInvalid ? { ...next, chosenChampionKey: undefined } : next;
}
