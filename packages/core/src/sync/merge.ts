import type { SyncRecord } from '../types';
import { canonicalJson } from './canonical';

const timestampOf = (record: SyncRecord): number => (Number.isFinite(record.updatedAt) ? record.updatedAt : 0);

/**
 * Total order over versions of the same record: positive when `a` wins.
 * Newest updatedAt, then tombstone, then greater canonical JSON. Because it is a total order,
 * picking the maximum is commutative, associative and idempotent, so devices converge.
 * The final tie-break is arbitrary but deterministic.
 */
export function compareRecords(a: SyncRecord, b: SyncRecord): number {
  const byTime = timestampOf(a) - timestampOf(b);
  if (byTime !== 0) return byTime;
  const byTombstone = Number(a.deleted === true) - Number(b.deleted === true);
  if (byTombstone !== 0) return byTombstone;
  const ca = canonicalJson(a);
  const cb = canonicalJson(b);
  return ca === cb ? 0 : ca > cb ? 1 : -1;
}

export const compareById = (a: { id: string }, b: { id: string }): number =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** Last write wins per record id. Ties resolve toward tombstones, then a stable content order. Output is sorted by id. */
export function mergeRecords<T extends SyncRecord>(local: T[], remote: T[]): T[] {
  const winners = new Map<string, T>();
  for (const record of [...local, ...remote]) {
    const current = winners.get(record.id);
    if (current === undefined || compareRecords(record, current) > 0) winners.set(record.id, record);
  }
  return [...winners.values()].sort(compareById);
}

/** Drop tombstones whose updatedAt is older than the retention window (client side housekeeping). */
export function pruneTombstones<T extends SyncRecord>(records: T[], now: number, retentionMs: number): T[] {
  return records.filter((record) => !(record.deleted === true && now - record.updatedAt > retentionMs));
}
