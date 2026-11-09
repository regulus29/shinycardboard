import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Deck } from '@sc/core';
import { db } from './db';
import { ownedId } from './ids';
import {
  addTag,
  addTagToCards,
  adjustOwnedQuantity,
  deleteDeck,
  deleteSearch,
  duplicateDeck,
  removeTag,
  renameTag,
  saveDeck,
  saveSearch,
  setOwnedQuantity,
} from './mutations';
import { readUserData, restoreBackup } from './backup';
import { buildSearchContext } from './searchContext';
import { subscribeLocalChanges } from './changeBus';
import { installFakeClock, resetDb } from '../test/helpers';

const KEY = { printingKey: 'ogn-042-standard' };

describe('owned mutations', () => {
  let clock: ReturnType<typeof installFakeClock>;
  beforeEach(async () => {
    await resetDb();
    clock = installFakeClock();
  });
  afterEach(() => clock.restore());

  it('creates a row with a deterministic id, defaults and a fresh updatedAt', async () => {
    const entry = await setOwnedQuantity(KEY, 2);
    expect(entry).toMatchObject({ id: ownedId(KEY.printingKey, 'normal', 'NM'), quantity: 2, finish: 'normal', condition: 'NM', updatedAt: clock.now });
  });

  it('upserts by (printingKey, finish, condition) without duplicating rows', async () => {
    await setOwnedQuantity(KEY, 1);
    clock.tick();
    await setOwnedQuantity(KEY, 3);
    await setOwnedQuantity({ ...KEY, finish: 'foil' }, 1);
    const rows = await db.owned.toArray();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.finish === 'normal')).toMatchObject({ quantity: 3, updatedAt: clock.now });
  });

  it('writes a tombstone at zero, stamped, and revives the same row later', async () => {
    const created = await setOwnedQuantity(KEY, 2);
    clock.tick();
    expect(await setOwnedQuantity(KEY, 0)).toBeNull();
    const tomb = await db.owned.get(created!.id);
    expect(tomb).toMatchObject({ deleted: true, quantity: 0, updatedAt: clock.now });

    clock.tick();
    const revived = await setOwnedQuantity(KEY, 1);
    expect(revived?.id).toBe(created!.id);
    expect(revived?.deleted).toBeUndefined();
    expect(await db.owned.count()).toBe(1);
  });

  it('adjusts relative to the current quantity and never goes negative', async () => {
    await setOwnedQuantity(KEY, 1);
    expect((await adjustOwnedQuantity(KEY, 2))?.quantity).toBe(3);
    expect(await adjustOwnedQuantity(KEY, -10)).toBeNull();
  });

  it('announces local changes after commit', async () => {
    const listener = vi.fn();
    const off = subscribeLocalChanges(listener);
    await setOwnedQuantity(KEY, 1);
    off();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('tags', () => {
  beforeEach(resetDb);

  it('adds, dedupes case-insensitively and removes tags, tombstoning when empty', async () => {
    await addTag('vi', 'Aggro');
    await addTag('vi', ' aggro ');
    expect((await db.taggings.get('vi'))?.tags).toEqual(['Aggro']);

    await removeTag('vi', 'AGGRO');
    expect(await db.taggings.get('vi')).toMatchObject({ deleted: true });
  });

  it('bulk tags many cards in one call', async () => {
    const rows = await addTagToCards(['a', 'b', 'a'], 'deckbox');
    expect(rows).toHaveLength(2);
  });

  it('renames a tag across all cards and merges with an existing target', async () => {
    await addTag('a', 'old');
    await addTag('b', 'old');
    await addTag('b', 'new');
    expect(await renameTag('old', 'new')).toBe(2);
    expect((await db.taggings.get('a'))?.tags).toEqual(['new']);
    expect((await db.taggings.get('b'))?.tags).toEqual(['new']);
  });
});

describe('decks and saved searches', () => {
  beforeEach(resetDb);

  it('creates a deck with defaults, then updates by id', async () => {
    const deck = await saveDeck({ name: 'Fury aggro' });
    expect(deck).toMatchObject({ name: 'Fury aggro', main: [], runes: [], battlefields: [], sideboard: [] });
    const updated = await saveDeck({ id: deck.id, main: [{ cardKey: 'vi', count: 3 }] });
    expect(updated.name).toBe('Fury aggro');
    expect(updated.main).toHaveLength(1);
    expect(await db.decks.count()).toBe(1);
  });

  it('duplicates into a new id and tombstones on delete', async () => {
    const deck = await saveDeck({ name: 'Base', notes: 'hi' });
    const copy = (await duplicateDeck(deck.id)) as Deck;
    expect(copy.id).not.toBe(deck.id);
    expect(copy.name).toBe('Base (copy)');
    expect(await deleteDeck(copy.id)).toBe(true);
    expect(await deleteDeck(copy.id)).toBe(false);
    expect(await db.decks.get(copy.id)).toMatchObject({ deleted: true });
  });

  it('saves, edits and deletes saved searches', async () => {
    const saved = await saveSearch({ name: ' Fury units ', query: 'fury unit' });
    expect(saved.name).toBe('Fury units');
    const renamed = await saveSearch({ id: saved.id, name: 'Aggro', query: 'fury unit' });
    expect(renamed.id).toBe(saved.id);
    await deleteSearch(saved.id);
    expect((await readUserData()).savedSearches).toHaveLength(0);
  });
});

describe('backup restore', () => {
  beforeEach(resetDb);

  it('replaces data, tombstones what the backup lacks and re-stamps restored rows', async () => {
    await setOwnedQuantity({ printingKey: 'old-001-standard' }, 4);
    const deck = await saveDeck({ name: 'Doomed' });

    await restoreBackup({
      owned: [{ id: 'x', printingKey: 'new-001-standard', finish: 'foil', condition: 'LP', quantity: 2, updatedAt: 1 }],
      taggings: [],
      decks: [],
      savedSearches: [{ id: 's', name: 'S', query: 'q', updatedAt: 1 }],
    });

    const data = await readUserData();
    expect(data.owned.map((r) => r.printingKey)).toEqual(['new-001-standard']);
    expect(data.owned[0]!.updatedAt).toBeGreaterThan(1);
    expect(data.decks).toHaveLength(0);
    expect(await db.decks.get(deck.id)).toMatchObject({ deleted: true });
    expect(data.savedSearches).toHaveLength(1);
  });

  it('is all-or-nothing when a write fails', async () => {
    await setOwnedQuantity({ printingKey: 'keep-001-standard' }, 1);
    const bad = { owned: [{ id: undefined as unknown as string }], taggings: [], decks: [], savedSearches: [] };
    await expect(restoreBackup(bad as never)).rejects.toBeTruthy();
    expect((await readUserData()).owned.map((r) => r.printingKey)).toEqual(['keep-001-standard']);
  });
});

describe('buildSearchContext', () => {
  it('indexes tags and the decks that use each card, including the legend', () => {
    const deck: Deck = {
      id: 'd',
      name: 'Deck A',
      legendKey: 'vi',
      main: [{ cardKey: 'ember', count: 3 }],
      runes: [{ cardKey: 'fury-rune', count: 6 }],
      battlefields: [],
      sideboard: [{ cardKey: 'ember', count: 1 }],
      updatedAt: 1,
    };
    const ctx = buildSearchContext([], [{ id: 'ember', cardKey: 'ember', tags: ['burn'], updatedAt: 1 }], [deck]);
    expect(ctx.tagsByCard).toEqual({ ember: ['burn'] });
    expect(ctx.decksByCard.ember).toEqual(['Deck A']);
    expect(ctx.decksByCard.vi).toEqual(['Deck A']);
  });
});
