/** Constants for the deck features. Game limits come from core rules.config.json, never from here. */
import type { DeckSection } from '@sc/core';

export const AUTOSAVE_DELAY_MS = 700;
/** Viewport width (rem) from which the builder shows three panes; narrower shows tabs. */
export const BUILDER_PANES_MIN_REM = 80;
/** From this width the builder shows pool and deck side by side with insights in a drawer. */
export const BUILDER_TWO_PANE_MIN_REM = 64;
/** Phones: matches the app layout breakpoint (DESKTOP_MIN_WIDTH_REM). */
export const PHONE_QUERY = '(max-width: 47.99rem)';
export const DRAFT_STORAGE_PREFIX = 'sc.deckdraft.v1.';
export const CONFLICTS_PREVIEW = 5;
/** How long the saved indicator keeps its confirmation look before settling. */
export const SAVED_SETTLE_MS = 2500;
export const MAX_DECK_NAME_LENGTH = 80;
export const MAX_TAG_LENGTH = 32;
export const MAX_TAGS_PER_DECK = 12;

/** Card pool paging so a 400 card legend pool never mounts hundreds of images at once. */
export const POOL_PAGE_SIZE = 36;
/** Energy filter buckets run 0..N and the last one means "N or more". */
export const ENERGY_BUCKET_MAX = 6;
/** Legends listed in the What can I build panel. */
export const BUILDABLE_TOP = 4;
/** Legends listed on the Discover tab. */
export const DISCOVER_LIST_LIMIT = 12;
/** Deck list tabs. */
export const DECK_TABS = [
  { value: 'mine', label: 'My decks' },
  { value: 'discover', label: 'Discover' },
] as const;
export type DeckTab = (typeof DECK_TABS)[number]['value'];
export const BUYABLE_PREVIEW_LIMIT = 40;

export const CHAMPION_SELECT_ID = 'dk-champion-select';
/** Window event asking the header to reveal and focus the champion control. */
export const FOCUS_CHAMPION_EVENT = 'dk:focus-champion';
export const SAMPLE_SEED_RANGE = 1_000_000;
export const NEW_DECK_SUFFIX = 'deck';
export const IMPORT_FILE_ACCEPT = '.txt,.md,text/plain';
export const EXPORT_MIME = 'text/plain;charset=utf-8';

export const SECTION_LABELS: Record<DeckSection, string> = {
  main: 'Main deck',
  runes: 'Runes',
  battlefields: 'Battlefields',
  sideboard: 'Sideboard',
};

export const SECTION_SHORT: Record<DeckSection, string> = {
  main: 'Main',
  runes: 'Runes',
  battlefields: 'Battlefields',
  sideboard: 'Side',
};

export const SECTION_ORDER: readonly DeckSection[] = ['main', 'runes', 'battlefields', 'sideboard'];

export type DeckSort = 'recent' | 'name' | 'completeness';
export const DECK_SORT_OPTIONS = [
  { value: 'recent', label: 'Recently edited' },
  { value: 'name', label: 'Name' },
  { value: 'completeness', label: 'Most complete' },
] as const;

export type LegendSort = 'ready' | 'name';

export type PoolScope = 'owned' | 'all';
export type CardOrder = 'energy' | 'name';
export const CARD_ORDER_OPTIONS = [
  { value: 'energy', label: 'Energy' },
  { value: 'name', label: 'Name' },
] as const;

export type PaneId = 'pool' | 'deck' | 'insights';
export const PANE_LABELS: Record<PaneId, string> = { pool: 'Pool', deck: 'Deck', insights: 'Insights' };

/** Plain language labels for rule keys shown in the Rules popover. */
export const RULE_LABELS: Record<string, string> = {
  mainDeckSize: 'Main deck size',
  mainDeckSizeIsMinimum: 'Main deck size is a minimum',
  includesChosenChampion: 'Main deck includes the chosen champion',
  copyLimit: 'Copies of one card',
  copyLimitAppliesAcrossSideboard: 'Copy limit counts the sideboard',
  signatureLimit: 'Signature cards in total',
  signatureLimitAppliesAcrossSideboard: 'Signature limit counts the sideboard',
  signatureRequiresMatchingLegend: 'Signature cards must match the legend',
  runeDeckSize: 'Rune deck size',
  runeDomains: 'Rune domains',
  battlefieldCount: 'Battlefields',
  battlefieldCopyLimit: 'Copies of one battlefield',
  colorlessAlwaysLegal: 'Cards with no domain fit any legend',
  legendCount: 'Legends',
  sideboardSizes: 'Sideboard size',
  sideboardTypes: 'Sideboard card types',
  openingHandSize: 'Opening hand',
  mulliganMax: 'Mulligan',
  championStartsOutsideLibrary: 'Chosen champion starts set aside',
};

export const ENERGY_BUCKETS: readonly number[] = Array.from({ length: ENERGY_BUCKET_MAX + 1 },(_, i) => i);
