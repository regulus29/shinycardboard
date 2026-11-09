import { SYNC_COLLECTIONS, type SyncCollection, type SyncRecord } from '../types';
import { SYNC_CONFIG } from './config';
import { compareById, compareRecords } from './merge';
import type { SyncRequest, SyncResponse } from './sync';

/** A record plus the server clock value at which the server last received a change to it. */
export interface StoredRecord {
  record: SyncRecord;
  syncedAt: number;
}

export interface ServerState {
  /** Random id created with the data set. Changes if the data is lost or replaced. */
  serverId: string;
  /** Last server time handed out. Strictly increases with every request. */
  serverTime: number;
  /** Highest receipt time of any tombstone pruned so far. Clients with an older cursor must resync. */
  prunedBefore: number;
  collections: Record<SyncCollection, StoredRecord[]>;
}

export interface SyncOutcome {
  state: ServerState;
  response: SyncResponse;
  /** True when stored records changed and the state should be persisted. */
  changed: boolean;
  /** Pushed records whose updatedAt was ahead of the allowed clock skew and was clamped. */
  clamped: number;
}

export interface ApplyOptions {
  tombstoneRetentionMs?: number;
  maxClockSkewMs?: number;
}

export function emptyServerState(serverId: string = globalThis.crypto.randomUUID()): ServerState {
  const collections = {} as Record<SyncCollection, StoredRecord[]>;
  for (const name of SYNC_COLLECTIONS) collections[name] = [];
  return { serverId, serverTime: 0, prunedBefore: 0, collections };
}

interface MergeContext {
  serverTime: number;
  retentionMs: number;
  /** Largest updatedAt accepted as is. */
  latestAllowed: number;
}

interface MergedCollection {
  byId: Map<string, StoredRecord>;
  /** Best version the client sent per id, after clamping. */
  sent: Map<string, SyncRecord>;
  /** Ids whose timestamp was altered, so the client must be told even if the clamped copy wins. */
  clampedIds: Set<string>;
  changed: boolean;
  prunedUpTo: number;
}

function clampRecord(record: SyncRecord, ctx: MergeContext): SyncRecord {
  return record.updatedAt > ctx.latestAllowed ? { ...record, updatedAt: ctx.serverTime } : record;
}

function mergeCollection(stored: StoredRecord[], incoming: SyncRecord[], ctx: MergeContext): MergedCollection {
  const byId = new Map(stored.map((entry) => [entry.record.id, entry]));
  const sent = new Map<string, SyncRecord>();
  const clampedIds = new Set<string>();
  let changed = false;
  let prunedUpTo = 0;

  for (const original of incoming) {
    const record = clampRecord(original, ctx);
    if (record !== original) clampedIds.add(record.id);
    const best = sent.get(record.id);
    if (best === undefined || compareRecords(record, best) > 0) sent.set(record.id, record);
  }
  for (const [id, record] of sent) {
    const current = byId.get(id);
    if (current === undefined || compareRecords(record, current.record) > 0) {
      byId.set(id, { record, syncedAt: ctx.serverTime });
      changed = true;
    }
  }
  // Expiry counts from receipt, and never in the request that stored the tombstone.
  for (const [id, entry] of byId) {
    const expired =
      entry.record.deleted === true && entry.syncedAt < ctx.serverTime && ctx.serverTime - entry.syncedAt > ctx.retentionMs;
    if (!expired) continue;
    byId.delete(id);
    prunedUpTo = Math.max(prunedUpTo, entry.syncedAt);
    changed = true;
  }
  return { byId, sent, clampedIds, changed, prunedUpTo };
}

/** Records to send back: anything new since the cursor, plus pushed records the server changed or overruled. */
function outgoingRecords(merged: MergedCollection, cursor: number): SyncRecord[] {
  const outgoing: SyncRecord[] = [];
  for (const [id, entry] of merged.byId) {
    const clientVersion = merged.sent.get(id);
    const clientHasIt =
      clientVersion !== undefined && !merged.clampedIds.has(id) && compareRecords(entry.record, clientVersion) === 0;
    if (!clientHasIt && (entry.syncedAt > cursor || clientVersion !== undefined)) outgoing.push(entry.record);
  }
  return outgoing.sort(compareById);
}

/**
 * Pure server-side sync step. Merges the client's changes into `state` (last write wins),
 * and returns the records the client has not seen. Never mutates its inputs.
 */
export function applySyncRequest(
  state: ServerState,
  request: SyncRequest,
  now: number,
  options: ApplyOptions = {},
): SyncOutcome {
  // Strictly increasing so two requests in one millisecond never hide each other's changes.
  const serverTime = Math.max(now, state.serverTime + 1);
  const skewMs = options.maxClockSkewMs ?? SYNC_CONFIG.defaultMaxClockSkewMs;
  const ctx: MergeContext = {
    serverTime,
    retentionMs: options.tombstoneRetentionMs ?? SYNC_CONFIG.defaultTombstoneRetentionMs,
    latestAllowed: serverTime + skewMs,
  };

  const merged = {} as Record<SyncCollection, MergedCollection>;
  let prunedBefore = state.prunedBefore;
  let changed = false;
  let clamped = 0;
  for (const name of SYNC_COLLECTIONS) {
    merged[name] = mergeCollection(state.collections[name] ?? [], request.changes[name] ?? [], ctx);
    prunedBefore = Math.max(prunedBefore, merged[name].prunedUpTo);
    changed ||= merged[name].changed;
    clamped += merged[name].clampedIds.size;
  }
  changed ||= prunedBefore !== state.prunedBefore;

  // A cursor older than a pruned tombstone may have missed that delete: hand over everything.
  // A cursor ahead of this server's clock came from a different or restored data set: resync too.
  const resync = request.since > 0 && (request.since < prunedBefore || request.since > state.serverTime);
  const cursor = resync ? 0 : request.since;

  const collections = {} as Record<SyncCollection, StoredRecord[]>;
  const responseChanges: SyncResponse['changes'] = {};
  for (const name of SYNC_COLLECTIONS) {
    collections[name] = [...merged[name].byId.values()].sort((a, b) => compareById(a.record, b.record));
    const outgoing = outgoingRecords(merged[name], cursor);
    if (outgoing.length > 0) responseChanges[name] = outgoing;
  }
  return {
    state: { serverId: state.serverId, serverTime, prunedBefore, collections },
    response: { changes: responseChanges, serverTime, serverId: state.serverId, resync },
    changed,
    clamped,
  };
}
