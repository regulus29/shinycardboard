import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MS_PER_DAY, type SyncResponse } from '@sc/core';
import { createServer } from './app';
import { FileStateStore, LOCK_FILE_NAME, STATE_FILE_NAME, StoreLockedError } from './store';
import { TOKEN, Device, entry, post, useHarness } from './testkit';

const { start, stop, dataDir, baseConfig } = useHarness();

const health = async (base: string) => (await (await fetch(`${base}/health`)).json()) as { serverId: string };

describe('server identity', () => {
  it('reports a stable serverId on /health and in every response, across restarts', async () => {
    const first = await start();
    const { serverId } = await health(first.base);
    const response = (await (await post(first.base, { since: 0, changes: {} })).json()) as SyncResponse;
    expect(serverId).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.serverId).toBe(serverId);
    await stop(first);

    const second = await start();
    expect((await health(second.base)).serverId).toBe(serverId);
  });

  it('gives a different data directory a different serverId', async () => {
    const first = await start();
    const other = await mkdtemp(path.join(os.tmpdir(), 'sc-sync-other-'));
    const second = await start({ dataDir: other });
    expect((await health(first.base)).serverId).not.toBe((await health(second.base)).serverId);
    await stop(second);
    await rm(other, { recursive: true, force: true });
  });
});

describe('tombstone expiry and resync', () => {
  it('tells a stale client to resync after unseen tombstones were pruned, and sends full state', async () => {
    let now = 1_000_000;
    const { base } = await start({ tombstoneRetentionMs: 10 * MS_PER_DAY }, () => now);
    const phone = new Device(base);
    const laptop = new Device(base);

    phone.edit(entry('keep', now));
    phone.edit(entry('gone', now));
    await phone.sync();
    await laptop.sync();

    // The laptop goes offline. The phone deletes a row and the delete ages out on the server.
    now += MS_PER_DAY;
    phone.edit(entry('gone', now, { deleted: true }));
    await phone.sync();
    now += 20 * MS_PER_DAY;
    await phone.sync();

    const stale = (await (await post(base, { since: laptop.since, changes: {} })).json()) as SyncResponse;
    expect(stale.resync).toBe(true);
    expect(stale.changes.owned?.map((r) => r.id)).toEqual(['keep']);

    const fresh = (await (await post(base, { since: 0, changes: {} })).json()) as SyncResponse;
    const current = (await (await post(base, { since: phone.since, changes: {} })).json()) as SyncResponse;
    expect([fresh.resync, current.resync]).toEqual([false, false]);
  });

  it('keeps a tombstone stamped long ago until retention passes from the time it was received', async () => {
    const now = 5_000_000_000_000;
    const { base } = await start({}, () => now);
    const observer = new Device(base);
    await observer.sync();

    const offline = new Device(base);
    offline.edit(entry('x', 1, { deleted: true })); // stamped by a device that was offline for months
    await offline.sync();

    const stored = JSON.parse(await readFile(path.join(dataDir(), STATE_FILE_NAME), 'utf8'));
    expect(stored.collections.owned).toHaveLength(1);
    const pulled = (await (await post(base, { since: observer.since, changes: {} })).json()) as SyncResponse;
    expect(pulled.changes.owned?.[0]).toMatchObject({ id: 'x', deleted: true });
  });
});

describe('clock skew', () => {
  it('clamps records stamped far in the future and sends the corrected copy back', async () => {
    const now = 1_700_000_000_000;
    const { base, logs } = await start({ maxClockSkewMs: 60_000 }, () => now);
    const response = await post(base, {
      since: 0,
      changes: { owned: [entry('fast', now + 3_600_000), entry('ok', now + 30_000)] },
    });
    const body = (await response.json()) as SyncResponse;
    expect(response.status).toBe(200);
    expect(body.changes.owned?.find((r) => r.id === 'fast')?.updatedAt).toBeLessThanOrEqual(now + 1);
    expect(body.changes.owned?.find((r) => r.id === 'ok')).toBeUndefined();
    expect(logs[0]).toMatchObject({ clamped: 1 });
  });

  it('rejects absurd and non finite timestamps', async () => {
    const { base } = await start();
    for (const updatedAt of [-1, 1e300, 'NaN']) {
      const response = await post(base, { since: 0, changes: { owned: [entry('a', updatedAt as number)] } });
      expect(response.status).toBe(400);
    }
  });
});

describe('hostile input', () => {
  it('answers 400, not 500, for deeply nested JSON', async () => {
    const { base } = await start({ maxBodyBytes: 5_000_000 });
    expect((await post(base, '['.repeat(200_000) + ']'.repeat(200_000))).status).toBe(400);

    let nested: unknown = 1;
    for (let i = 0; i < 5000; i++) nested = { n: nested };
    const record = entry('a', 1, { extra: nested });
    expect((await post(base, { since: 0, changes: { owned: [record] } })).status).toBe(400);
    expect((await fetch(`${base}/health`)).status).toBe(200);
  });

  it('validates record shapes per collection with the shared validators', async () => {
    const { base } = await start();
    const response = await post(base, { since: 0, changes: { owned: [entry('a', 1, { quantity: 1e9 })] } });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { message: string } }).error.message).toMatch(/quantity/);
  });
});

describe('restore', () => {
  it('issues a fresh serverId once when regeneration is requested, and keeps it on later starts', async () => {
    const first = await start();
    const { serverId: original } = await health(first.base);
    await stop(first);

    const restarted = await start({ regenerateServerId: true });
    const { serverId: fresh } = await health(restarted.base);
    expect(fresh).not.toBe(original);
    expect(restarted.events).toEqual([expect.objectContaining({ event: 'server_id_regenerated', serverId: fresh })]);
    expect(JSON.stringify(restarted.events)).not.toContain(TOKEN);
    await stop(restarted);

    const later = await start();
    expect((await health(later.base)).serverId).toBe(fresh);
    expect(later.events).toEqual([]);
  });
});

describe('data directory safety', () => {
  it('refuses a second instance on the same directory and frees the lock on close', async () => {
    const first = await start();
    await expect(createServer(baseConfig())).rejects.toBeInstanceOf(StoreLockedError);
    await stop(first);
    expect(await readdir(dataDir())).not.toContain(LOCK_FILE_NAME);
    await start();
  });

  it('takes over a lock left by a dead process and sweeps stale temp files', async () => {
    await writeFile(path.join(dataDir(), LOCK_FILE_NAME), '2147483646');
    await writeFile(path.join(dataDir(), `${STATE_FILE_NAME}.123.0.tmp`), 'partial');
    await start();
    expect((await readdir(dataDir())).sort()).toEqual([LOCK_FILE_NAME, STATE_FILE_NAME].sort());
  });

  it('leaves no temp file behind when a write fails', async () => {
    const store = new FileStateStore(dataDir());
    const state = await store.load();
    // A directory where the state file should go makes the rename fail.
    await mkdir(path.join(dataDir(), STATE_FILE_NAME));
    await expect(store.save(state)).rejects.toThrow();
    expect((await readdir(dataDir())).filter((n) => n.endsWith('.tmp'))).toEqual([]);
    await store.close();
  });
});
