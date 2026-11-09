import type { SyncCollection } from '@sc/core';
import { SYNC } from '../config/constants';
import type { ShinyCardboardDB } from './db';

/**
 * Queue records for the next sync push regardless of their updatedAt. Used by data migrations,
 * which stamp rows with old timestamps on purpose so they can never beat a genuine newer edit,
 * but must still reach the server. Call inside the caller's transaction (syncMeta must be in scope).
 */
export async function queueForPush(database: ShinyCardboardDB, collection: SyncCollection, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const existing = ((await database.syncMeta.get(SYNC.metaKeys.outbox))?.value as string[] | undefined) ?? [];
  const next = new Set([...existing, ...ids.map((id) => `${collection}:${id}`)]);
  await database.syncMeta.put({ key: SYNC.metaKeys.outbox, value: [...next] });
}
