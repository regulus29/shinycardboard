import type { CardType } from '@sc/core';
import { CARD_ASPECT, QUERY_PARAM } from '../../config/constants';

/** URL parameters owned by the collection page. Defaults are omitted from the URL. */
export const PARAMS = {
  query: QUERY_PARAM,
  scope: 'scope',
  sort: 'sort',
  dir: 'dir',
  group: 'group',
  view: 'view',
} as const;

export const SCOPES = ['all', 'owned', 'missing'] as const;
export type Scope = (typeof SCOPES)[number];
export const DEFAULT_SCOPE: Scope = 'all';

export const SORT_KEYS = ['relevance', 'name', 'set', 'energy', 'might', 'rarity', 'owned'] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export const DEFAULT_SORT: SortKey = 'relevance';

export const GROUP_KEYS = ['none', 'set', 'domain', 'type', 'rarity'] as const;
export type GroupKey = (typeof GROUP_KEYS)[number];
export const DEFAULT_GROUP: GroupKey = 'none';

export const VIEWS = ['grid', 'table'] as const;
export type ViewMode = (typeof VIEWS)[number];

export const SCOPE_LABELS: Record<Scope, string> = { all: 'All cards', owned: 'Owned', missing: 'Missing from sets' };
export const SORT_LABELS: Record<SortKey, string> = {
  relevance: 'Relevance',
  name: 'Name',
  set: 'Set',
  energy: 'Energy',
  might: 'Might',
  rarity: 'Rarity',
  owned: 'Owned',
};
export const GROUP_LABELS: Record<GroupKey, string> = { none: 'No grouping', set: 'Set', domain: 'Domain', type: 'Type', rarity: 'Rarity' };

/** Display order for the Type group and chips. */
export const TYPE_ORDER: readonly CardType[] = ['Legend', 'Unit', 'Spell', 'Gear', 'Battlefield', 'Rune'];
export const VARIANT_FILTERS = ['standard', 'alternate-art', 'overnumbered', 'signature', 'metal'] as const;
export const VARIANT_LABELS: Record<string, string> = {
  standard: 'Standard',
  'alternate-art': 'Alt art',
  overnumbered: 'Overnumbered',
  signature: 'Signature',
  metal: 'Metal',
  other: 'Other',
};

/** Virtualized grid geometry. CSS reads the same numbers through inline custom properties. */
export const GRID = {
  minTilePx: 148,
  gapPx: 16,
  /** Caption (name, number, domains) plus the stepper footer, used until real rows are measured. */
  chromePx: 112,
  groupHeaderPx: 52,
  overscanPx: 900,
  aspect: CARD_ASPECT.height / CARD_ASPECT.width,
} as const;

export const TABLE = {
  rowPx: 56,
  groupHeaderPx: 44,
  overscanPx: 700,
  thumbWidthPx: 32,
} as const;

/** Arrow keys inside the table move one row; the grid moves by column count. */
export const PAGE_JUMP_ROWS = 4;
export const SCROLL_CONTAINER_ID = 'main';
export const LIST_STATE_PREFIX = 'sc.collection.list.';
export const SELECTION_LIMIT_NOTE = 'Shift-click selects a range';

/** Maximum rows shown in the import issue table before a "show more" step. */
export const ISSUE_PAGE_SIZE = 50;
export const SUGGESTION_DEBOUNCE_MS = 150;

/** Set labels that mark promotional sets, excluded from "sets complete". */
export const PROMO_LABEL = /promo/i;
export const TABLE_COLUMNS_STORAGE_KEY = 'sc.collection.columns';

/** Viewport width (rem) from which the table also shows rarity and variant. */
export const WIDE_MIN_WIDTH_REM = 90;

/** Largest import accepted, in bytes. Larger files are rejected with a message instead of freezing the page. */
export const IMPORT_MAX_BYTES = 3 * 1024 * 1024;
/** Add mode warns when at least this share of rows already match what is owned (likely a re-import). */
export const ALREADY_IMPORTED_SHARE = 0.6;
export const MATCHED_PREVIEW_ROWS = 25;
