import { mkdir, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SYNC_COLLECTIONS, emptyServerState, validateSyncRecord, type ServerState } from '@sc/core';

export interface StateStore {
  /** Take any needed lock and read the persisted state. */
  load(): Promise<ServerState>;
  save(state: ServerState): Promise<void>;
  /** Release the lock. Safe to call more than once. */
  close?(): Promise<void>;
}

export const STATE_FILE_NAME = 'state.json';
export const LOCK_FILE_NAME = 'server.lock';
const TEMP_SUFFIX = '.tmp';

export class StoreLockedError extends Error {}

/** Parse and verify persisted state. Throws rather than returning something half valid. */
function parseState(text: string, file: string): ServerState {
  const corrupt = (why: string) => new Error(`State file ${file} is corrupt (${why}). Restore it from backup or move it aside`);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw corrupt('invalid JSON');
  }
  const state = raw as Partial<ServerState> | null;
  if (!state || typeof state.serverTime !== 'number' || !state.collections) throw corrupt('missing fields');
  for (const name of SYNC_COLLECTIONS) {
    const entries = state.collections[name];
    if (!Array.isArray(entries)) throw corrupt(`collection ${name} is not a list`);
    for (const entry of entries) {
      const problem = validateSyncRecord(entry?.record, `${name}.record`);
      if (problem || typeof entry.syncedAt !== 'number') throw corrupt(problem ?? 'bad syncedAt');
    }
  }
  // Files written before these fields existed get a fresh id and no pruning history.
  return {
    ...(state as ServerState),
    serverId: typeof state.serverId === 'string' && state.serverId ? state.serverId : emptyServerState().serverId,
    prunedBefore: typeof state.prunedBefore === 'number' ? state.prunedBefore : 0,
  };
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Single JSON snapshot on disk, replaced atomically so a crash never leaves a torn file. */
export class FileStateStore implements StateStore {
  private readonly file: string;
  private readonly lockFile: string;
  private writes = 0;
  private locked = false;

  constructor(private readonly dataDir: string) {
    this.file = path.join(dataDir, STATE_FILE_NAME);
    this.lockFile = path.join(dataDir, LOCK_FILE_NAME);
  }

  async load(): Promise<ServerState> {
    await mkdir(this.dataDir, { recursive: true });
    await this.acquireLock();
    try {
      await this.sweepTempFiles();
      return await this.readState();
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  private async readState(): Promise<ServerState> {
    try {
      return parseState(await readFile(this.file, 'utf8'), this.file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyServerState();
      throw error;
    }
  }

  /** Refuse to share a data directory with a live process; take over a lock left by a dead one. */
  private async acquireLock(): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await writeFile(this.lockFile, String(process.pid), { flag: 'wx' });
        this.locked = true;
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const holder = Number((await readFile(this.lockFile, 'utf8').catch(() => '')).trim());
        if (Number.isInteger(holder) && holder > 0 && processIsAlive(holder)) {
          throw new StoreLockedError(`Data directory ${this.dataDir} is in use by process ${holder}`);
        }
        await rm(this.lockFile, { force: true });
      }
    }
    throw new StoreLockedError(`Could not take the lock in ${this.dataDir}`);
  }

  /** Delete temp files left by a crash mid-write. */
  private async sweepTempFiles(): Promise<void> {
    const prefix = `${STATE_FILE_NAME}.`;
    const names = await readdir(this.dataDir);
    await Promise.all(
      names.filter((n) => n.startsWith(prefix) && n.endsWith(TEMP_SUFFIX)).map((n) => rm(path.join(this.dataDir, n), { force: true })),
    );
  }

  async save(state: ServerState): Promise<void> {
    const temp = `${this.file}.${process.pid}.${this.writes++}${TEMP_SUFFIX}`;
    try {
      const handle = await open(temp, 'w', 0o600);
      try {
        await handle.writeFile(JSON.stringify(state), 'utf8');
        await handle.sync(); // flush to disk before the rename makes it visible
      } finally {
        await handle.close();
      }
      await rename(temp, this.file);
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
    await this.syncDirectory();
  }

  /** Persist the rename itself. Not possible on every platform (Windows refuses), so failure is ignored. */
  private async syncDirectory(): Promise<void> {
    try {
      const handle = await open(this.dataDir, 'r');
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
    } catch {
      // Best effort only.
    }
  }

  async close(): Promise<void> {
    if (!this.locked) return;
    this.locked = false;
    await rm(this.lockFile, { force: true });
  }
}
