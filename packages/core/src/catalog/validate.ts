import type { Catalog } from '../types';
import { legendTitle } from './legends';
import { slugify } from './slug';

/** Supertypes that legitimately have several standard printings in one set (numbered tokens). */
const MULTI_STANDARD_SUPERTYPES: readonly string[] = ['Token'];


/**
 * Cards with more than one standard printing in the same set, which usually means a stale
 * source record leaked through. Numbered tokens are exempt.
 */
export function findDuplicateStandards(catalog: Catalog): string[] {
  const found = new Map<string, string[]>();
  for (const printing of Object.values(catalog.printings)) {
    if (printing.variant !== 'standard') continue;
    if (MULTI_STANDARD_SUPERTYPES.includes(catalog.cards[printing.cardKey]?.supertype ?? '')) continue;
    const key = `${printing.cardKey} in ${printing.setId}`;
    found.set(key, [...(found.get(key) ?? []), printing.printingKey]);
  }
  return [...found].filter(([, keys]) => keys.length > 1).map(([key, keys]) => `${key}: ${keys.join(', ')}`);
}

/** Legends that share a title are the same legend recorded under different name forms. */
export function findDuplicateLegends(catalog: Catalog): string[] {
  const byTitle = new Map<string, string[]>();
  for (const card of Object.values(catalog.cards)) {
    if (card.type !== 'Legend') continue;
    const title = slugify(legendTitle(card.name));
    byTitle.set(title, [...(byTitle.get(title) ?? []), card.cardKey]);
  }
  return [...byTitle].filter(([, keys]) => keys.length > 1).map(([title, keys]) => `legend "${title}": ${keys.join(', ')}`);
}

/**
 * Check structural invariants of a built catalog. Returns human readable problems;
 * an empty list means the catalog is consistent.
 */
export function validateCatalog(catalog: Catalog): string[] {
  const problems: string[] = [];
  const printings = Object.entries(catalog.printings);
  if (printings.length === 0) problems.push('catalog has no printings');

  const seenSourceIds = new Set<string>();
  for (const [key, printing] of printings) {
    if (printing.printingKey !== key) problems.push(`printing keyed "${key}" has printingKey "${printing.printingKey}"`);
    if (!printing.imageUrl) problems.push(`printing ${key} has no image url`);
    if (seenSourceIds.has(printing.sourceId)) problems.push(`source id ${printing.sourceId} used by more than one printing`);
    seenSourceIds.add(printing.sourceId);
    const card = catalog.cards[printing.cardKey];
    if (!card) problems.push(`printing ${key} points at missing card ${printing.cardKey}`);
    else if (!card.printingKeys.includes(key)) problems.push(`card ${card.cardKey} does not list printing ${key}`);
  }

  for (const [key, card] of Object.entries(catalog.cards)) {
    if (card.cardKey !== key) problems.push(`card keyed "${key}" has cardKey "${card.cardKey}"`);
    if (card.printingKeys.length === 0) problems.push(`card ${key} has no printings`);
    for (const printingKey of card.printingKeys) {
      if (catalog.printings[printingKey]?.cardKey !== key) problems.push(`card ${key} lists foreign printing ${printingKey}`);
    }
  }

  problems.push(...findDuplicateStandards(catalog).map((entry) => `duplicate standard printings: ${entry}`));
  problems.push(...findDuplicateLegends(catalog).map((entry) => `duplicate legend: ${entry}`));

  const setTotal = catalog.sets.reduce((sum, set) => sum + set.count, 0);
  if (setTotal !== printings.length) problems.push(`set counts add up to ${setTotal}, expected ${printings.length}`);
  return problems;
}
