// Node-only file helpers for the catalog build script. Not exported from the package index.
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Catalog, RiftcodexCard } from '../types';
import type { PullMetadata } from './pull';

/** Error codes Windows raises when another process (a dev server) holds the destination open. */
const LOCKED_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);

function isLocked(error: unknown): boolean {
  return LOCKED_CODES.has((error as NodeJS.ErrnoException).code ?? '');
}

/**
 * Write via a temp file in the same directory, then rename, so readers never see a half written
 * file. If the destination is locked (Windows dev server), fall back to a plain copy over it,
 * which is best effort but starts only after the temp copy is complete. The temp file is
 * removed whatever happens.
 */
export function writeFileAtomic(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temp, contents);
    try {
      renameSync(temp, path);
    } catch (error) {
      if (!isLocked(error)) throw error;
      copyFileSync(temp, path);
    }
  } finally {
    rmSync(temp, { force: true });
  }
}

/** Parsed JSON, or null when the file does not exist. A file that exists but cannot be read is an error. */
export function readJsonIfExists<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (error) {
    throw new Error(`${path} exists but is not valid JSON (${String(error)}). Fix or delete it, then rerun.`);
  }
}

export interface RawCache {
  cards: RiftcodexCard[];
  metadata: PullMetadata;
}

/** Cached raw pull plus its sidecar metadata. Falls back to the file time when the sidecar is missing. */
export function readRawCache(rawPath: string, metaPath: string, source: string): RawCache | null {
  const cards = readJsonIfExists<RiftcodexCard[]>(rawPath);
  if (cards === null) return null;
  if (!Array.isArray(cards)) throw new Error(`${rawPath} is not a list of cards. Delete it and rerun with --refresh.`);
  const metadata =
    readJsonIfExists<PullMetadata>(metaPath) ??
    ({ pulledAt: statSync(rawPath).mtime.toISOString(), count: cards.length, pages: 0, source } satisfies PullMetadata);
  return { cards, metadata };
}

export function readPreviousCatalog(path: string): Catalog | null {
  const catalog = readJsonIfExists<Catalog>(path);
  if (catalog === null) return null;
  if (typeof catalog.printings !== 'object' || typeof catalog.cards !== 'object') {
    throw new Error(`${path} is not a catalog. Delete it to rebuild without the key guard.`);
  }
  return catalog;
}
