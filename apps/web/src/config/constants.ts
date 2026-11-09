/** Central app constants. Nothing else in the app should hard code these values. */
import type { Condition, Finish } from '@sc/core';
import { SETTINGS_STORAGE_KEY } from '../../pwa.config';

export const APP_NAME = 'Shiny Cardboard';

/** Injected by vite.config.ts at build time; the typeof guards keep tests and tooling safe. */
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
export const BUILD_TIME = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '';

/** syncMeta key set once any user data has been written; used to detect a database that was wiped. */
export const DATA_MARKER_KEY = 'hadData';

export const DB_NAME = 'shinycardboard';

/** localStorage keys. The theme bootstrap script in index.html reads SETTINGS directly. */
export const STORAGE_KEYS = {
  settings: SETTINGS_STORAGE_KEY,
  syncConfig: 'sc.sync.config.v1',
} as const;

/** Card art ratio from the source images (744 x 1039). */
export const CARD_ASPECT = { width: 744, height: 1039 } as const;

export const CATALOG_URL = `${import.meta.env.BASE_URL}catalog.json`;
/** Dev-only fallback produced by src/dev/make-dev-catalog.mjs. */
export const DEV_CATALOG_URL = `${import.meta.env.BASE_URL}dev-catalog.json`;

export const OWNED_DEFAULTS: { finish: Finish; condition: Condition } = { finish: 'normal', condition: 'NM' };
export const FINISHES: readonly Finish[] = ['normal', 'foil'];
export const CONDITIONS: readonly Condition[] = ['NM', 'LP', 'MP', 'HP', 'DMG'];
export const MAX_OWNED_QUANTITY = 9999;

export const NEW_DECK_NAME = 'Untitled deck';
export const RECENT_DECKS_LIMIT = 5;

/** Sync tuning and protocol locations. The server contract lives in @sc/core sync types. */
export const SYNC = {
  /** Path appended to the configured server URL. */
  path: '/sync',
  intervalMs: 60_000,
  debounceMs: 2_000,
  /** Minimum gap before a tab-visibility change triggers another sync. */
  visibilityGapMs: 15_000,
  requestTimeoutMs: 20_000,
  /** syncMeta row keys: server cursor, local dirty watermark, wall clock of last success. */
  backoffBaseMs: 5_000,
  backoffMaxMs: 300_000,
  metaKeys: {
    serverTime: 'serverTime',
    watermark: 'watermark',
    lastSuccess: 'lastSuccess',
    applied: 'applied',
    serverUrl: 'serverUrl',
    serverId: 'serverId',
    outbox: 'outbox',
  },
} as const;

/** Keyboard focus target for the global omnibox (`/` shortcut). Phase 2 puts this id on its input. */
export const OMNIBOX_INPUT_ID = 'omnibox-input';
/** Query parameter carrying the omnibox query on /collection. */
export const QUERY_PARAM = 'q';

/** Layout breakpoint (rem) where the sidebar replaces the bottom tab bar. CSS media queries must use it (guarded by breakpoints.test.ts). */
export const DESKTOP_MIN_WIDTH_REM = 48;

/** Service-worker cache name and CDN host for card art; defined once in pwa.config.ts. */
export { CARD_ART_CACHE } from '../../pwa.config';

/** Landscape phones are short: below this height the sidebar is forced to its icon rail. */
export const SHORT_VIEWPORT_QUERY = '(max-height: 30rem)';
export const LIGHT_SCHEME_QUERY = '(prefers-color-scheme: light)';
