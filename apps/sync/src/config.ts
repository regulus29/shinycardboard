import { MS_PER_DAY, SYNC_CONFIG } from '@sc/core';

export interface ServerConfig {
  port: number;
  host: string;
  /** Shared secret clients send as a bearer token. Never logged. */
  token: string;
  /** Allowed CORS origins, or '*' for any. Empty means CORS is off. */
  allowOrigins: readonly string[];
  dataDir: string;
  maxBodyBytes: number;
  tombstoneRetentionMs: number;
  requestTimeoutMs: number;
  /** Records stamped further ahead of server time than this are clamped to server time. */
  maxClockSkewMs: number;
  /** Hard limit on graceful shutdown before the process exits anyway. */
  shutdownTimeoutMs: number;
}

export class ConfigError extends Error {}

export const CONFIG_DEFAULTS = {
  port: 8787,
  host: '127.0.0.1',
  dataDir: './data/sync',
  maxBodyBytes: 5 * 1024 * 1024,
  tombstoneRetentionDays: SYNC_CONFIG.defaultTombstoneRetentionMs / MS_PER_DAY,
  requestTimeoutMs: 30_000,
  maxClockSkewMs: SYNC_CONFIG.defaultMaxClockSkewMs,
  shutdownTimeoutMs: 10_000,
  /** Short tokens are guessable, so the server refuses them. */
  minTokenLength: 16,
  maxPort: 65_535,
} as const;

type Env = Record<string, string | undefined>;

function integerFrom(env: Env, name: string, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ConfigError(`${name} must be a whole number between ${min} and ${max}`);
  }
  return value;
}

function tokenFrom(env: Env): string {
  const token = env.SYNC_TOKEN?.trim();
  if (!token) throw new ConfigError('SYNC_TOKEN is required. Refusing to start without authentication');
  if (token.length < CONFIG_DEFAULTS.minTokenLength) {
    throw new ConfigError(`SYNC_TOKEN must be at least ${CONFIG_DEFAULTS.minTokenLength} characters`);
  }
  return token;
}

function originsFrom(env: Env): string[] {
  return (env.SYNC_ALLOW_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter((origin) => origin !== '');
}

/** Read configuration from environment variables. Throws ConfigError on anything unusable. */
export function loadConfig(env: Env = process.env): ServerConfig {
  const retentionDays = integerFrom(env, 'SYNC_TOMBSTONE_DAYS', CONFIG_DEFAULTS.tombstoneRetentionDays, 1);
  return {
    // PORT 0 asks the OS for a free port, which tests rely on.
    port: integerFrom(env, 'PORT', CONFIG_DEFAULTS.port, 0, CONFIG_DEFAULTS.maxPort),
    host: env.HOST?.trim() || CONFIG_DEFAULTS.host,
    token: tokenFrom(env),
    allowOrigins: originsFrom(env),
    dataDir: env.SYNC_DATA_DIR?.trim() || CONFIG_DEFAULTS.dataDir,
    maxBodyBytes: integerFrom(env, 'SYNC_MAX_BODY_BYTES', CONFIG_DEFAULTS.maxBodyBytes, 1),
    tombstoneRetentionMs: retentionDays * MS_PER_DAY,
    requestTimeoutMs: integerFrom(env, 'SYNC_REQUEST_TIMEOUT_MS', CONFIG_DEFAULTS.requestTimeoutMs, 1),
    maxClockSkewMs: integerFrom(env, 'SYNC_MAX_CLOCK_SKEW_MS', CONFIG_DEFAULTS.maxClockSkewMs, 0),
    shutdownTimeoutMs: integerFrom(env, 'SYNC_SHUTDOWN_TIMEOUT_MS', CONFIG_DEFAULTS.shutdownTimeoutMs, 1),
  };
}
