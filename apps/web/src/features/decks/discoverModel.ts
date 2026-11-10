/** Which legends are worth suggesting, given the collection and the decks already made. */
import { buildableLegends, ownedByCard, type Catalog, type Deck, type LegendReadiness, type OwnedEntry } from '@sc/core';

/** Copies of each card that the existing decks already claim. */
function deckClaims(decks: Deck[]): Map<string, number> {
  const claims = new Map<string, number>();
  for (const deck of decks) {
    const slots = [...deck.main, ...deck.runes, ...deck.battlefields, ...deck.sideboard, ...(deck.legendKey ? [{ cardKey: deck.legendKey, count: 1 }] : [])];
    for (const slot of slots) claims.set(slot.cardKey, (claims.get(slot.cardKey) ?? 0) + slot.count);
  }
  return claims;
}

/** The collection with copies reserved by existing decks taken out, so a second build only counts spare cards. */
export function ownedAfterDecks(owned: OwnedEntry[], decks: Deck[], catalog: Catalog): OwnedEntry[] {
  const claims = deckClaims(decks);
  return owned.flatMap((entry) => {
    const cardKey = catalog.printings[entry.printingKey]?.cardKey;
    const claimed = cardKey ? (claims.get(cardKey) ?? 0) : 0;
    const taken = Math.min(claimed, entry.quantity);
    if (cardKey && taken > 0) claims.set(cardKey, claimed - taken);
    return entry.quantity - taken > 0 ? [{ ...entry, quantity: entry.quantity - taken }] : [];
  });
}

/**
 * Legends to suggest. A legend with no deck yet is listed by how close the collection is.
 * A legend that already has a deck is listed again only when a spare legend copy and spare
 * cards can fill a second full deck, so finished builds never clutter the list.
 */
export function discoverLegends(catalog: Catalog, owned: OwnedEntry[], decks: Deck[]): LegendReadiness[] {
  const deckCounts = new Map<string, number>();
  for (const deck of decks) if (deck.legendKey) deckCounts.set(deck.legendKey, (deckCounts.get(deck.legendKey) ?? 0) + 1);

  const everything = buildableLegends(catalog, owned);
  const ownedCopies = ownedByCard(owned, catalog);
  const needsSpare = [...deckCounts.entries()].filter(([key, made]) => (ownedCopies[key] ?? 0) > made);
  const spare = needsSpare.length ? new Map(buildableLegends(catalog, ownedAfterDecks(owned, decks, catalog)).map((r) => [r.legendKey, r])) : new Map<string, LegendReadiness>();

  return everything.flatMap((entry) => {
    const made = deckCounts.get(entry.legendKey) ?? 0;
    if (made === 0) return [entry];
    const extra = spare.get(entry.legendKey);
    return extra && extra.shortBy === 0 && (ownedCopies[entry.legendKey] ?? 0) > made ? [extra] : [];
  });
}
