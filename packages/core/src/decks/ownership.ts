/**
 * Ownership and demand accounting.
 *
 * Pin-aware counting: a slot with a printingKey that belongs to the slot card must be
 * filled from copies of that exact printing. Unpinned demand is filled from whatever
 * owned copies of the card remain after pinned demand took its share. A pin that is
 * unknown or belongs to another card is ignored (treated as unpinned). Finish and
 * condition never matter. Cross deck conflicts are counted by cardKey only (pins are
 * ignored), because pins do not reserve physical copies across decks.
 */
import type { Card, Catalog, Deck, DeckSlot, OwnedEntry } from '../types';
import type { ConflictEntry, MissingEntry } from './deck-types';
import { DECK_SECTIONS, sanitizeCount, sectionSlots } from './slots';

/** Owned copies per printingKey. Deleted rows, bad quantities and unknown printings are dropped. */
export function ownedByPrinting(owned: OwnedEntry[], catalog: Catalog): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of owned) {
    const quantity = sanitizeCount(entry.quantity);
    if (entry.deleted || quantity === 0 || !catalog.printings[entry.printingKey]) continue;
    counts.set(entry.printingKey, (counts.get(entry.printingKey) ?? 0) + quantity);
  }
  return counts;
}

/** Owned copies per cardKey, summed across printings and finishes. */
export function ownedByCard(owned: OwnedEntry[], catalog: Catalog): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [printingKey, quantity] of ownedByPrinting(owned, catalog)) {
    const cardKey = catalog.printings[printingKey]?.cardKey;
    if (cardKey) result[cardKey] = (result[cardKey] ?? 0) + quantity;
  }
  return result;
}

interface CardDemand {
  total: number;
  /** Demand tied to a specific printing. */
  pinned: Map<string, number>;
}

/** The pin on a slot, only when it is a real printing of that slot card. */
function validPin(slot: DeckSlot, catalog: Catalog): string | undefined {
  const printing = slot.printingKey ? catalog.printings[slot.printingKey] : undefined;
  return printing && printing.cardKey === slot.cardKey ? slot.printingKey : undefined;
}

/** Everything a deck needs physically: legend, main, runes, battlefields and sideboard. */
export function deckDemand(deck: Deck, catalog: Catalog): Map<string, CardDemand> {
  const demand = new Map<string, CardDemand>();
  const slots: DeckSlot[] = [
    ...(deck.legendKey ? [{ cardKey: deck.legendKey, count: 1 }] : []),
    ...DECK_SECTIONS.flatMap((section) => sectionSlots(deck, section)),
  ];
  for (const slot of slots) {
    const count = sanitizeCount(slot.count);
    if (count === 0) continue;
    const line = demand.get(slot.cardKey) ?? { total: 0, pinned: new Map<string, number>() };
    line.total += count;
    const pin = validPin(slot, catalog);
    if (pin) line.pinned.set(pin, (line.pinned.get(pin) ?? 0) + count);
    demand.set(slot.cardKey, line);
  }
  return demand;
}

/** Copies of a card still lacking after pinned demand and unpinned demand take their share. */
function shortfall(cardKey: string, line: CardDemand, owned: number, byPrinting: Map<string, number>): MissingEntry {
  let pinnedTotal = 0;
  let pinnedCovered = 0;
  for (const [printingKey, need] of line.pinned) {
    pinnedTotal += need;
    pinnedCovered += Math.min(need, byPrinting.get(printingKey) ?? 0);
  }
  const unpinned = line.total - pinnedTotal;
  const missing = pinnedTotal - pinnedCovered + Math.max(0, unpinned - (owned - pinnedCovered));
  return { cardKey, needed: line.total, owned, missing };
}

/** Cards a deck needs beyond what is owned (legend plus all slots in main, runes, battlefields, sideboard). */
export function missingCards(deck: Deck, owned: OwnedEntry[], catalog: Catalog): MissingEntry[] {
  const byPrinting = ownedByPrinting(owned, catalog);
  const byCard = ownedByCard(owned, catalog);
  const result: MissingEntry[] = [];
  for (const [cardKey, line] of deckDemand(deck, catalog)) {
    const entry = shortfall(cardKey, line, byCard[cardKey] ?? 0, byPrinting);
    if (entry.missing > 0) result.push(entry);
  }
  return result;
}

/**
 * Cards where total demand across the given decks exceeds the owned count and at least
 * two decks want the card. A shortfall inside a single deck is reported by missingCards.
 * Deleted decks are ignored.
 */
export function allocationConflicts(decks: Deck[], owned: OwnedEntry[], catalog: Catalog): ConflictEntry[] {
  const ownedCounts = ownedByCard(owned, catalog);
  const totals = new Map<string, { demanded: number; decks: string[] }>();
  for (const deck of decks) {
    if (deck.deleted) continue;
    for (const [cardKey, line] of deckDemand(deck, catalog)) {
      const entry = totals.get(cardKey) ?? { demanded: 0, decks: [] };
      entry.demanded += line.total;
      entry.decks.push(deck.id);
      totals.set(cardKey, entry);
    }
  }
  const conflicts: ConflictEntry[] = [];
  for (const [cardKey, { demanded, decks: ids }] of totals) {
    const have = ownedCounts[cardKey] ?? 0;
    if (ids.length > 1 && demanded > have) conflicts.push({ cardKey, owned: have, demanded, decks: ids });
  }
  return conflicts.sort((a, b) => a.cardKey.localeCompare(b.cardKey));
}

export interface OwnedCard {
  card: Card;
  owned: number;
}

/** Catalog cards with at least one owned copy, in catalog order. Ownership of unknown cards is dropped. */
export function ownedCards(owned: OwnedEntry[], catalog: Catalog): OwnedCard[] {
  const counts = ownedByCard(owned, catalog);
  const result: OwnedCard[] = [];
  for (const [cardKey, count] of Object.entries(counts)) {
    const card = catalog.cards[cardKey];
    if (card) result.push({ card, owned: count });
  }
  return result;
}
