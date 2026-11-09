import type { SyncRecord, UserData } from '@sc/core';
import type { Table } from 'dexie';
import { db } from './db';
import { clock } from './clock';
import { mutate, liveOnly, nextUpdatedAt, toTombstone } from './repo';

/** Snapshot of all live user data (tombstones excluded), ready for exportBackup. */
export async function readUserData(): Promise<UserData> {
  const [owned, taggings, decks, savedSearches] = await Promise.all([
    db.owned.toArray(),
    db.taggings.toArray(),
    db.decks.toArray(),
    db.savedSearches.toArray(),
  ]);
  return {
    owned: liveOnly(owned),
    taggings: liveOnly(taggings),
    decks: liveOnly(decks),
    savedSearches: liveOnly(savedSearches),
  };
}

/**
 * Make `table` match `incoming` exactly: restored rows are re-stamped so they beat older
 * remote copies, and rows missing from the backup become tombstones so other devices follow.
 */
async function replaceTable<T extends SyncRecord>(table: Table<T, string>, incoming: T[], at: number) {
  const keep = new Set(incoming.map((row) => row.id));
  const existing = await table.toArray();
  const priorStamp = new Map(existing.map((row) => [row.id, row.updatedAt]));
  const removed = existing.filter((row) => !row.deleted && !keep.has(row.id)).map((row) => toTombstone(row, at));
  const restored = incoming.map((row) => {
    const { deleted: _deleted, ...live } = row;
    return { ...live, updatedAt: nextUpdatedAt(at, priorStamp.get(row.id)) } as T;
  });
  await table.bulkPut([...removed, ...restored]);
}

/** Transactionally replace all user data with a backup. All-or-nothing. */
export function restoreBackup(data: UserData): Promise<void> {
  const at = clock.now();
  return mutate([db.owned, db.taggings, db.decks, db.savedSearches], async () => {
    await replaceTable(db.owned, data.owned, at);
    await replaceTable(db.taggings, data.taggings, at);
    await replaceTable(db.decks, data.decks, at);
    await replaceTable(db.savedSearches, data.savedSearches, at);
  });
}
