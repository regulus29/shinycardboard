import type { Table } from 'dexie';
import { nextUpdatedAt, type SyncRecord } from '@sc/core';
import { db } from './db';
import { clock } from './clock';
import { DATA_MARKER_KEY } from '../config/constants';
import { emitLocalChange, reportStorageFailure, writeCount } from './changeBus';

/** Never earlier than the previous version stamp, so clock skew cannot make an edit lose to its own past. */
export { nextUpdatedAt };

/** Return a copy of the record stamped for a new write. All writes go through this. */
export function stamp<T extends SyncRecord>(record: T, previous?: SyncRecord | number, at: number = clock.now()): T {
  const prior = typeof previous === 'number' ? previous : previous?.updatedAt;
  return { ...record, updatedAt: nextUpdatedAt(at, prior) };
}

/** A tombstone keeps the record shape so it still syncs. */
export function toTombstone<T extends SyncRecord>(record: T, at: number = clock.now()): T {
  return { ...record, deleted: true, updatedAt: nextUpdatedAt(at, record.updatedAt) };
}

/** Clear the tombstone flag when a record is brought back to life. */
export function revive<T extends SyncRecord>(record: T, at: number = clock.now()): T {
  const { deleted: _deleted, ...rest } = record;
  return { ...rest, updatedAt: nextUpdatedAt(at, record.updatedAt) } as T;
}

export function isLive<T extends SyncRecord>(record: T): boolean {
  return !record.deleted;
}

export function liveOnly<T extends SyncRecord>(records: T[]): T[] {
  return records.filter(isLive);
}

/** Dexie tables differ in row type and are invariant, so a transaction scope must be typed with any. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = Table<any, string>;

let persistRequested = false;

/** Ask the browser to protect our data from eviction, once per session, after the first write. */
export function requestPersistenceOnce(): void {
  if (persistRequested || typeof navigator === 'undefined' || !navigator.storage?.persist) return;
  persistRequested = true;
  navigator.storage.persist().catch(() => undefined);
}

/**
 * Run a write transaction over the given tables. Announces a local change only if rows were
 * written, asks for persistent storage after the first write, and reports failures (quota,
 * blocked transactions) to the UI before rethrowing.
 * Use for every user-initiated mutation. Never use for writes applied from sync.
 */
export async function mutate<R>(tables: AnyTable[], work: () => Promise<R>): Promise<R> {
  const before = writeCount();
  try {
    const result = await db.transaction('rw', tables, work);
    if (writeCount() !== before) {
      emitLocalChange();
      requestPersistenceOnce();
      void db.syncMeta.put({ key: DATA_MARKER_KEY, value: true }).catch(() => undefined);
    }
    return result;
  } catch (error) {
    reportStorageFailure(error);
    throw error;
  }
}

/** Stamp and upsert one record, stamping after the version already stored. */
export async function putRecord<T extends SyncRecord>(table: Table<T, string>, record: T): Promise<T> {
  const existing = await table.get(record.id);
  const stamped = stamp(record, existing);
  await table.put(stamped);
  return stamped;
}

/** Tombstone a record by id. Returns false when it does not exist or is already deleted. */
export async function tombstoneRecord<T extends SyncRecord>(table: Table<T, string>, id: string): Promise<boolean> {
  const existing = await table.get(id);
  if (!existing || existing.deleted) return false;
  await table.put(toTombstone(existing));
  return true;
}
