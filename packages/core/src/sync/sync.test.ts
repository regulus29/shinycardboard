import { describe, expect, it } from 'vitest';
import { SYNC_COLLECTIONS, type SyncCollection, type SyncRecord } from '../types';
import { applySyncRequest, emptyServerState, type ServerState } from './apply';
import { mergeRecords, pruneTombstones } from './merge';
import type { SyncRequest } from './sync';
import { validateSyncRecord } from './validate';

interface Rec extends SyncRecord {
  value?: string;
}

const rec = (id: string, updatedAt: number, extra: Partial<Rec> = {}): Rec => ({ id, updatedAt, ...extra });

/** Small deterministic PRNG so failures are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('mergeRecords', () => {
  it('keeps the newest version of each id and the union of ids', () => {
    const merged = mergeRecords([rec('a', 1, { value: 'old' }), rec('b', 5)], [rec('a', 2, { value: 'new' }), rec('c', 1)]);
    expect(merged).toEqual([rec('a', 2, { value: 'new' }), rec('b', 5), rec('c', 1)]);
  });

  it('lets a tombstone win a timestamp tie', () => {
    const live = rec('a', 5, { value: 'x' });
    const dead = rec('a', 5, { deleted: true });
    expect(mergeRecords([live], [dead])).toEqual([dead]);
    expect(mergeRecords([dead], [live])).toEqual([dead]);
  });

  it('breaks remaining ties on stable content, independent of argument order', () => {
    const x = rec('a', 5, { value: 'x' });
    const y = rec('a', 5, { value: 'y' });
    expect(mergeRecords([x], [y])).toEqual(mergeRecords([y], [x]));
  });

  it('collapses duplicate ids inside one list and does not mutate inputs', () => {
    const local = [rec('a', 1), rec('a', 3)];
    const copy = structuredClone(local);
    expect(mergeRecords(local, [])).toEqual([rec('a', 3)]);
    expect(local).toEqual(copy);
  });

  it('is commutative, associative and idempotent over random inputs', () => {
    const random = mulberry32(7);
    const randomSet = (): Rec[] =>
      Array.from({ length: 12 }, () =>
        rec(`id${Math.floor(random() * 6)}`, Math.floor(random() * 4), {
          value: random() < 0.5 ? 'p' : 'q',
          ...(random() < 0.3 ? { deleted: true } : {}),
        }),
      );
    for (let i = 0; i < 200; i++) {
      const [a, b, c] = [randomSet(), randomSet(), randomSet()];
      expect(mergeRecords(a, b)).toEqual(mergeRecords(b, a));
      expect(mergeRecords(mergeRecords(a, b), c)).toEqual(mergeRecords(a, mergeRecords(b, c)));
      expect(mergeRecords(a, a)).toEqual(mergeRecords(a, []));
    }
  });
});

describe('pruneTombstones', () => {
  it('drops only tombstones older than the window', () => {
    const records = [
      rec('live-old', 0),
      rec('dead-old', 0, { deleted: true }),
      rec('dead-new', 900, { deleted: true }),
    ];
    expect(pruneTombstones(records, 1000, 500).map((r) => r.id)).toEqual(['live-old', 'dead-new']);
  });
});

describe('validateSyncRecord', () => {
  it('accepts well formed records and rejects bad ones', () => {
    expect(validateSyncRecord(rec('a', 1), 'r')).toBeNull();
    expect(validateSyncRecord(rec('a', 1, { deleted: true }), 'r')).toBeNull();
    expect(validateSyncRecord({ id: '', updatedAt: 1 }, 'r')).toMatch(/id/);
    expect(validateSyncRecord({ id: 'a', updatedAt: 'x' }, 'r')).toMatch(/updatedAt/);
    expect(validateSyncRecord({ id: 'a', updatedAt: 1, deleted: 'yes' }, 'r')).toMatch(/deleted/);
    expect(validateSyncRecord(null, 'r')).toMatch(/object/);
  });
});

describe('applySyncRequest', () => {
  const request = (since: number, owned: SyncRecord[] = []): SyncRequest => ({ since, changes: { owned } });

  it('stores pushed records and returns them to other devices only', () => {
    const first = applySyncRequest(emptyServerState(), request(0, [rec('a', 10)]), 100);
    expect(first.changed).toBe(true);
    expect(first.response.changes.owned).toBeUndefined();

    const second = applySyncRequest(first.state, request(0), 101);
    expect(second.response.changes.owned).toEqual([rec('a', 10)]);
  });

  it('only returns records newer than the client cursor', () => {
    const one = applySyncRequest(emptyServerState(), request(0, [rec('a', 1)]), 100);
    const two = applySyncRequest(one.state, request(0, [rec('b', 2)]), 200);
    const pull = applySyncRequest(two.state, request(one.response.serverTime), 300);
    expect(pull.response.changes.owned).toEqual([rec('b', 2)]);
  });

  it('hands back the server copy when the pushed record loses', () => {
    const base = applySyncRequest(emptyServerState(), request(0, [rec('a', 10, { value: 'server' })]), 100);
    const stale = applySyncRequest(base.state, request(base.response.serverTime, [rec('a', 5, { value: 'stale' })]), 200);
    expect(stale.response.changes.owned).toEqual([rec('a', 10, { value: 'server' })]);
    expect(stale.changed).toBe(false);
  });

  it('keeps server time strictly increasing even with a stalled or rewound clock', () => {
    const one = applySyncRequest(emptyServerState(), request(0), 500);
    const two = applySyncRequest(one.state, request(0), 500);
    const three = applySyncRequest(two.state, request(0), 100);
    expect([one, two, three].map((o) => o.response.serverTime)).toEqual([500, 501, 502]);
  });

  it('does not mutate the previous state', () => {
    const state = emptyServerState();
    const snapshot = structuredClone(state);
    applySyncRequest(state, request(0, [rec('a', 1)]), 100);
    expect(state).toEqual(snapshot);
  });

  it('prunes expired tombstones from storage', () => {
    const tombstone = rec('a', 1, { deleted: true });
    const pushed = applySyncRequest(emptyServerState(), request(0, [tombstone]), 10, { tombstoneRetentionMs: 1000 });
    expect(pushed.state.collections.owned).toHaveLength(1);
    const later = applySyncRequest(pushed.state, request(0), 5000, { tombstoneRetentionMs: 1000 });
    expect(later.state.collections.owned).toHaveLength(0);
    expect(later.changed).toBe(true);
  });
});

/** A simulated client: local copy per collection, a dirty set, and a sync cursor. */
class Device {
  since = 0;
  private readonly local = new Map<string, Rec>();
  private readonly dirty = new Map<string, Rec>();

  constructor(
    readonly name: string,
    private readonly collection: SyncCollection,
  ) {}

  edit(record: Rec): void {
    const current = this.local.get(record.id);
    if (current && mergeRecords([current], [record])[0] !== record) return; // an older edit would lose anyway
    this.local.set(record.id, record);
    this.dirty.set(record.id, record);
  }

  buildRequest(): SyncRequest {
    return { since: this.since, changes: { [this.collection]: [...this.dirty.values()] } };
  }

  /** Apply a response; `delivered` false simulates a lost response (the cursor must not advance). */
  receive(state: { changes: SyncRequest['changes']; serverTime: number }, delivered: boolean): void {
    if (!delivered) return;
    for (const remote of (state.changes[this.collection] ?? []) as Rec[]) {
      const winner = mergeRecords([this.local.get(remote.id)].filter((r): r is Rec => r !== undefined), [remote])[0]!;
      this.local.set(remote.id, winner);
    }
    this.dirty.clear();
    this.since = state.serverTime;
  }

  snapshot(): Rec[] {
    return mergeRecords([...this.local.values()], []);
  }
}

function syncDevice(
  state: ServerState,
  device: Device,
  now: number,
  options: { dropResponse?: boolean } = {},
): ServerState {
  const outcome = applySyncRequest(state, device.buildRequest(), now);
  device.receive(outcome.response, !options.dropResponse);
  return outcome.state;
}

const serverRecords = (state: ServerState, collection: SyncCollection): Rec[] =>
  state.collections[collection].map((s) => s.record as Rec);

describe('convergence', () => {
  const scenarios = 60;
  const devicesPerScenario = 3;
  const stepsPerScenario = 80;
  const idsPerScenario = 5;

  for (let seed = 1; seed <= scenarios; seed++) {
    it(`converges after random edits and out of order syncs (seed ${seed})`, () => {
      const random = mulberry32(seed);
      const pick = <T,>(items: T[]): T => items[Math.floor(random() * items.length)]!;
      const collection = pick([...SYNC_COLLECTIONS]);
      const devices = Array.from({ length: devicesPerScenario }, (_, i) => new Device(`d${i}`, collection));
      let state = emptyServerState();
      let clock = 1000;

      for (let step = 0; step < stepsPerScenario; step++) {
        const device = pick(devices);
        if (random() < 0.5) {
          // Timestamps repeat and skew across devices to exercise tie breaks and clock drift.
          const updatedAt = clock + Math.floor(random() * 5) - 2;
          device.edit(
            rec(`r${Math.floor(random() * idsPerScenario)}`, updatedAt, {
              value: `${device.name}-${step}`,
              ...(random() < 0.25 ? { deleted: true } : {}),
            }),
          );
        } else {
          state = syncDevice(state, device, clock, { dropResponse: random() < 0.2 });
        }
        clock += Math.floor(random() * 3); // sometimes stalls, so server time collisions happen
      }

      // Quiesce: two full rounds so every device sees every change.
      for (let round = 0; round < 2; round++) {
        for (const device of devices) state = syncDevice(state, device, clock++);
      }
      const expected = serverRecords(state, collection);
      for (const device of devices) expect(device.snapshot()).toEqual(expected);
    });
  }

  it('gives the same final state regardless of the order devices sync', () => {
    const edits = (device: Device, base: number) => {
      device.edit(rec('shared', base, { value: device.name }));
      device.edit(rec(`own-${device.name}`, base + 1, { value: 'x' }));
    };
    const run = (order: number[]): Rec[] => {
      const devices = [0, 1, 2].map((i) => new Device(`d${i}`, 'decks'));
      devices.forEach((d, i) => edits(d, 100 + i));
      let state = emptyServerState();
      let clock = 1000;
      for (const i of order) state = syncDevice(state, devices[i]!, clock++);
      for (const d of devices) state = syncDevice(state, d, clock++);
      return serverRecords(state, 'decks');
    };
    const baseline = run([0, 1, 2]);
    for (const order of [[2, 1, 0], [1, 0, 2], [2, 0, 1]]) expect(run(order)).toEqual(baseline);
  });

  it('propagates a delete to a device that was offline', () => {
    const a = new Device('a', 'owned');
    const b = new Device('b', 'owned');
    let state = emptyServerState();
    a.edit(rec('x', 10, { value: 'v' }));
    state = syncDevice(state, a, 100);
    state = syncDevice(state, b, 101);
    a.edit(rec('x', 20, { deleted: true }));
    state = syncDevice(state, a, 102);
    state = syncDevice(state, b, 103);
    expect(b.snapshot()).toEqual([rec('x', 20, { deleted: true })]);
  });
});
