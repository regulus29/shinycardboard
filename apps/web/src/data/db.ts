import Dexie, { type Table, type Transaction } from 'dexie';
import type { CardTagging, Deck, OwnedEntry, SavedSearch } from '@sc/core';
import { DB_NAME } from '../config/constants';
import { noteWrite } from './changeBus';
import { reportDbFailure } from './health';

/** Key/value rows for sync bookkeeping and other small persisted facts. */
export interface MetaRow {
  key: string;
  value: unknown;
}

interface SchemaVersion {
  version: number;
  stores: Record<string, string>;
  /** Optional data migration run when upgrading to this version. */
  upgrade?: (tx: Transaction) => void | Promise<void>;
}

/**
 * Ordered schema history. NEVER edit a shipped entry: append a new version with the full
 * `stores` map (plus an `upgrade` callback when rows need rewriting).
 *
 * Index notes: booleans are not valid IndexedDB keys so `deleted` is filtered in code.
 * `[printingKey+finish+condition]` backs the upsert in setOwnedQuantity; `*tags` is a
 * multi-entry index for tag lookups.
 */
export const SCHEMA_VERSIONS: readonly SchemaVersion[] = [
  {
    version: 1,
    stores: {
      owned: 'id, printingKey, [printingKey+finish+condition], updatedAt',
      taggings: 'id, cardKey, *tags, updatedAt',
      decks: 'id, name, updatedAt',
      savedSearches: 'id, name, updatedAt',
      syncMeta: 'key',
    },
  },
];

export class ShinyCardboardDB extends Dexie {
  owned!: Table<OwnedEntry, string>;
  taggings!: Table<CardTagging, string>;
  decks!: Table<Deck, string>;
  savedSearches!: Table<SavedSearch, string>;
  syncMeta!: Table<MetaRow, string>;

  constructor(name: string = DB_NAME) {
    super(name);
    for (const { version, stores, upgrade } of SCHEMA_VERSIONS) {
      const v = this.version(version).stores(stores);
      if (upgrade) v.upgrade(upgrade);
    }
    // Another tab upgrading the schema, or the browser closing the connection, leaves this handle unusable.
    this.on('versionchange', () => {
      this.close();
      reportDbFailure('versionchange');
      return false;
    });
    this.on('close', () => reportDbFailure('closed'));
    // Count row writes so mutate() can skip the change event when nothing was written.
    for (const table of [this.owned, this.taggings, this.decks, this.savedSearches]) {
      table.hook('creating', () => void noteWrite());
      table.hook('updating', () => void noteWrite());
      table.hook('deleting', () => void noteWrite());
    }
  }
}

export const db = new ShinyCardboardDB();
