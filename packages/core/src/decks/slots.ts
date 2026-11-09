import type { Deck, DeckSlot } from '../types';
import type { DeckSection } from './deck-types';

export function totalSlots(slots: DeckSlot[]): number {
  return slots.reduce((sum, s) => sum + s.count, 0);
}

/** A usable copy count: whole and positive, otherwise 0. Guards against bad stored data. */
export function sanitizeCount(count: number): number {
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

/** Copies per cardKey with duplicate slots merged and bad counts dropped. Insertion ordered. */
export function mergeSlots(slots: DeckSlot[]): Map<string, number> {
  const merged = new Map<string, number>();
  for (const slot of slots) {
    const count = sanitizeCount(slot.count);
    if (count > 0) merged.set(slot.cardKey, (merged.get(slot.cardKey) ?? 0) + count);
  }
  return merged;
}

export function sectionSlots(deck: Deck, section: DeckSection): DeckSlot[] {
  return deck[section] ?? [];
}

export function sumCounts(counts: Map<string, number>): number {
  let sum = 0;
  for (const n of counts.values()) sum += n;
  return sum;
}

/** Add every entry of `from` into `into`. */
export function addCounts(into: Map<string, number>, from: Map<string, number>): void {
  for (const [key, n] of from) into.set(key, (into.get(key) ?? 0) + n);
}

export const DECK_SECTIONS: readonly DeckSection[] = ['main', 'runes', 'battlefields', 'sideboard'];
