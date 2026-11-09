import type { Deck, DeckSlot, SearchHit } from '@sc/core';

export interface DeckUsage {
  deckId: string;
  name: string;
  /** Copies across main deck, runes, battlefields, sideboard and the legend slot. */
  count: number;
}

const slotCount = (slots: readonly DeckSlot[], cardKey: string): number =>
  slots.filter((slot) => slot.cardKey === cardKey).reduce((sum, slot) => sum + slot.count, 0);

/** Decks that contain a card with how many copies each uses, most used first. */
export function deckUsage(decks: readonly Deck[], cardKey: string): DeckUsage[] {
  return decks
    .map((deck) => ({
      deckId: deck.id,
      name: deck.name,
      count:
        slotCount(deck.main, cardKey) +
        slotCount(deck.runes, cardKey) +
        slotCount(deck.battlefields, cardKey) +
        slotCount(deck.sideboard, cardKey) +
        (deck.legendKey === cardKey ? 1 : 0),
    }))
    .filter((usage) => usage.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export interface Neighbors {
  index: number;
  total: number;
  previous: string | null;
  next: string | null;
}

/** Previous and next printing keys around `printingKey` in the list the user came from, or null when absent. */
export function neighborsOf(hits: readonly SearchHit[], printingKey: string): Neighbors | null {
  const index = hits.findIndex((hit) => hit.printing.printingKey === printingKey);
  if (index < 0) return null;
  return {
    index,
    total: hits.length,
    previous: hits[index - 1]?.printing.printingKey ?? null,
    next: hits[index + 1]?.printing.printingKey ?? null,
  };
}
