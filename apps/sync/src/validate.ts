import { SYNC_COLLECTIONS, validateCollectionRecord, type SyncRequest } from '@sc/core';

type Result = { ok: true; value: SyncRequest } | { ok: false; error: string };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const fail = (error: string): Result => ({ ok: false, error });

/** Validate an untrusted request body, using the same per-collection record validators as backup import. */
export function validateSyncRequest(body: unknown): Result {
  if (!isObject(body)) return fail('Body must be a JSON object');
  const { since, changes } = body;
  if (typeof since !== 'number' || !Number.isFinite(since) || since < 0) {
    return fail('since must be a non-negative number');
  }
  if (!isObject(changes)) return fail('changes must be an object');

  const known: readonly string[] = SYNC_COLLECTIONS;
  const unknownName = Object.keys(changes).find((name) => !known.includes(name));
  if (unknownName !== undefined) return fail(`Unknown collection "${unknownName.slice(0, 40)}"`);

  for (const name of SYNC_COLLECTIONS) {
    const records = changes[name];
    if (records === undefined) continue;
    if (!Array.isArray(records)) return fail(`changes.${name} must be a list`);
    for (let i = 0; i < records.length; i++) {
      const problem = validateCollectionRecord(name, records[i], `changes.${name}[${i}]`);
      if (problem) return fail(problem);
    }
  }
  return { ok: true, value: body as unknown as SyncRequest };
}
