import type { SyncCollection, SyncRecord, SyncRequest, SyncResponse } from '@sc/core';
import { SYNC_COLLECTIONS } from '@sc/core';
import { db } from '../data/db';
import { clock } from '../data/clock';

/** Empty every table between tests. */
export async function resetDb(): Promise<void> {
  await Promise.all([db.owned.clear(), db.taggings.clear(), db.decks.clear(), db.savedSearches.clear(), db.syncMeta.clear()]);
}

/** Deterministic clock: each call to `tick()` advances by one second from a fixed epoch. */
export function installFakeClock(start = 1_700_000_000_000) {
  let current = start;
  const spy = vi.spyOn(clock, 'now').mockImplementation(() => current);
  return {
    tick(ms = 1000) {
      current += ms;
      return current;
    },
    set(ms: number) {
      current = ms;
    },
    get now() {
      return current;
    },
    restore: () => spy.mockRestore(),
  };
}

/** Independent last-write-wins merge matching core's documented rules (ties: tombstone, then remote). */
export function lwwMerge<T extends SyncRecord>(local: T[], remote: T[]): T[] {
  const byId = new Map<string, T>(local.map((row) => [row.id, row]));
  for (const incoming of remote) {
    const current = byId.get(incoming.id);
    if (!current) byId.set(incoming.id, incoming);
    else if (incoming.updatedAt > current.updatedAt) byId.set(incoming.id, incoming);
    else if (incoming.updatedAt === current.updatedAt && (incoming.deleted || !current.deleted)) byId.set(incoming.id, incoming);
  }
  return [...byId.values()];
}

interface StoredRecord {
  record: SyncRecord;
  seq: number;
}

export interface FakeSyncServer {
  fetch: typeof fetch;
  requests: SyncRequest[];
  /** Server-side view of one collection. */
  records(name: SyncCollection): SyncRecord[];
  /** Simulate another device writing directly to the server. */
  seed(name: SyncCollection, record: SyncRecord & Record<string, unknown>): void;
  /** Make every request fail with this HTTP status (null restores normal service). */
  failWith(status: number | null): void;
  /** Make every request throw a network error. */
  goDark(down: boolean): void;
  /** Stable id reported in every response. */
  readonly serverId: string;
  /** The next response carries resync:true plus the full state (as if tombstones were pruned). */
  demandResyncOnce(): void;
}

export interface FakeServerOptions {
  /** Clamp pushed updatedAt values above this to it and return the corrected copy. */
  clampFutureTo?: number;
}

/** In-memory implementation of the sync protocol with bearer auth and per-record sequence numbers. */
let serverCounter = 0;

export function createFakeSyncServer(token = 'secret-token', options: FakeServerOptions = {}): FakeSyncServer {
  const serverId = `server-${++serverCounter}`;
  let resyncOnce = false;
  const store = Object.fromEntries(SYNC_COLLECTIONS.map((name) => [name, new Map<string, StoredRecord>()])) as Record<
    SyncCollection,
    Map<string, StoredRecord>
  >;
  const requests: SyncRequest[] = [];
  let seq = 1000;
  let forcedStatus: number | null = null;
  let dark = false;

  const upsert = (name: SyncCollection, incoming: SyncRecord) => {
    const existing = store[name].get(incoming.id);
    if (existing && lwwMerge([existing.record], [incoming])[0] === existing.record) return;
    store[name].set(incoming.id, { record: incoming, seq: ++seq });
  };

  const reply = (status: number, body: unknown) =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (dark) throw new TypeError('Failed to fetch');
    if (forcedStatus) return reply(forcedStatus, {});
    if (!String(input).endsWith('/sync') || init?.method !== 'POST') return reply(404, {});
    const auth = new Headers(init.headers).get('Authorization');
    if (auth !== `Bearer ${token}`) return reply(401, { error: 'unauthorized' });

    const request = JSON.parse(String(init.body)) as SyncRequest;
    requests.push(request);
    const pushedIds = new Set<string>();
    const fullState = resyncOnce;
    resyncOnce = false;
    for (const name of SYNC_COLLECTIONS) {
      for (const record of request.changes[name] ?? []) {
        const clamp = options.clampFutureTo;
        upsert(name, clamp !== undefined && record.updatedAt > clamp ? { ...record, updatedAt: clamp } : record);
        pushedIds.add(`${name}:${record.id}`);
      }
    }
    const changes: SyncResponse['changes'] = {};
    for (const name of SYNC_COLLECTIONS) {
      const unseen = [...store[name].values()].filter((row) => fullState || row.seq > request.since || (pushedIds.has(`${name}:${row.record.id}`) && options.clampFutureTo !== undefined)).map((row) => row.record);
      if (unseen.length > 0) changes[name] = unseen;
    }
    return reply(200, { changes, serverTime: seq, serverId, resync: fullState } satisfies SyncResponse);
  }) as typeof fetch;

  return {
    serverId,
    demandResyncOnce: () => {
      resyncOnce = true;
    },
    fetch: fakeFetch,
    requests,
    records: (name) => [...store[name].values()].map((row) => row.record),
    seed: (name, record) => upsert(name, record),
    failWith: (status) => {
      forcedStatus = status;
    },
    goDark: (down) => {
      dark = down;
    },
  };
}
