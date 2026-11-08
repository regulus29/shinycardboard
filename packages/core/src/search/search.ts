import type { Card, Catalog, OwnedEntry, Printing } from '../types';

/** User state the search needs to evaluate owned:, tag: and deck: filters. */
export interface SearchContext {
  owned: OwnedEntry[];
  /** cardKey to user tags. */
  tagsByCard: Record<string, string[]>;
  /** cardKey to names of decks that use the card. */
  decksByCard: Record<string, string[]>;
}

export interface SearchHit {
  printing: Printing;
  card: Card;
  /** Higher is a better match. Used for ordering when no sort is requested. */
  score: number;
}

export interface ParseWarning {
  token: string;
  message: string;
}

/**
 * Query language (case insensitive, all terms ANDed, `OR` and parentheses optional stretch):
 *  - Bare set plus number in any form: `ogn 42`, `OGN-042`, `ogn042`, `unl 29a`, `ogn #42`
 *  - Bare words match name, then domain/type/rarity/keyword names (`fury unit`), with typo tolerance
 *  - `field:value` and comparisons: set, number, type, domain, rarity, energy (alias cost),
 *    might, text, keyword, tag, variant, owned, deck, artist
 *  - Numeric operators: `energy>=3`, `might<2`, `cost:2..4`
 *  - owned flags: `owned:yes|no|foil|>2`, `variant:alt|sig|over|metal`
 *  - Negation with `-` prefix, quoted phrases, `tag:"aggro package"`
 * Parsing never throws. Unknown fields become warnings and fall back to free text.
 */
export interface ParsedQuery {
  raw: string;
  clauses: unknown[];
  warnings: ParseWarning[];
}

export type SortKey = 'relevance' | 'name' | 'set' | 'energy' | 'might' | 'rarity' | 'owned';

export function parseQuery(_input: string): ParsedQuery {
  throw new Error('not implemented');
}

export function runSearch(
  _input: string | ParsedQuery,
  _catalog: Catalog,
  _ctx: SearchContext,
  _opts?: { sort?: SortKey; descending?: boolean; limit?: number },
): { hits: SearchHit[]; warnings: ParseWarning[] } {
  throw new Error('not implemented');
}

/** Short suggestions for the omnibox as the user types (field names, domains, tags, sets). */
export function suggest(_input: string, _catalog: Catalog, _ctx: SearchContext): string[] {
  throw new Error('not implemented');
}
