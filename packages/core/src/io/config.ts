import type { Condition, Finish, Variant } from '../types';

/** Tunables and lookup tables for import and export. Kept as data so formats extend without code changes. */
export const IO_CONFIG = {
  /** Longest raw row echoed back in an import issue. */
  maxRawPreviewChars: 160,
  maxQuantity: 9999,
  /** Longest identifier or name cell accepted; longer rows are rejected. */
  maxFieldChars: 200,
  /** Longest notes cell; longer notes are truncated with a warning. */
  maxNotesChars: 2000,
  /** Data rows read from one CSV; the rest are reported and ignored. */
  maxRows: 50000,
  /** Distinct names fuzzy searched per import; later unknown names are not fuzzy matched. */
  maxFuzzyLookups: 2000,
  /** Largest text accepted for a CSV or a backup (characters), and for a deck list. */
  maxInputChars: 50_000_000,
  maxDeckTextChars: 1_000_000,
  /** Deck text limits. */
  maxDeckLineChars: 200,
  maxDeckLines: 5000,
  maxDeckCount: 99,
  /** Rows scanned from the top of a CSV to find the header row. */
  headerScanRows: 5,
  /** Recognized columns needed before a row counts as the header. */
  minHeaderMatches: 2,
  /** Minimum normalized similarity (1 = identical) for a fuzzy name match. */
  fuzzyMinSimilarity: 0.8,
  /** Below this similarity a listed name contradicts a set plus number match. */
  nameConflictMinSimilarity: 0.5,
  defaultCondition: 'NM' as Condition,
  defaultFinish: 'normal' as Finish,
  backupAppId: 'shinycardboard',
  backupVersion: 1,
  /** Backup validation problems listed in the error before summarizing the rest. */
  maxReportedBackupProblems: 3,
  defaultDeckName: 'Imported deck',
} as const;

/** Normalized condition text (lowercase, words only) to condition grade. */
export const CONDITION_ALIASES: Readonly<Record<string, Condition>> = {
  nm: 'NM',
  mint: 'NM',
  'near mint': 'NM',
  m: 'NM',
  lp: 'LP',
  'lightly played': 'LP',
  'light play': 'LP',
  'slightly played': 'LP',
  sp: 'LP',
  excellent: 'LP',
  mp: 'MP',
  'moderately played': 'MP',
  'moderate play': 'MP',
  played: 'MP',
  hp: 'HP',
  'heavily played': 'HP',
  'heavy play': 'HP',
  poor: 'HP',
  dmg: 'DMG',
  damaged: 'DMG',
  d: 'DMG',
};

/** Normalized finish text to finish. Boolean style foil columns are covered too. */
export const FINISH_ALIASES: Readonly<Record<string, Finish>> = {
  normal: 'normal',
  nonfoil: 'normal',
  'non foil': 'normal',
  regular: 'normal',
  standard: 'normal',
  false: 'normal',
  no: 'normal',
  n: 'normal',
  '0': 'normal',
  foil: 'foil',
  holo: 'foil',
  holofoil: 'foil',
  'holo foil': 'foil',
  true: 'foil',
  yes: 'foil',
  y: 'foil',
  '1': 'foil',
};

/** Word that marks a foil inside a combined condition cell such as "Near Mint Foil". */
export const FOIL_WORD = 'foil';

/** Phrases (normalized) in a name or variant cell that point at a variant. */
export const VARIANT_HINT_PHRASES: Readonly<Record<Exclude<Variant, 'standard' | 'other'>, readonly string[]>> = {
  'alternate-art': ['alternate art', 'alt art', 'alternative art'],
  overnumbered: ['overnumbered', 'over numbered'],
  signature: ['signature'],
  metal: ['metal'],
};

/** Deck text headings (normalized, trailing counts removed) mapped to a section. */
export type DeckSection = 'legend' | 'champion' | 'main' | 'runes' | 'battlefields' | 'sideboard';
export const DECK_HEADING_ALIASES: Readonly<Record<string, DeckSection>> = {
  legend: 'legend',
  legends: 'legend',
  'champion legend': 'legend',
  champion: 'champion',
  'chosen champion': 'champion',
  main: 'main',
  'main deck': 'main',
  maindeck: 'main',
  mainboard: 'main',
  deck: 'main',
  'rune deck': 'runes',
  runes: 'runes',
  rune: 'runes',
  runedeck: 'runes',
  battlefields: 'battlefields',
  battlefield: 'battlefields',
  'battlefield deck': 'battlefields',
  sideboard: 'sideboard',
  'side board': 'sideboard',
  'side deck': 'sideboard',
  side: 'sideboard',
  sb: 'sideboard',
};

/** Headings written by formatDeckText. */
export const DECK_SECTION_TITLES: Readonly<Record<DeckSection, string>> = {
  legend: 'Legend',
  champion: 'Champion',
  main: 'Main Deck',
  runes: 'Rune Deck',
  battlefields: 'Battlefields',
  sideboard: 'Sideboard',
};

/** Lines starting with one of these are comments in deck text. */
export const DECK_COMMENT_PREFIXES: readonly string[] = ['//', '#'];
/** Deck text lines `Name: ...` or `Deck: ...` set the deck name. */
export const DECK_NAME_KEYS: readonly string[] = ['deck', 'name'];
