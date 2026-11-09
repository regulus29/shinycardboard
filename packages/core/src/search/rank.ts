import { RARITIES } from '../catalog/vocabulary';
import type { Entry } from './index-build';
import type { MatchEnv } from './match';
import type { Clause, SortKey } from './types';

export interface Scored {
  entry: Entry;
  score: number;
}

/** Bonuses for how well the whole typed name matches the card name. */
const NAME_BONUS = {
  exact: 300,
  startsWith: 100,
  contiguous: 50,
  /** The typed words appear together, in order, in the rules text ("draw a card"). */
  rulesPhrase: 40,
} as const;

/**
 * Extra relevance for entries whose name matches the bare words as a whole. Only top-level,
 * non-negated words count, so `rebuttal` ranks the card named Rebuttal above names that merely contain it.
 */
export function nameBonus(clauses: Clause[]): (entry: Entry) => number {
  const words = clauses.flatMap((clause) => (clause.kind === 'word' && !clause.negated ? [clause.text] : []));
  const phrase = words.join(' ');
  if (!phrase) return () => 0;
  return ({ info }) => {
    if (info.nameFolded === phrase) return NAME_BONUS.exact;
    if (info.nameFolded.startsWith(phrase)) return NAME_BONUS.startsWith;
    if (words.length > 1 && info.nameFolded.includes(phrase)) return NAME_BONUS.contiguous;
    return words.length > 1 && info.rulesPadded.includes(` ${phrase}`) ? NAME_BONUS.rulesPhrase : 0;
  };
}

function rarityRank(rarity: string): number {
  const index = RARITIES.findIndex((known) => known.toLowerCase() === rarity.toLowerCase());
  return index === -1 ? RARITIES.length : index;
}

/** Compare two nullable numbers ascending, with missing values always last. */
function compareNullable(a: number | null, b: number | null, descending: boolean): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return descending ? b - a : a - b;
}

function primaryComparator(sort: SortKey, descending: boolean, env: MatchEnv): (a: Scored, b: Scored) => number {
  const direction = descending ? -1 : 1;
  switch (sort) {
    case 'relevance':
      return (a, b) => b.score - a.score;
    case 'name':
      return (a, b) => direction * a.entry.card.name.localeCompare(b.entry.card.name);
    case 'set':
      return (a, b) => direction * (a.entry.order - b.entry.order);
    case 'energy':
      return (a, b) => compareNullable(a.entry.card.energy, b.entry.card.energy, descending);
    case 'might':
      return (a, b) => compareNullable(a.entry.card.might, b.entry.card.might, descending);
    case 'rarity':
      return (a, b) => direction * (rarityRank(a.entry.printing.rarity) - rarityRank(b.entry.printing.rarity));
    case 'owned':
      return (a, b) =>
        direction * (env.owned(a.entry.printing.printingKey).total - env.owned(b.entry.printing.printingKey).total);
  }
}

/** Sort in place. Ties always fall back to set order and number, so results are stable and predictable. */
export function sortScored(scored: Scored[], sort: SortKey, descending: boolean, env: MatchEnv): Scored[] {
  const primary = primaryComparator(sort, descending, env);
  return scored.sort((a, b) => primary(a, b) || a.entry.order - b.entry.order);
}
