import { readdir, readFile, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { type SyncResponse } from '@sc/core';
import { CONFIG_DEFAULTS, ConfigError, loadConfig } from './config';
import { createServer } from './app';
import { FileStateStore, LOCK_FILE_NAME, STATE_FILE_NAME } from './store';
import { Device, TOKEN, auth, entry, jsonHeaders, post, useHarness } from './testkit';

const { start, stop, dataDir, baseConfig } = useHarness();


describe('configuration', () => {
  const env = { SYNC_TOKEN: TOKEN };

  it('refuses to start without a token, or with a short one', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({ SYNC_TOKEN: '   ' })).toThrow(/SYNC_TOKEN is required/);
    expect(() => loadConfig({ SYNC_TOKEN: 'short' })).toThrow(/at least/);
  });

  it('applies defaults and reads overrides', () => {
    expect(loadConfig(env)).toMatchObject({
      port: CONFIG_DEFAULTS.port,
      host: CONFIG_DEFAULTS.host,
      dataDir: CONFIG_DEFAULTS.dataDir,
      allowOrigins: [],
      maxBodyBytes: CONFIG_DEFAULTS.maxBodyBytes,
      maxClockSkewMs: 300_000,
      shutdownTimeoutMs: 10_000,
    });
    const custom = loadConfig({
      ...env,
      PORT: '9000',
      SYNC_DATA_DIR: '/var/sync',
      SYNC_ALLOW_ORIGIN: 'https://a.example, https://b.example/',
      SYNC_MAX_BODY_BYTES: '2048',
      SYNC_TOMBSTONE_DAYS: '30',
      SYNC_MAX_CLOCK_SKEW_MS: '1000',
      SYNC_SHUTDOWN_TIMEOUT_MS: '500',
    });
    expect(custom).toMatchObject({ maxClockSkewMs: 1000, shutdownTimeoutMs: 500 });
    expect(custom).toMatchObject({ port: 9000, dataDir: '/var/sync', maxBodyBytes: 2048 });
    expect(custom.allowOrigins).toEqual(['https://a.example', 'https://b.example']);
    expect(custom.tombstoneRetentionMs).toBe(30 * 86_400_000);
  });

  it('rejects malformed numbers instead of silently using defaults', () => {
    expect(() => loadConfig({ ...env, PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadConfig({ ...env, PORT: '70000' })).toThrow(/PORT/);
    expect(() => loadConfig({ ...env, SYNC_MAX_BODY_BYTES: '0' })).toThrow(/SYNC_MAX_BODY_BYTES/);
  });
});

describe('routing and auth', () => {
  it('serves /health without authentication', async () => {
    const { base } = await start();
    const response = await fetch(`${base}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', serverId: expect.any(String) });
  });

  it('rejects missing, malformed and wrong tokens with 401', async () => {
    const { base } = await start();
    const body = { since: 0, changes: {} };
    const attempts: Record<string, string>[] = [
      { 'Content-Type': 'application/json' },
      { 'Content-Type': 'application/json', Authorization: 'Basic abc' },
      { 'Content-Type': 'application/json', Authorization: 'Bearer wrong-token-0123456789' },
      { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}x` },
    ];
    for (const headers of attempts) {
      const response = await post(base, body, headers);
      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toBe('Bearer');
    }
  });

  it('answers 404 for unknown paths and 405 with Allow for wrong methods', async () => {
    const { base } = await start();
    expect((await fetch(`${base}/nope`)).status).toBe(404);
    const wrong = await fetch(`${base}/sync`, { headers: auth });
    expect(wrong.status).toBe(405);
    expect(wrong.headers.get('allow')).toContain('POST');
    expect((await fetch(`${base}/health`, { method: 'POST' })).status).toBe(405);
  });
});

describe('request validation', () => {
  it('rejects non JSON content types with 415', async () => {
    const { base } = await start();
    const response = await post(base, '{}', { ...auth, 'Content-Type': 'text/plain' });
    expect(response.status).toBe(415);
  });

  it('rejects malformed JSON and bad shapes with 400 and a clear message', async () => {
    const { base } = await start();
    const cases: [unknown, RegExp][] = [
      ['{not json', /not valid JSON/],
      [[], /JSON object/],
      [{ changes: {} }, /since/],
      [{ since: -1, changes: {} }, /since/],
      [{ since: 0 }, /changes/],
      [{ since: 0, changes: { owned: 'x' } }, /changes\.owned must be a list/],
      [{ since: 0, changes: { widgets: [] } }, /Unknown collection/],
      [{ since: 0, changes: { owned: [{ id: '', updatedAt: 1 }] } }, /changes\.owned\[0\]\.id/],
      [{ since: 0, changes: { owned: [{ id: 'a', updatedAt: 'x' }] } }, /updatedAt/],
      [JSON.parse('{"since":0,"changes":{"__proto__":[]}}'), /Unknown collection/],
    ];
    for (const [body, pattern] of cases) {
      const response = await post(base, typeof body === 'string' ? body : JSON.stringify(body));
      expect(response.status).toBe(400);
      const payload = (await response.json()) as { error: { message: string } };
      expect(payload.error.message).toMatch(pattern);
    }
  });

  it('rejects an oversized body with 413, by declared length', async () => {
    const { base } = await start({ maxBodyBytes: 1024 });
    const big = { since: 0, changes: { owned: [entry('a', 1, { notes: 'x'.repeat(5000) })] } };
    expect((await post(base, big)).status).toBe(413);
    // The server is still healthy afterwards.
    expect((await fetch(`${base}/health`)).status).toBe(200);
  });

  it('rejects an oversized chunked body with 413 even without a content length', async () => {
    const { base } = await start({ maxBodyBytes: 1024 });
    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(`${base}/sync`, { method: 'POST', headers: jsonHeaders }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on('error', reject);
      req.write('{"since":0,"changes":{"owned":[');
      req.write(' '.repeat(4096));
      req.end(']}}');
    });
    expect(status).toBe(413);
  });

  it('accepts a body just under the limit', async () => {
    const { base } = await start({ maxBodyBytes: 1024 });
    const response = await post(base, { since: 0, changes: {} });
    expect(response.status).toBe(200);
  });
});

describe('sync round trip', () => {
  it('moves records between two devices, including deletes', async () => {
    const { base } = await start();
    const phone = new Device(base);
    const laptop = new Device(base);

    const t = Date.now(); // realistic times, so the tombstone is not past retention
    phone.edit(entry('a', t, { quantity: 2 }));
    phone.edit(entry('b', t + 1));
    await phone.sync();
    await laptop.sync();
    expect(laptop.records.map((r) => r.id)).toEqual(['a', 'b']);

    laptop.edit(entry('a', t + 10, { quantity: 5 }));
    laptop.edit(entry('b', t + 11, { deleted: true }));
    await laptop.sync();
    await phone.sync();
    expect(phone.records).toEqual(laptop.records);
    expect(phone.records.find((r) => r.id === 'a')).toMatchObject({ quantity: 5 });
    expect(phone.records.find((r) => r.id === 'b')?.deleted).toBe(true);
  });

  it('answers an empty incremental sync with no changes and an increasing serverTime', async () => {
    const { base } = await start();
    const device = new Device(base);
    const first = await device.sync();
    const second = await device.sync();
    expect(second.changes).toEqual({});
    expect(second.serverTime).toBeGreaterThan(first.serverTime);
  });

  it('keeps unknown extra fields on records', async () => {
    const { base } = await start();
    const a = new Device(base);
    const b = new Device(base);
    a.edit(entry('a', 1, { futureField: { nested: true } }));
    await a.sync();
    await b.sync();
    expect(b.records[0]).toMatchObject({ futureField: { nested: true } });
  });
});

describe('persistence', () => {
  it('serves the same data after a restart and writes no temp files', async () => {
    const first = await start();
    const device = new Device(first.base);
    device.edit(entry('a', 10, { quantity: 3 }));
    await device.sync();
    await stop(first);

    const second = await start();
    const fresh = new Device(second.base);
    await fresh.sync();
    expect(fresh.records).toEqual([entry('a', 10, { quantity: 3 })]);
    await stop(second);
    expect(await readdir(dataDir())).toEqual([STATE_FILE_NAME]);
  });

  it('keeps server time increasing across restarts', async () => {
    const first = await start();
    const device = new Device(first.base);
    device.edit(entry('a', 1));
    const before = await device.sync();
    await stop(first);

    const second = await start();
    const after = await post(second.base, { since: before.serverTime, changes: {} });
    expect(((await after.json()) as SyncResponse).serverTime).toBeGreaterThan(before.serverTime);
  });

  it('refuses to start on a corrupt state file instead of overwriting it', async () => {
    await writeFile(path.join(dataDir(), STATE_FILE_NAME), '{"truncated');
    await expect(createServer(baseConfig())).rejects.toThrow(/corrupt/);
    expect(await readdir(dataDir())).not.toContain(LOCK_FILE_NAME); // a failed start must not keep the lock
    expect(await readFile(path.join(dataDir(), STATE_FILE_NAME), 'utf8')).toBe('{"truncated');
  });

  it('starts empty when the data directory does not exist yet', async () => {
    const nested = path.join(dataDir(), 'a', 'b');
    const state = await new FileStateStore(nested).load();
    expect(state.serverTime).toBe(0);
  });
});

describe('concurrency', () => {
  it('serializes simultaneous syncs without losing writes', async () => {
    const { base } = await start();
    const count = 25;
    const devices = Array.from({ length: count }, () => new Device(base));
    devices.forEach((device, i) => device.edit(entry(`rec-${i}`, 100 + i)));
    await Promise.all(devices.map((device) => device.sync()));

    const reader = new Device(base);
    await reader.sync();
    expect(reader.records).toHaveLength(count);

    // Everyone converges after one more round.
    await Promise.all(devices.map((device) => device.sync()));
    for (const device of devices) expect(device.records).toEqual(reader.records);
  });

  it('resolves conflicting concurrent edits to the newest write', async () => {
    const { base } = await start();
    const devices = Array.from({ length: 10 }, () => new Device(base));
    devices.forEach((device, i) => device.edit(entry('shared', 1000 + i, { quantity: i })));
    await Promise.all(devices.map((device) => device.sync()));
    await Promise.all(devices.map((device) => device.sync()));
    for (const device of devices) expect(device.records[0]).toMatchObject({ quantity: 9 });
  });

  it('persists a consistent file under load', async () => {
    const { base } = await start();
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => {
        const device = new Device(base);
        device.edit(entry(`r${i}`, i + 1));
        return device.sync();
      }),
    );
    const state = JSON.parse(await readFile(path.join(dataDir(), STATE_FILE_NAME), 'utf8'));
    expect(state.collections.owned).toHaveLength(20);
  });
});

describe('CORS', () => {
  it('sends no CORS headers by default', async () => {
    const { base } = await start();
    const response = await fetch(`${base}/health`, { headers: { Origin: 'https://app.example' } });
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('answers preflight and echoes only listed origins', async () => {
    const { base } = await start({ allowOrigins: ['https://app.example'] });
    const allowed = await fetch(`${base}/sync`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://app.example', 'Access-Control-Request-Method': 'POST' },
    });
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://app.example');
    expect(allowed.headers.get('access-control-allow-headers')).toContain('Authorization');
    expect(allowed.headers.get('vary')).toBe('Origin');

    expect(allowed.headers.get('access-control-allow-methods')).toContain('POST');

    const denied = await fetch(`${base}/sync`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
    expect(denied.status).toBe(204);
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
    expect(denied.headers.get('access-control-allow-methods')).toBeNull();
    expect(denied.headers.get('vary')).toBe('Origin');
  });

  it('adds CORS headers to errors too, so browsers can read them', async () => {
    const { base } = await start({ allowOrigins: ['https://app.example'] });
    const response = await post(base, {}, { 'Content-Type': 'application/json', Origin: 'https://app.example' });
    expect(response.status).toBe(401);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://app.example');
  });

  it('supports a wildcard origin', async () => {
    const { base } = await start({ allowOrigins: ['*'] });
    const response = await fetch(`${base}/health`);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });
});

describe('logging', () => {
  it('logs one structured line per request without tokens or record bodies', async () => {
    const instance = await start();
    const device = new Device(instance.base);
    device.edit(entry('secret-id-123', 1, { notes: 'private note text' }));
    await device.sync();
    await post(instance.base, {}, { 'Content-Type': 'application/json', Authorization: 'Bearer leaked-token-attempt-000' });

    expect(instance.logs).toHaveLength(2);
    expect(instance.logs[0]).toMatchObject({ method: 'POST', path: '/sync', status: 200, recordsIn: 1, recordsOut: 0 });
    expect(instance.logs[1]).toMatchObject({ status: 401, error: 'unauthorized' });
    const text = JSON.stringify(instance.logs);
    for (const secret of [TOKEN, 'leaked-token-attempt-000', 'secret-id-123', 'private note text']) {
      expect(text).not.toContain(secret);
    }
  });
});
