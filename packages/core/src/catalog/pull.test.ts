import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RiftcodexCard } from '../types';
import { assertNotShrunk, fetchAllCards, fetchPage, isRawCard, parseFlags, PullError, type PullConfig } from './pull';
import { readPreviousCatalog, readRawCache, writeFileAtomic } from './pullFiles';
import { rawCard } from './test-data';

const CONFIG: PullConfig = {
  apiUrl: 'https://api.example/cards',
  pageSize: 2,
  userAgent: 'test/1',
  requestTimeoutMs: 1000,
  maxAttempts: 3,
  retryDelayMs: 10,
  maxRetryAfterMs: 5000,
  maxDropPercent: 5,
};

const cards = (count: number): RiftcodexCard[] =>
  Array.from({ length: count }, (_, i) => rawCard({ id: `c${i}`, name: `Card ${i}`, riftbound_id: `tst-${i}-1` }));

type Reply = Response | Error;
const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), init);

/** A fake fetch that serves queued replies in order and records every request. */
function fakeFetch(replies: Reply[]) {
  const calls: { url: string; userAgent: string | null }[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), userAgent: new Headers(init?.headers).get('User-Agent') });
    const reply = replies.shift();
    if (reply === undefined) throw new Error('no reply queued');
    if (reply instanceof Error) throw reply;
    return reply;
  }) as typeof fetch;
  return { fetchFn, calls };
}

function deps(replies: Reply[]) {
  const sleeps: number[] = [];
  const fake = fakeFetch(replies);
  return { ...fake, sleeps, deps: { fetchFn: fake.fetchFn, sleep: async (ms: number) => void sleeps.push(ms) } };
}

describe('fetchAllCards', () => {
  it('pages through the API with a descriptive user agent and returns every record', async () => {
    const all = cards(5);
    const ctx = deps([
      json({ items: all.slice(0, 2), pages: 3, total: 5 }),
      json({ items: all.slice(2, 4), pages: 3, total: 5 }),
      json({ items: all.slice(4), pages: 3, total: 5 }),
    ]);
    const result = await fetchAllCards(CONFIG, ctx.deps);
    expect(result.cards.map((c) => c.id)).toEqual(['c0', 'c1', 'c2', 'c3', 'c4']);
    expect(result.pages).toBe(3);
    expect(ctx.calls.map((c) => c.url)).toEqual([
      'https://api.example/cards?page=1&size=2',
      'https://api.example/cards?page=2&size=2',
      'https://api.example/cards?page=3&size=2',
    ]);
    expect(ctx.calls.every((c) => c.userAgent === 'test/1')).toBe(true);
  });

  it('rejects a truncated middle page', async () => {
    const all = cards(5);
    const ctx = deps([json({ items: all.slice(0, 2), pages: 3 }), json({ items: all.slice(2, 3), pages: 3 }), json({ items: all.slice(3), pages: 3 })]);
    await expect(fetchAllCards(CONFIG, ctx.deps)).rejects.toThrow(/page 2 is truncated/);
  });

  it('rejects an empty last page, a total mismatch, bad records and duplicate ids', async () => {
    const all = cards(3);
    await expect(fetchAllCards(CONFIG, deps([json({ items: all.slice(0, 2), pages: 2 }), json({ items: [], pages: 2 })]).deps)).rejects.toThrow(/empty/);
    await expect(
      fetchAllCards(CONFIG, deps([json({ items: all.slice(0, 2), pages: 2, total: 9 }), json({ items: all.slice(2), pages: 2, total: 9 })]).deps),
    ).rejects.toThrow(/reports 9 records/);
    await expect(fetchAllCards(CONFIG, deps([json({ items: [{ id: 'x' }], pages: 1 })]).deps)).rejects.toThrow(/does not look like/);
    const twin = [all[0] as RiftcodexCard, all[0] as RiftcodexCard];
    await expect(fetchAllCards(CONFIG, deps([json({ items: twin, pages: 1 })]).deps)).rejects.toThrow(/duplicate record ids/);
  });

  it('rejects responses without a valid shape', async () => {
    await expect(fetchAllCards(CONFIG, deps([json([])]).deps)).rejects.toThrow(/no items array/);
    await expect(fetchAllCards(CONFIG, deps([json({ items: [], pages: 0 })]).deps)).rejects.toThrow(/page count/);
  });
});

describe('fetchPage retries', () => {
  const ok = () => json({ items: cards(1), pages: 1 });

  it('retries network errors, 5xx and 429 (honouring Retry-After, capped)', async () => {
    const ctx = deps([
      new TypeError('connection reset'),
      json({}, { status: 503 }),
      json({}, { status: 429, headers: { 'Retry-After': '2' } }),
      ok(),
    ]);
    await expect(fetchPage(1, { ...CONFIG, maxAttempts: 4 }, ctx.deps)).resolves.toMatchObject({ pages: 1 });
    expect(ctx.sleeps).toEqual([10, 20, 2000]);
    const capped = deps([json({}, { status: 429, headers: { 'Retry-After': '999' } }), ok()]);
    await fetchPage(1, CONFIG, capped.deps);
    expect(capped.sleeps).toEqual([5000]);
  });

  it('does not retry client errors, and gives up after the attempt limit', async () => {
    const notFound = deps([json({}, { status: 404 }), ok()]);
    await expect(fetchPage(1, CONFIG, notFound.deps)).rejects.toThrow(/HTTP 404/);
    expect(notFound.calls).toHaveLength(1);
    const down = deps([json({}, { status: 500 }), json({}, { status: 500 }), json({}, { status: 500 }), ok()]);
    await expect(fetchPage(1, CONFIG, down.deps)).rejects.toBeInstanceOf(PullError);
    expect(down.calls).toHaveLength(3);
  });
});

describe('pull safety checks', () => {
  it('recognises card shaped records only', () => {
    expect(isRawCard(rawCard())).toBe(true);
    expect(isRawCard({ id: 'x' })).toBe(false);
    expect(isRawCard(null)).toBe(false);
  });

  it('rejects a pull that shrinks past the allowed percentage', () => {
    expect(() => assertNotShrunk(96, 100, CONFIG)).not.toThrow();
    expect(() => assertNotShrunk(94, 100, CONFIG)).toThrow(/fell from 100 to 94/);
    expect(() => assertNotShrunk(5, null, CONFIG)).not.toThrow();
    expect(() => assertNotShrunk(500, 100, CONFIG)).not.toThrow();
  });
});

describe('cache files', () => {
  it('writes atomically without leaving temp files and reads the sidecar pull time', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sc-pull-'));
    try {
      const raw = join(dir, 'raw', 'cards.json');
      const meta = join(dir, 'raw', 'cards.meta.json');
      writeFileAtomic(raw, JSON.stringify(cards(2)));
      writeFileAtomic(meta, JSON.stringify({ pulledAt: '2026-01-02T03:04:05.000Z', count: 2, pages: 1, source: 's' }));
      writeFileAtomic(raw, JSON.stringify(cards(3)));
      expect(readdirSync(join(dir, 'raw')).sort()).toEqual(['cards.json', 'cards.meta.json']);
      const cache = readRawCache(raw, meta, 's');
      expect(cache?.cards).toHaveLength(3);
      expect(cache?.metadata.pulledAt).toBe('2026-01-02T03:04:05.000Z');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falls back to file time without a sidecar and fails loudly on corrupt caches', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sc-pull-'));
    try {
      const raw = join(dir, 'cards.json');
      writeFileSync(raw, JSON.stringify(cards(1)));
      expect(readRawCache(raw, join(dir, 'missing.json'), 's')?.metadata.count).toBe(1);
      writeFileSync(raw, '{not json');
      expect(() => readRawCache(raw, join(dir, 'missing.json'), 's')).toThrow(/not valid JSON/);
      expect(readRawCache(join(dir, 'nothing.json'), join(dir, 'missing.json'), 's')).toBeNull();
      expect(readFileSync(raw, 'utf8')).toBe('{not json');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('script safety', () => {
  it('rejects unknown flags', () => {
    expect(parseFlags(['--refresh'], ['--refresh', '--accept-key-changes'])).toEqual(new Set(['--refresh']));
    expect(() => parseFlags(['--refesh'], ['--refresh'])).toThrow(/Unknown argument\(s\): --refesh/);
  });

  it('removes its temp file when the write fails', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sc-pull-'));
    try {
      // The destination is a directory, so neither rename nor copy can succeed.
      const target = join(dir, 'target');
      mkdirSync(target);
      expect(() => writeFileAtomic(target, 'data')).toThrow();
      expect(readdirSync(dir)).toEqual(['target']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails loudly on a corrupt previous catalog or raw cache instead of skipping the guards', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sc-pull-'));
    try {
      const file = join(dir, 'catalog.json');
      expect(readPreviousCatalog(file)).toBeNull();
      writeFileSync(file, '{"truncated":');
      expect(() => readPreviousCatalog(file)).toThrow(/not valid JSON/);
      writeFileSync(file, '{"cards":{}}');
      expect(() => readPreviousCatalog(file)).toThrow(/not a catalog/);
      writeFileSync(file, '{"not":"a list"}');
      expect(() => readRawCache(file, join(dir, 'meta.json'), 's')).toThrow(/not a list of cards/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
