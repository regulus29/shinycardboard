import { describe, expect, it } from 'vitest';
import type { SyncRecord } from '../types';
import { applySyncRequest, emptyServerState, type ServerState } from './apply';
import { nextUpdatedAt } from './clock';
import { compareRecords } from './merge';
import { mergePulledRecords } from './pull';
import type { SyncRequest, SyncResponse } from './sync';

/** Randomized multi-device runs with skew, lost and duplicated messages, deletes, pruning and restores. */

interface Rec extends SyncRecord {
  value: string;
}

const RETENTION = 60;
const SKEW_WINDOW = 100;
const FAST_CLOCK_OFFSET = 400;
const IDS = 6;

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Device {
  since = 0;
  serverId: string | undefined;
  private local = new Map<string, Rec>();
  private dirty = new Map<string, Rec>();

  constructor(
    readonly name: string,
    readonly clockOffset: number,
  ) {}

  edit(id: string, serverNow: number, value: string, deleted: boolean): void {
    const previous = this.local.get(id);
    const updatedAt = nextUpdatedAt(Math.max(0, serverNow + this.clockOffset), previous?.updatedAt);
    const record: Rec = { id, updatedAt, value, ...(deleted ? { deleted: true } : {}) };
    this.local.set(id, record);
    this.dirty.set(id, record);
  }

  buildRequest(): SyncRequest {
    return { since: this.since, changes: { owned: [...this.dirty.values()] } };
  }

  /** What the device sent, so a server correction of a pushed record can be adopted. */
  receive(response: SyncResponse, sent: SyncRequest): void {
    const pushed = new Map((sent.changes.owned ?? []).map((r) => [r.id, r as Rec]));
    const idChanged = this.serverId !== undefined && response.serverId !== this.serverId;
    const incoming = (response.changes.owned ?? []) as Rec[];

    const { merged, toPush } = mergePulledRecords([...this.local.values()], incoming);
    const next = new Map(merged.map((r) => [r.id, r]));
    for (const record of incoming) {
      const sentVersion = pushed.get(record.id);
      const untouchedSince = sentVersion !== undefined && this.local.get(record.id) === sentVersion;
      // The server's answer for a record we just pushed is authoritative (it may have clamped the stamp).
      if (untouchedSince) next.set(record.id, record);
    }
    this.local = next;

    for (const sentRecord of pushed.values()) this.dirty.delete(sentRecord.id);
    for (const record of toPush) if (compareRecords(record, next.get(record.id)!) === 0) this.dirty.set(record.id, record);

    this.serverId = response.serverId;
    if (response.resync || idChanged) {
      // Start over: push everything we hold, tombstones included.
      this.since = 0;
      for (const record of this.local.values()) this.dirty.set(record.id, record);
    } else {
      this.since = response.serverTime;
    }
  }

  snapshot(): Rec[] {
    return [...this.local.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  }
}

const live = (records: Rec[]) => records.filter((r) => !r.deleted);

describe('randomized multi-device convergence', () => {
  const seeds = 150;

  for (let seed = 1; seed <= seeds; seed++) {
    it(`converges (seed ${seed})`, () => {
      const random = mulberry32(seed * 7919);
      const pick = <T,>(items: T[]): T => items[Math.floor(random() * items.length)]!;
      const deviceCount = 3 + Math.floor(random() * 3);
      const hasFastClock = random() < 0.3;
      const devices = Array.from({ length: deviceCount }, (_, i) => {
        const offset = hasFastClock && i === 0 ? FAST_CLOCK_OFFSET : Math.floor(random() * 11) - 5;
        return new Device(`d${i}`, offset);
      });

      let now = 1000;
      let state: ServerState = emptyServerState('server-a');
      let snapshot: ServerState | undefined;
      const options = { tombstoneRetentionMs: RETENTION, maxClockSkewMs: SKEW_WINDOW };

      const syncOnce = (device: Device, mode: 'normal' | 'lost' | 'duplicate-response' | 'duplicate-request') => {
        const request = device.buildRequest();
        let outcome = applySyncRequest(state, request, now, options);
        state = outcome.state;
        if (mode === 'duplicate-request') {
          outcome = applySyncRequest(state, request, now, options);
          state = outcome.state;
        }
        if (mode === 'lost') return;
        device.receive(outcome.response, request);
        if (mode === 'duplicate-response') device.receive(outcome.response, request);
      };

      for (let step = 0; step < 120; step++) {
        const device = pick(devices);
        const roll = random();
        if (roll < 0.4) {
          device.edit(`r${Math.floor(random() * IDS)}`, now, `${device.name}-${step}`, random() < 0.3);
        } else if (roll < 0.95) {
          const mode = pick(['normal', 'normal', 'normal', 'lost', 'duplicate-response', 'duplicate-request'] as const);
          syncOnce(device, mode);
        } else if (!snapshot) {
          snapshot = state;
        } else {
          // Operator restores an older backup and regenerates the server id.
          state = { ...snapshot, serverId: `server-${step}` };
          snapshot = undefined;
        }
        now += pick([0, 1, 1, 2, 5, 20]); // sometimes jumps far enough to age out tombstones
      }

      // Quiesce: sync everyone until a whole round changes nothing.
      let stable = false;
      for (let round = 0; round < 12 && !stable; round++) {
        const before = JSON.stringify([state.collections, devices.map((d) => d.snapshot())]);
        for (const device of devices) {
          now += 1;
          syncOnce(device, 'normal');
        }
        stable = JSON.stringify([state.collections, devices.map((d) => d.snapshot())]) === before;
      }
      expect(stable).toBe(true);

      const server = state.collections.owned.map((s) => s.record as Rec);
      const expectedLive = JSON.stringify(live(server));
      for (const device of devices) {
        expect(JSON.stringify(live(device.snapshot()))).toBe(expectedLive);
        // Where the server still holds a record, every device holds the identical version.
        const mine = new Map(device.snapshot().map((r) => [r.id, r]));
        for (const record of server) expect(mine.get(record.id)).toEqual(record);
      }
    });
  }
});

describe('mergePulledRecords', () => {
  it('reports local records that beat what was pulled, so they get pushed back', () => {
    const tombstone: Rec = { id: 'x', updatedAt: 5, value: 'v', deleted: true };
    const staleLive: Rec = { id: 'x', updatedAt: 1, value: 'v' };
    const { merged, toPush } = mergePulledRecords([tombstone], [staleLive, { id: 'y', updatedAt: 1, value: 'w' }]);
    expect(toPush).toEqual([tombstone]);
    expect(merged.map((r) => r.id)).toEqual(['x', 'y']);
    expect(merged[0]).toEqual(tombstone);
  });

  it('reports nothing when the pulled records win or tie', () => {
    const a: Rec = { id: 'x', updatedAt: 1, value: 'a' };
    expect(mergePulledRecords([a], [{ ...a, updatedAt: 2 }]).toPush).toEqual([]);
    expect(mergePulledRecords([a], [a]).toPush).toEqual([]);
  });
});

describe('resync after tombstone pruning', () => {
  it('converges a resurrected row with a device that kept its tombstone', () => {
    const options = { tombstoneRetentionMs: RETENTION };
    const offline = new Device('offline', 0);
    const deleter = new Device('deleter', 0);
    let state = emptyServerState('s');
    let now = 1000;
    const run = (device: Device) => {
      const request = device.buildRequest();
      const outcome = applySyncRequest(state, request, now++, options);
      state = outcome.state;
      device.receive(outcome.response, request);
    };

    deleter.edit('x', now, 'live', false);
    run(deleter);
    run(offline);
    deleter.edit('x', now, 'gone', true);
    run(deleter);
    now += RETENTION * 3;
    run(deleter); // prunes the tombstone

    offline.edit('unrelated', now, 'keeps offline edits', false);
    run(offline); // told to resync: it now pushes everything it holds
    run(offline); // resurrects x on the server
    run(deleter); // pulls the live copy but holds a newer tombstone, so it queues it for pushing
    run(deleter);
    run(offline);

    const server = state.collections.owned.map((s) => s.record as Rec);
    expect(server.find((r) => r.id === 'x')?.deleted).toBe(true);
    expect(live(offline.snapshot()).map((r) => r.id)).toEqual(['unrelated']);
    expect(live(deleter.snapshot()).map((r) => r.id)).toEqual(['unrelated']);
  });
});
