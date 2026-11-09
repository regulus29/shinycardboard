import { applySyncRequest, type ServerState, type SyncRequest, type SyncResponse } from '@sc/core';
import { SerialQueue } from './queue';
import type { StateStore } from './store';

export interface SyncServiceOptions {
  store: StateStore;
  tombstoneRetentionMs: number;
  maxClockSkewMs: number;
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
    private readonly options: SyncServiceOptions,
  ) {
    this.clock = options.clock ?? Date.now;
  }

  static async open(options: SyncServiceOptions): Promise<SyncService> {
    const service = new SyncService(await options.store.load(), options);
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
      // Persist first: a failed write leaves memory unchanged and the client simply retries.
      if (outcome.changed) await this.options.store.save(outcome.state);
      this.state = outcome.state;
      return { response: outcome.response, clamped: outcome.clamped };
    });
  }

  /** Resolves when all accepted requests have been persisted. */
  idle(): Promise<void> {
    return this.queue.idle();
  }
}
