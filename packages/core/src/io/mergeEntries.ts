import type { OwnedEntry } from '../types';
import { nextUpdatedAt } from '../sync/clock';
import { ownedEntryKey } from './entries';

type EntryIndex = Map<string, OwnedEntry>;

/** Index by key, preferring live rows over tombstones so a returning row revives the live id. */
function indexByKey(entries: OwnedEntry[]): EntryIndex {
  const index: EntryIndex = new Map();
  for (const entry of entries) {
    const key = ownedEntryKey(entry);
    const current = index.get(key);
    if (!current || (current.deleted && !entry.deleted)) index.set(key, entry);
  }
  return index;
}

/** Combine rows that share a key, summing quantity. */
function collapseDuplicates(entries: OwnedEntry[]): OwnedEntry[] {
  const merged: EntryIndex = new Map();
  for (const entry of entries) {
    if (entry.quantity <= 0) continue;
    const key = ownedEntryKey(entry);
    const current = merged.get(key);
    merged.set(key, current ? { ...current, quantity: current.quantity + entry.quantity } : entry);
  }
  return [...merged.values()];
}

/** A live copy of `entry` stamped to win over the version it replaces. */
function revise(previous: OwnedEntry, now: number): OwnedEntry {
  const { deleted: _deleted, ...live } = previous;
  return { ...live, updatedAt: nextUpdatedAt(now, previous.updatedAt) };
}

/** Result of applying one imported row onto the row that has the same key, if any. */
function combine(existing: OwnedEntry | undefined, imported: OwnedEntry, addQuantity: boolean, now: number): OwnedEntry {
  if (!existing) return { ...imported, updatedAt: now };
  const live = existing.deleted !== true;
  const quantity = addQuantity && live ? existing.quantity + imported.quantity : imported.quantity;
  const notes = imported.notes ?? (addQuantity && live ? existing.notes : undefined);
  const row: OwnedEntry = { ...revise(existing, now), quantity };
  if (notes !== undefined) row.notes = notes;
  else delete row.notes;
  return row;
}

/**
 * Merge imported rows into existing entries by (printingKey, finish, condition).
 * add: quantities are summed. replace: the imported rows become the whole collection and
 * any live row not in the import is tombstoned so the removal syncs.
 * Matching rows keep their existing id. Tombstones are retained.
 */
export function mergeImportedEntries(
  existing: OwnedEntry[],
  imported: OwnedEntry[],
  mode: 'add' | 'replace',
  now: number,
): OwnedEntry[] {
  const index = indexByKey(existing);
  const incoming = collapseDuplicates(imported);
  const results = new Map<string, OwnedEntry>();

  for (const row of incoming) {
    const key = ownedEntryKey(row);
    const current = index.get(key);
    results.set(key, combine(current, row, mode === 'add', now));
  }

  const resultIds = new Set([...results.values()].map((entry) => entry.id));
  const untouched = existing.filter((entry) => !resultIds.has(entry.id));
  const kept = untouched.map((entry) =>
    mode === 'replace' && entry.deleted !== true ? { ...entry, deleted: true, updatedAt: nextUpdatedAt(now, entry.updatedAt) } : entry,
  );
  return [...kept, ...results.values()];
}
