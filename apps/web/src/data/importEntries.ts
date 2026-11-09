import { mergeImportedEntries, ownedEntryKey, type OwnedEntry } from '@sc/core';
import { db } from './db';
import { clock } from './clock';
import { ownedId } from './ids';
import { mutate } from './repo';
import { MAX_OWNED_QUANTITY } from '../config/constants';

export type ImportMode = 'add' | 'replace';

/** What an import changed, for toasts and tests. */
export interface ImportOutcome {
  /** Rows that did not exist as live copies before. */
  added: number;
  /** Live rows whose quantity or notes changed. */
  updated: number;
  /** Live rows tombstoned by a replace. */
  removed: number;
}

const isLiveRow = (entry: OwnedEntry) => entry.deleted !== true;

/** Imported rows carry random ids; owned rows use the deterministic id so devices converge. */
function withDeterministicId(entry: OwnedEntry): OwnedEntry {
  return { ...entry, id: ownedId(entry.printingKey, entry.finish, entry.condition) };
}

function clampQuantity(entry: OwnedEntry): OwnedEntry {
  return isLiveRow(entry) && entry.quantity > MAX_OWNED_QUANTITY ? { ...entry, quantity: MAX_OWNED_QUANTITY } : entry;
}

/** Count live rows the replace would tombstone, without writing anything (for the confirm step). */
export function countReplaceRemovals(existing: OwnedEntry[], imported: OwnedEntry[]): number {
  const incoming = new Set(imported.map((entry) => ownedEntryKey(entry)));
  return existing.filter((entry) => isLiveRow(entry) && !incoming.has(ownedEntryKey(entry))).length;
}

function summarize(before: OwnedEntry[], after: OwnedEntry[]): ImportOutcome {
  const liveBefore = new Map(before.filter(isLiveRow).map((entry) => [ownedEntryKey(entry), entry]));
  const outcome: ImportOutcome = { added: 0, updated: 0, removed: 0 };
  for (const row of after) {
    const key = ownedEntryKey(row);
    const prior = liveBefore.get(key);
    if (!isLiveRow(row)) {
      if (prior) outcome.removed += 1;
    } else if (!prior) {
      outcome.added += 1;
    } else if (prior.quantity !== row.quantity || prior.notes !== row.notes) {
      outcome.updated += 1;
    }
  }
  return outcome;
}

/**
 * Apply parsed import rows in one transaction. Uses core mergeImportedEntries so quantities,
 * revived tombstones and replace-mode deletions follow the shared rules; only rows that changed
 * are written, each already stamped with nextUpdatedAt. mutate() announces the change for sync.
 */
export function applyImport(imported: OwnedEntry[], mode: ImportMode, now: number = clock.now()): Promise<ImportOutcome> {
  return mutate([db.owned], async () => {
    const existing = await db.owned.toArray();
    const merged = mergeImportedEntries(existing, imported.map(withDeterministicId), mode, now).map(clampQuantity);
    const before = new Map(existing.map((entry) => [entry.id, entry]));
    const changed = merged.filter((row) => {
      const prior = before.get(row.id);
      return !prior || prior.updatedAt !== row.updatedAt || prior.deleted !== row.deleted || prior.quantity !== row.quantity;
    });
    if (changed.length) await db.owned.bulkPut(changed);
    return summarize(existing, merged);
  });
}
