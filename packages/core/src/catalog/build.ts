import type { Card, Catalog, Printing, RiftcodexCard } from '../types';
import { assignPrintingKeys, baseKey, legacyKey, type KeyInput } from './keys';
import { compareStandardFirst, comparePrintings, setRank } from './order';
import { dropDuplicates, type DuplicateDrop } from './dedupe';
import { unifyLegendNames } from './legends';
import { assignCardKeys, isSkipped, prepare, resolveMarkerVariants, type Prepared, type Skipped } from './prepare';
import { cleanRulesText, parseKeywords, unrecognizedTerms } from './text';

export interface BuildReport {
  inputCount: number;
  printingCount: number;
  cardCount: number;
  skipped: Skipped[];
  duplicatesDropped: DuplicateDrop[];
  /** Printing keys that needed a disambiguating suffix because source id and variant collided. */
  disambiguatedKeys: number;
  /** Bracketed rules terms that are not keywords, with counts, to spot new mechanics after a refresh. */
  unrecognizedTerms: Record<string, number>;
  /** Number of distinct unrecognised bracket terms; a jump after a refresh means a new mechanic. */
  unrecognizedTermCount: number;
  /**
   * Old-format printing key to current key, only where the old key named exactly one printing.
   * Stored with the catalog so owned copies saved under old keys can be migrated.
   */
  keyAliases: Record<string, string>;
}

interface Built {
  item: Prepared;
  cardKey: string;
  printing: Printing;
}

function toPrinting(item: Prepared, cardKey: string, printingKey: string): Printing {
  const { record } = item;
  return {
    printingKey,
    cardKey,
    setId: record.set.set_id,
    setLabel: record.set.label,
    collectorNumber: record.collector_number,
    riftboundId: record.riftbound_id,
    variant: item.variant,
    variantLabel: item.variantLabel,
    rarity: record.classification.rarity,
    imageUrl: record.media.image_url,
    artist: record.media.artist,
    sourceId: record.id,
    tcgplayerId: record.tcgplayer_id,
  };
}

/** Tags across all printings, representative printing first, without duplicates. */
function unionTags(lists: string[][]): string[] {
  return [...new Set(lists.flat())];
}

function toCard(cardKey: string, members: Built[]): Card {
  const ordered = [...members].sort((a, b) => compareStandardFirst(a.printing, b.printing));
  const { item } = ordered[0] as Built;
  const { record } = item;
  const rulesText = cleanRulesText(record.text.rich, record.text.plain);
  return {
    cardKey,
    name: item.baseName,
    type: item.type,
    supertype: record.classification.supertype,
    domains: item.domains,
    energy: record.attributes.energy,
    might: record.attributes.might,
    power: record.attributes.power,
    rulesText,
    tags: unionTags(ordered.map((member) => member.item.record.tags)),
    keywords: parseKeywords(rulesText),
    printingKeys: ordered.map((member) => member.printing.printingKey),
  };
}

function buildKeyAliases(built: Built[]): Record<string, string> {
  const targets = new Map<string, string[]>();
  for (const { item, printing } of built) {
    const old = legacyKey({ ...printing, variantSlug: item.variantSlug });
    targets.set(old, [...(targets.get(old) ?? []), printing.printingKey]);
  }
  const aliases: Record<string, string> = {};
  for (const [old, keys] of targets) {
    const [only] = keys;
    if (keys.length === 1 && only !== undefined && only !== old) aliases[old] = only;
  }
  return aliases;
}

function groupByCard(built: Built[]): Map<string, Built[]> {
  const groups = new Map<string, Built[]>();
  for (const entry of built) {
    const group = groups.get(entry.cardKey);
    if (group) group.push(entry);
    else groups.set(entry.cardKey, [entry]);
  }
  return groups;
}

function summarizeSets(printings: Printing[]): Catalog['sets'] {
  const sets = new Map<string, { setId: string; label: string; count: number }>();
  for (const printing of printings) {
    const entry = sets.get(printing.setId) ?? { setId: printing.setId, label: printing.setLabel, count: 0 };
    entry.count += 1;
    sets.set(printing.setId, entry);
  }
  return [...sets.values()].sort(
    (a, b) => setRank(a.setId) - setRank(b.setId) || a.setId.localeCompare(b.setId),
  );
}

function countUnrecognized(items: Prepared[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const text = cleanRulesText(item.record.text.rich, item.record.text.plain);
    for (const term of unrecognizedTerms(text)) counts[term] = (counts[term] ?? 0) + 1;
  }
  return counts;
}

/**
 * Convert raw Riftcodex records into the normalized Catalog, plus a report of what was
 * skipped, merged or disambiguated. Deterministic: the same records in any order give the same catalog.
 */
export function buildCatalogDetailed(
  raw: RiftcodexCard[],
  builtAt: string,
): { catalog: Catalog; report: BuildReport } {
  const prepared = raw.map(prepare);
  const skipped = prepared.filter(isSkipped);
  const usable = resolveMarkerVariants(prepared.filter((entry): entry is Prepared => !isSkipped(entry)));
  const { kept: deduped, drops } = dropDuplicates(usable);
  const kept = unifyLegendNames(deduped);

  const cardKeys = assignCardKeys(kept);
  const keyInputs: KeyInput[] = kept.map((item) => ({
    riftboundId: item.record.riftbound_id,
    setId: item.record.set.set_id,
    variantSlug: item.keySlug ?? item.variantSlug,
    tcgplayerId: item.record.tcgplayer_id,
    sourceId: item.record.id,
  }));
  const printingKeys = assignPrintingKeys(keyInputs);
  const built: Built[] = kept
    .map((item, index) => ({
      item,
      cardKey: cardKeys[index] as string,
      printing: toPrinting(item, cardKeys[index] as string, printingKeys[index] as string),
    }))
    .sort((a, b) => comparePrintings(a.printing, b.printing));

  const cards: Record<string, Card> = {};
  for (const [cardKey, members] of [...groupByCard(built)].sort(([a], [b]) => a.localeCompare(b))) {
    cards[cardKey] = toCard(cardKey, members);
  }
  const printings: Record<string, Printing> = {};
  for (const { printing } of built) printings[printing.printingKey] = printing;

  const catalog: Catalog = { builtAt, cards, printings, sets: summarizeSets(built.map((b) => b.printing)) };
  const unrecognizedTerms = countUnrecognized(kept);
  const report: BuildReport = {
    inputCount: raw.length,
    printingCount: built.length,
    cardCount: Object.keys(cards).length,
    skipped,
    duplicatesDropped: drops,
    disambiguatedKeys: printingKeys.filter((key, i) => key !== baseKey(keyInputs[i] as KeyInput)).length,
    unrecognizedTerms,
    unrecognizedTermCount: Object.keys(unrecognizedTerms).length,
    keyAliases: buildKeyAliases(built),
  };
  return { catalog, report };
}

/** Convert raw Riftcodex records into the normalized Catalog. */
export function buildCatalog(raw: RiftcodexCard[], builtAt: string): Catalog {
  return buildCatalogDetailed(raw, builtAt).catalog;
}
