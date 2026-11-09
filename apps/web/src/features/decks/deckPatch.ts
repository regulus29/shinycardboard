/** Translate between the editable draft and what saveDeck stores. */
import type { Deck } from '@sc/core';
import type { NewDeck } from '../../data';

/** Stored stand-in for a cleared optional field. Written by toPatch and read by fromStored, nowhere else. */
export const CLEARED = '';

/**
 * saveDeck ignores undefined fields, so a cleared optional field is saved as an empty string and
 * read back as undefined by `fromStored`.
 */
export function toPatch(deck: Deck): NewDeck {
  return {
    id: deck.id,
    name: deck.name,
    legendKey: deck.legendKey ?? CLEARED,
    chosenChampionKey: deck.chosenChampionKey ?? CLEARED,
    main: deck.main,
    runes: deck.runes,
    battlefields: deck.battlefields,
    sideboard: deck.sideboard,
    notes: deck.notes ?? CLEARED,
    tags: deck.tags ?? [],
  };
}

/** Normalize a stored deck into a draft: empty strings become undefined, lists always exist. */
export function fromStored(deck: Deck): Deck {
  return {
    ...deck,
    legendKey: deck.legendKey === CLEARED ? undefined : deck.legendKey,
    chosenChampionKey: deck.chosenChampionKey === CLEARED ? undefined : deck.chosenChampionKey,
    notes: deck.notes === CLEARED ? undefined : deck.notes,
    tags: deck.tags ?? [],
    main: deck.main ?? [],
    runes: deck.runes ?? [],
    battlefields: deck.battlefields ?? [],
    sideboard: deck.sideboard ?? [],
  };
}

/** Add a tag keeping the user's casing; duplicates compare case-insensitively. Returns the same list when unchanged. */
export function addTagTo(tags: string[], raw: string, maxTags: number, maxLength: number): string[] {
  const tag = raw.trim().slice(0, maxLength);
  if (!tag || tags.length >= maxTags) return tags;
  if (tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) return tags;
  return [...tags, tag];
}
