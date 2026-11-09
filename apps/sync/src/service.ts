import { randomUUID } from 'node:crypto';
import { applySyncRequest, type ServerState, type SyncRequest, type SyncResponse } from '@sc/core';
import { assertWithinLimits, serializedBytes, type StateLimits } from './limits';
import { SerialQueue } from './queue';
import type { StateStore } from './store';

export interface SyncServiceOptions {
  store: StateStore;
  tombstoneRetentionMs: number;
  maxClockSkewMs: number;
  limits: StateLimits;
  /** Replace the stored serverId at startup, as after restoring an old backup. */
  regenerateServerId?: boolean;
  clock?: () => number;
}

export interface SyncResult {
  response: SyncResponse;
  /** Pushed records whose timestamps were pulled back to server time. */
  clamped: number;
}

/** Owns the in-memory server state. Requests are applied one at a time and persisted before they are acknowledged. */
export class SyncService {
  private readonly queue = new SerialQueue();
  private readonly clock: () => number;

  private constructor(
    private state: ServerState,
    private stateBytes: number,
    private readonly options: SyncServiceOptions,
  ) {
    this.clock = options.clock ?? Date.now;
  }

  static async open(options: SyncServiceOptions): Promise<SyncService> {
    const loaded = await options.store.load();
    const state = options.regenerateServerId ? { ...loaded, serverId: randomUUID() } : loaded;
    const service = new SyncService(state, serializedBytes(state), options);
    // Persist on open so a freshly generated server id survives a restart before any client syncs.
    await options.store.save(service.state);
    return service;
  }

  /** Stable id of this data set. */
  get serverId(): string {
    return this.state.serverId;
  }

  sync(request: SyncRequest): Promise<SyncResult> {
    return this.queue.run(async () => {
      const outcome = applySyncRequest(this.state, request, this.clock(), {
        tombstoneRetentionMs: this.options.tombstoneRetentionMs,
        maxClockSkewMs: this.options.maxClockSkewMs,
      });
      let bytes = this.stateBytes;
      if (outcome.changed) {
        // Caps are checked before anything is written or assigned, so a rejection leaves the state untouched.
        bytes = assertWithinLimits(this.state, outcome.state, this.options.limits, this.stateBytes);
        // Persist first: a failed write leaves memory unchanged and the client simply retries.
        await this.options.store.save(outcome.state);
      }
      this.state = outcome.state;
      this.stateBytes = bytes;
      return { response: outcome.response, clamped: outcome.clamped };
    });
  }

  /** Resolves when all accepted requests have been persisted. */
  idle(): Promise<void> {
    return this.queue.idle();
  }
}
