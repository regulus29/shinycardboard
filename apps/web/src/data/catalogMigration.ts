import { nextUpdatedAt, type Catalog, type Deck, type OwnedEntry } from '@sc/core';
import { MAX_OWNED_QUANTITY } from '../config/constants';
import { clock } from './clock';
import { db, type ShinyCardboardDB } from './db';
import { emitLocalChange, reportStorageFailure } from './changeBus';
import { ownedId } from './ids';
import { queueForPush } from './outbox';

export interface MigrationResult {
  /** Owned rows moved to a current key. */
  migratedOwned: number;
  /** Target rows that combined several old rows or already existed. */
  mergedOwned: number;
  /** Decks whose pinned printings were re-pointed. */
  migratedDecks: number;
  /** Printing keys held in the collection or decks that are neither current nor aliased. Kept, never deleted. */
  orphanedKeys: string[];
}

export const EMPTY_MIGRATION: MigrationResult = { migratedOwned: 0, mergedOwned: 0, migratedDecks: 0, orphanedKeys: [] };

/** Map a retired printing key to its current key; current keys map to themselves; unknown keys to undefined. */
export function resolvePrintingKey(catalog: Catalog, key: string): string | undefined {
  if (catalog.printings[key]) return key;
  const alias = catalog.keyAliases?.[key];
  return alias && catalog.printings[alias] ? alias : undefined;
}

function joinNotes(rows: OwnedEntry[]): string | undefined {
  const notes = [...new Set(rows.map((row) => row.notes).filter((note): note is string => Boolean(note)))].sort();
  return notes.length ? notes.join('\n') : undefined;
}

/**
 * Retired owned rows that map onto one current row. The result is a pure function of the old
 * rows (sum, newest stamp, sorted notes), so two devices migrating the same data produce
 * byte-identical rows and converge without any coordination.
 */
function collapse(olds: OwnedEntry[], newKey: string): OwnedEntry {
  const first = olds[0]!;
  const notes = joinNotes(olds);
  return {
    id: ownedId(newKey, first.finish, first.condition),
    printingKey: newKey,
    finish: first.finish,
    condition: first.condition,
    quantity: Math.min(MAX_OWNED_QUANTITY, olds.reduce((sum, row) => sum + row.quantity, 0)),
    // The OLD rows' newest stamp, not now: a stale migration must never beat a genuine newer edit.
    updatedAt: Math.max(...olds.map((row) => row.updatedAt)),
    ...(notes !== undefined ? { notes } : {}),
  };
}

function repinDeck(deck: Deck, catalog: Catalog): Deck | null {
  let changed = false;
  const fix = (slots: Deck['main']) =>
    slots.map((slot) => {
      const current = slot.printingKey ? resolvePrintingKey(catalog, slot.printingKey) : undefined;
      if (!slot.printingKey || !current || current === slot.printingKey) return slot;
      changed = true;
      return { ...slot, printingKey: current };
    });
  const next = { ...deck, main: fix(deck.main), runes: fix(deck.runes), battlefields: fix(deck.battlefields), sideboard: fix(deck.sideboard) };
  // Minimal bump: beats the identical pre-migration version, loses to any genuine newer edit.
  return changed ? { ...next, updatedAt: deck.updatedAt + 1 } : null;
}

/**
 * Transactional core of the migration, parameterised on the database so two devices can be
 * simulated in tests.
 *
 * Reconciliation rules (they make a stale or concurrent migration harmless):
 * - The new row is stamped with the old rows' newest updatedAt. If a row already exists on the
 *   new key (usually because another device migrated first and synced), it is only replaced when
 *   the old data is strictly newer, which means it was edited after that migration. Equal or
 *   older old data is already accounted for in the existing row, so quantities are never summed
 *   with a pre-existing target (no doubling) and never rolled back (no loss).
 * - A target that was deleted after migrating stays deleted unless the old data is newer.
 * - Old rows are tombstoned with a normal fresh stamp so the move propagates.
 * - Rewritten rows are queued in the sync outbox because their stamps are intentionally old.
 */
export function runMigration(database: ShinyCardboardDB, catalog: Catalog, now: number): Promise<MigrationResult> {
  return database.transaction('rw', [database.owned, database.decks, database.syncMeta], async () => {
    const result: MigrationResult = { migratedOwned: 0, mergedOwned: 0, migratedDecks: 0, orphanedKeys: [] };
    const orphans = new Set<string>();
    const groups = new Map<string, { newKey: string; olds: OwnedEntry[] }>();

    for (const row of (await database.owned.toArray()).sort((a, b) => a.id.localeCompare(b.id))) {
      if (row.deleted || catalog.printings[row.printingKey]) continue;
      const current = resolvePrintingKey(catalog, row.printingKey);
      if (!current) {
        orphans.add(row.printingKey);
        continue;
      }
      const id = ownedId(current, row.finish, row.condition);
      const group = groups.get(id) ?? { newKey: current, olds: [] };
      group.olds.push(row);
      groups.set(id, group);
    }

    const pushIds: string[] = [];
    for (const [id, { newKey, olds }] of groups) {
      const merged = collapse(olds, newKey);
      const target = await database.owned.get(id);
      if (!target || merged.updatedAt > target.updatedAt) {
        await database.owned.put(merged);
        pushIds.push(id);
      }
      for (const old of olds) {
        await database.owned.put({ ...old, deleted: true, quantity: 0, updatedAt: nextUpdatedAt(now, old.updatedAt) });
      }
      result.migratedOwned += olds.length;
      if (olds.length > 1 || target) result.mergedOwned += 1;
    }
    await queueForPush(database, 'owned', pushIds);

    const deckIds: string[] = [];
    for (const deck of await database.decks.toArray()) {
      if (deck.deleted) continue;
      const next = repinDeck(deck, catalog);
      if (next) {
        await database.decks.put(next);
        deckIds.push(deck.id);
        result.migratedDecks += 1;
      }
      for (const slot of [...deck.main, ...deck.runes, ...deck.battlefields, ...deck.sideboard]) {
        if (slot.printingKey && !resolvePrintingKey(catalog, slot.printingKey)) orphans.add(slot.printingKey);
      }
    }
    await queueForPush(database, 'decks', deckIds);

    result.orphanedKeys = [...orphans].sort();
    return result;
  });
}

/** Run the migration against the app database; announces a local change only if something moved. */
export async function migrateRetiredKeys(catalog: Catalog): Promise<MigrationResult> {
  try {
    const result = await runMigration(db, catalog, clock.now());
    if (result.migratedOwned + result.migratedDecks > 0) emitLocalChange();
    return result;
  } catch (error) {
    reportStorageFailure(error);
    throw error;
  }
}
