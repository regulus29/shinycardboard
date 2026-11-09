import { beforeEach, describe, expect, it } from 'vitest';
import type { OwnedEntry } from '@sc/core';
import { db } from './db';
import { applyImport, countReplaceRemovals } from './importEntries';
import { setOwnedQuantity } from './mutations';
import { subscribeLocalChanges } from './changeBus';
import { resetDb } from '../test/helpers';

const incoming = (printingKey: string, quantity: number, finish: OwnedEntry['finish'] = 'normal'): OwnedEntry => ({
  id: crypto.randomUUID(),
  printingKey,
  finish,
  condition: 'NM',
  quantity,
  updatedAt: 0,
});

const live = async () => (await db.owned.toArray()).filter((row) => !row.deleted);

beforeEach(async () => {
  await resetDb();
});

describe('applyImport', () => {
  it('adds new rows with deterministic ids and sums onto existing copies', async () => {
    await setOwnedQuantity({ printingKey: 'a' }, 2);
    const outcome = await applyImport([incoming('a', 3), incoming('b', 1, 'foil')], 'add', 5_000_000_000_000);
    expect(outcome).toEqual({ added: 1, updated: 1, removed: 0 });
    const rows = await live();
    expect(rows.find((r) => r.printingKey === 'a')?.quantity).toBe(5);
    expect(rows.find((r) => r.printingKey === 'b')?.id).toBe('b|foil|NM');
  });

  it('replace tombstones rows missing from the file and stamps them newer', async () => {
    await setOwnedQuantity({ printingKey: 'a' }, 2);
    await setOwnedQuantity({ printingKey: 'gone' }, 4);
    const before = await db.owned.get('gone|normal|NM');
    expect(countReplaceRemovals(await db.owned.toArray(), [incoming('a', 1)])).toBe(1);
    const outcome = await applyImport([incoming('a', 1)], 'replace');
    expect(outcome).toEqual({ added: 0, updated: 1, removed: 1 });
    const gone = await db.owned.get('gone|normal|NM');
    expect(gone?.deleted).toBe(true);
    expect(gone!.updatedAt).toBeGreaterThan(before!.updatedAt);
    expect((await live()).map((r) => [r.printingKey, r.quantity])).toEqual([['a', 1]]);
  });

  it('revives a tombstoned row under its original id', async () => {
    await setOwnedQuantity({ printingKey: 'a' }, 1);
    await setOwnedQuantity({ printingKey: 'a' }, 0);
    await applyImport([incoming('a', 2)], 'add');
    const row = await db.owned.get('a|normal|NM');
    expect(row?.deleted).toBeUndefined();
    expect(row?.quantity).toBe(2);
  });

  it('announces a change once, and not at all when nothing changes', async () => {
    let events = 0;
    const off = subscribeLocalChanges(() => (events += 1));
    await applyImport([incoming('a', 1)], 'add');
    expect(events).toBe(1);
    await applyImport([], 'add');
    expect(events).toBe(1);
    off();
  });

  it('clamps summed quantities to the maximum', async () => {
    await setOwnedQuantity({ printingKey: 'a' }, 9000);
    await applyImport([incoming('a', 9000)], 'add');
    expect((await db.owned.get('a|normal|NM'))?.quantity).toBe(9999);
  });
});
