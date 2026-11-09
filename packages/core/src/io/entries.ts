import type { OwnedEntry } from '../types';

/** Identity of a collection row: the same printing, finish and condition is one row. */
export function ownedEntryKey(entry: Pick<OwnedEntry, 'printingKey' | 'finish' | 'condition'>): string {
  return `${entry.printingKey}|${entry.finish}|${entry.condition}`;
}

/** New record id. Uses the platform UUID generator available in browsers and Node. */
export function newRecordId(): string {
  return globalThis.crypto.randomUUID();
}
