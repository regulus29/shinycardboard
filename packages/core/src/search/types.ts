import type { Card, OwnedEntry, Printing } from '../types';

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

export type SortKey = 'relevance' | 'name' | 'set' | 'energy' | 'might' | 'rarity' | 'owned';

/** Fields whose values come from a closed vocabulary and match by prefix. */
export type EnumField = 'set' | 'type' | 'supertype' | 'domain' | 'rarity' | 'keyword' | 'variant';
export type NumericField = 'energy' | 'might' | 'power' | 'number';
export type TextField = 'name' | 'rules' | 'artist';
export type UserListField = 'tag' | 'deck';

export type NumericOp = '=' | '!=' | '<' | '<=' | '>' | '>=';

/** A numeric comparison or an inclusive range. Open ended ranges become `>=` or `<=`. */
export type NumericTest =
  | { op: NumericOp; value: number }
  | { op: 'range'; min: number; max: number };

/** What `owned:` asks of a printing. Counts are totals across finishes and conditions. */
export type OwnedTest =
  | { type: 'count'; test: NumericTest }
  | { type: 'foil' }
  | { type: 'nonfoil' };

interface ClauseBase {
  negated: boolean;
  /** The query text this clause came from, for error messages and chips. */
  source: string;
}

/** Bare word: matches card names (with typo tolerance), then champion or faction tags. */
export interface WordClause extends ClauseBase {
  kind: 'word';
  text: string;
}

/** Quoted bare phrase: matches the name or the rules text as a contiguous phrase. */
export interface PhraseClause extends ClauseBase {
  kind: 'phrase';
  text: string;
}

/** `name:`, `text:` or `artist:`. Quoted values are contiguous phrases. */
export interface TextClause extends ClauseBase {
  kind: 'text';
  field: TextField;
  text: string;
  phrase: boolean;
}

export interface EnumClause extends ClauseBase {
  kind: 'enum';
  field: EnumField;
  /** Alternatives (comma separated in the query); any may match. */
  values: string[];
  /** Relevance when matched. Defaults to a plain filter; set for words that should outrank text hits. */
  weight?: number;
}

export interface NumberClause extends ClauseBase {
  kind: 'number';
  field: NumericField;
  test: NumericTest;
}

/**
 * Set plus collector number. `sets` is null when no set was given (bare number). `prefix` is the
 * optional letter part some numbers carry (`r04`, `sp4`). `suffix` is the variant marker (`a`, `*`);
 * an empty suffix means the unmarked (standard) printing unless `anyMarker` is set, which happens
 * when the query also names a variant (`unl 29 alt`). `total` is the printed set size in
 * `042/298`; it only narrows the match when no set was given.
 */
export interface CardRefClause extends ClauseBase {
  kind: 'cardRef';
  sets: string[] | null;
  prefix: string;
  number: number;
  suffix: string;
  total: number | null;
  anyMarker: boolean;
}

export interface OwnedClause extends ClauseBase {
  kind: 'owned';
  test: OwnedTest;
}

/** `tag:` and `deck:`. `any` and `none` test for presence; other values match by prefix. */
export interface UserListClause extends ClauseBase {
  kind: 'user';
  field: UserListField;
  values: string[];
  presence: 'any' | 'none' | null;
}

/** A pasted printing key or source id such as `ogn-042-298-standard` or `unl-029-219`. */
export interface PrintingClause extends ClauseBase {
  kind: 'printing';
  keys: string[];
}

/** OR of AND-branches, produced by `OR`, `|` and parentheses. */
export interface GroupClause extends ClauseBase {
  kind: 'group';
  branches: Clause[][];
}

export type Clause =
  | WordClause
  | PhraseClause
  | TextClause
  | EnumClause
  | NumberClause
  | CardRefClause
  | OwnedClause
  | UserListClause
  | PrintingClause
  | GroupClause;

/** All clauses are ANDed. */
export interface ParsedQuery {
  raw: string;
  clauses: Clause[];
  warnings: ParseWarning[];
}

/** One alternative a phrase can stand for: a closed-vocabulary field and its values. */
export interface Facet {
  field: EnumField;
  values: string[];
}

/** What a bare word or phrase means. `orName` also lets the words match card names. */
export type PhraseTarget =
  | { kind: 'facets'; facets: Facet[]; orName: boolean; isSet: boolean }
  | { kind: 'owned'; test: OwnedTest };

export interface ParseOptions {
  /** Set codes of the catalog, any case. Enables bare set codes and rejects unknown prefixes. */
  knownSets?: readonly string[];
  /**
   * Extra bare phrases keyed by folded text (set titles, variant labels from the catalog).
   * Merged over the built in ones.
   */
  phrases?: ReadonlyMap<string, PhraseTarget>;
  /** Printing keys and source ids (lower case) to the printing keys they name, for pasted identifiers. */
  printingLookup?: ReadonlyMap<string, readonly string[]>;
}

export interface SearchOptions {
  sort?: SortKey;
  descending?: boolean;
  limit?: number;
}
