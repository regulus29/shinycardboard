// Fetches Riftcodex, builds the Catalog via @sc/core, writes apps/web/public/catalog.json.
// Usage: npx tsx scripts/build-catalog.ts [--refresh] [--accept-key-changes]
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalogDetailed } from '../packages/core/src/catalog/build';
import { assertNotShrunk, fetchAllCards, parseFlags, type PullConfig, type PullMetadata } from '../packages/core/src/catalog/pull';
import { readPreviousCatalog, readRawCache, writeFileAtomic } from '../packages/core/src/catalog/pullFiles';
import {
  aliasPreviousCardKeys,
  aliasPreviousKeys,
  findLostCardKeys,
  findLostKeys,
  type CatalogWithAliases,
} from '../packages/core/src/catalog/stability';
import { validateCatalog } from '../packages/core/src/catalog/validate';
import type { RiftcodexCard } from '../packages/core/src/types';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const CONFIG = {
  pull: {
    apiUrl: 'https://api.riftcodex.com/cards',
    pageSize: 100,
    /** The default fetch user agent is blocked by the API, so identify the client. */
    userAgent: 'shinycardboard/0.1',
    requestTimeoutMs: 60_000,
    maxAttempts: 3,
    retryDelayMs: 1_500,
    maxRetryAfterMs: 30_000,
    maxDropPercent: 5,
  } satisfies PullConfig,
  rawCachePath: resolve(ROOT, 'data/raw/cards.json'),
  rawMetaPath: resolve(ROOT, 'data/raw/cards.meta.json'),
  outputPath: resolve(ROOT, 'apps/web/public/catalog.json'),
  refreshFlag: '--refresh',
  acceptKeyChangesFlag: '--accept-key-changes',
  bytesPerKilobyte: 1024,
  maxListedProblems: 20,
  listSeparator: '\n- ',
} as const;

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

interface Pull {
  cards: RiftcodexCard[];
  metadata: PullMetadata;
  /** True when freshly fetched and not yet written to the cache. */
  fresh: boolean;
}

async function loadPull(refresh: boolean): Promise<Pull> {
  const cached = readRawCache(CONFIG.rawCachePath, CONFIG.rawMetaPath, CONFIG.pull.apiUrl);
  if (!refresh && cached) {
    console.log(`Using cached raw pull from ${cached.metadata.pulledAt} (use ${CONFIG.refreshFlag} to refetch)`);
    return { ...cached, fresh: false };
  }
  console.log(`Fetching ${CONFIG.pull.apiUrl} ...`);
  const { cards, pages } = await fetchAllCards(CONFIG.pull, { fetchFn: fetch, sleep });
  assertNotShrunk(cards.length, cached?.cards.length ?? null, CONFIG.pull);
  const metadata = { pulledAt: new Date().toISOString(), count: cards.length, pages, source: CONFIG.pull.apiUrl };
  return { cards, metadata, fresh: true };
}

function failIfInvalid(problems: string[]): boolean {
  if (problems.length === 0) return false;
  console.error(`Catalog invariants failed (${problems.length}):\n- ${problems.slice(0, CONFIG.maxListedProblems).join('\n- ')}`);
  return true;
}

async function main(): Promise<void> {
  const args = parseFlags(process.argv.slice(2), [CONFIG.refreshFlag, CONFIG.acceptKeyChangesFlag]);
  const pull = await loadPull(args.has(CONFIG.refreshFlag));
  const { catalog, report } = buildCatalogDetailed(pull.cards, pull.metadata.pulledAt);
  if (failIfInvalid(validateCatalog(catalog))) {
    process.exitCode = 1;
    return;
  }

  // Owned copies attach to printing and card keys, so a key that vanishes would orphan user data.
  // Keys of merged duplicates and renamed records are aliased to their replacement.
  const previous = readPreviousCatalog(CONFIG.outputPath);
  const keyAliases = previous
    ? aliasPreviousKeys(previous, catalog, report.duplicatesDropped, report.keyAliases)
    : report.keyAliases;
  const cardKeyAliases = previous ? aliasPreviousCardKeys(previous, catalog, keyAliases) : {};
  const withAliases: CatalogWithAliases = { ...catalog, keyAliases, cardKeyAliases };
  const lost = previous ? findLostKeys(previous, withAliases) : [];
  const lostCards = previous ? findLostCardKeys(previous, withAliases) : [];
  if ((lost.length > 0 || lostCards.length > 0) && !args.has(CONFIG.acceptKeyChangesFlag)) {
    console.error(`${lost.length} printing keys and ${lostCards.length} card keys disappeared without an alias, for example:`);
    console.error(`- ${[...lost, ...lostCards].slice(0, CONFIG.maxListedProblems).join(CONFIG.listSeparator)}`);
    console.error(`Review, then rerun with ${CONFIG.acceptKeyChangesFlag} if the change is intended.`);
    process.exitCode = 1;
    return;
  }

  // Everything validated: only now replace the cache and the output.
  if (pull.fresh) {
    writeFileAtomic(CONFIG.rawCachePath, JSON.stringify(pull.cards));
    writeFileAtomic(CONFIG.rawMetaPath, JSON.stringify(pull.metadata, null, 1));
  }
  const json = JSON.stringify(withAliases);
  writeFileAtomic(CONFIG.outputPath, json);

  console.log(`Raw records: ${report.inputCount} (pulled ${pull.metadata.pulledAt})`);
  console.log(`Printings: ${report.printingCount}  Cards: ${report.cardCount}`);
  const reasons = report.duplicatesDropped.reduce<Record<string, number>>((counts, drop) => {
    counts[drop.reason] = (counts[drop.reason] ?? 0) + 1;
    return counts;
  }, {});
  console.log(`Source duplicates removed: ${JSON.stringify(reasons)}  Skipped: ${report.skipped.length}`);
  console.log(`Printing keys disambiguated: ${report.disambiguatedKeys}  Lost keys accepted: ${lost.length + lostCards.length}  Aliases: ${Object.keys(keyAliases).length}`);
  console.log(`Sets: ${catalog.sets.map((set) => `${set.setId} ${set.count}`).join(', ')}`);
  for (const skipped of report.skipped.slice(0, CONFIG.maxListedProblems)) console.warn(`WARN skipped ${skipped.name}: ${skipped.reason}`);
  if (report.unrecognizedTermCount > 0) {
    console.warn(`WARN ${report.unrecognizedTermCount} bracket terms are not keywords: ${JSON.stringify(report.unrecognizedTerms)}`);
  }
  console.log(`Wrote ${CONFIG.outputPath} (${Math.round(Buffer.byteLength(json) / CONFIG.bytesPerKilobyte)} KB)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
