import { SYNC_COLLECTIONS, type ServerState } from '@sc/core';

export interface StateLimits {
  maxRecordsPerCollection: number;
  maxStateBytes: number;
}

/** Thrown before a request is committed, so a rejected request never changes stored state. */
export class StateLimitError extends Error {}

/** Size of the state as the JSON file would store it. */
export function serializedBytes(state: ServerState): number {
  return Buffer.byteLength(JSON.stringify(state), 'utf8');
}

/** Only growth past a cap is refused, so updates and deletes still work once a cap is reached. */
const growsPast = (next: number, previous: number, cap: number): boolean => next > cap && next > previous;

function assertRecordCaps(before: ServerState, after: ServerState, cap: number): void {
  for (const name of SYNC_COLLECTIONS) {
    const next = after.collections[name].length;
    if (growsPast(next, before.collections[name].length, cap)) {
      throw new StateLimitError(`${name} would hold ${next} records, the limit is ${cap}`);
    }
  }
}

/** Checks a candidate state against both caps. Returns its serialized size for the caller to track. */
export function assertWithinLimits(
  before: ServerState,
  after: ServerState,
  limits: StateLimits,
  beforeBytes: number,
): number {
  assertRecordCaps(before, after, limits.maxRecordsPerCollection);
  const afterBytes = serializedBytes(after);
  if (growsPast(afterBytes, beforeBytes, limits.maxStateBytes)) {
    throw new StateLimitError(`State would be ${afterBytes} bytes, the limit is ${limits.maxStateBytes}`);
  }
  return afterBytes;
}
