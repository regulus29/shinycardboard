import { describe, expect, it } from 'vitest';
import type { SyncRecord } from '../types';
import { applySyncRequest, emptyServerState, type ServerState } from './apply';
import { nextUpdatedAt } from './clock';
import { MS_PER_DAY, SYNC_CONFIG } from './config';
import { validateCollectionRecord } from './records';
import type { SyncRequest } from './sync';
import { validateSyncRecord } from './validate';

const RETENTION = 10 * MS_PER_DAY;
const rec = (id: string, updatedAt: number, extra: Partial<SyncRecord> = {}): SyncRecord => ({ id, updatedAt, ...extra });
const request = (since: number, owned: SyncRecord[] = []): SyncRequest => ({ since, changes: { owned } });
const sync = (state: ServerState, req: SyncRequest, now: number) =>
  applySyncRequest(state, req, now, { tombstoneRetentionMs: RETENTION });

describe('tombstone expiry counts from receipt', () => {
  it('keeps a tombstone with an ancient updatedAt and delivers it to other devices', () => {
    const start = 1_000_000 * MS_PER_DAY;
    const seen = sync(emptyServerState(), request(0), start);
    const pushed = sync(seen.state, request(0, [rec('a', 5, { deleted: true })]), start + 10);
    expect(pushed.state.collections.owned).toHaveLength(1);
    const pulled = sync(pushed.state, request(seen.response.serverTime), start + 20);
    expect(pulled.response.changes.owned).toEqual([rec('a', 5, { deleted: true })]);
    expect(pulled.response.resync).toBe(false);
  });

  it('does not lose a delete that was stamped by a slow or skewed back clock', () => {
    const start = 100 * MS_PER_DAY;
    const live = sync(emptyServerState(), request(0, [rec('a', start)]), start);
    const deleted = sync(live.state, request(live.response.serverTime, [rec('a', start - 5 * MS_PER_DAY, { deleted: true })]), start + 1);
    // The older stamp loses last write wins: nothing is pruned or resurrected by the expiry rule.
    expect(deleted.state.collections.owned[0]?.record.deleted).toBeUndefined();
    const fixedClock = nextUpdatedAt(start - 5 * MS_PER_DAY, start);
    expect(fixedClock).toBe(start + 1);
  });

  it('never prunes in the request that stored the tombstone, even with zero retention', () => {
    const outcome = applySyncRequest(emptyServerState(), request(0, [rec('a', 1, { deleted: true })]), 1000, {
      tombstoneRetentionMs: 0,
    });
    expect(outcome.state.collections.owned).toHaveLength(1);
  });

  it('prunes after retention from receipt and raises the watermark', () => {
    const t0 = 50 * MS_PER_DAY;
    const pushed = sync(emptyServerState(), request(0, [rec('a', 1, { deleted: true })]), t0);
    const later = sync(pushed.state, request(pushed.response.serverTime), t0 + RETENTION + 1);
    expect(later.state.collections.owned).toHaveLength(0);
    expect(later.state.prunedBefore).toBe(pushed.response.serverTime);
    expect(later.changed).toBe(true);
  });

  it('flags only cursors older than the pruned tombstone, and sends full state', () => {
    const t0 = 50 * MS_PER_DAY;
    const first = sync(emptyServerState(), request(0, [rec('keep', t0), rec('gone', t0)]), t0);
    const staleCursor = first.response.serverTime;
    const del = sync(first.state, request(staleCursor, [rec('gone', t0 + 1, { deleted: true })]), t0 + MS_PER_DAY);
    const afterPrune = sync(del.state, request(0), t0 + MS_PER_DAY + RETENTION + 5);

    const stale = sync(afterPrune.state, request(staleCursor), t0 + 30 * MS_PER_DAY);
    expect(stale.response.resync).toBe(true);
    expect(stale.response.changes.owned?.map((r) => r.id)).toEqual(['keep']);

    const fresh = sync(stale.state, request(0), t0 + 31 * MS_PER_DAY);
    const upToDate = sync(fresh.state, request(afterPrune.response.serverTime), t0 + 32 * MS_PER_DAY);
    expect([fresh.response.resync, upToDate.response.resync]).toEqual([false, false]);
  });

  it('puts the same serverId in every response and keeps it across states', () => {
    const state = emptyServerState('server-1');
    const one = sync(state, request(0), 1000);
    const two = sync(one.state, request(0), 2000);
    expect([one.response.serverId, two.response.serverId]).toEqual(['server-1', 'server-1']);
    expect(emptyServerState().serverId).not.toBe(emptyServerState().serverId);
  });
});

describe('clock skew', () => {
  it('clamps records stamped beyond the skew window and returns the corrected copy', () => {
    const now = 1_700_000_000_000;
    const outcome = applySyncRequest(emptyServerState(), request(0, [rec('far', now + MS_PER_DAY), rec('near', now + 1000)]), now, {
      maxClockSkewMs: 60_000,
    });
    expect(outcome.clamped).toBe(1);
    const stored = Object.fromEntries(outcome.state.collections.owned.map((s) => [s.record.id, s.record.updatedAt]));
    expect(stored.far).toBe(outcome.state.serverTime);
    expect(stored.near).toBe(now + 1000);
    expect(outcome.response.changes.owned?.map((r) => r.id)).toEqual(['far']);
  });

  it('a clamped record cannot beat a later real edit from another device', () => {
    const now = 1_700_000_000_000;
    const first = applySyncRequest(emptyServerState(), request(0, [rec('a', now + 10 * MS_PER_DAY, { deleted: true })]), now);
    const second = applySyncRequest(first.state, request(0, [rec('a', now + 5000)]), now + 5000);
    expect(second.state.collections.owned[0]?.record.deleted).toBeUndefined();
  });
});

describe('nextUpdatedAt', () => {
  it('uses the clock normally and steps past a newer previous stamp', () => {
    expect(nextUpdatedAt(100)).toBe(100);
    expect(nextUpdatedAt(100, 50)).toBe(100);
    expect(nextUpdatedAt(100, 100)).toBe(101);
    expect(nextUpdatedAt(100, 500)).toBe(501);
  });
});

describe('record validation bounds and depth', () => {
  it('rejects non finite, negative and absurd updatedAt values', () => {
    for (const updatedAt of [Number.NaN, Infinity, -1, SYNC_CONFIG.maxUpdatedAt + 1, '5']) {
      expect(validateSyncRecord({ id: 'a', updatedAt }, 'r')).toMatch(/updatedAt/);
    }
    expect(validateSyncRecord({ id: 'a', updatedAt: SYNC_CONFIG.maxUpdatedAt }, 'r')).toBeNull();
  });

  it('rejects hostile nesting without overflowing the stack', () => {
    let nested: unknown = 1;
    for (let i = 0; i < 200_000; i++) nested = [nested];
    expect(validateSyncRecord({ id: 'a', updatedAt: 1, extra: nested }, 'r')).toMatch(/nested too deeply/);
  });

  it('applies collection specific limits', () => {
    const owned = { id: 'a', updatedAt: 1, printingKey: 'k', finish: 'normal', condition: 'NM', quantity: 1 };
    expect(validateCollectionRecord('owned', owned, 'r')).toBeNull();
    expect(validateCollectionRecord('owned', { ...owned, quantity: 10 ** 9 }, 'r')).toMatch(/quantity/);
    expect(validateCollectionRecord('owned', { ...owned, notes: 'x'.repeat(100_000) }, 'r')).toMatch(/notes/);
    expect(validateCollectionRecord('owned', { ...owned, finish: 'shiny' }, 'r')).toMatch(/finish/);
    const deck = { id: 'd', updatedAt: 1, name: 'n', main: [{ cardKey: 'c', count: 1000 }], runes: [], battlefields: [], sideboard: [] };
    expect(validateCollectionRecord('decks', deck, 'r')).toMatch(/count/);
  });
});
