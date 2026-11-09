import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import type { Catalog, OwnedEntry, Printing } from '@sc/core';
import { ShinyCardboardDB, db } from './db';
import { migrateRetiredKeys, resolvePrintingKey, runMigration } from './catalogMigration';
import { saveDeck, setOwnedQuantity } from './mutations';
import { SyncEngine } from '../sync/engine';
import { createFakeSyncServer, installFakeClock, lwwMerge, resetDb, type FakeSyncServer } from '../test/helpers';

const printing = (printingKey: string): Printing => ({
  printingKey,
  cardKey: 'vi',
  setId: 'UNL',
  setLabel: 'Unleashed',
  collectorNumber: 29,
  riftboundId: 'unl-029-219',
  variant: 'standard',
  variantLabel: null,
  rarity: 'Rare',
  imageUrl: '',
  artist: null,
  sourceId: 'x',
  tcgplayerId: null,
});

const OLD = 'unl-029-standard';
const OLD_2 = 'unl-029-alt-standard';
const NEW = 'unl-029-219-standard';

const CATALOG: Catalog = {
  builtAt: '2026',
  cards: {},
  printings: { [NEW]: printing(NEW), 'unl-029a-219-alternate-art': printing('unl-029a-219-alternate-art') },
  sets: [],
  keyAliases: { [OLD]: NEW, [OLD_2]: NEW, 'unl-029-alternate-art': 'unl-029a-219-alternate-art' },
};

beforeEach(resetDb);

describe('resolvePrintingKey', () => {
  it('keeps current keys, maps aliases and rejects unknown keys', () => {
    expect(resolvePrintingKey(CATALOG, NEW)).toBe(NEW);
    expect(resolvePrintingKey(CATALOG, OLD)).toBe(NEW);
    expect(resolvePrintingKey(CATALOG, 'zzz-001-standard')).toBeUndefined();
  });
});

describe('migrateRetiredKeys (single device)', () => {
  it('moves retired owned rows to the current key, preserving quantity and tombstoning the old row', async () => {
    await setOwnedQuantity({ printingKey: OLD, finish: 'foil' }, 2);
    const result = await migrateRetiredKeys(CATALOG);
    expect(result).toMatchObject({ migratedOwned: 1, mergedOwned: 0, orphanedKeys: [] });
    expect(await db.owned.get(`${OLD}|foil|NM`)).toMatchObject({ deleted: true, quantity: 0 });
    expect(await db.owned.get(`${NEW}|foil|NM`)).toMatchObject({ quantity: 2, printingKey: NEW });
  });

  it('sums several retired rows that collapse onto one key, merging notes deterministically', async () => {
    await setOwnedQuantity({ printingKey: OLD }, 3, 'sleeved');
    await setOwnedQuantity({ printingKey: OLD_2 }, 2, 'binder');
    const result = await migrateRetiredKeys(CATALOG);
    expect(result).toMatchObject({ migratedOwned: 2, mergedOwned: 1 });
    const merged = await db.owned.get(`${NEW}|normal|NM`);
    expect(merged).toMatchObject({ quantity: 5, notes: 'binder\nsleeved' });
  });

  it('is idempotent (re-run changes nothing)', async () => {
    await setOwnedQuantity({ printingKey: OLD }, 2);
    await migrateRetiredKeys(CATALOG);
    const before = await db.owned.toArray();
    const again = await migrateRetiredKeys(CATALOG);
    expect(again).toMatchObject({ migratedOwned: 0, mergedOwned: 0, migratedDecks: 0 });
    expect(await db.owned.toArray()).toEqual(before);
  });

  it('re-points pinned printings in decks with a minimal stamp bump', async () => {
    const deck = await saveDeck({
      name: 'Pinned',
      main: [
        { cardKey: 'vi', count: 3, printingKey: 'unl-029-alternate-art' },
        { cardKey: 'vi', count: 1, printingKey: NEW },
      ],
    });
    const result = await migrateRetiredKeys(CATALOG);
    expect(result.migratedDecks).toBe(1);
    const stored = await db.decks.get(deck.id);
    expect(stored!.main[0]!.printingKey).toBe('unl-029a-219-alternate-art');
    expect(stored!.updatedAt).toBe(deck.updatedAt + 1);
  });

  it('flags unknown keys as orphaned but keeps the rows untouched', async () => {
    await setOwnedQuantity({ printingKey: 'mystery-999-standard' }, 4);
    await saveDeck({ name: 'D', main: [{ cardKey: 'x', count: 1, printingKey: 'ghost-1-standard' }] });
    const result = await migrateRetiredKeys(CATALOG);
    expect(result.orphanedKeys).toEqual(['ghost-1-standard', 'mystery-999-standard']);
    expect(await db.owned.get('mystery-999-standard|normal|NM')).toMatchObject({ quantity: 4 });
    expect((await db.owned.get('mystery-999-standard|normal|NM'))?.deleted).toBeUndefined();
  });

  it('keeps a target that was deleted after migrating unless the old data is newer', async () => {
    const old = await setOwnedQuantity({ printingKey: OLD }, 3);
    // Simulate: another device migrated, then deleted the new row later than this old row's stamp.
    await db.owned.put({ id: `${NEW}|normal|NM`, printingKey: NEW, finish: 'normal', condition: 'NM', quantity: 0, deleted: true, updatedAt: old!.updatedAt + 10 });
    await migrateRetiredKeys(CATALOG);
    expect(await db.owned.get(`${NEW}|normal|NM`)).toMatchObject({ deleted: true });
  });
});

describe('migration across two devices and a sync server', () => {
  const TOKEN = 'secret-token';
  const CONFIG = { url: 'https://sync.test', token: TOKEN };
  const TIMING = { intervalMs: 60_000, debounceMs: 15, visibilityGapMs: 0, backoffBaseMs: 1_000, backoffMaxMs: 8_000 };
  let server: FakeSyncServer;
  let clock: ReturnType<typeof installFakeClock>;
  let dbB: ShinyCardboardDB;
  let engineA: SyncEngine;
  let engineB: SyncEngine;

  const makeEngine = (database: ShinyCardboardDB) =>
    new SyncEngine({ db: database, getConfig: () => CONFIG, fetchFn: server.fetch, merge: lwwMerge, now: () => clock.now, isOnline: () => true, random: () => 0.5 }, TIMING);
  const syncBoth = async () => {
    clock.tick();
    await engineA.syncNow();
    clock.tick();
    await engineB.syncNow();
    clock.tick();
    await engineA.syncNow();
  };
  const live = async (database: ShinyCardboardDB, key: string) =>
    (await database.owned.toArray()).filter((row) => !row.deleted && row.printingKey === key);

  beforeEach(async () => {
    server = createFakeSyncServer(TOKEN);
    clock = installFakeClock();
    dbB = new ShinyCardboardDB('device-b-migration');
    await dbB.open();
    engineA = makeEngine(db);
    engineB = makeEngine(dbB);
    // Both devices start holding the old row at quantity 3.
    await setOwnedQuantity({ printingKey: OLD }, 3);
    clock.tick();
    await engineA.syncNow();
    clock.tick();
    await engineB.syncNow();
    expect(await live(dbB, OLD)).toHaveLength(1);
  });
  afterEach(async () => {
    clock.restore();
    dbB.close();
    await Dexie.delete('device-b-migration');
  });

  it('A migrates and edits to 5, stale B migrates before pulling: both end at 5', async () => {
    clock.tick();
    await runMigration(db, CATALOG, clock.now);
    clock.tick();
    await setOwnedQuantity({ printingKey: NEW }, 5);
    clock.tick();
    await engineA.syncNow();

    clock.tick();
    await runMigration(dbB, CATALOG, clock.now); // B has not pulled yet
    await syncBoth();

    for (const database of [db, dbB]) {
      const rows = await live(database, NEW);
      expect(rows.map((r: OwnedEntry) => r.quantity)).toEqual([5]);
      expect(await live(database, OLD)).toHaveLength(0);
    }
  });

  it('B edited the old row after A migrated (B stale, no pull): result is B edit, not 7 and not 3', async () => {
    clock.tick();
    await runMigration(db, CATALOG, clock.now);
    clock.tick();
    await engineA.syncNow();

    clock.tick();
    const oldRow = (await dbB.owned.get(`${OLD}|normal|NM`))!;
    await dbB.owned.put({ ...oldRow, quantity: 4, updatedAt: clock.now });
    clock.tick();
    await runMigration(dbB, CATALOG, clock.now);
    await syncBoth();

    for (const database of [db, dbB]) expect((await live(database, NEW)).map((r) => r.quantity)).toEqual([4]);
  });

  it('B edited the old row after A migrated and pulled first: still 4 (no doubling)', async () => {
    clock.tick();
    await runMigration(db, CATALOG, clock.now);
    clock.tick();
    await engineA.syncNow();

    clock.tick();
    const oldRow = (await dbB.owned.get(`${OLD}|normal|NM`))!;
    await dbB.owned.put({ ...oldRow, quantity: 4, updatedAt: clock.now });
    clock.tick();
    await engineB.syncNow(); // pulls A's new row (3) and the old tombstone, which B's newer edit beats
    clock.tick();
    await runMigration(dbB, CATALOG, clock.now);
    await syncBoth();

    for (const database of [db, dbB]) expect((await live(database, NEW)).map((r) => r.quantity)).toEqual([4]);
  });

  it('both devices migrate simultaneously and converge on the correct sum', async () => {
    // A second retired key that collapses onto the same new row.
    await setOwnedQuantity({ printingKey: OLD_2 }, 2);
    clock.tick();
    await engineA.syncNow();
    clock.tick();
    await engineB.syncNow();

    clock.tick();
    await runMigration(db, CATALOG, clock.now);
    clock.tick();
    await runMigration(dbB, CATALOG, clock.now);
    await syncBoth();

    for (const database of [db, dbB]) {
      expect((await live(database, NEW)).map((r) => r.quantity)).toEqual([5]);
      expect(await live(database, OLD)).toHaveLength(0);
      expect(await live(database, OLD_2)).toHaveLength(0);
    }
  });

  it('a migrated row reaches the server even though its stamp is old, and re-running changes nothing', async () => {
    clock.tick();
    await runMigration(db, CATALOG, clock.now);
    clock.tick();
    await engineA.syncNow();
    expect(server.records('owned').filter((r) => (r as OwnedEntry).printingKey === NEW && !r.deleted)).toHaveLength(1);

    const before = await db.owned.toArray();
    const again = await runMigration(db, CATALOG, clock.now + 1000);
    expect(again.migratedOwned).toBe(0);
    expect(await db.owned.toArray()).toEqual(before);
  });
});
