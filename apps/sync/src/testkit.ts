import { mkdtemp, rm } from 'node:fs/promises';
import type { Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect } from 'vitest';
import { MS_PER_DAY, mergeRecords, type SyncRecord, type SyncRequest, type SyncResponse } from '@sc/core';
import { closeServer, createServer, listen } from './app';
import { CONFIG_DEFAULTS, type ServerConfig } from './config';
import type { RequestLog, ServerEvent } from './logger';

/** Test support: starts real servers on ephemeral ports with a temporary data directory. */

export const TOKEN = 'test-token-0123456789abcdef';

export interface Running {
  server: Server;
  base: string;
  logs: RequestLog[];
  events: ServerEvent[];
}

export interface Harness {
  dataDir(): string;
  baseConfig(overrides?: Partial<ServerConfig>): ServerConfig;
  start(overrides?: Partial<ServerConfig>, clock?: () => number): Promise<Running>;
  stop(instance: Running): Promise<void>;
}

/** Registers per test setup and teardown, and returns helpers bound to the current test. */
export function useHarness(): Harness {
  let dir = '';
  let running: Running[] = [];

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'sc-sync-'));
    running = [];
  });
  afterEach(async () => {
    await Promise.all(running.map((r) => closeServer(r.server)));
    await rm(dir, { recursive: true, force: true });
  });

  const baseConfig = (overrides: Partial<ServerConfig> = {}): ServerConfig => ({
    port: 0,
    host: '127.0.0.1',
    token: TOKEN,
    allowOrigins: [],
    dataDir: dir,
    maxBodyBytes: 64 * 1024,
    tombstoneRetentionMs: CONFIG_DEFAULTS.tombstoneRetentionDays * MS_PER_DAY,
    requestTimeoutMs: 10_000,
    maxClockSkewMs: CONFIG_DEFAULTS.maxClockSkewMs,
    shutdownTimeoutMs: 1000,
    maxRecordsPerCollection: CONFIG_DEFAULTS.maxRecordsPerCollection,
    maxStateBytes: CONFIG_DEFAULTS.maxStateBytes,
    regenerateServerId: CONFIG_DEFAULTS.regenerateServerId,
    lockGraceMs: CONFIG_DEFAULTS.lockGraceMs,
    ...overrides,
  });

  return {
    dataDir: () => dir,
    baseConfig,
    async start(overrides = {}, clock) {
      const config = baseConfig(overrides);
      const logs: RequestLog[] = [];
      const events: ServerEvent[] = [];
      const server = await createServer(config, {
        logger: (entry) => logs.push(entry),
        events: (event) => events.push(event),
        clock,
      });
      const port = await listen(server, 0, config.host);
      const instance = { server, base: `http://127.0.0.1:${port}`, logs, events };
      running.push(instance);
      return instance;
    },
    async stop(instance) {
      await closeServer(instance.server);
      running = running.filter((r) => r !== instance);
    },
  };
}

export const auth = { Authorization: `Bearer ${TOKEN}` };
export const jsonHeaders = { ...auth, 'Content-Type': 'application/json' };

export const post = (base: string, body: unknown, headers: Record<string, string> = jsonHeaders) =>
  fetch(`${base}/sync`, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

export const entry = (id: string, updatedAt: number, extra: Record<string, unknown> = {}): SyncRecord =>
  ({ id, updatedAt, printingKey: 'ogn-042-standard', finish: 'normal', condition: 'NM', quantity: 1, ...extra }) as SyncRecord;

/** Minimal client that follows the protocol the web app will use. */
export class Device {
  since = 0;
  serverId: string | undefined;
  records: SyncRecord[] = [];
  private dirty: SyncRecord[] = [];

  constructor(private readonly base: string) {}

  edit(record: SyncRecord): void {
    this.records = mergeRecords(this.records, [record]);
    this.dirty.push(record);
  }

  async sync(): Promise<SyncResponse> {
    const body: SyncRequest = { since: this.since, changes: { owned: this.dirty } };
    const response = await post(this.base, body);
    expect(response.status).toBe(200);
    const result = (await response.json()) as SyncResponse;
    this.records = mergeRecords(this.records, result.changes.owned ?? []);
    this.since = result.resync ? 0 : result.serverTime;
    this.serverId = result.serverId;
    this.dirty = [];
    return result;
  }
}
