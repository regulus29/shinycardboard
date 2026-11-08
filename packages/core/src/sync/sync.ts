import type { SyncCollection, SyncRecord } from '../types';

/** Wire protocol shared by the web client and the sync server. */
export interface SyncRequest {
  /** Server time returned by the previous successful sync; 0 on first sync. */
  since: number;
  /** Local records changed since the last sync, per collection. */
  changes: Partial<Record<SyncCollection, SyncRecord[]>>;
}

export interface SyncResponse {
  /** Records the client has not seen, per collection. */
  changes: Partial<Record<SyncCollection, SyncRecord[]>>;
  /** Store as `since` for the next request. */
  serverTime: number;
}

/** Last write wins per record id. Ties resolve toward tombstones, then toward the remote copy. */
export function mergeRecords<T extends SyncRecord>(_local: T[], _remote: T[]): T[] {
  throw new Error('not implemented');
}

/** Drop tombstones older than the retention window. */
export function pruneTombstones<T extends SyncRecord>(_records: T[], _now: number, _retentionMs: number): T[] {
  throw new Error('not implemented');
}
