import type { Card } from '../types';
import type { FillSuggestion } from './deck-types';
import type { LegendContext } from './identity';

interface Option {
  card: Card;
  /** Copies still available to add. */
  available: number;
}

/** Fill rune slots one at a time from the rune the deck has the fewest of, so domains stay balanced. */
export function suggestRunes(options: Option[], have: Map<string, number>, remaining: number, ctx: LegendContext): FillSuggestion[] {
  const counts = new Map(have);
  const left = new Map(options.map((o) => [o.card.cardKey, o.available]));
  const picked = new Map<string, number>();
  for (let i = 0; i < remaining; i++) {
    const open = options
      .filter((o) => (left.get(o.card.cardKey) ?? 0) > 0)
      .sort((a, b) => (counts.get(a.card.cardKey) ?? 0) - (counts.get(b.card.cardKey) ?? 0) || a.card.cardKey.localeCompare(b.card.cardKey));
    const best = open[0];
    if (!best) break;
    const key = best.card.cardKey;
    left.set(key, (left.get(key) ?? 0) - 1);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    picked.set(key, (picked.get(key) ?? 0) + 1);
  }
  const domains = ctx.identity.join(' and ');
  return [...picked].map(([cardKey, count]) => ({
    cardKey,
    count,
    section: 'runes',
    reason: `Keeps the rune deck balanced across ${domains}`,
  }));
}

/** Battlefields not yet in the deck, lowest `rank` first (default all equal), then by key. */
export function suggestBattlefields(options: Option[], remaining: number, rank: (card: Card) => number = () => 0): FillSuggestion[] {
  return options
    .filter((o) => o.available > 0)
    .sort((a, b) => rank(a.card) - rank(b.card) || a.card.cardKey.localeCompare(b.card.cardKey))
    .slice(0, remaining)
    .map((o) => ({ cardKey: o.card.cardKey, count: 1, section: 'battlefields', reason: 'Battlefield for your open slots' }));
}
