import { SYNC_COLLECTIONS, mergeRecords, validateCollectionRecord, type SyncCollection, type SyncRecord, type SyncRequest, type SyncResponse } from '@sc/core';
import type { Table } from 'dexie';
import { DATA_MARKER_KEY, SYNC } from '../config/constants';
import { db as defaultDb, type ShinyCardboardDB } from '../data/db';
import { clock } from '../data/clock';
import { subscribeLocalChanges } from '../data/changeBus';
import type { SyncConfig } from './config';
import { loadSyncConfig } from './config';
import { SyncError, postSync } from './http';

/** Timing knobs; overridable so tests do not have to wait real seconds. */
export interface SyncTiming {
  readonly intervalMs: number;
  readonly debounceMs: number;
  readonly visibilityGapMs: number;
  readonly backoffBaseMs: number;
  readonly backoffMaxMs: number;
}

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline' | 'disabled';

export interface SyncState {
  status: SyncStatus;
  /** Wall-clock time of the last successful sync, or null if never. */
  lastSyncedAt: number | null;
  /** User-safe message when status is "error". */
  error: string | null;
  /** Local records changed since the last successful sync. */
  pending: number;
  /** Remote records dropped by validation in the last sync (never applied to the local database). */
  rejected: number;
  /** True once a sync has completed since this engine started (remote state has been merged). */
  syncedThisSession: boolean;
}

type MergeFn = <T extends SyncRecord>(local: T[], remote: T[]) => T[];

export interface SyncEngineDeps {
  db: ShinyCardboardDB;
  getConfig: () => SyncConfig | null;
  fetchFn: typeof fetch;
  merge: MergeFn;
  now: () => number;
  isOnline: () => boolean;
  /** Jitter source in [0, 1). */
  random?: () => number;
}

export function defaultSyncDeps(): SyncEngineDeps {
  return {
    db: defaultDb,
    getConfig: loadSyncConfig,
    fetchFn: (...args) => fetch(...args),
    merge: mergeRecords,
    now: () => clock.now(),
    isOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine),
    random: Math.random,
  };
}

/** Exponential backoff with equal jitter: half fixed, half random, capped. */
export function backoffDelay(failures: number, baseMs: number, maxMs: number, random: () => number = Math.random): number {
  const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, failures - 1));
  return Math.round(exp / 2 + (exp / 2) * random());
}

type Records = Partial<Record<SyncCollection, SyncRecord[]>>;
/** Remote rows already stored locally, keyed `collection:id` to the updatedAt we received. */
type AppliedMap = Record<string, number>;

interface Cursor {
  since: number;
  watermark: number;
  applied: AppliedMap;
  serverId: string | undefined;
  /** `collection:id` keys that must be pushed even though their updatedAt is below the watermark. */
  outbox: string[];
}


const sameRecord = (a: SyncRecord | undefined, b: SyncRecord) => a !== undefined && JSON.stringify(a) === JSON.stringify(b);
const keyOf = (name: SyncCollection, id: string) => `${name}:${id}`;

/** Stamps we sent in this request, keyed `collection:id`. */
function pushedStamps(request: SyncRequest): Map<string, number> {
  const stamps = new Map<string, number>();
  for (const name of SYNC_COLLECTIONS) for (const row of request.changes[name] ?? []) stamps.set(keyOf(name, row.id), row.updatedAt);
  return stamps;
}
const META = SYNC.metaKeys;

/**
 * Pull/push sync against the protocol in @sc/core.
 *
 * Dirty tracking: a record is dirty when `updatedAt` is greater than the watermark (the local
 * clock minus 1 ms at the start of the last successful sync) and it is not a copy we just
 * received from the server. Cursors are tied to the server URL and id: if either changes, or
 * the server asks for a resync, or its clock goes backwards, the cursors reset and a full
 * exchange happens.
 */
export class SyncEngine {
  private state: SyncState = { status: 'disabled', lastSyncedAt: null, error: null, pending: 0, rejected: 0, syncedThisSession: false };
  private readonly listeners = new Set<() => void>();
  private inflight: Promise<boolean> | null = null;
  private refreshing: Promise<void> | null = null;
  private rerunRequested = false;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private intervalTimer: ReturnType<typeof setInterval> | undefined;
  private lastAttemptAt = 0;
  private failures = 0;
  private retryAt = 0;
  private teardown: Array<() => void> = [];

  constructor(
    private readonly deps: SyncEngineDeps = defaultSyncDeps(),
    private readonly timing: SyncTiming = SYNC,
  ) {}

  /* ---- observable state (compatible with useSyncExternalStore) ---- */

  getState = (): SyncState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private setState(patch: Partial<SyncState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  /* ---- lifecycle ---- */

  /** Begin automatic syncing: on start, interval, reconnect, tab focus and local edits. Idempotent. */
  start(): void {
    if (this.teardown.length > 0) return;
    const onOnline = () => {
      this.failures = 0;
      this.retryAt = 0;
      void this.syncNow();
    };
    const onOffline = () => this.deps.getConfig() && this.setState({ status: 'offline' });
    const onVisible = () => {
      const stale = this.deps.now() - this.lastAttemptAt >= this.timing.visibilityGapMs;
      if (document.visibilityState === 'visible' && stale) void this.autoSync();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    this.intervalTimer = setInterval(() => void this.autoSync(), this.timing.intervalMs);
    this.teardown = [
      () => window.removeEventListener('online', onOnline),
      () => window.removeEventListener('offline', onOffline),
      () => document.removeEventListener('visibilitychange', onVisible),
      () => clearInterval(this.intervalTimer),
      subscribeLocalChanges(() => this.notifyLocalChange()),
    ];
    void this.refresh();
  }

  stop(): void {
    this.teardown.forEach((fn) => fn());
    this.teardown = [];
    clearTimeout(this.debounceTimer);
  }

  /** Re-evaluate configuration (call after settings change) and sync when enabled. Concurrent calls share one run. */
  refresh(): Promise<void> {
    this.refreshing ??= this.loadPersistedState()
      .then(() => this.syncNow())
      .finally(() => {
        this.refreshing = null;
      });
    return this.refreshing;
  }

  /** Forget the server cursors so the next sync pushes everything and pulls everything. */
  async resyncEverything(): Promise<void> {
    const { db } = this.deps;
    await db.syncMeta.bulkDelete([META.serverTime, META.watermark, META.applied, META.serverUrl, META.serverId]);
    this.failures = 0;
    this.retryAt = 0;
    await this.syncNow();
  }

  /** Schedule a debounced sync after a local edit. */
  notifyLocalChange(): void {
    if (!this.deps.getConfig()) return;
    void this.updatePending();
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => void this.autoSync(), this.timing.debounceMs);
  }

  /** Background trigger: respects error backoff. Manual and reconnect triggers call syncNow directly. */
  private async autoSync(): Promise<void> {
    if (this.deps.now() < this.retryAt) return;
    await this.syncNow();
  }

  /** Run a sync now. Concurrent calls coalesce into the running one plus one follow-up. */
  async syncNow(): Promise<void> {
    if (this.inflight) {
      this.rerunRequested = true;
      await this.inflight;
      return;
    }
    const config = this.deps.getConfig();
    if (!config) return this.setState({ status: 'disabled', error: null });
    if (!this.deps.isOnline()) return this.setState({ status: 'offline' });

    this.inflight = this.runOnce(config).finally(() => {
      this.inflight = null;
    });
    const needsFollowUp = await this.inflight;
    if (needsFollowUp || this.rerunRequested) {
      this.rerunRequested = false;
      await this.syncNow();
    }
  }

  /* ---- persisted bookkeeping ---- */

  /** Synced tables share one record shape, so they are handled generically. */
  private table(name: SyncCollection): Table<SyncRecord, string> {
    return this.deps.db[name] as unknown as Table<SyncRecord, string>;
  }

  private async getMeta<T>(key: string): Promise<T | undefined> {
    return (await this.deps.db.syncMeta.get(key))?.value as T | undefined;
  }

  /** Cursors for the given server. A different URL means a different server: start from zero. */
  private async cursorFor(config: SyncConfig | null): Promise<Cursor> {
    const storedUrl = await this.getMeta<string>(META.serverUrl);
    const outbox = (await this.getMeta<string[]>(META.outbox)) ?? [];
    if (config && storedUrl !== config.url) return { since: 0, watermark: 0, applied: {}, serverId: undefined, outbox };
    return {
      since: (await this.getMeta<number>(META.serverTime)) ?? 0,
      watermark: (await this.getMeta<number>(META.watermark)) ?? 0,
      applied: (await this.getMeta<AppliedMap>(META.applied)) ?? {},
      serverId: await this.getMeta<string>(META.serverId),
      outbox,
    };
  }

  private async loadPersistedState(): Promise<void> {
    const lastSyncedAt = (await this.getMeta<number>(META.lastSuccess)) ?? null;
    this.setState({ lastSyncedAt });
    await this.updatePending();
  }

  private async updatePending(): Promise<void> {
    const cursor = await this.cursorFor(this.deps.getConfig());
    const dirty = await this.collectDirty(cursor);
    this.setState({ pending: SYNC_COLLECTIONS.reduce((sum, name) => sum + (dirty[name]?.length ?? 0), 0) });
  }

  /* ---- one exchange ---- */

  private async collectDirty(cursor: Cursor): Promise<Records> {
    const changes: Records = {};
    for (const name of SYNC_COLLECTIONS) {
      const rows = await this.table(name).where('updatedAt').above(cursor.watermark).toArray();
      const own = rows.filter((row) => cursor.applied[keyOf(name, row.id)] !== row.updatedAt);
      // Outbox rows carry deliberately old stamps (migrations) but still have to reach the server.
      const seen = new Set(own.map((row) => row.id));
      const queuedIds = cursor.outbox.filter((key) => key.startsWith(`${name}:`)).map((key) => key.slice(name.length + 1)).filter((id) => !seen.has(id));
      const queued = (await this.table(name).bulkGet(queuedIds)).filter((row): row is SyncRecord => row !== undefined);
      const all = [...own, ...queued];
      if (all.length > 0) changes[name] = all;
    }
    return changes;
  }

  /** Resolves true when a follow-up exchange is needed (server reset detected). */
  private async runOnce(config: SyncConfig): Promise<boolean> {
    this.lastAttemptAt = this.deps.now();
    this.setState({ status: 'syncing', error: null });
    try {
      const startedAt = this.deps.now();
      const cursor = await this.cursorFor(config);
      const request: SyncRequest = { since: cursor.since, changes: await this.collectDirty(cursor) };
      const response = await postSync(config, request, this.deps.fetchFn);
      const resync = this.serverWasReset(cursor, response);
      // A reset only needs a second exchange if this one did not already push and pull everything.
      const followUp = resync && (cursor.since > 0 || cursor.watermark > 0);
      await this.applyResponse(config, response, cursor, startedAt - 1, followUp, pushedStamps(request));
      this.failures = 0;
      this.retryAt = 0;
      this.setState({ status: 'idle', lastSyncedAt: this.deps.now(), error: null, syncedThisSession: true });
      await this.updatePending();
      return followUp;
    } catch (error) {
      this.failures += 1;
      this.retryAt = this.deps.now() + backoffDelay(this.failures, this.timing.backoffBaseMs, this.timing.backoffMaxMs, this.deps.random);
      this.setState(this.errorState(error));
      return false;
    }
  }

  /** True when this server is not the one our cursors describe. */
  private serverWasReset(cursor: Cursor, response: SyncResponse): boolean {
    if (response.resync === true) return true;
    if (cursor.serverId && response.serverId && cursor.serverId !== response.serverId) return true;
    return response.serverTime < cursor.since;
  }

  private errorState(error: unknown): Partial<SyncState> {
    if (error instanceof SyncError && error.kind === 'network' && !this.deps.isOnline()) return { status: 'offline', error: null };
    const message = error instanceof SyncError ? error.message : 'Sync failed unexpectedly';
    return { status: 'error', error: message };
  }

  /** Merge remote records into local tables and advance (or reset) the cursors in one transaction. */
  private async applyResponse(
    config: SyncConfig,
    response: SyncResponse,
    cursor: Cursor,
    watermark: number,
    resync: boolean,
    pushed: Map<string, number>,
  ): Promise<void> {
    const { db } = this.deps;
    const applied: AppliedMap = { ...cursor.applied };
    let rejected = 0;
    let wroteRows = false;
    await db.transaction('rw', [db.owned, db.taggings, db.decks, db.savedSearches, db.syncMeta], async () => {
      for (const name of SYNC_COLLECTIONS) {
        const incoming = response.changes[name] ?? [];
        const remote = incoming.filter((row) => validateCollectionRecord(name, row, name) === null);
        rejected += incoming.length - remote.length;
        for (const row of await this.mergeCollection(name, remote, pushed)) {
          applied[keyOf(name, row.id)] = row.updatedAt;
          wroteRows = true;
        }
      }
      const serverId = response.serverId;
      if (rejected > 0) console.warn(`Dropped ${rejected} invalid record(s) from the sync server`);
      this.setState({ rejected });
      const nextWatermark = resync ? 0 : watermark;
      const kept = resync ? {} : Object.fromEntries(Object.entries(applied).filter(([, stamp]) => stamp > nextWatermark));
      await db.syncMeta.bulkPut([
        { key: META.serverTime, value: resync ? 0 : response.serverTime },
        { key: META.watermark, value: nextWatermark },
        { key: META.applied, value: kept },
        { key: META.serverUrl, value: config.url },
        { key: META.lastSuccess, value: this.deps.now() },
      ]);
      if (serverId) await db.syncMeta.put({ key: META.serverId, value: serverId });
      if (wroteRows) await db.syncMeta.put({ key: DATA_MARKER_KEY, value: true });
      // Re-read inside the transaction so entries queued during the request are not lost.
      const queued = (await db.syncMeta.get(META.outbox))?.value as string[] | undefined;
      if (queued) await db.syncMeta.put({ key: META.outbox, value: queued.filter((key) => !pushed.has(key)) });
    });
  }

  /** Returns the rows that were written locally. */
  private async mergeCollection(name: SyncCollection, remote: SyncRecord[], pushed: Map<string, number>): Promise<SyncRecord[]> {
    if (remote.length === 0) return [];
    const table = this.table(name);
    const local = (await table.bulkGet(remote.map((row) => row.id))).filter((row): row is SyncRecord => row !== undefined);
    const localById = new Map(local.map((row) => [row.id, row]));
    // The server may correct a record we just pushed (for example clamping a future timestamp).
    // If it was not edited since, the server copy is authoritative even though LWW would keep ours.
    const authoritative = remote.filter((row) => {
      const current = localById.get(row.id);
      return current !== undefined && pushed.get(keyOf(name, row.id)) === current.updatedAt;
    });
    const authoritativeIds = new Set(authoritative.map((row) => row.id));
    const merged = this.deps.merge(local.filter((row) => !authoritativeIds.has(row.id)), remote.filter((row) => !authoritativeIds.has(row.id)));
    const changed = [...merged, ...authoritative].filter((row) => !sameRecord(localById.get(row.id), row));
    if (changed.length > 0) await table.bulkPut(changed);
    return changed;
  }
}
