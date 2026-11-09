import { createServer as createHttpServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ServerConfig } from './config';
import { createHandler } from './handler';
import { jsonEventLogger, jsonLineLogger, type EventLogger, type Logger } from './logger';
import { SyncService } from './service';
import { FileStateStore, type StateStore } from './store';

export interface AppOptions {
  /** Defaults to a file store in `config.dataDir`. */
  store?: StateStore;
  logger?: Logger;
  /** Receives lifecycle events. Defaults to JSON lines on stdout. */
  events?: EventLogger;
  clock?: () => number;
}

/** Cleanup to run after each server stops, such as releasing the data directory lock. */
const cleanups = new WeakMap<Server, () => Promise<void>>();

/**
 * Load persisted state and build an HTTP server. Does not bind a port; call `listen` yourself.
 * Takes a lock on the data directory, released by `closeServer`.
 */
export async function createServer(config: ServerConfig, options: AppOptions = {}): Promise<Server> {
  const store = options.store ?? new FileStateStore(config.dataDir, { lockGraceMs: config.lockGraceMs });
  let service: SyncService;
  try {
    service = await SyncService.open({
      store,
      tombstoneRetentionMs: config.tombstoneRetentionMs,
      maxClockSkewMs: config.maxClockSkewMs,
      limits: { maxRecordsPerCollection: config.maxRecordsPerCollection, maxStateBytes: config.maxStateBytes },
      regenerateServerId: config.regenerateServerId,
      clock: options.clock,
    });
  } catch (error) {
    await store.close?.();
    throw error;
  }
  if (config.regenerateServerId) {
    (options.events ?? jsonEventLogger)({ time: new Date().toISOString(), event: 'server_id_regenerated', serverId: service.serverId });
  }
  const handler = createHandler({ config, service, logger: options.logger ?? jsonLineLogger });
  const server = createHttpServer(handler);
  server.requestTimeout = config.requestTimeoutMs;
  cleanups.set(server, async () => {
    await service.idle();
    await store.close?.();
  });
  return server;
}

/** Bind and resolve with the actual port (useful with port 0). */
export function listen(server: Server, port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve((server.address() as AddressInfo).port);
    });
  });
}

function stopListening(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server.listening) return resolve();
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeIdleConnections();
  });
}

/** Stop accepting connections, drop idle ones, wait for in-flight requests, then release the lock. */
export async function closeServer(server: Server): Promise<void> {
  try {
    await stopListening(server);
  } finally {
    await cleanups.get(server)?.();
    cleanups.delete(server);
  }
}

/** Like `closeServer`, but cuts remaining connections after `timeoutMs` so shutdown always finishes. */
export async function closeServerWithin(server: Server, timeoutMs: number): Promise<void> {
  const timer = setTimeout(() => server.closeAllConnections(), timeoutMs);
  try {
    await closeServer(server);
  } finally {
    clearTimeout(timer);
  }
}
