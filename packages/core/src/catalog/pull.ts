import type { RiftcodexCard } from '../types';

/** Settings for pulling the card list. Injected so tests can use tiny pages and no delays. */
export interface PullConfig {
  apiUrl: string;
  pageSize: number;
  userAgent: string;
  requestTimeoutMs: number;
  maxAttempts: number;
  retryDelayMs: number;
  /** Longest wait honoured from a Retry-After header. */
  maxRetryAfterMs: number;
  /** Largest allowed drop in record count versus the previous pull, in percent. */
  maxDropPercent: number;
}

export interface PullDeps {
  fetchFn: typeof fetch;
  sleep: (ms: number) => Promise<void>;
}

export class PullError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = 'PullError';
  }
}

const MILLIS_PER_SECOND = 1000;
const PERCENT = 100;
const SERVER_ERROR_MIN = 500;
const TOO_MANY_REQUESTS = 429;

interface CardsPage {
  items: unknown[];
  pages: number;
  total: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Minimal structural check of the fields the catalog build reads. */
export function isRawCard(value: unknown): value is RiftcodexCard {
  if (!isRecord(value)) return false;
  const { classification, set, media, metadata, attributes, text } = value;
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.riftbound_id === 'string' &&
    typeof value.collector_number === 'number' &&
    Array.isArray(value.tags) &&
    isRecord(classification) &&
    typeof classification.type === 'string' &&
    Array.isArray(classification.domain) &&
    isRecord(set) &&
    typeof set.set_id === 'string' &&
    isRecord(media) &&
    typeof media.image_url === 'string' &&
    isRecord(metadata) &&
    isRecord(attributes) &&
    isRecord(text)
  );
}

function parsePage(body: unknown, source: string): CardsPage {
  if (!isRecord(body) || !Array.isArray(body.items)) throw new PullError(`${source}: response has no items array`);
  const pages = body.pages;
  if (typeof pages !== 'number' || !Number.isInteger(pages) || pages < 1) {
    throw new PullError(`${source}: response has no valid page count`);
  }
  return { items: body.items, pages, total: typeof body.total === 'number' ? body.total : null };
}

function retryAfterMs(response: Response, config: PullConfig): number | null {
  const seconds = Number.parseFloat(response.headers.get('Retry-After') ?? '');
  return Number.isFinite(seconds) ? Math.min(seconds * MILLIS_PER_SECOND, config.maxRetryAfterMs) : null;
}

async function requestPage(page: number, config: PullConfig, deps: PullDeps): Promise<CardsPage> {
  const url = `${config.apiUrl}?page=${page}&size=${config.pageSize}`;
  let response: Response;
  try {
    response = await deps.fetchFn(url, {
      headers: { 'User-Agent': config.userAgent, Accept: 'application/json' },
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    });
  } catch (error) {
    throw new PullError(`network error for ${url}: ${String(error)}`, true);
  }
  if (response.status === TOO_MANY_REQUESTS || response.status >= SERVER_ERROR_MIN) {
    throw new PullError(`HTTP ${response.status} for ${url}`, true, retryAfterMs(response, config));
  }
  if (!response.ok) throw new PullError(`HTTP ${response.status} for ${url}`);
  try {
    return parsePage(await response.json(), url);
  } catch (error) {
    if (error instanceof PullError) throw error;
    throw new PullError(`invalid JSON from ${url}`, true);
  }
}

/** Fetch one page, retrying only network errors, 5xx and 429 (honouring Retry-After). */
export async function fetchPage(page: number, config: PullConfig, deps: PullDeps): Promise<CardsPage> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await requestPage(page, config, deps);
    } catch (error) {
      const retryable = error instanceof PullError && error.retryable;
      if (!retryable || attempt >= config.maxAttempts) throw error;
      await deps.sleep((error as PullError).retryAfterMs ?? config.retryDelayMs * attempt);
    }
  }
}

function checkPage(page: number, body: CardsPage, config: PullConfig, firstPages: number): void {
  if (body.pages !== firstPages) throw new PullError(`page ${page} reports ${body.pages} pages, expected ${firstPages}`);
  const isLast = page === firstPages;
  const expected = isLast ? null : config.pageSize;
  if (expected !== null && body.items.length !== expected) {
    throw new PullError(`page ${page} is truncated: ${body.items.length} of ${expected} records`);
  }
  if (isLast && body.items.length === 0) throw new PullError(`last page ${page} is empty`);
}

/** Fetch and validate every page. Throws on malformed, truncated or inconsistent responses. */
export async function fetchAllCards(config: PullConfig, deps: PullDeps): Promise<{ cards: RiftcodexCard[]; pages: number }> {
  const first = await fetchPage(1, config, deps);
  checkPage(1, first, config, first.pages);
  const items = [...first.items];
  for (let page = 2; page <= first.pages; page++) {
    const body = await fetchPage(page, config, deps);
    checkPage(page, body, config, first.pages);
    items.push(...body.items);
  }
  if (first.total !== null && first.total !== items.length) {
    throw new PullError(`API reports ${first.total} records but ${items.length} were received`);
  }
  const invalid = items.findIndex((item) => !isRawCard(item));
  if (invalid !== -1) throw new PullError(`record ${invalid} does not look like a Riftcodex card`);
  const cards = items as RiftcodexCard[];
  if (new Set(cards.map((card) => card.id)).size !== cards.length) throw new PullError('duplicate record ids in pull');
  return { cards, pages: first.pages };
}

/** Reject a pull that lost too many records compared with the previous one. */
export function assertNotShrunk(newCount: number, previousCount: number | null, config: PullConfig): void {
  if (previousCount === null || previousCount === 0) return;
  const dropPercent = ((previousCount - newCount) / previousCount) * PERCENT;
  if (dropPercent > config.maxDropPercent) {
    throw new PullError(
      `record count fell from ${previousCount} to ${newCount} (${dropPercent.toFixed(1)}%, limit ${config.maxDropPercent}%)`,
    );
  }
}

export interface PullMetadata {
  pulledAt: string;
  count: number;
  pages: number;
  source: string;
}

/** Command line flags as a set. Unknown flags fail, so a typo never silently falls back to the cache. */
export function parseFlags(argv: string[], supported: readonly string[]): Set<string> {
  const unknown = argv.filter((arg) => !supported.includes(arg));
  if (unknown.length > 0) {
    throw new PullError(`Unknown argument(s): ${unknown.join(' ')}. Supported: ${supported.join(' ')}`);
  }
  return new Set(argv);
}
