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
  /** Stable id of this server's data set. If it differs from the one stored, resync from scratch. */
  serverId?: string;
  /**
   * True when the server dropped delete markers newer than the client's `since`, or the client's
   * `since` is ahead of this server (restored or replaced data). The client may be holding rows
   * that were deleted elsewhere. The response then carries the server's full state.
   * The client should push its full local state and continue with since=0.
   */
  resync?: boolean;
}

export { mergeRecords, pruneTombstones } from './merge';
export { applySyncRequest, emptyServerState } from './apply';
export type { ApplyOptions, ServerState, StoredRecord, SyncOutcome } from './apply';
export { nextUpdatedAt } from './clock';
export { mergePulledRecords } from './pull';
export { validateSyncRecord } from './validate';
export { validateCollectionRecord, validateCollectionRecords } from './records';
export { SYNC_CONFIG, RECORD_LIMITS, MS_PER_DAY } from './config';
