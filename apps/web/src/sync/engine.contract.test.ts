import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../data/db';
import { setOwnedQuantity } from '../data/mutations';
import { SYNC } from '../config/constants';
import { createFakeSyncServer, installFakeClock, lwwMerge, resetDb, type FakeSyncServer } from '../test/helpers';
import { SyncEngine } from './engine';
import type { SyncConfig } from './config';

const TOKEN = 'secret-token';
const CONFIG: SyncConfig = { url: 'https://sync.test', token: TOKEN };
const TIMING = { intervalMs: 60_000, debounceMs: 15, visibilityGapMs: 0, backoffBaseMs: 1_000, backoffMaxMs: 8_000 };

describe('sync protocol contract (serverId, resync, clamping, validation)', () => {
  let clock: ReturnType<typeof installFakeClock>;
  beforeEach(async () => {
    await resetDb();
    clock = installFakeClock();
  });
  afterEach(() => clock.restore());

  const engineFor = (server: FakeSyncServer, config: SyncConfig = CONFIG) =>
    new SyncEngine({ db, getConfig: () => config, fetchFn: server.fetch, merge: lwwMerge, now: () => clock.now, isOnline: () => true, random: () => 0.5 }, TIMING);

  it('persists the server id and does a full exchange when it changes behind the same URL', async () => {
    await setOwnedQuantity({ printingKey: 'a-001-standard' }, 2);
    const first = createFakeSyncServer(TOKEN);
    clock.tick();
    await engineFor(first).syncNow();
    expect((await db.syncMeta.get(SYNC.metaKeys.serverId))?.value).toBe(first.serverId);

    const replacement = createFakeSyncServer(TOKEN); // new id, same URL
    clock.tick();
    await engineFor(replacement).syncNow();
    const exchanges = replacement.requests;
    expect(exchanges.at(-1)!.since).toBe(0);
    expect(exchanges.at(-1)!.changes.owned).toHaveLength(1);
    expect(replacement.records('owned')).toHaveLength(1);
    expect((await db.syncMeta.get(SYNC.metaKeys.serverId))?.value).toBe(replacement.serverId);
  });

  it('resync:true (pruned tombstones) triggers a full push and pull from zero', async () => {
    await setOwnedQuantity({ printingKey: 'a-001-standard' }, 1);
    const server = createFakeSyncServer(TOKEN);
    const engine = engineFor(server);
    clock.tick();
    await engine.syncNow();

    clock.tick();
    await setOwnedQuantity({ printingKey: 'b-002-standard' }, 1);
    server.demandResyncOnce();
    clock.tick();
    await engine.syncNow();

    const last = server.requests.at(-1)!;
    expect(last.since).toBe(0);
    expect(last.changes.owned).toHaveLength(2);
    expect(engine.getState().status).toBe('idle');
  });

  it('applies the corrected copy when the server clamps a future updatedAt', async () => {
    const serverNow = clock.now;
    const server = createFakeSyncServer(TOKEN, { clampFutureTo: serverNow });
    clock.set(serverNow + 3_600_000); // this device runs an hour ahead
    const created = await setOwnedQuantity({ printingKey: 'a-001-standard' }, 4);
    expect(created!.updatedAt).toBeGreaterThan(serverNow);

    const engine = engineFor(server);
    await engine.syncNow();

    const local = await db.owned.get(created!.id);
    expect(local?.updatedAt).toBe(serverNow); // server version adopted even though ours was "newer"
    expect(engine.getState().pending).toBe(0);
    await engine.syncNow();
    expect(server.requests.at(-1)!.changes.owned).toBeUndefined(); // not re-pushed
  });

  it('a local edit made after the push is not overwritten by the clamped copy', async () => {
    const serverNow = clock.now;
    const server = createFakeSyncServer(TOKEN, { clampFutureTo: serverNow });
    clock.set(serverNow + 3_600_000);
    await setOwnedQuantity({ printingKey: 'a-001-standard' }, 4);
    const engine = engineFor(server);
    const pending = engine.syncNow();
    clock.tick();
    await setOwnedQuantity({ printingKey: 'a-001-standard' }, 9); // edited while the request is in flight
    await pending;
    expect((await db.owned.toArray())[0]?.quantity).toBe(9);
  });

  it('drops invalid remote records, reports the count and keeps the database clean', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const server = createFakeSyncServer(TOKEN);
    server.seed('owned', { id: 'good|normal|NM', updatedAt: clock.now, printingKey: 'good', finish: 'normal', condition: 'NM', quantity: 1 });
    server.seed('owned', { id: 'bad|foil|NM', updatedAt: clock.now, printingKey: 'bad', finish: 'shiny', condition: 'NM', quantity: -5 });
    const engine = engineFor(server);
    await engine.syncNow();
    expect(await db.owned.get('good|normal|NM')).toBeTruthy();
    expect(await db.owned.get('bad|foil|NM')).toBeUndefined();
    expect(engine.getState()).toMatchObject({ status: 'idle', rejected: 1 });
    warn.mockRestore();
  });
});
