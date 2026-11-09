import type { SyncRecord } from '../types';
import { SYNC_CONFIG } from './config';

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** True when nesting goes deeper than `limit`. Iterative, so hostile input cannot overflow the stack. */
export function exceedsDepth(value: unknown, limit: number): boolean {
  const stack: [unknown, number][] = [[value, 0]];
  while (stack.length > 0) {
    const [current, depth] = stack.pop()!;
    if (typeof current !== 'object' || current === null) continue;
    if (depth >= limit) return true;
    for (const child of Object.values(current)) stack.push([child, depth + 1]);
  }
  return false;
}

/** Check the fields every syncing record must carry. Returns an error message or null. */
export function validateSyncRecord(value: unknown, path: string): string | null {
  if (!isPlainObject(value)) return `${path} must be an object`;
  const { id, updatedAt, deleted } = value;
  if (typeof id !== 'string' || id.length === 0 || id.length > SYNC_CONFIG.maxRecordIdLength) {
    return `${path}.id must be a non-empty string of at most ${SYNC_CONFIG.maxRecordIdLength} characters`;
  }
  if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt) || updatedAt < 0 || updatedAt > SYNC_CONFIG.maxUpdatedAt) {
    return `${path}.updatedAt must be a number between 0 and ${SYNC_CONFIG.maxUpdatedAt}`;
  }
  if (deleted !== undefined && typeof deleted !== 'boolean') return `${path}.deleted must be a boolean`;
  if (exceedsDepth(value, SYNC_CONFIG.maxRecordDepth)) return `${path} is nested too deeply`;
  return null;
}
