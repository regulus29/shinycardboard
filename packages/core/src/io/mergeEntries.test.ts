import { describe, expect, it } from 'vitest';
import type { OwnedEntry } from '../types';
import { mergeImportedEntries } from './mergeEntries';

const NOW = 5000;
const entry = (id: string, printingKey: string, quantity: number, extra: Partial<OwnedEntry> = {}): OwnedEntry => ({
  id,
  updatedAt: 100,
  printingKey,
  finish: 'normal',
  condition: 'NM',
  quantity,
  ...extra,
});

describe('mergeImportedEntries add mode', () => {
  it('sums quantities for the same key, keeps the existing id and stamps updatedAt', () => {
    const merged = mergeImportedEntries([entry('e1', 'p1', 2)], [entry('i1', 'p1', 3)], 'add', NOW);
    expect(merged).toEqual([entry('e1', 'p1', 5, { updatedAt: NOW })]);
  });

  it('treats finish and condition as part of the key', () => {
    const merged = mergeImportedEntries(
      [entry('e1', 'p1', 1)],
      [entry('i1', 'p1', 1, { finish: 'foil' }), entry('i2', 'p1', 1, { condition: 'LP' })],
      'add',
      NOW,
    );
    expect(merged).toHaveLength(3);
    expect(merged.find((e) => e.id === 'e1')!.updatedAt).toBe(100);
  });

  it('adds new rows with a fresh timestamp and leaves other rows untouched', () => {
    const untouched = entry('e1', 'p1', 1);
    const merged = mergeImportedEntries([untouched], [entry('i1', 'p2', 4)], 'add', NOW);
    expect(merged).toEqual([untouched, entry('i1', 'p2', 4, { updatedAt: NOW })]);
  });

  it('revives a tombstoned row under its old id', () => {
    const tomb = entry('e1', 'p1', 9, { deleted: true });
    const merged = mergeImportedEntries([tomb], [entry('i1', 'p1', 2)], 'add', NOW);
    expect(merged).toEqual([entry('e1', 'p1', 2, { updatedAt: NOW })]);
  });

  it('collapses duplicate imported keys and ignores empty quantities', () => {
    const merged = mergeImportedEntries([], [entry('i1', 'p1', 1), entry('i2', 'p1', 2), entry('i3', 'p2', 0)], 'add', NOW);
    expect(merged.map((e) => [e.printingKey, e.quantity])).toEqual([['p1', 3]]);
  });

  it('keeps notes: imported notes win, otherwise existing notes stay', () => {
    const kept = mergeImportedEntries([entry('e1', 'p1', 1, { notes: 'mine' })], [entry('i1', 'p1', 1)], 'add', NOW);
    expect(kept[0]!.notes).toBe('mine');
    const replaced = mergeImportedEntries([entry('e1', 'p1', 1, { notes: 'mine' })], [entry('i1', 'p1', 1, { notes: 'new' })], 'add', NOW);
    expect(replaced[0]!.notes).toBe('new');
  });

  it('does not mutate its inputs', () => {
    const existing = [entry('e1', 'p1', 2)];
    const imported = [entry('i1', 'p1', 3)];
    const snapshot = structuredClone([existing, imported]);
    mergeImportedEntries(existing, imported, 'add', NOW);
    expect([existing, imported]).toEqual(snapshot);
  });
});

describe('mergeImportedEntries replace mode', () => {
  it('replaces quantities, reuses ids and tombstones rows missing from the import', () => {
    const existing = [entry('e1', 'p1', 5), entry('e2', 'p2', 1)];
    const merged = mergeImportedEntries(existing, [entry('i1', 'p1', 2), entry('i3', 'p3', 7)], 'replace', NOW);
    const byId = new Map(merged.map((e) => [e.id, e]));
    expect(byId.get('e1')).toEqual(entry('e1', 'p1', 2, { updatedAt: NOW }));
    expect(byId.get('e2')).toEqual(entry('e2', 'p2', 1, { updatedAt: NOW, deleted: true }));
    expect(byId.get('i3')).toEqual(entry('i3', 'p3', 7, { updatedAt: NOW }));
    expect(merged).toHaveLength(3);
  });

  it('keeps old tombstones as they were', () => {
    const old = entry('t1', 'p9', 1, { deleted: true, updatedAt: 7 });
    const merged = mergeImportedEntries([old], [], 'replace', NOW);
    expect(merged).toEqual([old]);
  });

  it('an empty import removes everything live', () => {
    const merged = mergeImportedEntries([entry('e1', 'p1', 1), entry('e2', 'p2', 1)], [], 'replace', NOW);
    expect(merged.every((e) => e.deleted === true && e.updatedAt === NOW)).toBe(true);
  });

  it('drops stale notes that the import does not carry', () => {
    const merged = mergeImportedEntries([entry('e1', 'p1', 1, { notes: 'old' })], [entry('i1', 'p1', 1)], 'replace', NOW);
    expect(merged[0]).not.toHaveProperty('notes');
  });
});

describe('mergeImportedEntries last write wins safety', () => {
  const FUTURE = NOW + 10_000;

  it('stamps an update after an existing version that is ahead of the import clock', () => {
    const merged = mergeImportedEntries([entry('e1', 'p1', 1, { updatedAt: FUTURE })], [entry('i1', 'p1', 2)], 'add', NOW);
    expect(merged[0]!.updatedAt).toBe(FUTURE + 1);
  });

  it('stamps replace mode tombstones after the row they remove', () => {
    const merged = mergeImportedEntries([entry('e1', 'p1', 1, { updatedAt: FUTURE })], [], 'replace', NOW);
    expect(merged[0]).toMatchObject({ deleted: true, updatedAt: FUTURE + 1 });
  });

  it('revives a tombstone with a later stamp than the tombstone', () => {
    const tomb = entry('e1', 'p1', 1, { deleted: true, updatedAt: FUTURE });
    const merged = mergeImportedEntries([tomb], [entry('i1', 'p1', 3)], 'replace', NOW);
    expect(merged[0]).toMatchObject({ id: 'e1', quantity: 3, updatedAt: FUTURE + 1 });
    expect(merged[0]).not.toHaveProperty('deleted');
  });
});
