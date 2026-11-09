import type { CardTagging, Condition, Deck, Finish, OwnedEntry, SavedSearch } from '@sc/core';
import { db } from './db';
import { newId, ownedId } from './ids';
import { MAX_OWNED_QUANTITY, NEW_DECK_NAME, OWNED_DEFAULTS } from '../config/constants';
import { mutate, putRecord, revive, toTombstone, tombstoneRecord } from './repo';

/* ----------------------------------------------------------------- owned */

export interface OwnedKey {
  printingKey: string;
  finish?: Finish;
  condition?: Condition;
}

function resolveKey(key: OwnedKey) {
  return {
    printingKey: key.printingKey,
    finish: key.finish ?? OWNED_DEFAULTS.finish,
    condition: key.condition ?? OWNED_DEFAULTS.condition,
  };
}

/** Clamp to the allowed range. Non-finite input is rejected by the caller (keeps the current value). */
function clampQuantity(quantity: number): number {
  return Math.min(MAX_OWNED_QUANTITY, Math.max(0, Math.trunc(quantity)));
}

async function findOwned(printingKey: string, finish: Finish, condition: Condition) {
  return db.owned.where('[printingKey+finish+condition]').equals([printingKey, finish, condition]).first();
}

/** Transactional core of the owned upsert; callers supply the surrounding transaction. */
async function upsertOwned(key: OwnedKey, quantity: number | ((current: number) => number), notes?: string) {
  const { printingKey, finish, condition } = resolveKey(key);
  const existing = await findOwned(printingKey, finish, condition);
  const current = existing && !existing.deleted ? existing.quantity : 0;
  const requested = typeof quantity === 'function' ? quantity(current) : quantity;
  // NaN or Infinity must never delete a card: keep what is there.
  const next = Number.isFinite(requested) ? clampQuantity(requested) : current;

  if (next === 0) {
    if (existing && !existing.deleted) await db.owned.put({ ...toTombstone(existing), quantity: 0 });
    return null;
  }
  const base: OwnedEntry = existing ?? {
    id: ownedId(printingKey, finish, condition),
    printingKey,
    finish,
    condition,
    quantity: next,
    updatedAt: 0,
  };
  // A revived row starts clean: notes from a deleted copy must not resurface.
  const { notes: oldNotes, ...rest } = revive(base);
  const keptNotes = notes ?? (existing?.deleted ? undefined : oldNotes);
  return putRecord(db.owned, { ...rest, quantity: next, ...(keptNotes !== undefined ? { notes: keptNotes } : {}) });
}

/**
 * Upsert the owned row for (printingKey, finish, condition). A quantity of zero writes a
 * tombstone so the removal syncs. Returns the live row, or null when removed.
 */
export function setOwnedQuantity(key: OwnedKey, quantity: number, notes?: string): Promise<OwnedEntry | null> {
  return mutate([db.owned], () => upsertOwned(key, quantity, notes));
}

/** Add `delta` (may be negative) to the current quantity of a row. */
export function adjustOwnedQuantity(key: OwnedKey, delta: number): Promise<OwnedEntry | null> {
  return mutate([db.owned], () => upsertOwned(key, (current) => current + delta));
}

/* ------------------------------------------------------------------ tags */

/** Trim and collapse whitespace. Tags keep the user's casing but compare case-insensitively. */
export function normalizeTag(tag: string): string {
  return tag.trim().replace(/\s+/g, ' ');
}

const sameTag = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function dedupeTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const raw of tags) {
    const tag = normalizeTag(raw);
    if (tag && !out.some((existing) => sameTag(existing, tag))) out.push(tag);
  }
  return out;
}

async function liveTaggings(): Promise<CardTagging[]> {
  return (await db.taggings.toArray()).filter((row) => !row.deleted);
}

/** Write a card's tag list; an empty list with no note becomes a tombstone. */
async function writeTags(cardKey: string, tags: string[]): Promise<CardTagging | null> {
  const existing = await db.taggings.get(cardKey);
  if (tags.length === 0 && !existing?.note) {
    if (existing && !existing.deleted) await db.taggings.put(toTombstone(existing));
    return null;
  }
  const base: CardTagging = existing ? revive(existing) : { id: cardKey, cardKey, tags: [], updatedAt: 0 };
  return putRecord(db.taggings, { ...base, tags });
}

async function tagsOf(cardKey: string): Promise<string[]> {
  const existing = await db.taggings.get(cardKey);
  return existing && !existing.deleted ? existing.tags : [];
}

/** Replace a card's tags wholesale. */
export function setCardTags(cardKey: string, tags: string[]): Promise<CardTagging | null> {
  return mutate([db.taggings], () => writeTags(cardKey, dedupeTags(tags)));
}

/** Bulk tag: add one tag to many cards in a single transaction. */
export function addTagToCards(cardKeys: string[], tag: string): Promise<CardTagging[]> {
  const clean = normalizeTag(tag);
  if (!clean) return Promise.resolve([]);
  return mutate([db.taggings], async () => {
    const written: CardTagging[] = [];
    for (const cardKey of new Set(cardKeys)) {
      const row = await writeTags(cardKey, dedupeTags([...(await tagsOf(cardKey)), clean]));
      if (row) written.push(row);
    }
    return written;
  });
}

export async function addTag(cardKey: string, tag: string): Promise<CardTagging | null> {
  const rows = await addTagToCards([cardKey], tag);
  return rows[0] ?? null;
}

export function removeTag(cardKey: string, tag: string): Promise<CardTagging | null> {
  return mutate([db.taggings], async () => {
    const tags = await tagsOf(cardKey);
    return writeTags(cardKey, tags.filter((existing) => !sameTag(existing, tag)));
  });
}

/** Rename a tag on every card that has it. Merges when the card already has the new name. */
export function renameTag(from: string, to: string): Promise<number> {
  const source = normalizeTag(from);
  const target = normalizeTag(to);
  if (!target || !source || source === target) return Promise.resolve(0);
  return mutate([db.taggings], async () => {
    const affected = (await liveTaggings()).filter((row) => row.tags.some((t) => sameTag(t, source)));
    for (const row of affected) {
      await writeTags(row.cardKey, dedupeTags(row.tags.map((t) => (sameTag(t, source) ? target : t))));
    }
    return affected.length;
  });
}

/** Remove a tag from every card. Returns how many cards changed. */
export function deleteTag(tag: string): Promise<number> {
  return mutate([db.taggings], async () => {
    const affected = (await liveTaggings()).filter((row) => row.tags.some((t) => sameTag(t, tag)));
    for (const row of affected) await writeTags(row.cardKey, row.tags.filter((t) => !sameTag(t, tag)));
    return affected.length;
  });
}

/* ----------------------------------------------------------------- decks */

export type NewDeck = Partial<Omit<Deck, 'updatedAt' | 'deleted'>>;

export function emptyDeck(init: NewDeck = {}): Deck {
  return {
    main: [],
    runes: [],
    battlefields: [],
    sideboard: [],
    ...init,
    id: init.id ?? newId(),
    name: init.name?.trim() || NEW_DECK_NAME,
    updatedAt: 0,
  };
}

/** Drop keys whose value is undefined so a partial update never erases stored data. */
function definedOnly<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<T>;
}

export interface SaveDeckOptions {
  /** Required to save over a deck that was deleted (an explicit undelete). */
  revive?: boolean;
}

/** Create a deck (no id) or update the deck with the given id. Returns the stored deck. */
export function saveDeck(deck: NewDeck, options: SaveDeckOptions = {}): Promise<Deck> {
  return mutate([db.decks], async () => {
    const existing = deck.id ? await db.decks.get(deck.id) : undefined;
    if (existing?.deleted && !options.revive) throw new Error('That deck was deleted; pass { revive: true } to restore it.');
    const base = existing ?? emptyDeck(deck);
    const merged = { ...base, ...definedOnly(deck), id: base.id };
    merged.name = merged.name?.trim() || base.name?.trim() || NEW_DECK_NAME;
    return putRecord(db.decks, revive(merged));
  });
}

export function duplicateDeck(deckId: string, name?: string): Promise<Deck | null> {
  return mutate([db.decks], async () => {
    const source = await db.decks.get(deckId);
    if (!source || source.deleted) return null;
    const { deleted: _deleted, ...rest } = structuredClone(source);
    return putRecord(db.decks, { ...rest, id: newId(), name: name ?? `${source.name} (copy)` });
  });
}

export function deleteDeck(deckId: string): Promise<boolean> {
  return mutate([db.decks], () => tombstoneRecord(db.decks, deckId));
}

/* -------------------------------------------------------- saved searches */

export interface SavedSearchInput {
  /** Omit to create; provide to rename or edit. */
  id?: string;
  name: string;
  query: string;
}

export function saveSearch(input: SavedSearchInput): Promise<SavedSearch> {
  return mutate([db.savedSearches], async () => {
    const existing = input.id ? await db.savedSearches.get(input.id) : undefined;
    const base: SavedSearch = existing ?? { id: input.id ?? newId(), name: '', query: '', updatedAt: 0 };
    return putRecord(db.savedSearches, { ...revive(base), name: input.name.trim(), query: input.query.trim() });
  });
}

export function deleteSearch(id: string): Promise<boolean> {
  return mutate([db.savedSearches], () => tombstoneRecord(db.savedSearches, id));
}
