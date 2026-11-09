import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { ShinyCardboardDB, db } from '../data/db';
import { addTag, deleteDeck, saveDeck, setOwnedQuantity } from '../data/mutations';
import { createFakeSyncServer, installFakeClock, lwwMerge, resetDb, type FakeSyncServer } from '../test/helpers';
import { SyncEngine, backoffDelay, type SyncEngineDeps } from './engine';
import { testConnection } from './http';
import type { SyncConfig } from './config';

const TOKEN = 'secret-token';
const CONFIG: SyncConfig = { url: 'https://sync.test', token: TOKEN };
const FAST_TIMING = { intervalMs: 60_000, debounceMs: 15, visibilityGapMs: 0, backoffBaseMs: 1_000, backoffMaxMs: 8_000 };

describe('SyncEngine', () => {
  let server: FakeSyncServer;
  let clock: ReturnType<typeof installFakeClock>;
  let config: SyncConfig | null;
  let online: boolean;

  const makeEngine = (overrides: Partial<SyncEngineDeps> = {}, timing = FAST_TIMING) =>
    new SyncEngine(
      {
        db,
        getConfig: () => config,
        fetchFn: server.fetch,
        merge: lwwMerge,
        now: () => clock.now,
        isOnline: () => online,
        ...overrides,
      },
      timing,
    );

  beforeEach(async () => {
    await resetDb();
    server = createFakeSyncServer(TOKEN);
    clock = installFakeClock();
    config = CONFIG;
    online = true;
  });
  afterEach(() => clock.restore());

  it('stays disabled without a configuration and never calls the server', async () => {
    config = null;
    const engine = makeEngine();
    await engine.syncNow();
    expect(engine.getState().status).toBe('disabled');
    expect(server.requests).toHaveLength(0);
  });

  it('reports offline without hitting the network', async () => {
    online = false;
    const engine = makeEngine();
    await engine.syncNow();
    expect(engine.getState().status).toBe('offline');
    expect(server.requests).toHaveLength(0);
  });

  it('pushes dirty records on first sync, including tombstones', async () => {
    await setOwnedQuantity({ printingKey: 'ogn-001-standard' }, 2);
    const deck = await saveDeck({ name: 'Doomed' });
    clock.tick();
    await deleteDeck(deck.id);

    const engine = makeEngine();
    clock.tick();
    await engine.syncNow();

    expect(engine.getState()).toMatchObject({ status: 'idle', error: null, pending: 0 });
    expect(server.requests[0]!.since).toBe(0);
    expect(server.records('owned')).toHaveLength(1);
    expect(server.records('decks')[0]).toMatchObject({ id: deck.id, deleted: true });
  });

  it('only sends records changed since the last successful sync', async () => {
    await setOwnedQuantity({ printingKey: 'a-001-standard' }, 1);
    const engine = makeEngine();
    clock.tick();
    await engine.syncNow();

    clock.tick();
    await addTag('vi', 'burn');
    clock.tick();
    await engine.syncNow();

    const second = server.requests[1]!;
    expect(second.changes.owned).toBeUndefined();
    expect(second.changes.taggings).toHaveLength(1);
    expect(second.since).toBeGreaterThan(0);
  });

  it('applies remote changes, including remote deletes, and keeps newer local edits', async () => {
    const mine = await setOwnedQuantity({ printingKey: 'mine-001-standard' }, 5);
    await setOwnedQuantity({ printingKey: 'gone-001-standard' }, 1);
    const engine = makeEngine();
    clock.tick();
    await engine.syncNow();

    clock.tick();
    const remoteNewer = { ...mine!, quantity: 9, updatedAt: clock.now };
    server.seed('owned', remoteNewer);
    server.seed('owned', {
      ...(await db.owned.get('gone-001-standard|normal|NM'))!,
      deleted: true,
      quantity: 0,
      updatedAt: clock.now,
    });
    server.seed('savedSearches', { id: 'ss1', updatedAt: clock.now, name: 'Remote', query: 'q' } as never);

    clock.tick();
    await engine.syncNow();

    expect((await db.owned.get(mine!.id))?.quantity).toBe(9);
    expect(await db.owned.get('gone-001-standard|normal|NM')).toMatchObject({ deleted: true });
    expect(await db.savedSearches.get('ss1')).toMatchObject({ name: 'Remote' });
  });

  it('does not overwrite a local record that is newer than the remote copy', async () => {
    const local = await setOwnedQuantity({ printingKey: 'x-001-standard' }, 7);
    server.seed('owned', { ...local!, quantity: 1, updatedAt: local!.updatedAt - 500 });
    const engine = makeEngine();
    clock.tick();
    await engine.syncNow();
    expect((await db.owned.get(local!.id))?.quantity).toBe(7);
    expect(server.records('owned')[0]).toMatchObject({ quantity: 7 });
  });

  it('converges two devices through the server', async () => {
    const dbB = new ShinyCardboardDB('device-b');
    const deviceA = makeEngine();
    const deviceB = makeEngine({ db: dbB });

    const created = await setOwnedQuantity({ printingKey: 'shared-001-standard' }, 3);
    clock.tick();
    await deviceA.syncNow();
    await deviceB.syncNow();
    expect(await dbB.owned.get(created!.id)).toMatchObject({ quantity: 3 });

    clock.tick();
    await dbB.owned.put({ ...created!, quantity: 8, updatedAt: clock.now });
    clock.tick();
    await deviceB.syncNow();
    clock.tick();
    await deviceA.syncNow();
    expect((await db.owned.get(created!.id))?.quantity).toBe(8);
    dbB.close();
    await Dexie.delete('device-b');
  });

  it.each([
    [401, 'rejected the access token'],
    [500, 'returned an error (500)'],
    [404, 'endpoint not found'],
  ])('maps HTTP %i to a safe message without leaking the token', async (status, fragment) => {
    server.failWith(status);
    const engine = makeEngine();
    await engine.syncNow();
    const { status: state, error } = engine.getState();
    expect(state).toBe('error');
    expect(error).toContain(fragment);
    expect(error).not.toContain(TOKEN);
  });

  it('recovers from an error on the next successful sync', async () => {
    server.failWith(500);
    const engine = makeEngine();
    await engine.syncNow();
    server.failWith(null);
    await engine.syncNow();
    expect(engine.getState()).toMatchObject({ status: 'idle', error: null });
  });

  it('reports an unreachable server as an error while online', async () => {
    server.goDark(true);
    const engine = makeEngine();
    await engine.syncNow();
    expect(engine.getState()).toMatchObject({ status: 'error', error: 'Could not reach the server' });
  });

  it('reports offline when connectivity drops during the request', async () => {
    const engine = makeEngine({
      fetchFn: (async () => {
        online = false;
        throw new TypeError('Failed to fetch');
      }) as typeof fetch,
    });
    await engine.syncNow();
    expect(engine.getState()).toMatchObject({ status: 'offline', error: null });
  });

  it('coalesces concurrent syncs into one run plus a single follow-up', async () => {
    const engine = makeEngine();
    await Promise.all([engine.syncNow(), engine.syncNow(), engine.syncNow()]);
    expect(server.requests.length).toBeLessThanOrEqual(2);
  });

  it('debounces local changes into one automatic sync', async () => {
    const engine = makeEngine();
    engine.notifyLocalChange();
    engine.notifyLocalChange();
    engine.notifyLocalChange();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(server.requests).toHaveLength(1);
    engine.stop();
  });

  it('exposes pending local changes and publishes state to subscribers', async () => {
    const engine = makeEngine();
    const seen: string[] = [];
    engine.subscribe(() => seen.push(engine.getState().status));
    await setOwnedQuantity({ printingKey: 'p-001-standard' }, 1);
    clock.tick();
    await engine.syncNow();
    expect(seen).toContain('syncing');
    expect(seen.at(-1)).toBe('idle');
  });

  it('persists the cursor so a new engine instance resumes incrementally', async () => {
    await setOwnedQuantity({ printingKey: 'p-001-standard' }, 1);
    clock.tick();
    await makeEngine().syncNow();
    clock.tick();
    const resumed = makeEngine();
    await resumed.refresh();
    expect(server.requests.at(-1)!.since).toBeGreaterThan(0);
    expect(resumed.getState().lastSyncedAt).not.toBeNull();
  });
});

describe('SyncEngine server identity and resilience', () => {
  let server: FakeSyncServer;
  let clock: ReturnType<typeof installFakeClock>;
  let config: SyncConfig;
  const TIMING = { intervalMs: 60_000, debounceMs: 15, visibilityGapMs: 0, backoffBaseMs: 1_000, backoffMaxMs: 8_000 };
  const makeEngine = (fetchFn: typeof fetch = server.fetch) =>
    new SyncEngine({ db, getConfig: () => config, fetchFn, merge: lwwMerge, now: () => clock.now, isOnline: () => true, random: () => 0.5 }, TIMING);

  beforeEach(async () => {
    await resetDb();
    server = createFakeSyncServer(TOKEN);
    clock = installFakeClock();
    config = CONFIG;
  });
  afterEach(() => clock.restore());

  it('switching servers does a full exchange', async () => {
    await setOwnedQuantity({ printingKey: 'a-001-standard' }, 2);
    const engine = makeEngine();
    clock.tick();
    await engine.syncNow();
    expect(server.records('owned')).toHaveLength(1);

    const fresh = createFakeSyncServer(TOKEN);
    config = { url: 'https://other.test', token: TOKEN };
    const switched = makeEngine(fresh.fetch);
    clock.tick();
    await switched.syncNow();
    expect(fresh.requests[0]!.since).toBe(0);
    expect(fresh.requests[0]!.changes.owned).toHaveLength(1);
    expect(fresh.records('owned')).toHaveLength(1);
  });

  it('treats a server clock that went backwards as a reset and re-pushes everything', async () => {
    await setOwnedQuantity({ printingKey: 'a-001-standard' }, 2);
    const engine = makeEngine();
    clock.tick();
    await engine.syncNow();

    const reset = createFakeSyncServer(TOKEN); // empty server, same URL, lower serverTime
    const after = makeEngine(reset.fetch);
    clock.tick();
    await after.syncNow();
    expect(reset.records('owned')).toHaveLength(1);
    expect(after.getState().status).toBe('idle');
  });

  it('manual resync sends everything again', async () => {
    await setOwnedQuantity({ printingKey: 'a-001-standard' }, 2);
    const engine = makeEngine();
    clock.tick();
    await engine.syncNow();
    await engine.resyncEverything();
    expect(server.requests.at(-1)!.since).toBe(0);
    expect(server.requests.at(-1)!.changes.owned).toHaveLength(1);
  });

  it('does not echo remote rows with future timestamps back and clears pending', async () => {
    const future = clock.now + 3_600_000;
    server.seed('owned', { id: 'far|normal|NM', updatedAt: future, printingKey: 'far', finish: 'normal', condition: 'NM', quantity: 1 });
    const engine = makeEngine();
    clock.tick();
    await engine.syncNow();
    expect(await db.owned.get('far|normal|NM')).toBeTruthy();
    expect(engine.getState().pending).toBe(0);
    clock.tick();
    await engine.syncNow();
    expect(server.requests.at(-1)!.changes.owned).toBeUndefined();
  });

  it('backs off after errors for automatic triggers and resets on success', async () => {
    server.failWith(500);
    const engine = makeEngine();
    await engine.syncNow();
    const attempts = server.requests.length;
    engine.notifyLocalChange();
    // retryAt is in the future (fake clock does not advance), so the debounced auto sync is skipped
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(server.requests.length).toBe(attempts);
    server.failWith(null);
    await engine.syncNow(); // manual sync always runs
    expect(engine.getState().status).toBe('idle');
  });

  it('refresh calls made together share one run (StrictMode safe)', async () => {
    const engine = makeEngine();
    await Promise.all([engine.refresh(), engine.refresh()]);
    expect(server.requests).toHaveLength(1);
  });
});

describe('backoffDelay', () => {
  it('grows exponentially with jitter and caps', () => {
    expect(backoffDelay(1, 1000, 8000, () => 0)).toBe(500);
    expect(backoffDelay(1, 1000, 8000, () => 1)).toBe(1000);
    expect(backoffDelay(3, 1000, 8000, () => 1)).toBe(4000);
    expect(backoffDelay(10, 1000, 8000, () => 1)).toBe(8000);
  });
});

describe('testConnection', () => {
  it('accepts a valid token and rejects a bad one', async () => {
    const server = createFakeSyncServer(TOKEN);
    expect(await testConnection(CONFIG, server.fetch)).toEqual({ ok: true });
    const bad = await testConnection({ ...CONFIG, token: 'nope' }, server.fetch);
    expect(bad).toMatchObject({ ok: false });
    expect(JSON.stringify(bad)).not.toContain('nope');
  });

  it('reports an unreachable server', async () => {
    const server = createFakeSyncServer(TOKEN);
    server.goDark(true);
    expect(await testConnection(CONFIG, server.fetch)).toEqual({ ok: false, error: 'Could not reach the server' });
  });
});
