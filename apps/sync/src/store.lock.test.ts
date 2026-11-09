import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileStateStore, LOCK_FILE_NAME, StoreLockedError, type FileStoreOptions } from './store';

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url));
const RACER = fileURLToPath(new URL('./test-helpers/lock-racer.ts', import.meta.url));
const RACERS = 4;
const LONG_GRACE_MS = 60_000;
const DEAD_PID = '2147483646';

let dir = '';
const lockPath = () => path.join(dir, LOCK_FILE_NAME);
/** A fake link(2) that always fails with the given error code. */
const failingLink = (code: string) => async () => {
  throw Object.assign(new Error(code), { code });
};
const eexist = failingLink('EEXIST');
const exdev = failingLink('EXDEV');

async function openStore(options: FileStoreOptions = {}): Promise<FileStateStore> {
  const store = new FileStateStore(dir, options);
  await store.load();
  return store;
}

interface Racer {
  child: ChildProcess;
  outcome: Promise<string>;
  exited: Promise<void>;
}

function startRacer(): Racer {
  const child = spawn(process.execPath, ['--import', 'tsx', RACER, dir], { cwd: APP_ROOT, stdio: ['pipe', 'pipe', 'inherit'] });
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  const outcome = new Promise<string>((resolve) => {
    child.stdout?.setEncoding('utf8');
    child.stdout?.once('data', (chunk: string) => resolve(chunk.trim()));
    child.once('exit', () => resolve('exited'));
  });
  return { child, outcome, exited };
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'sc-sync-lock-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('lock acquisition', () => {
  it('takes over a lock held by a dead process', async () => {
    await writeFile(lockPath(), DEAD_PID);
    const store = await openStore();
    expect(await readFile(lockPath(), 'utf8')).toBe(String(process.pid));
    await store.close();
    expect(await readdir(dir)).toEqual([]);
  });

  it('refuses a lock held by a live process', async () => {
    await writeFile(lockPath(), String(process.pid));
    await expect(openStore()).rejects.toBeInstanceOf(StoreLockedError);
    expect(await readFile(lockPath(), 'utf8')).toBe(String(process.pid));
  });

  it('refuses an empty lock file younger than the grace period', async () => {
    await writeFile(lockPath(), '');
    await expect(openStore({ lockGraceMs: LONG_GRACE_MS })).rejects.toBeInstanceOf(StoreLockedError);
  });

  it('takes over an empty lock file older than the grace period', async () => {
    await writeFile(lockPath(), '');
    const hourAgo = (Date.now() - 3_600_000) / 1000;
    await utimes(lockPath(), hourAgo, hourAgo);
    const store = await openStore({ lockGraceMs: LONG_GRACE_MS });
    expect(await readFile(lockPath(), 'utf8')).toBe(String(process.pid));
    await store.close();
  });

  it('refuses when the retry after removing a stale lock finds it taken again', async () => {
    await writeFile(lockPath(), DEAD_PID);
    await expect(openStore({ link: eexist })).rejects.toBeInstanceOf(StoreLockedError);
  });

  it('falls back to exclusive create when hard links are unsupported, and still refuses a live holder', async () => {
    const store = await openStore({ link: exdev });
    expect(await readFile(lockPath(), 'utf8')).toBe(String(process.pid));
    await store.close();

    await writeFile(lockPath(), String(process.pid));
    await expect(openStore({ link: exdev })).rejects.toBeInstanceOf(StoreLockedError);
  });

  it('leaves no temp files next to the lock', async () => {
    const store = await openStore();
    expect(await readdir(dir)).toEqual([LOCK_FILE_NAME]);
    await store.close();
  });
});

describe('lock race across processes', () => {
  it('lets exactly one of four racing processes take the lock', async () => {
    const racers = Array.from({ length: RACERS }, () => startRacer());
    const outcomes = await Promise.all(racers.map((racer) => racer.outcome));

    expect(outcomes.filter((o) => o === 'won')).toHaveLength(1);
    expect(outcomes.filter((o) => o === 'locked')).toHaveLength(RACERS - 1);

    racers.forEach((racer) => racer.child.stdin?.end());
    await Promise.all(racers.map((racer) => racer.exited));
    expect(await readdir(dir)).toEqual([]);
  }, 30_000);
});
