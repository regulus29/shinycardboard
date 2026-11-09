import type { SyncRecord } from '../types';
import { compareRecords, mergeRecords } from './merge';

/**
 * Client side merge of records pulled from the server.
 *
 * `toPush` lists local records that beat the pulled version of the same id. The server does not
 * have them (for example a delete whose tombstone the server already pruned), so the client must
 * send them on its next sync or the two sides would disagree for good.
 */
export function mergePulledRecords<T extends SyncRecord>(
  local: T[],
  pulled: T[],
): { merged: T[]; toPush: T[] } {
  const localById = new Map(local.map((record) => [record.id, record]));
  const toPush: T[] = [];
  for (const remote of pulled) {
    const mine = localById.get(remote.id);
    if (mine !== undefined && compareRecords(mine, remote) > 0) toPush.push(mine);
  }
  return { merged: mergeRecords(local, pulled), toPush };
}
