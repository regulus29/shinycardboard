import { randomUUID } from 'node:crypto';
import { link as hardLink, mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SYNC_COLLECTIONS, emptyServerState, validateSyncRecord, type ServerState } from '@sc/core';
import { CONFIG_DEFAULTS } from './config';

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
/** Hard link errors meaning links are unavailable here, so the lock falls back to exclusive create. */
const LINK_UNSUPPORTED_CODES = new Set(['EPERM', 'ENOSYS', 'EXDEV']);

export type LinkFn = (existing: string, created: string) => Promise<void>;

export interface FileStoreOptions {
  lockGraceMs?: number;
  /** Replaceable so tests can simulate filesystems without hard links. */
  link?: LinkFn;
}

export class StoreLockedError extends Error {}

const errorCode = (error: unknown): string | undefined => (error as NodeJS.ErrnoException).code;

/** A lock file's pid, or undefined when the text is empty or not a positive integer. */
function parsePid(text: string): number | undefined {
  const pid = Number(text.trim());
  return Number.isInteger(pid) && pid > 0 ? pid : undefined;
}

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
  private readonly lockGraceMs: number;
  private readonly link: LinkFn;
  private linkSupported = true;
  private writes = 0;
  private locked = false;

  constructor(
    private readonly dataDir: string,
    options: FileStoreOptions = {},
  ) {
    this.file = path.join(dataDir, STATE_FILE_NAME);
    this.lockFile = path.join(dataDir, LOCK_FILE_NAME);
    this.lockGraceMs = options.lockGraceMs ?? CONFIG_DEFAULTS.lockGraceMs;
    this.link = options.link ?? hardLink;
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
    if (!(await this.createLock())) {
      await this.removeStaleLock();
      // The retry is the last attempt: if someone else won the race, refuse.
      if (!(await this.createLock())) {
        throw new StoreLockedError(`Data directory ${this.dataDir} was taken by another process`);
      }
    }
    this.locked = true;
  }

  /** True when this process created the lock file, false when it already exists. */
  private async createLock(): Promise<boolean> {
    if (this.linkSupported) {
      try {
        return await this.linkLock();
      } catch (error) {
        if (!LINK_UNSUPPORTED_CODES.has(errorCode(error) ?? '')) throw error;
        this.linkSupported = false;
      }
    }
    return this.exclusiveCreateLock();
  }

  /** The pid is fully written to a private temp file before the lock name appears, so no reader sees it empty. */
  private async linkLock(): Promise<boolean> {
    const temp = path.join(this.dataDir, `${LOCK_FILE_NAME}.${randomUUID()}${TEMP_SUFFIX}`);
    await writeFile(temp, String(process.pid), { flag: 'wx' });
    try {
      await this.link(temp, this.lockFile);
      return true;
    } catch (error) {
      if (errorCode(error) === 'EEXIST') return false;
      throw error;
    } finally {
      await rm(temp, { force: true });
    }
  }

  /** Fallback without hard links. The file can be briefly empty, which the grace period covers. */
  private async exclusiveCreateLock(): Promise<boolean> {
    try {
      await writeFile(this.lockFile, String(process.pid), { flag: 'wx' });
      return true;
    } catch (error) {
      if (errorCode(error) === 'EEXIST') return false;
      throw error;
    }
  }

  /** Throws if the lock belongs to a live process or is a fresh unreadable file. Otherwise removes that exact file. */
  private async removeStaleLock(): Promise<void> {
    const seen = await this.readLockSnapshot();
    if (!seen) return;
    const holder = parsePid(seen.text);
    if (holder === undefined) {
      if (Date.now() - seen.mtimeMs < this.lockGraceMs) {
        throw new StoreLockedError(`Data directory ${this.dataDir} is being locked by another process`);
      }
    } else if (processIsAlive(holder)) {
      throw new StoreLockedError(`Data directory ${this.dataDir} is in use by process ${holder}`);
    }
    // Remove only the file judged stale, so a lock created in the meantime survives.
    const current = await this.readLockSnapshot();
    if (current?.text === seen.text && current.mtimeMs === seen.mtimeMs) {
      await rm(this.lockFile, { force: true });
    }
  }

  private async readLockSnapshot(): Promise<{ text: string; mtimeMs: number } | undefined> {
    try {
      const [text, info] = await Promise.all([readFile(this.lockFile, 'utf8'), stat(this.lockFile)]);
      return { text, mtimeMs: info.mtimeMs };
    } catch {
      return undefined;
    }
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
