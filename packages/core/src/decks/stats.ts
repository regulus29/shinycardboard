import type { Catalog, Deck, Domain } from '../types';
import type { DeckStats } from './deck-types';
import { mergeSlots, sumCounts } from './slots';

/**
 * Stats over the main deck (the chosen champion included, runes and battlefields not).
 * Unknown cardKeys count toward mainCount but not toward any breakdown.
 */
export function deckStats(deck: Deck, catalog: Catalog): DeckStats {
  const main = mergeSlots(deck.main ?? []);
  const stats: DeckStats = { mainCount: sumCounts(main), curve: {}, byType: {}, byDomain: {}, averageEnergy: 0 };
  let energySum = 0;
  let energyCount = 0;
  for (const [cardKey, count] of main) {
    const card = catalog.cards[cardKey];
    if (!card) continue;
    stats.byType[card.type] = (stats.byType[card.type] ?? 0) + count;
    for (const domain of new Set<Domain>(card.domains)) {
      stats.byDomain[domain] = (stats.byDomain[domain] ?? 0) + count;
    }
    if (card.energy === null) continue;
    stats.curve[card.energy] = (stats.curve[card.energy] ?? 0) + count;
    energySum += card.energy * count;
    energyCount += count;
  }
  stats.averageEnergy = energyCount === 0 ? 0 : energySum / energyCount;
  return stats;
}
