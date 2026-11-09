import type { Catalog } from '@sc/core';
import type { OwnedCount } from './grouping';
import { computeSetProgress, isPromoSet } from './sets';

export interface CollectionSummary {
  copies: number;
  uniquePrintings: number;
  totalPrintings: number;
  uniqueCards: number;
  totalCards: number;
  /** Main (non-promotional) sets whose standard printings are all owned. */
  mainSetsComplete: number;
  mainSets: number;
  /** Share of all printings owned, 0..100 with one decimal. */
  percentOwned: number;
}

export function summarizeCollection(catalog: Catalog, counts: Map<string, OwnedCount>): CollectionSummary {
  let copies = 0;
  const cardKeys = new Set<string>();
  for (const [printingKey, count] of counts) {
    copies += count.total;
    const printing = catalog.printings[printingKey];
    if (printing) cardKeys.add(printing.cardKey);
  }
  const labels = new Map(catalog.sets.map((set) => [set.setId, set]));
  const main = computeSetProgress(catalog, new Set(counts.keys()), true).filter((set) => {
    const meta = labels.get(set.setId);
    return meta ? !isPromoSet(meta) : true;
  });
  const totalPrintings = Object.keys(catalog.printings).length;
  return {
    copies,
    uniquePrintings: counts.size,
    totalPrintings,
    uniqueCards: cardKeys.size,
    totalCards: Object.keys(catalog.cards).length,
    mainSetsComplete: main.filter((set) => set.complete).length,
    mainSets: main.length,
    percentOwned: totalPrintings === 0 ? 0 : Math.round((counts.size / totalPrintings) * 1000) / 10,
  };
}
