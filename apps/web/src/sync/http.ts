import type { SyncRequest, SyncResponse } from '@sc/core';
import { SYNC } from '../config/constants';
import type { SyncConfig } from './config';

export type SyncErrorKind = 'network' | 'auth' | 'server' | 'protocol';

/** Failure with a user-safe message. Messages never contain the token or server body. */
export class SyncError extends Error {
  constructor(
    readonly kind: SyncErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'SyncError';
  }
}

function isSyncResponse(value: unknown): value is SyncResponse {
  const candidate = value as Partial<SyncResponse> | null;
  return Boolean(candidate && typeof candidate.serverTime === 'number' && candidate.changes && typeof candidate.changes === 'object');
}

function statusError(status: number): SyncError {
  if (status === 401 || status === 403) return new SyncError('auth', 'The server rejected the access token');
  if (status === 404) return new SyncError('server', 'Sync endpoint not found; check the server URL');
  return new SyncError('server', `The sync server returned an error (${status})`);
}

/** POST one sync exchange. Throws SyncError for every failure mode. */
export async function postSync(
  config: SyncConfig,
  request: SyncRequest,
  fetchFn: typeof fetch = fetch,
  timeoutMs: number = SYNC.requestTimeoutMs,
): Promise<SyncResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(`${config.url}${SYNC.path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    if (!response.ok) throw statusError(response.status);
    const body: unknown = await response.json().catch(() => null);
    if (!isSyncResponse(body)) throw new SyncError('protocol', 'The server sent an unexpected response');
    return body;
  } catch (error) {
    if (error instanceof SyncError) throw error;
    throw new SyncError('network', controller.signal.aborted ? 'The server took too long to respond' : 'Could not reach the server');
  } finally {
    clearTimeout(timer);
  }
}

export type ConnectionResult = { ok: true } | { ok: false; error: string };

/** Verify URL and token with an empty exchange whose cursor is past any data, so nothing transfers. */
export async function testConnection(config: SyncConfig, fetchFn: typeof fetch = fetch): Promise<ConnectionResult> {
  try {
    await postSync(config, { since: Number.MAX_SAFE_INTEGER, changes: {} }, fetchFn);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Connection failed' };
  }
}
